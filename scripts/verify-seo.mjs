import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { load } from 'cheerio';
import { canIndex, productionOrigin, serializeJsonLd } from '../worker/seo.mjs';

const { Response } = globalThis;

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const bundle = await build({
  entryPoints: [new URL('../worker/site.mjs', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const file = (path) =>
  readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const post = {
  slug: 'synthetic-seo',
  title: '</script><img src=x onerror=alert(1)> 개발 글',
  description: '합성 설명 & "따옴표"',
  published_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
  thumbnail: 'https://example.com/article.png',
  tags: [],
  headings: [],
  rendered_html: '<p>합성 본문</p>',
};
const series = {
  id: 'series',
  name: '합성 시리즈',
  slug: 'synthetic-series',
  post_count: 1,
  description: '시리즈 설명',
  latest_at: post.published_at,
};
const tag = { name: 'Synthetic', post_count: 1 };
let cmsStatus = 200;
const assets = {
  '/': 'index.html',
  '/profile/': 'profile/index.html',
  '/article-template/': 'article-template/index.html',
  '/collection-template/': 'collection-template/index.html',
  '/list-template/': 'list-template/index.html',
  '/series/': 'series/index.html',
  '/tags/': 'tags/index.html',
  '/login/': 'login/index.html',
};
async function cms(request) {
  if (cmsStatus !== 200) return new Response('{}', { status: cmsStatus });
  const path = new URL(request.url).pathname;
  if (path === '/posts/synthetic-seo') return Response.json(post);
  if (path === '/posts')
    return Response.json({ entries: [], nextCursor: null });
  if (path === '/series') return Response.json({ entries: [series] });
  if (path === '/tags') return Response.json({ entries: [tag] });
  if (path === '/stats') return Response.json({ posts: 0 });
  if (path === '/sitemap-entries') return Response.json({ entries: [post] });
  return new Response('{}', { status: 404 });
}
const runtime = (origin, allowed) =>
  new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-09-16',
      bindings: {
        CONTENT_READS: 'true',
        SITE_ORIGIN: origin,
        ALLOW_INDEXING: allowed,
      },
      serviceBindings: {
        CMS: cms,
        ASSETS: async (request) => {
          const path = new URL(request.url).pathname;
          return assets[path]
            ? new Response(file(assets[path]), {
                headers: { 'Content-Type': 'text/html' },
              })
            : new Response('Not found', { status: 404 });
        },
      },
    })
  );

assert.equal(canIndex(productionOrigin, 'true'), true);
assert.equal(canIndex(productionOrigin, 'false'), false);
assert.equal(canIndex('https://preview.example', 'true'), false);
assert.equal(
  serializeJsonLd({ value: '</script>' }).includes('</script>'),
  false
);
const builtHome = load(file('index.html'));
const builtAllows = builtHome('meta[name="robots"]')
  .attr('content')
  .startsWith('index,');
assert.match(
  file('robots.txt'),
  builtAllows
    ? /Allow: \/\nSitemap: https:\/\/seungjun\.sh\/sitemap-index\.xml/
    : /Disallow: \/\n/
);
if (builtAllows) {
  assert.equal(
    builtHome('link[rel="canonical"]').attr('href'),
    productionOrigin + '/'
  );
  assert.equal(
    JSON.parse(builtHome('script[data-seo]').text())['@graph'][0]['@type'],
    'WebSite'
  );
  assert.equal(
    JSON.parse(load(file('profile/index.html'))('script[data-seo]').text())[
      '@graph'
    ][0]['@type'],
    'ProfilePage'
  );
}
const staticSitemap = file('sitemap-0.xml');
assert.doesNotMatch(
  staticSitemap,
  /\/(?:login|write|admin|article-template|collection-template|list-template|404)\//
);

const active = runtime(productionOrigin, 'true');
const blocked = runtime(productionOrigin, 'false');
const stageOrigin = 'https://devlog-site-stage.seungjun-jeong10.workers.dev';
const stage = runtime(stageOrigin, 'true');
try {
  for (const [instance, origin, allowed] of [
    [active, productionOrigin, true],
    [blocked, productionOrigin, false],
    [stage, stageOrigin, false],
    [active, 'https://preview.example', false],
  ]) {
    const robots = await instance.dispatchFetch(origin + '/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(
      await robots.text(),
      allowed ? /Allow: \/\nSitemap:/ : /Disallow: \/\n/
    );
    for (const path of [
      '/',
      '/blog/',
      '/blog/synthetic-seo/',
      '/series/',
      '/series/synthetic-series/',
      '/tags/',
      '/tags/synthetic/',
      '/profile/',
    ]) {
      const response = await instance.dispatchFetch(origin + path);
      assert.equal(response.status, 200, path);
      const $ = load(await response.text());
      assert.equal(
        $('meta[name="robots"]').attr('content'),
        allowed ? 'index,follow,max-image-preview:large' : 'noindex,nofollow',
        path
      );
      assert.equal($('link[rel="canonical"]').length, allowed ? 1 : 0, path);
      assert.equal($('script[data-seo]').length, allowed ? 1 : 0, path);
      if (allowed) {
        assert.equal(
          $('link[rel="canonical"]').attr('href'),
          productionOrigin + path
        );
        const graph = JSON.parse($('script[data-seo]').text())['@graph'];
        assert.ok(graph.length > 0);
        if (path === '/blog/synthetic-seo/') {
          const article = graph.find((item) => item['@type'] === 'BlogPosting');
          assert.equal(article.headline, post.title);
          assert.equal(article.datePublished, post.published_at);
          assert.equal(article.dateModified, post.updated_at);
          assert.deepEqual(article.image, [post.thumbnail]);
          assert.equal(article.author.name, '정승준');
          assert.equal($('title').text(), post.title + ' · seungjun.sh');
          assert.equal(
            $('img[onerror]').length,
            0,
            'Metadata must never become HTML'
          );
          assert.equal(
            $('meta[name="description"]').attr('content'),
            post.description
          );
          assert.equal(
            $('meta[property="og:image"]').attr('content'),
            post.thumbnail
          );
          assert.equal($('a[rel="author"]').attr('href'), '/profile/');
        }
      }
    }
  }
  const login = await active.dispatchFetch(productionOrigin + '/login/');
  const alias = load(
    await (
      await active.dispatchFetch(productionOrigin + '/blog/%73ynthetic-seo/')
    ).text()
  );
  assert.equal(
    alias('link[rel="canonical"]').attr('href'),
    productionOrigin + '/blog/synthetic-seo/'
  );
  for (const path of ['/index.html', '/profile', '/profile/index.html']) {
    const response = await stage.dispatchFetch(stageOrigin + path, {
      redirect: 'manual',
    });
    assert.equal(response.status, 301);
    assert.equal(new URL(response.headers.get('Location')).origin, stageOrigin);
  }
  assert.equal(
    load(await login.text())('meta[name="robots"]').attr('content'),
    'noindex, nofollow'
  );
  assert.equal(login.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(
    (
      await active.dispatchFetch(productionOrigin + '/write/', {
        redirect: 'manual',
      })
    ).status,
    302
  );
  for (const path of [
    '/article-template/',
    '/collection-template/',
    '/list-template/',
  ])
    assert.equal(
      (await active.dispatchFetch(productionOrigin + path)).status,
      404
    );
  const sitemap = await (
    await active.dispatchFetch(productionOrigin + '/sitemap.xml')
  ).text();
  assert.match(sitemap, /synthetic-seo/);
  assert.match(sitemap, /2026-02-01T00:00:00.000Z/);
  assert.doesNotMatch(sitemap, /\/login\/|\/write\/|\/admin\/|template/);
  const $xml = load(sitemap, { xml: true });
  assert.equal(
    $xml('url')
      .filter((_, el) => $xml(el).find('loc').text().includes('/series/'))
      .find('lastmod').length,
    0,
    'Do not present a publication date as a collection modification date'
  );
  post.thumbnail = null;
  post.updated_at = null;
  const withoutImage = load(
    await (
      await active.dispatchFetch(productionOrigin + '/blog/synthetic-seo/')
    ).text()
  );
  const article = JSON.parse(withoutImage('script[data-seo]').text())[
    '@graph'
  ].find((item) => item['@type'] === 'BlogPosting');
  assert.equal(article.image, undefined);
  assert.equal(article.dateModified, undefined);
  assert.equal(
    withoutImage('meta[property="og:image"]').attr('content'),
    productionOrigin + '/blog-og.png'
  );
  for (const status of [404, 500]) {
    cmsStatus = status;
    assert.equal(
      (await active.dispatchFetch(productionOrigin + '/blog/synthetic-seo/'))
        .status,
      status === 404 ? 404 : 503
    );
    assert.equal(
      (await active.dispatchFetch(productionOrigin + '/sitemap.xml')).status,
      503
    );
  }
  console.log(
    'PASS: production SEO, stage/preview blocks, canonical/schema metadata, script escaping, author, sitemap and private/error routes'
  );
} finally {
  await Promise.all([active.dispose(), blocked.dispose(), stage.dispose()]);
}
