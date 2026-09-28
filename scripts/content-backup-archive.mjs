import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

process.umask(0o077);
const [mode, source, destination] = process.argv.slice(2);
const secret = process.env.CONTENT_BACKUP_KEY;
if (
  !['encrypt', 'decrypt'].includes(mode) ||
  !source ||
  !destination ||
  !/^[a-f0-9]{64}$/.test(secret || '')
)
  throw new Error(
    'Usage: CONTENT_BACKUP_KEY=<64 hex characters> node scripts/content-backup-archive.mjs encrypt snapshot-directory new-file | decrypt encrypted-file new-tar.gz'
  );
if (fs.existsSync(destination) || fs.existsSync(destination + '.partial'))
  throw new Error('Output already exists');
const key = Buffer.from(secret, 'hex');
const magic = Buffer.from('DEVLOGB1');
try {
  if (mode === 'encrypt') {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(magic);
    fs.writeFileSync(destination + '.partial', Buffer.concat([magic, iv]), {
      mode: 0o600,
    });
    const tar = spawn('tar', ['-czf', '-', '-C', source, '.'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Never log tar output: paths may contain private content names.
    tar.stderr.resume();
    const exited = new Promise((resolve, reject) => {
      tar.on('error', reject);
      tar.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Snapshot archive failed'))
      );
    });
    await Promise.all([
      pipeline(
        tar.stdout,
        cipher,
        fs.createWriteStream(destination + '.partial', { flags: 'a' })
      ),
      exited,
    ]);
    fs.appendFileSync(destination + '.partial', cipher.getAuthTag());
  } else {
    const size = fs.statSync(source).size;
    if (size < 36) throw new Error('Invalid encrypted backup');
    const file = fs.openSync(source, 'r');
    const header = Buffer.alloc(20),
      tag = Buffer.alloc(16);
    try {
      fs.readSync(file, header, 0, 20, 0);
      fs.readSync(file, tag, 0, 16, size - 16);
    } finally {
      fs.closeSync(file);
    }
    if (!header.subarray(0, 8).equals(magic))
      throw new Error('Unknown backup format');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      header.subarray(8)
    );
    decipher.setAAD(magic);
    decipher.setAuthTag(tag);
    await pipeline(
      fs.createReadStream(source, { start: 20, end: size - 17 }),
      decipher,
      fs.createWriteStream(destination + '.partial', {
        flags: 'wx',
        mode: 0o600,
      })
    );
  }
  fs.renameSync(destination + '.partial', destination);
  console.log(
    JSON.stringify({
      operation: mode,
      output: destination,
      bytes: fs.statSync(destination).size,
    })
  );
} catch (error) {
  fs.rmSync(destination + '.partial', { force: true });
  throw error;
}
