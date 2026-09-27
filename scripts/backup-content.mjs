import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

// Backup/restore only: this tool never writes to production D1 or R2.
process.umask(0o077);
const [mode, input, destination] = process.argv.slice(2);
if (!['capture', 'restore'].includes(mode) || !input || !destination)
  throw new Error(
    'Usage: node scripts/backup-content.mjs capture backup.sql empty-directory | restore snapshot-directory empty-directory'
  );
const output = path.resolve(destination);
if (fs.existsSync(output)) throw new Error('Output directory already exists');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const saveJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function restoreSql(sql, file) {
  const db = new DatabaseSync(file);
  db.exec(sql);
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (
    integrity.length !== 1 ||
    integrity[0].integrity_check !== 'ok' ||
    db.prepare('PRAGMA foreign_key_check').all().length
  )
    throw new Error('Restored database failed integrity checks');
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name);
  const counts = Object.fromEntries(
    tables.map((name) => [
      name,
      db.prepare(`SELECT count(*) n FROM "${name.replaceAll('"', '""')}"`).get()
        .n,
    ])
  );
  const references = new Set(
    db
      .prepare(
        'SELECT r2_key FROM post_images UNION SELECT r2_key FROM post_draft_images'
      )
      .all()
      .map((row) => row.r2_key)
  );
  // Include legacy images and references missing from the relationship tables.
  for (const row of db
    .prepare(
      'SELECT markdown,thumbnail FROM posts UNION ALL SELECT markdown,thumbnail FROM post_drafts'
    )
    .all()) {
    for (const [value] of `${row.markdown}\n${row.thumbnail || ''}`.matchAll(
      /https:\/\/media\.seungjun\.sh\/[^\s)"'<>]+/g
    )) {
      const url = new URL(value);
      references.add(decodeURIComponent(url.pathname.slice(1)));
    }
  }
  return { db, counts, references };
}

if (mode === 'capture') {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  if (!/^[a-f0-9]{32}$/i.test(account || '') || bucket !== 'devlog-assets')
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID and R2_BUCKET=devlog-assets');
  const sql = fs.readFileSync(input);
  const restored = restoreSql(sql.toString(), ':memory:');
  let list, get;
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    list = async () => {
      const objects = [];
      let cursor;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: cursor,
          })
        );
        for (const item of page.Contents || [])
          objects.push({
            key: item.Key,
            size: item.Size,
            etag: item.ETag?.replaceAll('"', ''),
          });
        if (page.IsTruncated && !page.NextContinuationToken)
          throw new Error('Missing S3 pagination cursor');
        cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (cursor);
      return objects;
    };
    get = async (key) => {
      const item = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      return {
        bytes: Buffer.from(await item.Body.transformToByteArray()),
        etag: item.ETag?.replaceAll('"', ''),
        metadata: {
          contentType: item.ContentType,
          cacheControl: item.CacheControl,
          contentDisposition: item.ContentDisposition,
          contentEncoding: item.ContentEncoding,
          contentLanguage: item.ContentLanguage,
          custom: item.Metadata,
        },
      };
    };
  } else {
    // Local macOS fallback uses Wrangler's existing login, never copies credentials.
    let token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
      execFileSync('pnpm', ['exec', 'wrangler', 'whoami'], { stdio: 'pipe' });
      const profile = path.join(
        os.homedir(),
        'Library/Preferences/.wrangler/config/default.toml'
      );
      token = fs
        .readFileSync(profile, 'utf8')
        .match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
    }
    if (!token) throw new Error('No Cloudflare credentials available');
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects`;
    const request = async (url) => {
      const response = await globalThis.fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept-Encoding': 'identity',
        },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error(`R2 backup request failed: HTTP ${response.status}`);
      return response;
    };
    list = async () => {
      const objects = [];
      let cursor;
      do {
        const url = new URL(base);
        url.searchParams.set('per_page', '1000');
        if (cursor) url.searchParams.set('cursor', cursor);
        const page = await (await request(url)).json();
        if (!page.success || !Array.isArray(page.result))
          throw new Error('Invalid R2 list response');
        objects.push(...page.result);
        if (page.result_info?.is_truncated && !page.result_info.cursor)
          throw new Error('Missing R2 pagination cursor');
        cursor = page.result_info?.is_truncated
          ? page.result_info.cursor
          : undefined;
      } while (cursor);
      return objects;
    };
    get = async (key) => {
      const response = await request(
        `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
      );
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        etag: response.headers
          .get('etag')
          ?.replace(/^W\//, '')
          .replaceAll('"', ''),
      };
    };
  }
  const objects = await list();
  const keys = new Set(objects.map((item) => item.key));
  const missing = [...restored.references].filter((key) => !keys.has(key));
  if (missing.length)
    throw new Error(
      `Referenced R2 objects missing: ${missing.length}. Snapshot not complete.`
    );
  fs.mkdirSync(path.join(output, 'objects'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(output, 'content.sql'), sql, { mode: 0o600 });
  let next = 0,
    completed = 0;
  // ponytail: four concurrent downloads; full copies keep restore independent of older snapshots.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < objects.length) {
        const item = objects[next++];
        const downloaded = await get(item.key);
        if (
          downloaded.bytes.length !== item.size ||
          (downloaded.etag && downloaded.etag !== item.etag)
        )
          throw new Error(
            `R2 object changed during backup: ${item.key} (size ${item.size}/${downloaded.bytes.length}, etag ${item.etag}/${downloaded.etag}); repeat capture`
          );
        item.sha256 = hash(downloaded.bytes);
        item.file = `${hash(Buffer.from(item.key))}.bin`;
        if (downloaded.metadata) item.metadata = downloaded.metadata;
        fs.writeFileSync(
          path.join(output, 'objects', item.file),
          downloaded.bytes,
          { mode: 0o600 }
        );
        completed++;
        if (completed % 50 === 0)
          console.log(
            JSON.stringify({ downloaded: completed, total: objects.length })
          );
      }
    })
  );
  restored.db.close();
  const manifest = {
    version: 1,
    capturedAt: new Date().toISOString(),
    database: 'devlog-content',
    account,
    bucket,
    sqlSha256: hash(sql),
    counts: restored.counts,
    references: [...restored.references].sort(),
    objects,
  };
  saveJson(path.join(output, 'manifest.json'), manifest);
  console.log(
    JSON.stringify({
      output,
      counts: manifest.counts,
      referencedImages: manifest.references.length,
      objects: objects.length,
      bytes: objects.reduce((n, item) => n + item.size, 0),
    })
  );
} else {
  const source = path.resolve(input);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')
  );
  if (
    manifest.version !== 1 ||
    manifest.database !== 'devlog-content' ||
    !Array.isArray(manifest.objects)
  )
    throw new Error('Invalid backup manifest');
  const sql = fs.readFileSync(path.join(source, 'content.sql'));
  if (hash(sql) !== manifest.sqlSha256)
    throw new Error('SQL backup hash mismatch');
  fs.mkdirSync(path.join(output, 'objects'), { recursive: true, mode: 0o700 });
  const restored = restoreSql(
    sql.toString(),
    path.join(output, 'content.sqlite')
  );
  if (JSON.stringify(restored.counts) !== JSON.stringify(manifest.counts))
    throw new Error('Restored table counts differ');
  const keys = new Set();
  for (const item of manifest.objects) {
    if (
      typeof item.key !== 'string' ||
      !/^[a-f0-9]{64}\.bin$/.test(item.file) ||
      keys.has(item.key)
    )
      throw new Error('Invalid/duplicate object record');
    const bytes = fs.readFileSync(path.join(source, 'objects', item.file));
    if (bytes.length !== item.size || hash(bytes) !== item.sha256)
      throw new Error('Image backup hash mismatch');
    fs.writeFileSync(path.join(output, 'objects', item.file), bytes, {
      mode: 0o600,
    });
    keys.add(item.key);
  }
  if ([...restored.references].some((key) => !keys.has(key)))
    throw new Error('Restored image references are missing');
  // Never reactivate authentication records restored from historical data.
  const sessionTables = Object.keys(restored.counts).filter((name) =>
    /session/i.test(name)
  );
  for (const table of sessionTables)
    restored.db.exec(`DELETE FROM "${table.replaceAll('"', '""')}"`);
  restored.db.close();
  saveJson(path.join(output, 'manifest.json'), manifest);
  const report = {
    restoredAt: new Date().toISOString(),
    source,
    counts: restored.counts,
    referencedImages: restored.references.size,
    verifiedObjects: keys.size,
    integrity: 'ok',
    foreignKeyErrors: 0,
    invalidatedSessionTables: sessionTables,
    productionWrites: 0,
  };
  saveJson(path.join(output, 'restore-report.json'), report);
  console.log(JSON.stringify(report));
}
