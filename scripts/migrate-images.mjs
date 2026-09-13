import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const root = path.resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, data) => {
  const full = path.join(root, file);
  fs.writeFileSync(full + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(full + '.tmp', full);
};
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const manifest = read('migration/image-manifest.json');
const images = [...new Map(manifest.map((i) => [i.originalUrl, i])).values()];
const mode = process.argv[2];
const downloaded = fs.existsSync(
  path.join(root, 'migration/image-downloads.json')
)
  ? read('migration/image-downloads.json')
  : [];
const localFile = (image) => path.join(root, 'work/images', image.key);
const curl = (args) =>
  execFileSync(
    'curl',
    [
      '-sS',
      '--fail',
      '--location',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      '--max-time',
      '90',
      '--max-filesize',
      '52428800',
      ...args,
    ],
    { maxBuffer: 55 * 1024 * 1024 }
  );
function ensureSource(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw new Error('Only public HTTPS image URLs are supported');
}
function localRecord(image) {
  const record = downloaded.find(
    (r) => r.originalUrl === image.originalUrl && r.status === 'downloaded'
  );
  if (!record || !fs.existsSync(localFile(image)))
    throw new Error(`Download required for ${image.key}`);
  assertHash(fs.readFileSync(localFile(image)), record.sha256);
  return record;
}
function assertHash(bytes, expected) {
  if (hash(bytes) !== expected) throw new Error('Image content hash mismatch');
}

if (mode === 'download') {
  const output = [];
  for (const image of images) {
    try {
      ensureSource(image.originalUrl);
      const existing = downloaded.find(
        (r) => r.originalUrl === image.originalUrl && r.status === 'downloaded'
      );
      if (
        existing &&
        fs.existsSync(localFile(image)) &&
        hash(fs.readFileSync(localFile(image))) === existing.sha256
      ) {
        output.push(existing);
        continue;
      }
      fs.mkdirSync(path.dirname(localFile(image)), { recursive: true });
      const partial = localFile(image) + '.partial',
        headers = partial + '.headers';
      curl([
        '--retry',
        '2',
        '--dump-header',
        headers,
        '--output',
        partial,
        image.originalUrl,
      ]);
      const header = fs.readFileSync(headers, 'utf8');
      const contentType = [
        ...header.matchAll(/^content-type:\s*([^\r\n;]+)/gim),
      ]
        .at(-1)?.[1]
        .trim()
        .toLowerCase();
      if (!contentType?.startsWith('image/'))
        throw new Error(`Not an image: ${contentType || 'unknown MIME type'}`);
      const bytes = fs.readFileSync(partial);
      if (!bytes.length) throw new Error('Empty image');
      fs.renameSync(partial, localFile(image));
      fs.unlinkSync(headers);
      output.push({
        originalUrl: image.originalUrl,
        key: image.key,
        status: 'downloaded',
        contentType,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    } catch (error) {
      output.push({
        originalUrl: image.originalUrl,
        key: image.key,
        status: 'failed',
        error: error.message,
      });
    }
    write('migration/image-downloads.json', output);
    console.log(
      `Downloaded ${output.filter((r) => r.status === 'downloaded').length}/${images.length}`
    );
  }
  write('migration/image-downloads.json', output);
  if (output.some((r) => r.status !== 'downloaded')) process.exitCode = 1;
} else if (mode === 'upload') {
  const required = [
    'R2_ACCOUNT_ID',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(
      `Missing configuration: ${missing.join(', ')}. No upload attempted.`
    );
  if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID))
    throw new Error('Invalid R2 account ID');
  // Preflight every local file before creating the client or uploading any object.
  const records = images.map((image) => ({
    image,
    record: localRecord(image),
  }));
  const client = new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const output = [];
  for (const { image, record } of records) {
    try {
      let existing;
      try {
        existing = await client.send(
          new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: image.key,
          })
        );
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 404) throw error;
      }
      if (existing) {
        if (existing.Metadata?.sha256 !== record.sha256)
          throw new Error('ExistingObjectHashMismatch');
      } else {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: image.key,
            Body: fs.readFileSync(localFile(image)),
            ContentType: record.contentType,
            CacheControl: 'public, max-age=31536000, immutable',
            Metadata: { sha256: record.sha256 },
            IfNoneMatch: '*',
          })
        );
      }
      output.push({
        key: image.key,
        status: existing ? 'already-present' : 'uploaded',
        sha256: record.sha256,
      });
    } catch (error) {
      output.push({
        key: image.key,
        status: 'failed',
        error: error.name || 'UploadFailed',
      });
    }
    write('migration/image-uploads.json', output);
    console.log(`Processed ${output.length}/${images.length}`);
  }
  client.destroy();
  if (output.some((r) => r.status === 'failed')) process.exitCode = 1;
} else if (mode === 'verify') {
  const origin = process.env.MEDIA_BASE_URL?.replace(/\/$/, '');
  if (!origin)
    throw new Error('MEDIA_BASE_URL is required. No request attempted.');
  ensureSource(origin);
  if (new URL(origin).origin !== origin)
    throw new Error('MEDIA_BASE_URL must be an HTTPS origin with no path');
  const records = images.map((image) => ({
    image,
    record: localRecord(image),
  }));
  const checks = [];
  for (const { image, record } of records) {
    try {
      assertHash(curl([`${origin}/${image.key}`]), record.sha256);
      checks.push({
        key: image.key,
        status: 'verified',
        sha256: record.sha256,
      });
    } catch (error) {
      checks.push({ key: image.key, status: 'failed', error: error.message });
    }
    console.log(
      `Verified ${checks.filter((r) => r.status === 'verified').length}/${images.length}`
    );
  }
  const complete =
    checks.every((r) => r.status === 'verified') &&
    checks.length === images.length;
  write('migration/image-verification.json', {
    verifiedAt: new Date().toISOString(),
    origin,
    complete,
    checks,
  });
  if (!complete) process.exitCode = 1;
} else {
  console.log(
    'Usage: node scripts/migrate-images.mjs download|upload|verify\nDownload uses only public source URLs. Upload requires your R2 credentials. Verify checks bytes at MEDIA_BASE_URL.'
  );
  if (mode && mode !== '--help') process.exitCode = 1;
}
