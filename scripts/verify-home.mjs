import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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
const tags = Array.from({ length: 12 }, (_, i) => ({
  name: `Tag ${i}`,
  post_count: 12 - i,
}));
const data = {
  '/posts': {
    entries: [
      {
        id: '1',
        slug: 'example',
        title: 'Example',
        description: '',
        published_at: '2026-01-01T00:00:00Z',
        thumbnail: 'https://example.com/a.png',
        tags: ['C++', 'React'],
      },
    ],
  },
  '/series': { entries: [] },
  '/tags': { entries: tags },
  '/stats': { posts: 1 },
};
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-09-16',
    bindings: { SITE_ORIGIN: 'https://example.com', CONTENT_READS: 'true' },
    serviceBindings: {
      CMS: async (request) =>
        Response.json(data[new URL(request.url).pathname] ?? {}, {
          status: 200,
        }),
      ASSETS: async () =>
        new Response(readFileSync('dist/index.html'), {
          headers: { 'Content-Type': 'text/html' },
        }),
    },
  })
);
try {
  const response = await runtime.dispatchFetch('https://example.com/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /함께 읽을 글/);
  assert.match(html, /최근 발행한 글/);
  assert.match(html, /최근 글이 발행된 시리즈/);
  assert.match(html, /href="\/tags\/cpp\/"[^>]*>#C\+\+/);
  const section = html.match(/<div data-home-tags[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(section);
  assert.equal((section.match(/<a /g) || []).length, 8);
  assert.match(html, /href="\/tags\/"[^>]*>\s*모든 키워드/);
  console.log('PASS: home labels, featured tag links and eight keyword links');
} finally {
  await runtime.dispose();
}
