import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as path from 'node:path';
import console from 'node:console';
import { URL } from 'node:url';

// Run the actual cleanup script with an isolated clock, D1 and S3 adapter.
// No credentials, network requests or real R2 objects are used.
const source = fs.readFileSync(
  new URL('./cleanup-unused-images.mjs', import.meta.url),
  'utf8'
);
const key = 'posts/00000000-0000-4000-8000-000000000001.png';
const markerKey = key.replace('posts/', 'cms-orphans/');
const start = Date.parse('2026-09-20T00:00:00Z');
const week = 7 * 24 * 60 * 60 * 1000;

async function run({
  age,
  referenced = false,
  race = false,
  missing = false,
  fail = false,
  dry = false,
}) {
  const calls = [];
  let reads = 0;
  const context = vm.createContext({
    console: { log() {} },
    Date: class extends Date {
      static now() {
        return start + age;
      }
    },
    process: {
      loadEnvFile() {},
      argv: ['node', 'cleanup', '--d1', ...(dry ? [] : ['--delete'])],
      env: {
        R2_ACCOUNT_ID: 'test',
        R2_BUCKET: 'test-stage',
        R2_ACCESS_KEY_ID: 'test',
        R2_SECRET_ACCESS_KEY: 'test',
        CLOUDFLARE_D1_DATABASE: 'test-stage',
        CLOUDFLARE_D1_R2_BUCKET: 'test-stage',
      },
    },
  });
  const commands = Object.fromEntries(
    ['ListObjectsV2', 'HeadObject', 'PutObject', 'DeleteObject'].map((name) => [
      `${name}Command`,
      class {
        constructor(input) {
          this.name = name;
          this.input = input;
        }
      },
    ])
  );
  class S3Client {
    async send(command) {
      calls.push(command);
      if (command.name === 'ListObjectsV2')
        return {
          Contents: [
            command.input.Prefix === 'posts/'
              ? { Key: key }
              : { Key: markerKey, LastModified: new Date(start) },
          ],
        };
      if (command.name === 'HeadObject' && missing)
        throw { $metadata: { httpStatusCode: 404 } };
      return {};
    }
    destroy() {}
  }
  const adapters = {
    'node:path': path,
    'node:child_process': {
      execFileSync() {
        if (fail) throw new Error('D1 unavailable');
        reads++;
        return JSON.stringify([
          {
            results: referenced || (race && reads > 1) ? [{ r2_key: key }] : [],
          },
        ]);
      },
    },
    '@aws-sdk/client-s3': { S3Client, ...commands },
  };
  const script = new vm.SourceTextModule(source, {
    context,
    initializeImportMeta(meta) {
      meta.dirname = '/test/scripts';
    },
  });
  await script.link((specifier) => {
    const values = adapters[specifier];
    if (!values) throw new Error(`Unexpected import: ${specifier}`);
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [name, value] of Object.entries(values))
          this.setExport(name, value);
      },
      { context }
    );
  });
  let error;
  try {
    await script.evaluate();
  } catch (caught) {
    error = caught;
  }
  return { calls, error };
}
const deletes = (result) =>
  result.calls
    .filter((call) => call.name === 'DeleteObject')
    .map((call) => call.input.Key);
assert.deepEqual(deletes(await run({ age: week - 1 })), []);
assert.deepEqual(deletes(await run({ age: week })), [key, markerKey]);
assert.deepEqual(deletes(await run({ age: week + 1, dry: true })), []);
assert.deepEqual(deletes(await run({ age: week, referenced: true })), [
  markerKey,
]);
assert.deepEqual(deletes(await run({ age: week, race: true })), [markerKey]);
assert.deepEqual(deletes(await run({ age: week, missing: true })), []);
const failed = await run({ age: week, fail: true });
assert.ok(failed.error);
assert.deepEqual(deletes(failed), []);
console.log(
  'PASS: 7-day boundary, dry run, references, last-minute reference, missing marker, D1 failure'
);
