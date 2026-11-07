import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const bundle = await build({
  entryPoints: ['worker/site.mjs'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
let failPosts = false;
let failStats = false;
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-09-16',
    bindings: { SITE_ORIGIN: 'https://example.com', CONTENT_READS: 'true' },
    serviceBindings: {
      CMS: async (request) => {
        const path = new URL(request.url).pathname;
        if (
          (path === '/posts' && failPosts) ||
          (path === '/stats' && failStats)
        )
          return new Response('error', { status: 503 });
        return Response.json(
          path === '/stats'
            ? { posts: 31 }
            : {
                entries: [
                  {
                    id: '1',
                    slug: 'a',
                    title: 'A',
                    published_at: '2026-01-01T00:00:00Z',
                    series_name: 'React',
                    tags: ['React', 'hooks', '상태', '렌더링'],
                  },
                ],
                nextCursor: 'next',
              }
        );
      },
      ASSETS: async () =>
        new Response(readFileSync('dist/list-template/index.html'), {
          headers: { 'Content-Type': 'text/html' },
        }),
    },
  })
);
try {
  let response = await runtime.dispatchFetch('https://example.com/blog/');
  let html = await response.text();
  assert.equal(response.status, 200);
  for (const phrase of [
    '최신 발행순',
    '31개의 글',
    '글 검색',
    '태그 둘러보기',
    '시리즈 둘러보기',
    '더 보기',
  ])
    assert.ok(html.includes(phrase), phrase);
  assert.match(html, /data-search-open/);
  assert.match(
    html,
    /<span data-post-series[^>]*>React<\/span><span>#hooks · #상태 · #렌더링<\/span>/
  );
  failStats = true;
  response = await runtime.dispatchFetch('https://example.com/blog/');
  assert.equal(response.status, 200, 'stats failure does not block posts');
  failPosts = true;
  response = await runtime.dispatchFetch('https://example.com/blog/');
  html = await response.text();
  assert.equal(response.status, 503);
  assert.match(html, /글 목록을 불러오지 못했습니다/);
  assert.match(html, /다시 시도/);
  assert.match(html, /홈으로/);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
} finally {
  await runtime.dispose();
}

let handler;
let blogMetadata = true;
const makeElement = () => ({
  dataset: {},
  children: [],
  append(...items) {
    this.children.push(...items);
  },
  setAttribute() {},
  focus() {
    this.focused = true;
  },
});
const list = makeElement();
const status = makeElement();
const button = {
  dataset: { endpoint: '/api/content/posts?limit=20', cursor: 'next' },
  parentElement: {
    querySelector: (selector) =>
      selector === '[data-post-list]' ? list : status,
    hasAttribute: (name) => name === 'data-blog-metadata' && blogMetadata,
  },
};
const context = {
  document: {
    addEventListener: (_, fn) => {
      handler = fn;
    },
    createElement: makeElement,
  },
  location: { origin: 'https://example.com' },
  URL,
  Intl,
  fetch: async () => ({
    ok: true,
    json: async () => ({
      entries: [
        {
          slug: 'a',
          title: 'A',
          published_at: '2026-01-01T00:00:00Z',
          tags: [],
        },
      ],
      nextCursor: null,
    }),
  }),
};
vm.runInNewContext(readFileSync('public/d1-content.js', 'utf8'), context);
context.fetch = async () => ({ ok: false });
await handler({ target: { closest: () => button } });
assert.equal(button.disabled, false);
assert.equal(button.textContent, '다시 시도');
assert.match(status.textContent, /불러오지 못했습니다/);
context.fetch = async () => ({
  ok: true,
  json: async () => ({ entries: [], nextCursor: 'more' }),
});
await handler({ target: { closest: () => button } });
assert.equal(button.disabled, false);
assert.equal(button.dataset.cursor, 'more');
context.fetch = async () => ({
  ok: true,
  json: async () => ({
    entries: [
      {
        slug: 'a',
        title: 'A',
        published_at: '2026-01-01T00:00:00Z',
        series_name: 'React',
        tags: ['React', 'hooks', '상태', '렌더링'],
      },
    ],
    nextCursor: null,
  }),
});
await handler({ target: { closest: () => button } });
assert.equal(list.children.length, 1);
assert.equal(
  list.children[0].children[0].children[1].children[2].children[1].textContent,
  '#hooks · #상태 · #렌더링'
);
assert.equal(button.hidden, true);
assert.equal(status.focused, true);
assert.match(status.textContent, /1개의 글.*마지막 글/);
blogMetadata = false;
button.hidden = false;
button.disabled = false;
await handler({ target: { closest: () => button } });
assert.equal(
  list.children[1].children[0].children[1].children[2].children[1].textContent,
  'React · hooks · 상태'
);
console.log(
  'PASS: blog discovery, CMS failure recovery and final page announcement'
);
