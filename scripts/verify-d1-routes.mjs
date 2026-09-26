import assert from 'node:assert/strict';
import console from 'node:console';
import site from '../worker/site.mjs';

const { Request, Response } = globalThis;
let assetReads = 0;
const request = new Request('https://example.com/blog/existing-static-post/');
for (const status of [404, 500]) {
  const response = await site.fetch(request, {
    CONTENT_READS: 'true',
    CMS: { fetch: async () => new Response('{}', { status }) },
    ASSETS: {
      fetch: async () => {
        assetReads++;
        return new Response('Old deleted article');
      },
    },
  });
  assert.equal(response.status, status === 404 ? 404 : 503);
  assert.equal(
    assetReads,
    0,
    'D1 failures must never reveal stale static articles'
  );
}
const unavailable = await site.fetch(request, {
  CONTENT_READS: 'true',
  CMS: {
    fetch: async () => {
      throw new Error('D1 unavailable');
    },
  },
});
assert.equal(unavailable.status, 503);
const rollback = await site.fetch(request, {
  CONTENT_READS: 'false',
  ASSETS: { fetch: async () => new Response('Restored static article') },
});
assert.equal(await rollback.text(), 'Restored static article');
console.log(
  'PASS: D1 404, API failure and network failure preserve deletion; disabled gate serves restored static content'
);
