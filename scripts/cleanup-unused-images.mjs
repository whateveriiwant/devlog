import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const root = path.resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const args = process.argv.slice(2);
const execute = args.includes('--delete');
const d1Mode = args.includes('--d1');
if (args.some((arg) => !['--delete', '--d1'].includes(arg))) {
  throw new Error(
    'Usage: node scripts/cleanup-unused-images.mjs [--d1] [--delete]'
  );
}
const required = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length)
  throw new Error(`Missing configuration: ${missing.join(', ')}`);

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function readD1Used(database, key) {
  const sql = key
    ? `SELECT r2_key FROM post_images WHERE r2_key = '${key}' UNION SELECT r2_key FROM post_draft_images WHERE r2_key = '${key}'`
    : 'SELECT r2_key FROM post_images UNION SELECT r2_key FROM post_draft_images';
  const command = [
    'exec',
    'wrangler',
    'd1',
    'execute',
    database,
    '--remote',
    '--json',
    '--command',
    sql,
  ];
  if (process.env.CLOUDFLARE_D1_CONFIG)
    command.push('--config', process.env.CLOUDFLARE_D1_CONFIG);
  if (process.env.CLOUDFLARE_D1_ENV)
    command.push('--env', process.env.CLOUDFLARE_D1_ENV);
  const response = JSON.parse(
    execFileSync('pnpm', command, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  );
  return new Set(
    response.flatMap((result) => result.results.map((row) => row.r2_key))
  );
}

function readGitUsed() {
  // Always read the current remote refs. A failed fetch stops deletion.
  git(['fetch', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
  const refs = git([
    'for-each-ref',
    '--format=%(refname)',
    'refs/remotes/origin/',
  ])
    .trim()
    .split('\n')
    .filter(
      (ref) => ref.startsWith('refs/remotes/origin/') && !ref.endsWith('/HEAD')
    );
  if (
    !refs.includes('refs/remotes/origin/main') ||
    !refs.includes('refs/remotes/origin/dev')
  ) {
    throw new Error(
      'Expected main and dev branches were not fetched; refusing to clean up'
    );
  }
  let matches = '';
  try {
    matches = git([
      'grep',
      '-IhoE',
      'posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|gif|webp|avif)',
      ...refs,
      '--',
      'src/content/posts',
    ]);
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  return new Set(matches.trim().split('\n').filter(Boolean));
}

let used = new Set();
if (d1Mode) {
  const database = process.env.CLOUDFLARE_D1_DATABASE;
  if (!database)
    throw new Error('CLOUDFLARE_D1_DATABASE is required with --d1');
  if (process.env.CLOUDFLARE_D1_R2_BUCKET !== process.env.R2_BUCKET)
    throw new Error(
      'CLOUDFLARE_D1_R2_BUCKET must exactly match R2_BUCKET with --d1; refusing cross-environment cleanup'
    );
  used = readD1Used(database);
}
if (!d1Mode || process.env.CLOUDFLARE_D1_INCLUDE_GIT === 'true') {
  for (const key of readGitUsed()) used.add(key);
}
const client = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.R2_BUCKET;
const graceMs = 7 * 24 * 60 * 60 * 1000;
const imageKey =
  /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/;

async function list(prefix) {
  const objects = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    objects.push(...(page.Contents || []));
    token = page.NextContinuationToken;
  } while (token);
  return objects;
}

const images = (await list('posts/')).filter((item) => imageKey.test(item.Key));
const markers = new Map(
  (await list('cms-orphans/')).map((item) => [item.Key, item])
);
let marked = 0,
  deleted = 0,
  restored = 0;
for (const image of images) {
  const markerKey = `cms-orphans/${image.Key.slice('posts/'.length)}`;
  const marker = markers.get(markerKey);
  markers.delete(markerKey);
  if (used.has(image.Key)) {
    if (marker) {
      console.log(`Referenced again: ${image.Key}`);
      if (execute)
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: markerKey })
        );
      restored++;
    }
    continue;
  }
  if (!marker) {
    console.log(`Unused, start 7-day grace: ${image.Key}`);
    if (execute)
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: markerKey,
          Body: '',
          ContentType: 'text/plain',
          IfNoneMatch: '*',
        })
      );
    marked++;
    continue;
  }
  if (
    !marker.LastModified ||
    Date.now() - marker.LastModified.getTime() < graceMs
  )
    continue;
  // A marker can only be created by this script. Confirm it still exists before deleting the image.
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: markerKey })
    );
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404) continue;
    throw error;
  }
  if (
    d1Mode &&
    readD1Used(process.env.CLOUDFLARE_D1_DATABASE, image.Key).has(image.Key)
  ) {
    console.log(`Referenced again before deletion: ${image.Key}`);
    if (execute)
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: markerKey })
      );
    restored++;
    continue;
  }
  console.log(`Unused for 7 days, delete: ${image.Key}`);
  if (execute) {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: image.Key })
    );
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: markerKey })
    );
  }
  deleted++;
}
for (const markerKey of markers.keys()) {
  if (
    !markerKey.startsWith('cms-orphans/') ||
    !imageKey.test(`posts/${markerKey.slice('cms-orphans/'.length)}`)
  )
    continue;
  console.log(`Image already absent, remove marker: ${markerKey}`);
  if (execute)
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: markerKey })
    );
}
client.destroy();
console.log(
  `${execute ? 'Applied' : 'Dry run'}: ${images.length} images, ${used.size} references, ${marked} new markers, ${restored} restored, ${deleted} deletions`
);
