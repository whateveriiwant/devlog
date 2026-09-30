import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import cms from '../worker/cms.mjs';
const { Request, Response, ReadableStream, TextEncoder } = globalThis;
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const limit = 10 * 1024 * 1024;
let puts = 0;
const env = {
  SITE_ORIGIN: 'https://example.com',
  CONTENT_WRITES: 'true',
  GITHUB_ALLOWED_LOGIN: 'owner',
  CONTENT: {
    prepare: () => ({
      bind: () => ({ first: async () => ({ login: 'owner' }) }),
    }),
  },
  MEDIA_BASE_URL: 'https://media.example.com',
  MEDIA: {
    put: async () => {
      puts++;
    },
  },
};
const call = (path, body, extra = {}, method = 'POST') =>
  cms.fetch(
    new Request(`https://cms.example${path}`, {
      method,
      body,
      duplex: 'half',
      headers: {
        Origin: env.SITE_ORIGIN,
        Cookie: `__Host-cms_session=${'a'.repeat(43)}`,
        'Content-Type': path === '/media' ? 'image/png' : 'application/json',
        ...extra,
      },
    }),
    env
  );
function source(count, chunkSize = 1024 * 1024) {
  let reads = 0;
  let cancelled = false;
  return {
    body: new ReadableStream(
      {
        pull(controller) {
          if (reads === count) return controller.close();
          reads++;
          controller.enqueue(new Uint8Array(chunkSize));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 }
    ),
    get reads() {
      return reads;
    },
    get cancelled() {
      return cancelled;
    },
  };
}
for (const [path, method] of [
  ['/editor/posts', 'POST'],
  ['/editor/posts/test', 'DELETE'],
  ['/editor/posts/test/restore', 'POST'],
  ['/media', 'POST'],
]) {
  for (const headers of [{}, { 'Content-Length': '1' }]) {
    const input = source(30);
    assert.equal((await call(path, input.body, headers, method)).status, 413);
    assert.equal(input.reads, 11, 'stop on the first chunk over the limit');
    assert.equal(input.cancelled, true);
  }
  const input = source(30);
  assert.equal(
    (
      await call(
        path,
        input.body,
        { 'Content-Length': String(limit + 1) },
        method
      )
    ).status,
    413
  );
  assert.equal(
    input.reads,
    0,
    'reject declared oversized bodies before reading'
  );
  assert.equal(input.cancelled, true);
  assert.equal(
    (await call(path, '{}', { 'Content-Length': 'invalid' }, method)).status,
    400
  );
}
for (const [path, method] of [
  ['/editor/posts', 'POST'],
  ['/editor/posts/test', 'DELETE'],
  ['/editor/posts/test/restore', 'POST'],
]) {
  for (const body of [
    '{',
    'null',
    '[]',
    '1',
    'true',
    '"text"',
    '',
    new Uint8Array([0xff]),
  ])
    assert.equal((await call(path, body, {}, method)).status, 400);
  const broken = new ReadableStream({
    pull(controller) {
      controller.error(null);
    },
  });
  assert.equal((await call(path, broken, {}, method)).status, 400);
}
const exactJson = `{"padding":"${'a'.repeat(limit - 14)}"}`;
assert.equal(new TextEncoder().encode(exactJson).length, limit);
const atLimit = await call('/editor/posts', exactJson);
assert.equal(atLimit.status, 400);
assert.match(
  (await atLimit.json()).error,
  /입력값/,
  'exactly the cap reaches field validation'
);
for (const body of [
  new Uint8Array(),
  new Uint8Array([1, 2, 3]),
  new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]),
])
  assert.equal((await call('/media', body)).status, 400);
assert.equal(
  (await call('/media', new Uint8Array([1]), { 'Content-Type': 'text/plain' }))
    .status,
  400
);
const badWebp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 0,
]);
assert.equal(
  (await call('/media', badWebp, { 'Content-Type': 'image/webp' })).status,
  400
);
assert.equal(puts, 0, 'rejected bodies never reach R2');
for (const size of [4, limit]) {
  const png = new Uint8Array(size);
  png.set([0x89, 0x50, 0x4e, 0x47]);
  assert.equal((await call('/media', png)).status, 201);
}
assert.equal(puts, 2);

// Use Wrangler's installed Workers runtime for real HTMLRewriter behavior.
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: new URL('../worker/site.mjs', import.meta.url).pathname,
    compatibilityDate: '2026-09-16',
    bindings: { SITE_ORIGIN: env.SITE_ORIGIN },
    serviceBindings: {
      CMS: async () => new Response(null, { status: 204 }),
      ASSETS: async (request) => {
        const path = new URL(request.url).pathname;
        const file = path.startsWith('/login')
          ? 'login'
          : path.startsWith('/admin')
            ? 'admin'
            : 'write';
        return new Response(
          readFileSync(new URL(`../dist/${file}/index.html`, import.meta.url)),
          { headers: { 'Content-Type': 'text/html' } }
        );
      },
    },
  })
);
try {
  const config = readFileSync(
    new URL('../wrangler.jsonc', import.meta.url),
    'utf8'
  );
  assert.match(config, /"\/login"/);
  assert.match(config, /"\/login\/\*"/);
  let lastNonce;
  for (const path of [
    '/login/',
    '/login/index.html',
    '/admin/',
    '/admin/index.html',
    '/write/',
    '/write/index.html',
    '/login/',
  ]) {
    const response = await runtime.dispatchFetch(`https://example.com${path}`, {
      headers: { Cookie: '__Host-cms_session=test' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const policy = response.headers.get('Content-Security-Policy');
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /script-src-attr 'none'/);
    assert.match(policy, /connect-src 'self'/);
    assert.doesNotMatch(
      policy.split(';').find((p) => p.trim().startsWith('script-src ')),
      /unsafe-inline|unsafe-eval/
    );
    const nonce = /'nonce-([\w]+)'/.exec(policy)[1];
    assert.notEqual(nonce, lastNonce);
    lastNonce = nonce;
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)];
    assert.ok(scripts.length > 0);
    for (const [tag] of scripts)
      assert.ok(
        tag.includes(`nonce="${nonce}"`),
        'Astro bootstrap and module scripts receive the response nonce'
      );
  }
  const redirect = await runtime.dispatchFetch('https://example.com/admin/', {
    redirect: 'manual',
  });
  assert.equal(redirect.status, 302);
  assert.match(redirect.headers.get('Location'), /\/login\/\?next=/);
  const publicPage = await runtime.dispatchFetch(
    'https://example.com/profile/'
  );
  assert.equal(publicPage.headers.get('Content-Security-Policy'), null);
} finally {
  await runtime.dispose();
}
console.log(
  'PASS: bounded JSON/image streams, cancellation, malformed input, exact limits, no rejected R2 writes, real Workers nonce/CSP and login/editor/admin assets'
);
