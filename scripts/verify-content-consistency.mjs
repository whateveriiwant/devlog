import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { URL } from 'node:url';
import cms from '../worker/cms.mjs';
import site from '../worker/site.mjs';
import { run as cleanup } from './verify-image-cleanup.mjs';
const { Request, Response, crypto, TextEncoder } = globalThis;
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const file of readdirSync(
  new URL('../migrations/', import.meta.url)
).sort())
  if (file.endsWith('.sql'))
    db.exec(
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    );
let failBatch = false;
const CONTENT = {
  prepare(sql) {
    const bound = (params) => ({
      sql,
      params,
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => ({
        success: db.prepare(sql).run(...params).changes > 0,
      }),
    });
    return { ...bound([]), bind: (...params) => bound(params) };
  },
  async batch(statements) {
    db.exec('BEGIN');
    try {
      const result = statements.map((s, i) => {
        if (failBatch && i === 1)
          throw new Error('Injected mid-transaction failure');
        const result = s.sql.startsWith('SELECT')
          ? { changes: 0 }
          : db.prepare(s.sql).run(...s.params);
        return { meta: { changes: Number(result.changes) } };
      });
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
const token = 'a'.repeat(43);
const digest = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(token)
);
const hash = [...new Uint8Array(digest)]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
db.prepare('INSERT INTO admin_sessions VALUES (?,?,?,?)').run(
  hash,
  'owner',
  0,
  Math.floor(Date.now() / 1000) + 3600
);
const env = {
  CONTENT,
  CONTENT_WRITES: 'true',
  SITE_ORIGIN: 'https://example.com',
  GITHUB_ALLOWED_LOGIN: 'owner',
  MEDIA_BASE_URL: 'https://media.example.com',
  MEDIA: {
    objects: new Map(),
    async put(key, bytes, options) {
      this.objects.set(key, { bytes: Buffer.from(bytes), options });
    },
    async list() {
      return { objects: [], truncated: false };
    },
  },
};
const call = (path, body, method = 'POST') =>
  cms.fetch(
    new Request(`https://cms.example/editor${path}`, {
      method,
      headers: {
        Origin: env.SITE_ORIGIN,
        Cookie: `__Host-cms_session=${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    env
  );
const write = (extra) => ({
  id: 'test',
  requestId: crypto.randomUUID(),
  operation: 'save',
  title: '초안 제목',
  slug: 'draft',
  markdown: '초안 키워드',
  expectedRevision: 0,
  baseRevision: 0,
  ...extra,
});
const initial = write();
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const upload = await cms.fetch(
  new Request('https://cms.example/media', {
    method: 'POST',
    headers: {
      Origin: env.SITE_ORIGIN,
      Cookie: `__Host-cms_session=${token}`,
      'Content-Type': 'image/png',
    },
    body: png,
  }),
  env
);
assert.equal(upload.status, 201);
const uploadedImage = await upload.json();
assert.match(uploadedImage.key, /^posts\/[0-9a-f-]+\.png$/);
assert.deepEqual(
  env.MEDIA.objects.get(uploadedImage.key).bytes,
  Buffer.from(png)
);
const deniedUpload = await cms.fetch(
  new Request('https://cms.example/media', {
    method: 'POST',
    headers: { Origin: env.SITE_ORIGIN, 'Content-Type': 'image/png' },
    body: png,
  }),
  env
);
assert.equal(deniedUpload.status, 401, 'Uploads require a live session');
const invalidUpload = await cms.fetch(
  new Request('https://cms.example/media', {
    method: 'POST',
    headers: {
      Origin: env.SITE_ORIGIN,
      Cookie: `__Host-cms_session=${token}`,
      'Content-Type': 'image/png',
    },
    body: 'not a PNG',
  }),
  env
);
assert.equal(invalidUpload.status, 400, 'Malformed images are rejected');
const saved = await (await call('/posts', initial)).json();
assert.equal(saved.revision, 1);
const replay = await (await call('/posts', initial)).json();
assert.equal(
  replay.revision,
  1,
  'Lost-response replay must include the confirmed draft revision'
);
// Public routes must change only on publish, and agree after delete/restore.
const publicRead = async (path) => {
  const response = await cms.fetch(
    new Request(`https://cms.example${path}`),
    env
  );
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return response;
};
const readJson = async (path) => (await publicRead(path)).json();
async function visible(slug, title, present) {
  const lists = ['/posts', '/feed', '/sitemap-entries'];
  for (const path of lists) {
    const data = await readJson(path);
    assert.equal(
      data.entries.some((p) => p.slug === slug),
      present,
      path
    );
    if (present && path !== '/sitemap-entries')
      assert.equal(data.entries.find((p) => p.slug === slug).title, title);
  }
  const search = await readJson(`/search?q=${encodeURIComponent(title)}`);
  assert.equal(
    search.entries.some((p) => p.url === `/blog/${slug}/`),
    present,
    'search'
  );
  assert.equal(
    (await publicRead(`/posts/${slug}`)).status,
    present ? 200 : 404,
    'detail'
  );
  assert.equal((await readJson('/stats')).posts, present ? 1 : 0);
  const siteEnv = {
    CONTENT_READS: 'true',
    CMS: { fetch: (req) => cms.fetch(req, env) },
  };
  for (const path of ['/rss.xml', '/sitemap.xml']) {
    const response = await site.fetch(
      new Request(`https://example.com${path}`),
      siteEnv
    );
    assert.equal(response.status, 200);
    assert.equal(
      (await response.text()).includes(`/blog/${slug}/`),
      present,
      path
    );
  }
}
await visible('draft', initial.title, false);
const bodyKey = uploadedImage.key;
const coverKey = 'posts/00000000-0000-4000-8000-000000000002.png';
const newKey = 'posts/00000000-0000-4000-8000-000000000003.png';
async function protectedImage(key, protectedReference = true) {
  const result = await cleanup({
    age: 7 * 24 * 60 * 60 * 1000,
    imageKey: key,
    readReferences: (sql) => db.prepare(sql).all(),
  });
  assert.equal(result.error, undefined);
  assert.equal(
    result.calls.some((c) => c.name === 'DeleteObject' && c.input.Key === key),
    !protectedReference,
    key
  );
}
const publication = write({
  requestId: crypto.randomUUID(),
  operation: 'publish',
  title: '공개 첫 제목',
  slug: 'live',
  markdown: `공개 본문 ![본문](${env.MEDIA_BASE_URL}/${bodyKey})`,
  thumbnail: `${env.MEDIA_BASE_URL}/${coverKey}`,
  seriesId: 'series',
  newSeries: { id: 'series', name: '검증 시리즈', slug: 'series' },
  tags: ['검증'],
  expectedRevision: 1,
});
const published = await (await call('/posts', publication)).json();
assert.equal(published.revision, 1);
assert.equal(
  (
    await call('/posts', {
      ...publication,
      newSeries: { ...publication.newSeries, name: '다른 시리즈명' },
    })
  ).status,
  409,
  'The same request ID must not acknowledge different series metadata'
);
assert.deepEqual(await (await call('/posts', publication)).json(), published);
assert.equal(
  (await call('/posts', { ...publication, title: '바뀐 재사용 요청' })).status,
  409
);
assert.equal((await readJson('/series')).entries[0].post_count, 1);
assert.equal((await readJson('/tags')).entries[0].post_count, 1);
assert.equal((await readJson('/posts/live/series')).totalCount, 1);
await visible('live', publication.title, true);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_drafts').get().n, 0);
assert.deepEqual(
  db
    .prepare('SELECT r2_key FROM post_images ORDER BY r2_key')
    .all()
    .map((r) => r.r2_key),
  [bodyKey, coverKey].sort()
);
const update = write({
  title: '수정 제목',
  slug: 'updated',
  markdown: `수정 본문 ![새 이미지](${env.MEDIA_BASE_URL}/${newKey})`,
  baseRevision: 1,
});
const draftUpdate = await (await call('/posts', update)).json();
assert.equal(draftUpdate.revision, 1);
await visible('live', publication.title, true);

assert.equal((await publicRead('/posts/updated')).status, 404);
assert.equal(
  (await readJson(`/search?q=${encodeURIComponent(update.title)}`)).entries
    .length,
  0
);
assert.deepEqual(
  db
    .prepare('SELECT r2_key FROM post_draft_images')
    .all()
    .map((r) => r.r2_key),
  [newKey]
);
for (const key of [bodyKey, coverKey, newKey]) await protectedImage(key);
assert.equal(
  (await call('/posts/test', { requestId: crypto.randomUUID() }, 'DELETE'))
    .status,
  200
);
for (const key of [bodyKey, coverKey, newKey]) await protectedImage(key);
assert.equal(
  (await call('/posts/test/restore', { requestId: crypto.randomUUID() }))
    .status,
  200
);
const stale = write({ title: '충돌 제목', slug: 'stale', baseRevision: 1 });
assert.equal((await call('/posts', stale)).status, 409);
// Both callers read the same revision before their transaction; exactly one may write.
const competing = [
  write({ ...update, requestId: crypto.randomUUID(), expectedRevision: 1 }),
  write({
    ...update,
    requestId: crypto.randomUUID(),
    expectedRevision: 1,
    title: '동시 수정',
  }),
];
assert.deepEqual(
  (await Promise.all(competing.map((p) => call('/posts', p))))
    .map((r) => r.status)
    .sort(),
  [200, 409]
);
const currentDraft = db
  .prepare('SELECT * FROM post_drafts WHERE post_id=?')
  .get('test');
assert.equal(currentDraft.revision, 2);
assert.equal(
  (await call('/posts', update)).status,
  409,
  'An old request cannot claim the current draft was saved'
);
const before = db.prepare('SELECT * FROM posts WHERE id=?').get('test');
failBatch = true;
await assert.rejects(
  call(
    '/posts',
    write({
      ...update,
      requestId: crypto.randomUUID(),
      operation: 'publish',
      expectedRevision: 2,
    })
  ),
  /Injected/
);
failBatch = false;
assert.deepEqual(
  db.prepare('SELECT * FROM posts WHERE id=?').get('test'),
  before,
  'A batch failure rolls back the public write'
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM post_draft_images').get().n,
  1
);
const editPublish = write({
  ...update,
  title: currentDraft.title,
  requestId: crypto.randomUUID(),
  operation: 'publish',
  expectedRevision: 2,
});
const updated = await (await call('/posts', editPublish)).json();
assert.equal(updated.revision, 2);
assert.equal(updated.publishedAt, published.publishedAt);
assert.deepEqual(await (await call('/posts', editPublish)).json(), updated);
await visible('updated', editPublish.title, true);
assert.equal((await publicRead('/posts/live')).status, 404);
assert.equal(
  (await readJson(`/search?q=${encodeURIComponent(publication.title)}`)).entries
    .length,
  0
);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM post_draft_images').get().n,
  0
);
assert.deepEqual(
  db
    .prepare('SELECT r2_key FROM post_images')
    .all()
    .map((r) => r.r2_key),
  [newKey]
);
const deletion = { requestId: crypto.randomUUID() };
const deleted = await (await call('/posts/test', deletion, 'DELETE')).json();
assert.equal(typeof deleted.deletedAt, 'string');
assert.equal(
  (await call('/posts', write({ id: 'slug-conflict', slug: 'updated' })))
    .status,
  409,
  'Trash keeps its URL reserved for restoration'
);
assert.deepEqual(
  await (await call('/posts/test', deletion, 'DELETE')).json(),
  deleted
);
await visible('updated', editPublish.title, false);
assert.equal((await readJson('/series')).entries.length, 0);
assert.equal((await readJson('/tags')).entries.length, 0);
assert.equal((await publicRead('/posts/updated/series')).status, 404);
assert.equal(
  db.prepare('SELECT COUNT(*) AS n FROM post_images').get().n,
  1,
  'Trash retains its image references'
);
await protectedImage(newKey);
await protectedImage(bodyKey, false);
const restore = { requestId: crypto.randomUUID() };
const restored = await (await call('/posts/test/restore', restore)).json();
assert.equal(restored.deletedAt, null);
assert.deepEqual(
  await (await call('/posts/test/restore', restore)).json(),
  restored
);
assert.equal(
  (await call('/posts/test', deletion, 'DELETE')).status,
  409,
  'Old delete replay cannot delete a restored post'
);
await visible('updated', editPublish.title, true);
// Use the exact client helper: lose the response after commit and retry the same body.
const compiled = ts.transpileModule(
  readFileSync(new URL('../src/lib/editor-api.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext } }
).outputText;
const { editorRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const originalFetch = globalThis.fetch;
try {
  const bodies = [];
  globalThis.fetch = async (path, options) => {
    bodies.push(options.body);
    const response = await call(
      path.replace('/api/content/editor', ''),
      JSON.parse(options.body),
      options.method
    );
    if (bodies.length === 1) throw new Error('Response lost after commit');
    return response;
  };
  const request = write({
    id: 'retry',
    slug: 'retry',
    title: '응답 유실 초안',
  });
  const recovered = await editorRequest('/posts', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  assert.equal(recovered.revision, 1);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(
    db.prepare("SELECT revision FROM post_drafts WHERE post_id='retry'").get()
      .revision,
    1
  );
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    return new Response('{}', { status: 503 });
  };
  await assert.rejects(
    editorRequest('/posts', { method: 'POST', body: JSON.stringify(request) }),
    /결과를 확인하지 못/
  );
  assert.equal(attempts, 2);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(
    editorRequest('/posts', { method: 'POST', body: JSON.stringify(request) }),
    /올바르지/
  );
  globalThis.fetch = async () =>
    Response.json({ error: '충돌' }, { status: 409 });
  await assert.rejects(
    editorRequest('/posts', { method: 'POST', body: JSON.stringify(request) }),
    /충돌/
  );
} finally {
  globalThis.fetch = originalFetch;
}
const logout = await cms.fetch(
  new Request('https://cms.example/logout', {
    method: 'POST',
    headers: {
      Origin: env.SITE_ORIGIN,
      Cookie: `__Host-cms_session=${token}`,
    },
  }),
  env
);
assert.equal(logout.status, 204);
assert.equal(
  (
    await cms.fetch(
      new Request('https://cms.example/session', {
        headers: { Cookie: `__Host-cms_session=${token}` },
      }),
      env
    )
  ).status,
  401,
  'Logout revokes the server-side session'
);
assert.equal(
  (await call('/posts', write({ id: 'after-logout' }))).status,
  401,
  'Revoked sessions cannot write'
);
db.close();
console.log(
  'PASS: auth/session revocation, image upload/reference retention, draft/publish/edit/delete/restore consistency, SQL rollback, request replay/conflicts and bounded retry'
);
