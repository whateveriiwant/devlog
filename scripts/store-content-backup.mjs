import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const file = process.argv[2];
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const bucket = process.env.CONTENT_BACKUP_BUCKET;
if (
  !file ||
  !/^[a-f0-9]{32}$/i.test(account || '') ||
  bucket !== 'devlog-content-backups' ||
  !process.env.BACKUP_R2_ACCESS_KEY_ID ||
  !process.env.BACKUP_R2_SECRET_ACCESS_KEY
)
  throw new Error('Encrypted file and backup-only R2 configuration required');
const header = Buffer.alloc(8);
const fd = fs.openSync(file, 'r');
try {
  fs.readSync(fd, header, 0, 8, 0);
} finally {
  fs.closeSync(fd);
}
if (header.toString() !== 'DEVLOGB1')
  throw new Error('Refusing to upload an unencrypted backup');
const client = new S3Client({
  region: 'auto',
  endpoint: `https://${account}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.BACKUP_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.BACKUP_R2_SECRET_ACCESS_KEY,
  },
});
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const month = now.toISOString().slice(0, 7);
// Each weekly archive is independent; the monthly archive is the latest successful backup of that month.
for (const key of [`weekly/${stamp}.bin`, `monthly/${month}.bin`]) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(file),
      ContentLength: fs.statSync(file).size,
      ContentType: 'application/octet-stream',
    })
  );
}
for (const [prefix, keep, pattern] of [
  ['weekly/', 4, /^weekly\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.bin$/],
  ['monthly/', 12, /^monthly\/\d{4}-\d{2}\.bin$/],
]) {
  const keys = [];
  let cursor;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
      })
    );
    keys.push(
      ...(page.Contents || [])
        .map((item) => item.Key)
        .filter((key) => pattern.test(key))
    );
    if (page.IsTruncated && !page.NextContinuationToken)
      throw new Error('Missing backup list cursor');
    cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (cursor);
  // Delete only owned archive names, only after both new uploads succeeded.
  for (const key of keys.sort().reverse().slice(keep))
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
console.log(
  JSON.stringify({
    bucket,
    weeklyRetention: 4,
    monthlyRetention: 12,
    encrypted: true,
  })
);
