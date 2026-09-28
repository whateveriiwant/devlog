import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { URL } from 'node:url';
import cms from '../worker/cms.mjs';
import site from '../worker/site.mjs';

const { Request } = globalThis;

// Exercise the deployed handler's SQL against an isolated SQLite database.
// No credentials, network requests or production data are used.
const db = new DatabaseSync(':memory:');
for (const file of ['0001_content.sql', '0002_rendered_content.sql'])
  db.exec(
    readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
  );
const CONTENT = {
  prepare(sql) {
    const statement = db.prepare(sql);
    return {
      bind(...params) {
        return {
          first: async () => statement.get(...params) ?? null,
          all: async () => ({ results: statement.all(...params) }),
        };
      },
    };
  },
};
const env = { CONTENT, SITE_ORIGIN: 'https://example.com' };
db.exec(
  "INSERT INTO series (id, name, slug) VALUES ('series', '시리즈', 'series'), ('other', '다른 시리즈', 'other')"
);
const insert = db.prepare(`INSERT INTO posts
  (id, slug, title, markdown, published_at, series_id, draft, deleted_at, source_hash)
  VALUES (?, ?, ?, 'private raw body', '2026-09-28T00:00:00.000Z', ?, ?, ?, 'test')`);
for (let i = 0; i < 1001; i++) {
  const id = `p-${String(i).padStart(4, '0')}`;
  insert.run(id, id, `글 ${i}`, 'series', 0, null);
}
insert.run('draft', 'draft', '초안', 'series', 1, null);
insert.run('deleted', 'deleted', '휴지통', 'series', 0, '2026-09-28');
insert.run('other', 'other', '다른 글', 'other', 0, null);
insert.run('solo', 'solo', '개별 글', null, 0, null);

async function read(slug, query = '', origin) {
  return cms.fetch(
    new Request(`https://cms.example/posts/${slug}/series${query}`, {
      headers: origin ? { Origin: origin } : {},
    }),
    env
  );
}

const middle = await read('p-0500');
assert.equal(middle.headers.get('Cache-Control'), 'no-store');
const initial = await middle.json();
assert.equal(initial.totalCount, 1001);
assert.equal(
  initial.page,
  125,
  'Start on the page containing the current post'
);
assert.equal(initial.posts.length, 4);
assert.equal(initial.posts[0].position, 501);
assert.equal(initial.posts[0].current, true);
assert.deepEqual(
  initial.posts.map((post) => post.href),
  ['/blog/p-0500/', '/blog/p-0499/', '/blog/p-0498/', '/blog/p-0497/']
);
assert.equal(JSON.stringify(initial).includes('private raw body'), false);
const first = await (await read('p-0500', '?page=0')).json();
assert.equal(first.posts[0].href, '/blog/p-1000/');
assert.equal(
  first.posts.some((post) => post.current),
  false
);
const last = await (await read('p-0000', '?page=999999999')).json();
assert.equal(last.page, 250);
assert.equal(last.posts.length, 1);
assert.equal(last.posts[0].current, true);
assert.equal(last.posts[0].position, 1001);
for (const slug of ['draft', 'deleted', 'missing'])
  assert.equal((await read(slug)).status, 404);
for (const query of ['?page=-1', '?page=1.5', '?page=Infinity', '?page=abc'])
  assert.equal((await read('p-0500', query)).status, 400);
assert.equal((await read('%ZZ')).status, 400);
assert.equal(
  (await read('p-0500', '', 'https://untrusted.example')).status,
  403
);
assert.equal((await (await read('solo')).json()).totalCount, 0);

// A publish, delete, restore and series change must appear on the next read.
insert.run('new', 'new', '새 글', 'series', 0, null);
assert.equal((await (await read('p-0500', '?page=0')).json()).totalCount, 1002);
db.exec("UPDATE posts SET deleted_at='2026-09-28' WHERE id='new'");
assert.equal((await (await read('p-0500', '?page=0')).json()).totalCount, 1001);
db.exec("UPDATE posts SET deleted_at=NULL WHERE id='new'");
assert.equal((await (await read('p-0500', '?page=0')).json()).totalCount, 1002);
db.exec(
  "UPDATE posts SET title='수정한 제목', series_id='other' WHERE id='p-0500'"
);
const moved = await (await read('p-0500')).json();
assert.equal(moved.name, '다른 시리즈');
assert.equal(moved.totalCount, 2);
assert.equal(moved.posts.find((post) => post.current).title, '수정한 제목');

const proxied = await site.fetch(
  new Request('https://example.com/api/content/posts/p-0500/series?page=0'),
  {
    CONTENT_READS: 'true',
    CMS: { fetch: (request) => cms.fetch(request, env) },
  }
);
assert.equal(proxied.status, 200);
assert.equal((await proxied.json()).totalCount, 2);
db.close();
console.log(
  'PASS: series pagination, current page, 1001 posts, private content exclusion, input validation, mutations and site proxy'
);
