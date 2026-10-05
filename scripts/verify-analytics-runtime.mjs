import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { load } from 'cheerio';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const builtTemplate = readFileSync(
  new URL('../dist/article-template/index.html', import.meta.url),
  'utf8'
);
const productionOrigin = 'https://seungjun.sh';
const stageOrigin = 'https://devlog-site-stage.seungjun-jeong10.workers.dev';
let template = builtTemplate;
let cmsStatus = 200;
const post = {
  slug: 'synthetic-analytics',
  title: 'Synthetic article',
  description: '',
  published_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  headings: [],
  rendered_html: '<p>Synthetic body only</p>',
  previous_slug: 'previous',
  previous_title: 'Previous',
  next_slug: 'next',
  next_title: 'Next',
};
const makeRuntime = (siteOrigin) =>
  new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: new URL('../worker/site.mjs', import.meta.url).pathname,
      compatibilityDate: '2026-09-16',
      bindings: { CONTENT_READS: 'true', SITE_ORIGIN: siteOrigin },
      serviceBindings: {
        CMS: async () =>
          new Response(JSON.stringify(post), { status: cmsStatus }),
        ASSETS: async () =>
          new Response(template, { headers: { 'Content-Type': 'text/html' } }),
      },
    })
  );

const runtime = makeRuntime(productionOrigin);
const stageRuntime = makeRuntime(stageOrigin);
const validationOrigin =
  'https://devlog-ga-validation.seungjun-jeong10.workers.dev';
const validationAuth = `Basic ${Buffer.from('ga-validation:synthetic-test-credential-not-a-real-secret').toString('base64')}`;
const validationBundle = await build({
  entryPoints: [
    new URL('../worker/ga-validation.mjs', import.meta.url).pathname,
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const validationRuntime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: validationBundle.outputFiles[0].text,
    compatibilityDate: '2026-09-16',
    bindings: { VALIDATION_AUTHORIZATION: validationAuth },
    serviceBindings: {
      ASSETS: async () =>
        new Response(template, { headers: { 'Content-Type': 'text/html' } }),
    },
  })
);

function fixture({
  indexable = true,
  id = 'G-RQ6456HXLD',
  origin = productionOrigin,
  target = 'production',
} = {}) {
  const $ = load(builtTemplate);
  for (const attr of Object.keys($('html').attr()))
    if (attr.startsWith('data-template-') || attr.startsWith('data-analytics-'))
      $('html').removeAttr(attr);
  if (indexable) $('html').attr('data-template-indexable', 'true');
  if (id)
    $('html')
      .attr('data-template-analytics-measurement-id', id)
      .attr('data-template-analytics-site-origin', origin)
      .attr('data-template-analytics-environment', target);
  return $.html();
}
async function article(origin = productionOrigin, instance = runtime) {
  const response = await instance.dispatchFetch(`${origin}/blog/${post.slug}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const $ = load(await response.text());
  assert.equal($('[data-analytics-body]').text(), 'Synthetic body only');
  assert.equal(
    $('a[data-analytics-navigation="previous"]').attr('href'),
    '/blog/previous/'
  );
  assert.equal(
    $('a[data-analytics-navigation="next"]').attr('href'),
    '/blog/next/'
  );
  assert.equal(
    $(
      'html[data-template-indexable], html[data-template-analytics-measurement-id]'
    ).length,
    0
  );
  return $;
}
try {
  const built = await article();
  const builtConfig = load(builtTemplate);
  const enabled =
    builtConfig('html').attr('data-template-analytics-environment') ===
    'production';
  assert.equal(
    built('html').attr('data-analytics-measurement-id'),
    enabled ? 'G-RQ6456HXLD' : undefined
  );
  assert.equal(
    built('meta[name="robots"]').attr('content'),
    builtConfig('html').attr('data-template-indexable') === 'true'
      ? 'index,follow'
      : 'noindex,nofollow'
  );
  if (
    builtConfig('html').attr('data-template-analytics-environment') === 'stage'
  ) {
    const stageBuild = await article(stageOrigin, stageRuntime);
    assert.equal(
      stageBuild('html').attr('data-analytics-measurement-id'),
      'G-8SFTFGKZ9Y'
    );
  }
  template = fixture();
  const active = await article();
  assert.equal(
    active('html').attr('data-analytics-measurement-id'),
    'G-RQ6456HXLD'
  );
  assert.equal(active('html').attr('data-analytics-environment'), 'production');
  assert.equal(active('meta[name="robots"]').attr('content'), 'index,follow');
  for (const config of [
    { indexable: false },
    { id: '' },
    { id: 'G-UNKNOWN' },
    { id: 'G-8SFTFGKZ9Y' },
    { origin: stageOrigin },
    { target: 'preview' },
  ]) {
    template = fixture(config);
    assert.equal(
      (await article())('html').attr('data-analytics-measurement-id'),
      undefined
    );
  }
  template = fixture();
  assert.equal(
    (await article('https://preview.example'))('html').attr(
      'data-analytics-measurement-id'
    ),
    undefined
  );
  template = fixture({
    indexable: false,
    id: 'G-8SFTFGKZ9Y',
    origin: stageOrigin,
    target: 'stage',
  });
  const stage = await article(stageOrigin, stageRuntime);
  assert.equal(
    stage('meta[name="robots"]').attr('content'),
    'noindex,nofollow'
  );
  assert.equal(stage('html').attr('data-analytics-measurement-id'), undefined);
  template = fixture({
    id: 'G-8SFTFGKZ9Y',
    origin: stageOrigin,
    target: 'stage',
  });
  assert.equal(
    (await article(stageOrigin, stageRuntime))('html').attr(
      'data-analytics-measurement-id'
    ),
    'G-8SFTFGKZ9Y'
  );
  for (const status of [404, 500]) {
    cmsStatus = status;
    const response = await runtime.dispatchFetch(
      `${productionOrigin}/blog/${post.slug}/`
    );
    assert.equal(response.status, status === 404 ? 404 : 503);
    assert.doesNotMatch(await response.text(), /data-analytics-/);
  }
  for (const path of [
    '/article-template/',
    '/collection-template/',
    '/list-template/',
  ])
    assert.equal(
      (await runtime.dispatchFetch(`${productionOrigin}${path}`)).status,
      404
    );
  template = fixture({
    indexable: false,
    id: 'G-8SFTFGKZ9Y',
    origin: validationOrigin,
    target: 'validation',
  });
  for (const path of [
    '/blog/ga-validation-long/',
    '/_astro/example.js',
    '/privacy/',
    '/robots.txt',
    '/fixture.svg',
  ]) {
    for (const authorization of ['', 'Basic invalid']) {
      const response = await validationRuntime.dispatchFetch(
        `${validationOrigin}${path}`,
        { headers: { Authorization: authorization } }
      );
      assert.equal(
        response.status,
        401,
        'All validation HTML and assets need server authentication'
      );
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.doesNotMatch(
        await response.text(),
        /data-analytics-|Synthetic body/
      );
    }
  }
  for (const kind of ['long', 'short', 'image', 'previous', 'next']) {
    const response = await validationRuntime.dispatchFetch(
      `${validationOrigin}/blog/ga-validation-${kind}/`,
      { headers: { Authorization: validationAuth } }
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    const $ = load(await response.text());
    assert.equal($('meta[name="robots"]').attr('content'), 'noindex,nofollow');
    assert.equal($('html').attr('data-analytics-environment'), 'validation');
    assert.equal(
      $('html').attr('data-analytics-measurement-id'),
      'G-8SFTFGKZ9Y'
    );
    assert.equal(
      $('html').attr('data-analytics-validation-authenticated'),
      'true'
    );
    for (const link of $('a[data-analytics-navigation]').toArray())
      assert.match(
        $(link).attr('href'),
        /^\/blog\/ga-validation-(long|short|image|previous|next)\/$/
      );
  }
  for (const path of [
    '/blog/real-article/',
    '/blog/',
    '/search',
    '/api/content/search',
    '/sitemap.xml',
    '/rss.xml',
    '/login/',
    '/write/',
    '/admin/',
    '/article-template/',
    '/ga-validation/template/',
  ]) {
    const response = await validationRuntime.dispatchFetch(
      `${validationOrigin}${path}`,
      { headers: { Authorization: validationAuth } }
    );
    assert.equal(
      response.status,
      404,
      'Validation exposes only synthetic allowlisted routes'
    );
    assert.doesNotMatch(await response.text(), /data-analytics-/);
  }
  assert.equal(
    (
      await validationRuntime.dispatchFetch(
        'https://seungjun.sh/blog/ga-validation-long/',
        { headers: { Authorization: validationAuth } }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await validationRuntime.dispatchFetch(
        `${validationOrigin}/blog/ga-validation-long/`,
        { method: 'POST', headers: { Authorization: validationAuth } }
      )
    ).status,
    405
  );
  // A validation build/config alone cannot activate a normal site Worker.
  cmsStatus = 200;
  assert.equal(
    (await article())('html').attr('data-analytics-measurement-id'),
    undefined
  );
  for (const config of [
    { id: 'G-RQ6456HXLD' },
    { id: '' },
    { origin: stageOrigin },
    { target: 'stage' },
  ]) {
    template = fixture({
      indexable: false,
      id: 'G-8SFTFGKZ9Y',
      origin: validationOrigin,
      target: 'validation',
      ...config,
    });
    const response = await validationRuntime.dispatchFetch(
      `${validationOrigin}/blog/ga-validation-long/`,
      { headers: { Authorization: validationAuth } }
    );
    const $ = load(await response.text());
    assert.equal($('html').attr('data-analytics-measurement-id'), undefined);
    assert.equal(
      $('html').attr('data-analytics-validation-authenticated'),
      undefined
    );
  }
} finally {
  await Promise.all([
    runtime.dispose(),
    stageRuntime.dispose(),
    validationRuntime.dispose(),
  ]);
}
console.log(
  'PASS: real Workers D1 HTMLRewriter, built settings, synthetic enabled/disabled guards, noindex, navigation and 404/503 exclusions (no Google requests)'
);
