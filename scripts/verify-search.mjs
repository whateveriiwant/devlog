import assert from 'node:assert/strict';
import console from 'node:console';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import cms from '../worker/cms.mjs';
import site from '../worker/site.mjs';

const { Request, Response } = globalThis;
const root = new URL('../', import.meta.url);
const db = new DatabaseSync(':memory:');
for (const name of ['0001_content.sql', '0002_rendered_content.sql'])
  db.exec(fs.readFileSync(new URL(`migrations/${name}`, root), 'utf8'));
const CONTENT = {
  prepare(sql) {
    const statement = db.prepare(sql);
    return {
      bind(...params) {
        return { all: async () => ({ results: statement.all(...params) }) };
      },
    };
  },
};
const insert = db.prepare(`INSERT INTO posts
  (id, slug, title, description, markdown, published_at, draft, deleted_at, source_hash, searchable_text)
  VALUES (?, ?, ?, '', 'raw markdown must stay private', '2026-09-30', ?, ?, 'test', ?)`);
insert.run('live', 'live', '검색 대상', 0, null, '현재 본문 키워드');
insert.run('draft', 'draft', '검색 초안', 1, null, '현재 본문 키워드');
insert.run(
  'trash',
  'trash',
  '검색 휴지통',
  0,
  '2026-09-30',
  '현재 본문 키워드'
);
const env = {
  CONTENT_READS: 'true',
  CMS: { fetch: (request) => cms.fetch(request, { CONTENT }) },
};
const source = fs.readFileSync(new URL('src/lib/search.ts', root), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { searchPosts } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = (path) => {
  calls.push(path);
  return site.fetch(new Request(`https://example.com${path}`), env);
};
try {
  const found = await searchPosts('현재 키워드');
  assert.deepEqual(
    found.map((post) => post.url),
    ['/blog/live/']
  );
  assert.equal(JSON.stringify(found).includes('raw markdown'), false);
  assert.deepEqual(await searchPosts('없는단어'), []);
  db.exec("UPDATE posts SET searchable_text='수정된 본문' WHERE id='live'");
  assert.deepEqual(await searchPosts('현재 키워드'), []);
  assert.equal((await searchPosts('수정된')).length, 1);
  db.exec("UPDATE posts SET deleted_at='2026-09-30' WHERE id='live'");
  assert.deepEqual(await searchPosts('수정된'), []);
  db.exec("UPDATE posts SET deleted_at=NULL WHERE id='live'");
  assert.equal((await searchPosts('수정된')).length, 1);
  for (const failure of [
    () => Promise.resolve(new Response('{}', { status: 503 })),
    () => Promise.resolve(new Response('invalid JSON')),
    () => Promise.resolve(Response.json({ entries: null })),
    () => Promise.reject(new Error('Network unavailable')),
  ]) {
    let attempts = 0;
    globalThis.fetch = (path) => {
      calls.push(path);
      attempts++;
      return failure();
    };
    await assert.rejects(searchPosts('검색'));
    assert.equal(
      attempts,
      1,
      'A failed search must not request a static fallback'
    );
  }
  assert.ok(calls.every((path) => path.startsWith('/api/content/search?q=')));
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}

let assetReads = 0;
for (const path of [
  '/search-index.json',
  '/search-index.json/',
  '/search-index.json/index.html',
  '/pagefind',
  '/pagefind/pagefind.js',
  '/pagefind/fragment/test.pf_fragment',
  '/admin/legacy.html',
  '/admin/config.yml',
  '/admin/admin.css',
  '/admin/r2-media.js',
  '/admin/legacy.html/',
  '/%73earch-index.json',
]) {
  for (const method of ['GET', 'HEAD']) {
    const response = await site.fetch(
      new Request(`https://example.com${path}`, { method }),
      {
        CONTENT_READS: 'true',
        ASSETS: {
          fetch: async () => {
            assetReads++;
            return new Response('stale content');
          },
        },
      }
    );
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
}
assert.equal(
  assetReads,
  0,
  'Retired assets must be rejected before asset or session reads'
);
const nested = await site.fetch(
  new Request('https://example.com/blog/old/index.html'),
  {
    CONTENT_READS: 'true',
    ASSETS: {
      fetch: async () => {
        assetReads++;
        return new Response('old article');
      },
    },
  }
);
assert.equal(nested.status, 404);
assert.equal(assetReads, 0);
const bundle = fs.readFileSync(new URL('wrangler.jsonc', root), 'utf8');
for (const path of [
  '/search-index.json',
  '/search-index.json/*',
  '/pagefind',
  '/pagefind/*',
])
  assert.ok(
    bundle.includes(JSON.stringify(path)),
    `Worker must intercept ${path}`
  );
for (const name of [
  'search-index.json',
  'pagefind',
  'admin/legacy.html',
  'admin/config.yml',
  'admin/r2-media.js',
  'admin/admin.css',
])
  assert.equal(
    fs.existsSync(new URL(`dist/${name}`, root)),
    false,
    `No built ${name}`
  );
console.log(
  'PASS: D1 search, edit/delete/restore visibility, private content exclusion, failure without fallback, retired routes and build assets'
);
