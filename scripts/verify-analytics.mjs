import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
assert.ok(fs.existsSync(dist), 'Build the site before verifying analytics');

const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8'
);
assert.ok(workflow.includes('vars.GA4_PRODUCTION_MEASUREMENT_ID'));
assert.ok(workflow.includes('vars.GA4_PRODUCTION_ENABLED'));
assert.ok(workflow.includes('GA4_PRODUCTION_MEASUREMENT_ID:'));
assert.ok(workflow.includes('ALLOW_INDEXING:'));
assert.ok(workflow.includes("github.event_name == 'push'"));
assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
assert.ok(workflow.includes("'https://seungjun.sh'"));
assert.doesNotMatch(workflow, /G-8SFTFGKZ9Y/);

const htmlFiles = fs
  .readdirSync(dist, { recursive: true })
  .filter((file) => file.endsWith('.html'))
  .map((file) => path.join(dist, file));
assert.ok(htmlFiles.length, 'Built HTML pages exist');

let enabledPages = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const id = html.match(/data-analytics-measurement-id="([^"]+)"/)?.[1];
  if (id) {
    const relativePath = path.relative(dist, file).replaceAll(path.sep, '/');
    const origin = html.match(/data-analytics-site-origin="([^"]+)"/)?.[1];
    const environment = html.match(/data-analytics-environment="([^"]+)"/)?.[1];
    assert.ok(
      /^blog\/.+\/index\.html$/.test(relativePath),
      `${relativePath} is a public article route`
    );
    assert.match(
      html,
      /<meta name="robots" content="index,follow"/,
      `${relativePath} is indexable`
    );
    if (environment === 'stage') {
      assert.equal(id, 'G-8SFTFGKZ9Y', `${relativePath} uses only the test ID`);
      assert.equal(
        origin,
        'https://devlog-site-stage.seungjun-jeong10.workers.dev',
        `${relativePath} uses only the stage origin`
      );
    } else {
      assert.equal(environment, 'production', `${relativePath} environment`);
      assert.equal(
        id,
        'G-RQ6456HXLD',
        `${relativePath} approved production ID`
      );
      assert.notEqual(
        id,
        'G-8SFTFGKZ9Y',
        `${relativePath} rejects the test ID`
      );
      assert.equal(
        origin,
        'https://seungjun.sh',
        `${relativePath} prod origin`
      );
    }
    enabledPages++;
  } else {
    assert.doesNotMatch(
      html,
      /data-analytics-site-origin=/,
      `${path.relative(dist, file)} has no orphaned analytics origin`
    );
  }
  assert.doesNotMatch(
    html,
    /<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtag\/js/i,
    `${path.relative(dist, file)} does not preload Google's tag`
  );
  if (/<meta name="robots" content="noindex,nofollow"/.test(html))
    assert.doesNotMatch(
      html,
      /data-analytics-measurement-id=/,
      `${path.relative(dist, file)} is noindex and excluded`
    );
}
if (process.env.GA4_EXPECTED_TARGET === 'disabled')
  assert.equal(enabledPages, 0, 'Default and PR builds contain no GA ID');
if (['stage', 'production'].includes(process.env.GA4_EXPECTED_TARGET))
  assert.ok(enabledPages > 0, 'Stage build has eligible article pages');

const templateHtml = fs.readFileSync(
  path.join(dist, 'article-template/index.html'),
  'utf8'
);
const templateId = templateHtml.match(
  /data-template-analytics-measurement-id="([^"]+)"/
)?.[1];
if (process.env.GA4_EXPECTED_TARGET === 'disabled')
  assert.equal(
    templateId,
    undefined,
    'Disabled builds contain no inert runtime GA settings'
  );
if (['stage', 'production'].includes(process.env.GA4_EXPECTED_TARGET)) {
  assert.equal(
    templateId,
    process.env.GA4_EXPECTED_TARGET === 'stage'
      ? 'G-8SFTFGKZ9Y'
      : 'G-RQ6456HXLD'
  );
  assert.ok(
    templateHtml.includes(
      `data-template-analytics-environment="${process.env.GA4_EXPECTED_TARGET}"`
    )
  );
}

for (const route of [
  '404.html',
  'article-template/index.html',
  'collection-template/index.html',
  'list-template/index.html',
  'admin/index.html',
  'login/index.html',
  'write/index.html',
]) {
  const file = path.join(dist, route);
  if (!fs.existsSync(file)) continue;
  assert.doesNotMatch(
    fs.readFileSync(file, 'utf8'),
    /data-analytics-measurement-id=/,
    `${route} is excluded`
  );
}

const analyticsSource = fs.readFileSync(
  path.join(root, 'src/scripts/analytics.ts'),
  'utf8'
);
const javascript = ts.transpileModule(analyticsSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function makeBrowser({
  id = 'G-8SFTFGKZ9Y',
  expectedOrigin = 'https://devlog-site-stage.seungjun-jeong10.workers.dev',
  origin = expectedOrigin,
  pathname = '/blog/example/',
  search = '',
  hash = '#ga_debug',
  environment = 'stage',
  bodyHeight = 1000,
  hasBody = true,
  robots = 'index,follow',
  innerHeight = 100,
  visibilityState = 'visible',
  referrer = 'https://previous.example/page?token=private#section',
} = {}) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const scripts = [];
  const articleBody = {
    tagName: 'DIV',
    getBoundingClientRect: () => ({ top: -win.scrollY, height: bodyHeight }),
    contains: (target) => target?.insideArticle === true,
  };
  const doc = {
    documentElement: {
      dataset: {
        analyticsMeasurementId: id,
        analyticsSiteOrigin: expectedOrigin,
        analyticsEnvironment: environment,
      },
    },
    visibilityState,
    referrer,
    head: { appendChild: (script) => scripts.push(script) },
    createElement: (tagName) => ({ tagName, async: false, src: '' }),
    querySelector: (selector) =>
      selector === 'meta[name="robots"]'
        ? robots === null
          ? null
          : { content: robots }
        : selector === '[data-analytics-body]' && hasBody
          ? articleBody
          : null,
    addEventListener: (type, listener) => {
      const listeners = documentListeners.get(type) ?? [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
  };
  const page = new URL(`${origin}${pathname}${search}${hash}`);
  const win = {
    location: page,
    scrollY: 0,
    innerHeight,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    addEventListener: (type, listener) => {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
  };
  const context = vm.createContext({
    document: doc,
    window: win,
    URL,
    Date,
    Set,
    encodeURIComponent,
  });
  vm.runInContext(javascript, context, { filename: 'analytics.js' });
  return {
    document: doc,
    window: win,
    scripts,
    articleBody,
    fireDocument(type, event = {}) {
      for (const listener of documentListeners.get(type) ?? [])
        listener({ type, ...event });
    },
    fireWindow(type, event = {}) {
      for (const listener of windowListeners.get(type) ?? [])
        listener({ type, ...event });
    },
  };
}

const noId = makeBrowser({ id: '' });
assert.equal(noId.window.dataLayer, undefined);
assert.equal(noId.scripts.length, 0, 'Missing ID loads no Google script');

const wrongOrigin = makeBrowser({ origin: 'https://preview.example' });
assert.equal(wrongOrigin.window.dataLayer, undefined);
assert.equal(wrongOrigin.scripts.length, 0, 'Origin mismatch sends nothing');

const httpOrigin = makeBrowser({
  expectedOrigin: 'http://localhost:4321',
  origin: 'http://localhost:4321',
  environment: 'production',
});
assert.equal(httpOrigin.window.dataLayer, undefined);
assert.equal(httpOrigin.scripts.length, 0, 'HTTP development sends nothing');

const admin = makeBrowser({ pathname: '/admin/' });
assert.equal(admin.window.dataLayer, undefined);
assert.equal(admin.scripts.length, 0, 'Management paths send nothing');

const notFound = makeBrowser({ pathname: '/404.html' });
assert.equal(notFound.window.dataLayer, undefined);
assert.equal(notFound.scripts.length, 0, '404 paths send nothing');

const preview = makeBrowser({ search: '?preview=1&token=secret' });
assert.equal(preview.window.dataLayer, undefined);
assert.equal(preview.scripts.length, 0, 'Preview query sends nothing');

const ordinaryStage = makeBrowser({ hash: '' });
assert.equal(ordinaryStage.window.dataLayer, undefined);
assert.equal(ordinaryStage.scripts.length, 0, 'Stage requires the debug hash');

const authHash = makeBrowser({ hash: '#access_token=secret' });
assert.equal(authHash.window.dataLayer, undefined);
assert.equal(
  authHash.scripts.length,
  0,
  'Authentication fragments send nothing'
);

const productionWithStageId = makeBrowser({
  expectedOrigin: 'https://seungjun.sh',
  origin: 'https://seungjun.sh',
  environment: 'production',
});
assert.equal(productionWithStageId.window.dataLayer, undefined);
assert.equal(
  productionWithStageId.scripts.length,
  0,
  'Stage ID is rejected on production origin'
);

for (const robots of ['noindex,nofollow', 'NOINDEX, follow', 'none', null]) {
  const excluded = makeBrowser({ robots });
  assert.equal(
    excluded.scripts.length,
    0,
    'Noindex or missing robots cannot initialize GA'
  );
}
const production = makeBrowser({
  id: 'G-RQ6456HXLD',
  expectedOrigin: 'https://seungjun.sh',
  environment: 'production',
  hash: '',
});
assert.equal(production.scripts.length, 1);
assert.equal(
  production.window.dataLayer.find((command) => command[0] === 'config')[2]
    .debug_mode,
  undefined
);
const unknownProduction = makeBrowser({
  id: 'G-UNKNOWN',
  expectedOrigin: 'https://seungjun.sh',
  environment: 'production',
  hash: '',
});
assert.equal(
  unknownProduction.scripts.length,
  0,
  'Only the approved production ID is accepted'
);
const absentBody = makeBrowser({ hasBody: false });
assert.equal(
  absentBody.window.dataLayer.filter((args) => args[1] === 'article_progress')
    .length,
  0
);
const browser = makeBrowser();
assert.equal(
  browser.scripts.length,
  1,
  'Only the explicit stage debug page loads one tag'
);
assert.match(browser.scripts[0].src, /id=G-8SFTFGKZ9Y$/);
const commands = browser.window.dataLayer;
assert.ok(
  commands.every(
    (command) =>
      Object.prototype.toString.call(command) === '[object Arguments]'
  ),
  'Google tag commands use the official Arguments queue format'
);
const configCalls = commands.filter((args) => args[0] === 'config');
assert.equal(configCalls.length, 1, 'One config call provides one page view');
assert.equal(
  commands.filter((args) => args[0] === 'event' && args[1] === 'page_view')
    .length,
  0,
  'No duplicate manual page_view'
);
assert.equal(
  configCalls[0][2].page_location,
  'https://devlog-site-stage.seungjun-jeong10.workers.dev/blog/example/'
);
assert.equal(configCalls[0][2].page_referrer, 'https://previous.example/page');
assert.equal(configCalls[0][2].page_title, 'devlog');
assert.equal(configCalls[0][2].debug_mode, true);
assert.equal(configCalls[0][2].allow_google_signals, false);
assert.equal(configCalls[0][2].allow_ad_personalization_signals, false);

const progressEvents = () =>
  browser.window.dataLayer.filter(
    (args) => args[0] === 'event' && args[1] === 'article_progress'
  );
browser.fireWindow('scroll');
assert.deepEqual(
  Array.from(progressEvents(), (args) => args[2].progress_percent),
  []
);
browser.window.scrollY = 150;
browser.fireWindow('scroll');
assert.deepEqual(
  Array.from(progressEvents(), (args) => args[2].progress_percent),
  [25]
);
browser.window.scrollY = 500;
browser.fireWindow('scroll');
browser.window.scrollY = 800;
browser.fireWindow('scroll');
browser.window.scrollY = 0;
browser.fireWindow('scroll');
browser.window.scrollY = 1000;
browser.fireWindow('scroll');
assert.deepEqual(
  Array.from(progressEvents(), (args) => args[2].progress_percent),
  [25, 50, 75, 90],
  'Jumping and repeated scrolling emits each threshold once'
);
assert.deepEqual(
  Object.keys(progressEvents()[0][2]),
  ['progress_percent'],
  'Progress events send only their allowed parameter'
);
browser.fireWindow('pageshow', { persisted: true });
assert.equal(progressEvents().length, 4, 'BFCache restore does not duplicate');

const navClick = {
  button: 0,
  defaultPrevented: false,
  preventDefaultCalls: 0,
  preventDefault() {
    this.preventDefaultCalls++;
  },
  target: {
    closest: () => ({
      href: 'https://devlog-site-stage.seungjun-jeong10.workers.dev/blog/next/?token=secret#top',
      dataset: { analyticsNavigation: 'next' },
    }),
  },
};
browser.fireDocument('click', navClick);
browser.fireDocument('auxclick', {
  ...navClick,
  button: 1,
  target: {
    closest: () => ({
      href: 'https://devlog-site-stage.seungjun-jeong10.workers.dev/blog/previous/',
      dataset: { analyticsNavigation: 'previous' },
    }),
  },
});
browser.fireDocument('click', {
  ...navClick,
  target: {
    closest: () => ({
      href: 'https://other.example/blog/external/',
      dataset: { analyticsNavigation: 'next' },
    }),
  },
});
browser.fireDocument('click', {
  ...navClick,
  target: {
    closest: () => ({
      href: 'https://devlog-site-stage.seungjun-jeong10.workers.dev/blog/',
      dataset: { analyticsNavigation: 'next' },
    }),
  },
});
assert.equal(navClick.preventDefaultCalls, 0, 'Link navigation stays native');
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      browser.window.dataLayer
        .filter(
          (args) => args[0] === 'event' && args[1] === 'article_navigation'
        )
        .map((args) => args[2])
    )
  ),
  [
    { navigation_direction: 'next', target_path: '/blog/next/' },
    { navigation_direction: 'previous', target_path: '/blog/previous/' },
  ],
  'Only same-origin article paths and direction are sent'
);

const zeroHeight = makeBrowser({ bodyHeight: 0 });
assert.equal(
  zeroHeight.window.dataLayer.filter(
    (args) => args[0] === 'event' && args[1] === 'article_progress'
  ).length,
  0,
  'Zero-height article sends no progress'
);

const shortArticle = makeBrowser({ bodyHeight: 100, innerHeight: 100 });
assert.deepEqual(
  Array.from(
    shortArticle.window.dataLayer.filter(
      (args) => args[0] === 'event' && args[1] === 'article_progress'
    ),
    (args) => args[2].progress_percent
  ),
  [25, 50, 75, 90],
  'A short initially visible article can cross every threshold'
);

const resized = makeBrowser({ bodyHeight: 1000, innerHeight: 100 });
resized.window.innerHeight = 250;
resized.fireWindow('resize');
assert.deepEqual(
  Array.from(
    resized.window.dataLayer.filter(
      (args) => args[0] === 'event' && args[1] === 'article_progress'
    ),
    (args) => args[2].progress_percent
  ),
  [25],
  'Viewport resize recalculates progress'
);

const hidden = makeBrowser({
  bodyHeight: 1000,
  innerHeight: 500,
  visibilityState: 'hidden',
});
const hiddenProgressEvents = () =>
  hidden.window.dataLayer.filter(
    (args) => args[0] === 'event' && args[1] === 'article_progress'
  );
assert.equal(hiddenProgressEvents().length, 0, 'Hidden pages are not measured');
hidden.document.visibilityState = 'visible';
hidden.fireDocument('visibilitychange');
assert.deepEqual(
  Array.from(hiddenProgressEvents(), (args) => args[2].progress_percent),
  [25, 50],
  'Returning to a visible page measures current progress'
);

const imageLoad = makeBrowser({ bodyHeight: 1000 });
imageLoad.articleBody.contains = (target) => target?.insideArticle === true;
imageLoad.articleBody.getBoundingClientRect = () => ({
  top: -imageLoad.window.scrollY,
  height: imageLoadHeight,
});
let imageLoadHeight = 1000;
imageLoadHeight = 200;
imageLoad.fireDocument('load', {
  target: { tagName: 'IMG', insideArticle: true },
});
assert.deepEqual(
  Array.from(
    imageLoad.window.dataLayer.filter(
      (args) => args[0] === 'event' && args[1] === 'article_progress'
    ),
    (args) => args[2].progress_percent
  ),
  [25, 50],
  'Image load recalculates visible article progress'
);

console.log(
  `PASS: ${htmlFiles.length} built pages, ${enabledPages} enabled pages, and mocked GA4 event guards`
);
