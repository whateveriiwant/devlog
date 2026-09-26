import { toText } from 'hast-util-to-text';
import { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import GithubSlugger from 'github-slugger';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_MARKDOWN_BYTES = 1_500_000;
const renderSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes['*'] || []), 'align'],
    img: [
      ...(defaultSchema.attributes.img || []),
      'width',
      'height',
      'loading',
      'decoding',
    ],
    code: [['className', /^language-./]],
  },
};
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, renderSchema)
  .use(() => (tree) => {
    const slugger = new GithubSlugger();
    const headings = [];
    let hasH1 = false;
    visit(tree, 'element', (node) => {
      if (node.tagName === 'h1') hasH1 = true;
    });
    visit(tree, 'element', (node) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const depth = Number(node.tagName[1]) + (hasH1 ? 1 : 0);
      node.tagName = `h${Math.min(depth, 6)}`;
      const text = toText(node);
      const slug = slugger.slug(text);
      node.properties.id = slug;
      headings.push({ depth, slug, text });
    });
    tree.data = { ...(tree.data || {}), headings };
  })
  .use(rehypeStringify);
const contentWritesEnabled = (env) =>
  env.CONTENT_WRITES === 'true' || env.STAGE_CONTENT_WRITES === 'true';
const types = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
  'image/avif': { ext: 'avif', magic: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70] },
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function cookie(request, name) {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
    )
  );
}

async function authenticated(request, env, name = 'cms_session') {
  if (!env.SESSION_SECRET) return false;
  const value = cookie(request, name);
  if (!value) return false;
  const [login, expires, signature] = value.split('.');
  if (
    login !== env.GITHUB_ALLOWED_LOGIN ||
    !/^\d+$/.test(expires) ||
    Number(expires) < Date.now()
  )
    return false;
  return signature === (await sign(`${login}.${expires}`, env.SESSION_SECRET));
}

function cors(request, env) {
  return request.headers.get('Origin') === env.SITE_ORIGIN
    ? {
        'Access-Control-Allow-Origin': env.SITE_ORIGIN,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        Vary: 'Origin',
      }
    : null;
}

async function isEditor(request, env) {
  if (request.headers.get('Origin') !== env.SITE_ORIGIN) return false;
  if (await authenticated(request, env)) return true;
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'devlog-cms',
      },
    });
    if (!response.ok) return false;
    const user = await response.json();
    return user.login === env.GITHUB_ALLOWED_LOGIN;
  } catch {
    return false;
  }
}

function editorHeaders(request, env) {
  if (request.headers.get('Origin') !== env.SITE_ORIGIN) return null;
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

async function renderMarkdown(markdown) {
  const tree = await markdownProcessor.run(markdownProcessor.parse(markdown));
  return {
    html: String(markdownProcessor.stringify(tree)),
    headings: tree.data?.headings || [],
    text: toText(tree),
  };
}

function mediaKeys(markdown, thumbnail, mediaBaseUrl) {
  if (!mediaBaseUrl) return [];
  const base = new URL(mediaBaseUrl);
  const prefix = `${base.pathname.replace(/\/$/, '')}/`;
  return [
    ...new Set(
      [
        ...`${markdown}\n${thumbnail || ''}`.matchAll(
          /https:\/\/[^\s)\"'<>]+/g
        ),
      ].flatMap(([value]) => {
        try {
          const imageUrl = new URL(value);
          if (
            imageUrl.origin !== base.origin ||
            !imageUrl.pathname.startsWith(prefix)
          )
            return [];
          const key = decodeURIComponent(
            imageUrl.pathname.slice(prefix.length)
          );
          return /^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/i.test(
            key
          )
            ? [key]
            : [];
        } catch {
          return [];
        }
      })
    ),
  ];
}

function editorSummary(post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    publishedAt: post.published_at,
    revision: post.revision,
    hasDraft: Boolean(post.has_draft),
  };
}

async function editorContent(request, env, url) {
  const headers = editorHeaders(request, env);
  if (!headers) return json({ error: 'Forbidden origin' }, 403);
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers });
  if (url.pathname === '/editor/config' && request.method === 'GET')
    return json(
      {
        enabled: contentWritesEnabled(env),
        authOrigin: env.AUTH_ORIGIN || 'https://cms-api.seungjun.sh',
      },
      200,
      headers
    );
  if (!env.CONTENT || !contentWritesEnabled(env))
    return json({ error: 'Editor D1 writes are disabled' }, 404, headers);
  if (!(await isEditor(request, env)))
    return json(
      { error: '로그인이 필요하거나 허용되지 않은 계정입니다.' },
      401,
      headers
    );

  const postAction = /^\/editor\/posts\/([^/]+)(?:\/(restore))?$/.exec(
    url.pathname
  );
  if (
    postAction &&
    ((request.method === 'DELETE' && !postAction[2]) ||
      (request.method === 'POST' && postAction[2]))
  ) {
    let id;
    try {
      id = decodeURIComponent(postAction[1]);
    } catch {
      return json({ error: '글 ID가 올바르지 않습니다.' }, 400, headers);
    }
    if (!/^[\w.-]{1,120}$/.test(id))
      return json({ error: '글 ID가 올바르지 않습니다.' }, 400, headers);
    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: 'JSON 요청이 올바르지 않습니다.' }, 400, headers);
    }
    const requestId = String(input.requestId || '');
    const operation = postAction[2] ? 'restore' : 'delete';
    if (!/^[\w-]{8,80}$/.test(requestId))
      return json({ error: '요청 ID가 올바르지 않습니다.' }, 400, headers);
    const previous = await env.CONTENT.prepare(
      'SELECT post_id, operation FROM content_write_requests WHERE request_id=?'
    )
      .bind(requestId)
      .first();
    if (previous) {
      if (previous.post_id !== id || previous.operation !== operation)
        return json(
          { error: '요청 ID가 다른 작업에 사용되었습니다.' },
          409,
          headers
        );
      return json({ ok: true, duplicate: true, id }, 200, headers);
    }
    const now = new Date().toISOString();
    const update =
      operation === 'delete'
        ? env.CONTENT.prepare(
            'UPDATE posts SET deleted_at=? WHERE id=? AND draft=0 AND deleted_at IS NULL'
          ).bind(now, id)
        : env.CONTENT.prepare(
            'UPDATE posts SET deleted_at=NULL WHERE id=? AND draft=0 AND deleted_at IS NOT NULL'
          ).bind(id);
    const log = env.CONTENT.prepare(
      `INSERT OR IGNORE INTO content_write_requests(request_id,post_id,operation,created_at)
       SELECT ?,?,?,? WHERE changes()=1 AND EXISTS(
         SELECT 1 FROM posts WHERE id=? AND ((?='delete' AND deleted_at=?) OR (?='restore' AND deleted_at IS NULL))
       )`
    ).bind(requestId, id, operation, now, id, operation, now, operation);
    const results = await env.CONTENT.batch([update, log]);
    if (!results[0].meta.changes)
      return json(
        { error: '글 상태가 변경되었습니다. 목록을 새로고침해 주세요.' },
        409,
        headers
      );
    return json(
      { ok: true, id, deletedAt: operation === 'delete' ? now : null },
      200,
      headers
    );
  }

  if (url.pathname === '/editor/posts' && request.method === 'GET') {
    const [posts, drafts, series, trash] = await Promise.all([
      env.CONTENT.prepare(
        `SELECT p.id, p.title, p.slug, p.published_at, p.revision,
          EXISTS(SELECT 1 FROM post_drafts d WHERE d.post_id=p.id) AS has_draft
         FROM posts p WHERE p.draft=0 AND p.deleted_at IS NULL
         ORDER BY p.published_at DESC, p.id DESC LIMIT 500`
      ).all(),
      env.CONTENT.prepare(
        `SELECT post_id AS id, title, slug, revision, base_revision
         FROM post_drafts ORDER BY updated_at DESC LIMIT 500`
      ).all(),
      env.CONTENT.prepare(
        'SELECT id, name, slug, description FROM series ORDER BY name COLLATE NOCASE'
      ).all(),
      env.CONTENT.prepare(
        `SELECT id, title, slug, published_at, revision, deleted_at
         FROM posts WHERE draft=0 AND deleted_at IS NOT NULL
         ORDER BY deleted_at DESC LIMIT 500`
      ).all(),
    ]);
    return json(
      {
        posts: posts.results.map(editorSummary),
        drafts: drafts.results.map((draft) => ({
          id: draft.id,
          title: draft.title,
          revision: draft.revision,
          baseRevision: draft.base_revision,
        })),
        series: series.results,
        trash: trash.results.map((post) => ({
          ...editorSummary(post),
          deletedAt: post.deleted_at,
        })),
      },
      200,
      headers
    );
  }

  if (url.pathname.startsWith('/editor/posts/') && request.method === 'GET') {
    const id = decodeURIComponent(url.pathname.slice('/editor/posts/'.length));
    const row =
      (await env.CONTENT.prepare(
        `SELECT d.post_id AS id, d.title, d.slug, d.description, d.markdown,
        d.tags_json, d.series_id, d.series_json, d.thumbnail,
        d.revision, d.base_revision, p.published_at, p.revision AS published_revision
       FROM post_drafts d LEFT JOIN posts p ON p.id=d.post_id
       WHERE d.post_id=?`
      )
        .bind(id)
        .first()) ||
      (await env.CONTENT.prepare(
        `SELECT id, title, slug, description, markdown, tags_json, series_id,
        NULL AS series_json, thumbnail, revision, revision AS base_revision,
        published_at, revision AS published_revision
       FROM posts WHERE id=? AND draft=0 AND deleted_at IS NULL`
      )
        .bind(id)
        .first());
    if (!row) return json({ error: 'Not found' }, 404, headers);
    return json(
      {
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        markdown: row.markdown,
        tags: JSON.parse(row.tags_json),
        seriesId: row.series_id,
        newSeries: row.series_json ? JSON.parse(row.series_json) : null,
        thumbnail: row.thumbnail,
        revision: row.revision,
        baseRevision: row.base_revision,
        publishedAt: row.published_at,
        publishedRevision: row.published_revision,
        isDraft: Boolean(
          row.series_json !== null ||
          row.base_revision !== row.revision ||
          (await env.CONTENT.prepare(
            'SELECT 1 FROM post_drafts WHERE post_id=?'
          )
            .bind(id)
            .first())
        ),
      },
      200,
      headers
    );
  }

  if (url.pathname === '/editor/posts' && request.method === 'POST') {
    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: 'JSON 요청이 올바르지 않습니다.' }, 400, headers);
    }
    const id = String(input.id || '');
    const requestId = String(input.requestId || '');
    const operation = input.operation;
    const title = String(input.title || '').trim();
    const slug = String(input.slug || '').trim();
    const markdown = String(input.markdown || '');
    const description = String(input.description || '').trim();
    const tags = Array.isArray(input.tags)
      ? [
          ...new Set(
            input.tags.map((tag) => String(tag).trim()).filter(Boolean)
          ),
        ]
      : [];
    const seriesId = input.seriesId ? String(input.seriesId) : null;
    const newSeries =
      input.newSeries && typeof input.newSeries === 'object'
        ? input.newSeries
        : null;
    const expectedRevision = Number(input.expectedRevision || 0);
    const baseRevision = Number(input.baseRevision || 0);
    const validText = (value, max) => value.length <= max;
    if (
      !/^[\w.-]{1,120}$/.test(id) ||
      !/^[\w-]{8,80}$/.test(requestId) ||
      !['save', 'publish'].includes(operation) ||
      !title ||
      !slug ||
      !/^[^/\\?#%]+$/.test(slug) ||
      !validText(title, 300) ||
      !validText(description, 5000) ||
      new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES ||
      tags.length > 50 ||
      tags.some((tag) => tag.length > 80) ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0 ||
      !Number.isInteger(baseRevision) ||
      baseRevision < 0
    )
      return json(
        { error: '입력값이 올바르지 않거나 글 크기가 제한을 넘었습니다.' },
        400,
        headers
      );

    const previousRequest = await env.CONTENT.prepare(
      'SELECT post_id, operation FROM content_write_requests WHERE request_id=?'
    )
      .bind(requestId)
      .first();
    if (previousRequest) {
      if (
        previousRequest.post_id !== id ||
        previousRequest.operation !== operation
      )
        return json(
          { error: '요청 ID가 다른 글에 이미 사용되었습니다.' },
          409,
          headers
        );
      return json({ ok: true, duplicate: true, id }, 200, headers);
    }

    const published = await env.CONTENT.prepare(
      'SELECT revision, published_at FROM posts WHERE id=? AND draft=0 AND deleted_at IS NULL'
    )
      .bind(id)
      .first();
    const currentDraft = await env.CONTENT.prepare(
      'SELECT revision, base_revision FROM post_drafts WHERE post_id=?'
    )
      .bind(id)
      .first();
    if (
      (published?.revision || 0) !== baseRevision ||
      (currentDraft?.revision || 0) !== expectedRevision ||
      (currentDraft && currentDraft.base_revision !== baseRevision)
    )
      return json(
        {
          error:
            '다른 탭에서 글이 변경되었습니다. 새로고침한 뒤 다시 열어 주세요.',
        },
        409,
        headers
      );

    const duplicateSlug = await env.CONTENT.prepare(
      `SELECT id FROM posts WHERE slug=? AND id<>? AND deleted_at IS NULL
       UNION SELECT post_id AS id FROM post_drafts WHERE slug=? AND post_id<>? LIMIT 1`
    )
      .bind(slug, id, slug, id)
      .first();
    if (duplicateSlug)
      return json(
        { error: '같은 주소를 쓰는 글이 있습니다. 제목을 바꿔 주세요.' },
        409,
        headers
      );
    if (seriesId) {
      const found =
        newSeries?.id === seriesId ||
        (await env.CONTENT.prepare('SELECT id FROM series WHERE id=?')
          .bind(seriesId)
          .first());
      if (!found)
        return json(
          { error: '선택한 시리즈를 찾을 수 없습니다.' },
          400,
          headers
        );
    }

    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(tags);
    const thumbnail = input.thumbnail
      ? String(input.thumbnail).slice(0, 2048)
      : null;
    const seriesJson =
      newSeries && newSeries.id === seriesId
        ? JSON.stringify({
            id: seriesId,
            name: String(newSeries.name || '').slice(0, 160),
            slug: String(newSeries.slug || '').slice(0, 180),
            description: String(newSeries.description || '').slice(0, 2000),
          })
        : null;
    const hash = async (value) =>
      base64url(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
        )
      );
    const sourceHash = await hash(
      `${title}\0${slug}\0${description}\0${markdown}\0${tagsJson}\0${seriesId || ''}\0${thumbnail || ''}`
    );
    if (operation === 'save') {
      const write = env.CONTENT.prepare(
        `INSERT INTO post_drafts (post_id,title,slug,description,markdown,tags_json,
          series_id,series_json,thumbnail,base_revision,revision,updated_at,request_id)
         SELECT ?,?,?,?,?,?,?,?,?,?,1,?,?
         WHERE COALESCE((SELECT revision FROM posts WHERE id=? AND draft=0 AND deleted_at IS NULL),0)=?
         ON CONFLICT(post_id) DO UPDATE SET title=excluded.title,slug=excluded.slug,
          description=excluded.description,markdown=excluded.markdown,tags_json=excluded.tags_json,
          series_id=excluded.series_id,series_json=excluded.series_json,thumbnail=excluded.thumbnail,
          revision=post_drafts.revision+1,updated_at=excluded.updated_at,request_id=excluded.request_id
         WHERE post_drafts.revision=? AND post_drafts.base_revision=?
          AND COALESCE((SELECT revision FROM posts WHERE id=? AND draft=0 AND deleted_at IS NULL),0)=?`
      ).bind(
        id,
        title,
        slug,
        description,
        markdown,
        tagsJson,
        seriesId,
        seriesJson,
        thumbnail,
        baseRevision,
        now,
        requestId,
        id,
        baseRevision,
        expectedRevision,
        baseRevision,
        id,
        baseRevision
      );
      const logged = env.CONTENT.prepare(
        `INSERT OR IGNORE INTO content_write_requests(request_id,post_id,operation,created_at)
         SELECT ?,?,'save',? WHERE EXISTS(SELECT 1 FROM post_drafts WHERE post_id=? AND request_id=?)`
      ).bind(requestId, id, now, id, requestId);
      const draftImages = mediaKeys(markdown, thumbnail, env.MEDIA_BASE_URL);
      const imageReferences = [
        env.CONTENT.prepare(
          `DELETE FROM post_draft_images WHERE post_id=?
           AND EXISTS(SELECT 1 FROM post_drafts WHERE post_id=? AND request_id=?)`
        ).bind(id, id, requestId),
        ...draftImages.map((key) =>
          env.CONTENT.prepare(
            `INSERT OR IGNORE INTO post_draft_images(post_id,r2_key)
             SELECT ?,? WHERE EXISTS(SELECT 1 FROM post_drafts WHERE post_id=? AND request_id=?)`
          ).bind(id, key, id, requestId)
        ),
      ];
      const results = await env.CONTENT.batch([
        write,
        ...imageReferences,
        logged,
      ]);
      if (!results[0].meta.changes)
        return json(
          { error: '저장 충돌이 발생했습니다. 글 목록을 새로고침해 주세요.' },
          409,
          headers
        );
      return json(
        { ok: true, id, revision: expectedRevision + 1, baseRevision },
        200,
        headers
      );
    }

    let rendered;
    try {
      rendered = await renderMarkdown(markdown);
    } catch {
      return json(
        { error: '마크다운 렌더링에 실패해 공개본을 변경하지 않았습니다.' },
        422,
        headers
      );
    }
    if (new TextEncoder().encode(rendered.html).length > MAX_MARKDOWN_BYTES)
      return json(
        { error: '렌더링한 글이 허용 크기를 넘었습니다.' },
        413,
        headers
      );
    const publishedAt = published?.published_at || now;
    const nextRevision = (published?.revision || 0) + 1;
    const write = env.CONTENT.prepare(
      `INSERT INTO posts(id,slug,title,description,markdown,published_at,updated_at,tags_json,
        series_id,thumbnail,draft,revision,source_hash,rendered_html,headings_json,searchable_text)
       SELECT ?,?,?,?,?,?,?,?, ?,?,0,?,?, ?,?,?
       WHERE COALESCE((SELECT revision FROM posts WHERE id=? AND draft=0 AND deleted_at IS NULL),0)=?
        AND COALESCE((SELECT revision FROM post_drafts WHERE post_id=?),0)=?
       ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,
        description=excluded.description,markdown=excluded.markdown,updated_at=excluded.updated_at,
        tags_json=excluded.tags_json,series_id=excluded.series_id,thumbnail=excluded.thumbnail,
        draft=0,revision=posts.revision+1,source_hash=excluded.source_hash,
        rendered_html=excluded.rendered_html,headings_json=excluded.headings_json,
        searchable_text=excluded.searchable_text
       WHERE posts.revision=? AND posts.draft=0 AND posts.deleted_at IS NULL`
    ).bind(
      id,
      slug,
      title,
      description,
      markdown,
      publishedAt,
      now,
      tagsJson,
      seriesId,
      thumbnail,
      nextRevision,
      sourceHash,
      rendered.html,
      JSON.stringify(rendered.headings),
      rendered.text,
      id,
      baseRevision,
      id,
      expectedRevision,
      baseRevision
    );
    const seriesWrite = seriesJson
      ? env.CONTENT.prepare(
          `INSERT INTO series(id,name,slug,description)
       SELECT json_extract(?,'$.id'),json_extract(?,'$.name'),json_extract(?,'$.slug'),json_extract(?,'$.description')
       WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND source_hash=?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description`
        ).bind(
          seriesJson,
          seriesJson,
          seriesJson,
          seriesJson,
          id,
          nextRevision,
          sourceHash
        )
      : env.CONTENT.prepare('SELECT 1');
    const imageKeys = mediaKeys(markdown, thumbnail, env.MEDIA_BASE_URL);
    const imageStatements = [
      env.CONTENT.prepare(
        'DELETE FROM post_images WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND source_hash=?)'
      ).bind(id, id, nextRevision, sourceHash),
      env.CONTENT.prepare(
        'DELETE FROM post_draft_images WHERE post_id=? AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND source_hash=?)'
      ).bind(id, id, nextRevision, sourceHash),
      ...imageKeys.map((key) =>
        env.CONTENT.prepare(
          `INSERT OR IGNORE INTO post_images(post_id,r2_key)
       SELECT ?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND source_hash=?)`
        ).bind(id, key, id, nextRevision, sourceHash)
      ),
      env.CONTENT.prepare(
        `DELETE FROM post_drafts WHERE post_id=? AND revision=? AND base_revision=?
       AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND source_hash=?)`
      ).bind(id, expectedRevision, baseRevision, id, nextRevision, sourceHash),
      env.CONTENT.prepare(
        `INSERT OR IGNORE INTO content_write_requests(request_id,post_id,operation,created_at)
       SELECT ?,?,'publish',? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND source_hash=?)`
      ).bind(requestId, id, now, id, nextRevision, sourceHash),
    ];
    const results = await env.CONTENT.batch([
      write,
      seriesWrite,
      ...imageStatements,
    ]);
    if (!results[0].meta.changes)
      return json(
        { error: '발행 충돌이 발생했습니다. 글 목록을 새로고침해 주세요.' },
        409,
        headers
      );
    return json(
      {
        ok: true,
        id,
        revision: nextRevision,
        publishedAt,
        updatedAt: now,
        url: `/blog/${encodeURIComponent(slug)}/`,
      },
      200,
      headers
    );
  }
  return json({ error: 'Not found' }, 404, headers);
}

function popup(origin, message, headers = {}) {
  const safeMessage = JSON.stringify(message).replace(/</g, '\\u003c');
  const safeOrigin = JSON.stringify(origin);
  const html = `<!doctype html><meta charset="utf-8"><title>GitHub 로그인</title><script>
    const message = ${safeMessage};
    const origin = ${safeOrigin};
    if (window.opener) {
      window.addEventListener('message', (event) => {
        if (event.source === window.opener && event.origin === origin && event.data === 'authorizing:github') {
          window.opener.postMessage(message, origin);
        }
      });
      window.opener.postMessage('authorizing:github', origin);
    }
  </script><p>로그인 결과를 편집기로 전달하는 중입니다. 이 창은 곧 닫힙니다.</p>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'",
      ...headers,
    },
  });
}

async function callback(request, env, url) {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const valid = state && code && state === cookie(request, 'cms_oauth_state');
  const clearState =
    'cms_oauth_state=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
  if (!valid)
    return popup(
      env.SITE_ORIGIN,
      'authorization:github:error:{"message":"Invalid OAuth state"}',
      { 'Set-Cookie': clearState }
    );

  const tokenResponse = await fetch(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/callback`,
        state,
      }),
    }
  );
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token)
    return popup(
      env.SITE_ORIGIN,
      'authorization:github:error:{"message":"GitHub token exchange failed"}',
      { 'Set-Cookie': clearState }
    );

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'devlog-cms',
    },
  });
  const user = await userResponse.json();
  if (!userResponse.ok || user.login !== env.GITHUB_ALLOWED_LOGIN)
    return popup(
      env.SITE_ORIGIN,
      'authorization:github:error:{"message":"Unauthorized GitHub account"}',
      { 'Set-Cookie': clearState }
    );

  const expires = Date.now() + SESSION_SECONDS * 1000;
  const body = `${user.login}.${expires}`;
  const session = `${body}.${await sign(body, env.SESSION_SECRET)}`;
  const result = popup(
    env.SITE_ORIGIN,
    `authorization:github:success:${JSON.stringify({ provider: 'github', token: tokenData.access_token })}`
  );
  result.headers.append('Set-Cookie', clearState);
  result.headers.append(
    'Set-Cookie',
    `cms_session=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}`
  );
  result.headers.append(
    'Set-Cookie',
    `cms_gate=${session}; Domain=seungjun.sh; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}`
  );
  return result;
}

async function media(request, env, url) {
  const headers = cors(request, env);
  if (!headers) return json({ error: 'Forbidden origin' }, 403);
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers });
  if (!(await authenticated(request, env)) && !(await isEditor(request, env)))
    return json(
      { error: '로그인이 필요합니다. 편집기에서 다시 로그인하세요.' },
      401,
      headers
    );
  if (request.method === 'GET') {
    const listed = await env.MEDIA.list({
      prefix: 'posts/',
      limit: 100,
      cursor: url.searchParams.get('cursor') || undefined,
    });
    return json(
      {
        items: listed.objects.map((item) => ({
          key: item.key,
          url: `${env.MEDIA_BASE_URL}/${item.key}`,
        })),
        cursor: listed.truncated ? listed.cursor : null,
      },
      200,
      headers
    );
  }
  if (request.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405, headers);
  const type = request.headers.get('Content-Type')?.split(';')[0].toLowerCase();
  const image = types[type];
  const size = Number(request.headers.get('Content-Length'));
  if (!image || size > MAX_IMAGE_BYTES)
    return json(
      { error: 'PNG, JPEG, GIF, WebP, AVIF만 10MB까지 업로드할 수 있습니다.' },
      400,
      headers
    );
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (
    !bytes.length ||
    bytes.length > MAX_IMAGE_BYTES ||
    !image.magic.every((byte, index) => bytes[index] === byte)
  )
    return json(
      { error: '이미지 형식 또는 크기가 올바르지 않습니다.' },
      400,
      headers
    );
  if (
    type === 'image/webp' &&
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  )
    return json({ error: 'WebP 파일이 아닙니다.' }, 400, headers);
  const key = `posts/${crypto.randomUUID()}.${image.ext}`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: {
      contentType: type,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
  return json({ key, url: `${env.MEDIA_BASE_URL}/${key}` }, 201, headers);
}

async function stageMediaObject(request, env, url) {
  if (request.method !== 'GET' || env.STAGE_CONTENT_WRITES !== 'true')
    return json({ error: 'Not found' }, 404);
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice('/media/objects/'.length));
  } catch {
    return json({ error: 'Not found' }, 404);
  }
  if (
    !/^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/i.test(
      key
    )
  )
    return json({ error: 'Not found' }, 404);
  const object = await env.MEDIA.get(key);
  if (!object) return json({ error: 'Not found' }, 404);
  const headers = new Headers({
    'Cache-Control':
      object.httpMetadata?.cacheControl ||
      'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  object.writeHttpMetadata(headers);
  headers.set(
    'Cache-Control',
    object.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable'
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

function publicContentHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== env.SITE_ORIGIN) return null;
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function encodeCursor(post) {
  return base64url(
    new TextEncoder().encode(
      JSON.stringify({ date: post.published_at, id: post.id })
    )
  );
}

function decodeCursor(value) {
  if (!value || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const parsed = JSON.parse(
      atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    );
    if (
      typeof parsed.date !== 'string' ||
      typeof parsed.id !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(parsed.date)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

async function publicContent(request, env, url) {
  const headers = publicContentHeaders(request, env);
  if (!headers) return json({ error: 'Forbidden origin' }, 403);
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers });
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405, headers);
  if (!env.CONTENT)
    return json({ error: 'Content database is unavailable' }, 503, headers);

  if (url.pathname.startsWith('/posts/')) {
    let slug;
    try {
      slug = decodeURIComponent(url.pathname.slice('/posts/'.length));
    } catch {
      return json({ error: 'Invalid slug' }, 400, headers);
    }
    if (!slug || slug.includes('/'))
      return json({ error: 'Invalid slug' }, 400, headers);
    const post = await env.CONTENT.prepare(
      `SELECT p.id, p.slug, p.title, p.description, p.published_at,
        p.updated_at, p.tags_json, p.series_id, s.name AS series_name,
        s.slug AS series_slug,
        p.thumbnail, p.rendered_html, p.headings_json,
        (SELECT older.slug FROM posts older
          WHERE older.draft = 0 AND older.deleted_at IS NULL
            AND (older.published_at, older.id) < (p.published_at, p.id)
            AND (p.series_id IS NULL OR older.series_id = p.series_id)
          ORDER BY older.published_at DESC, older.id DESC LIMIT 1) AS previous_slug,
        (SELECT older.title FROM posts older
          WHERE older.draft = 0 AND older.deleted_at IS NULL
            AND (older.published_at, older.id) < (p.published_at, p.id)
            AND (p.series_id IS NULL OR older.series_id = p.series_id)
          ORDER BY older.published_at DESC, older.id DESC LIMIT 1) AS previous_title,
        (SELECT newer.slug FROM posts newer
          WHERE newer.draft = 0 AND newer.deleted_at IS NULL
            AND (newer.published_at, newer.id) > (p.published_at, p.id)
            AND (p.series_id IS NULL OR newer.series_id = p.series_id)
          ORDER BY newer.published_at ASC, newer.id ASC LIMIT 1) AS next_slug,
        (SELECT newer.title FROM posts newer
          WHERE newer.draft = 0 AND newer.deleted_at IS NULL
            AND (newer.published_at, newer.id) > (p.published_at, p.id)
            AND (p.series_id IS NULL OR newer.series_id = p.series_id)
          ORDER BY newer.published_at ASC, newer.id ASC LIMIT 1) AS next_title
       FROM posts p LEFT JOIN series s ON s.id = p.series_id
       WHERE p.slug = ? AND p.draft = 0 AND p.deleted_at IS NULL`
    )
      .bind(slug)
      .first();
    if (!post) return json({ error: 'Not found' }, 404, headers);
    return json(
      {
        ...post,
        tags: JSON.parse(post.tags_json),
        headings: JSON.parse(post.headings_json),
        tags_json: undefined,
        headings_json: undefined,
      },
      200,
      headers
    );
  }

  if (url.pathname === '/stats') {
    const counts = await env.CONTENT.prepare(
      'SELECT COUNT(*) AS posts FROM posts WHERE draft=0 AND deleted_at IS NULL'
    ).first();
    return json(counts, 200, headers);
  }

  if (url.pathname === '/posts') {
    const limit = Math.min(
      50,
      Math.max(1, Math.floor(Number(url.searchParams.get('limit')) || 20))
    );
    const conditions = ['p.draft = 0', 'p.deleted_at IS NULL'];
    const params = [];
    const seriesId = url.searchParams.get('series');
    const tag = url.searchParams.get('tag');
    if (seriesId) {
      conditions.push('p.series_id = ?');
      params.push(seriesId);
    }
    if (tag) {
      conditions.push(
        'EXISTS (SELECT 1 FROM json_each(p.tags_json) WHERE value = ?)'
      );
      params.push(tag);
    }
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    if (url.searchParams.has('cursor') && !cursor)
      return json({ error: 'Invalid cursor' }, 400, headers);
    if (cursor) {
      conditions.push('(p.published_at, p.id) < (?, ?)');
      params.push(cursor.date, cursor.id);
    }
    const result = await env.CONTENT.prepare(
      `SELECT p.id, p.slug, p.title, p.description, p.published_at,
        p.updated_at, p.tags_json, p.series_id, p.thumbnail, s.name AS series_name
       FROM posts p LEFT JOIN series s ON s.id = p.series_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.published_at DESC, p.id DESC LIMIT ?`
    )
      .bind(...params, limit + 1)
      .all();
    const hasMore = result.results.length > limit;
    const entries = result.results.slice(0, limit).map((post) => ({
      ...post,
      tags: JSON.parse(post.tags_json),
      tags_json: undefined,
    }));
    return json(
      {
        entries,
        nextCursor: hasMore ? encodeCursor(entries.at(-1)) : null,
      },
      200,
      headers
    );
  }

  if (url.pathname === '/series') {
    const result = await env.CONTENT.prepare(
      `SELECT s.id, s.name, s.slug, s.description, COUNT(p.id) AS post_count,
        MAX(p.published_at) AS latest_at,
        (SELECT latest.title FROM posts latest
          WHERE latest.series_id = s.id AND latest.draft = 0
            AND latest.deleted_at IS NULL
          ORDER BY latest.published_at DESC, latest.id DESC LIMIT 1) AS latest_title
       FROM series s JOIN posts p ON p.series_id = s.id
       WHERE p.draft = 0 AND p.deleted_at IS NULL
       GROUP BY s.id ORDER BY latest_at DESC, s.id DESC`
    ).all();
    return json({ entries: result.results }, 200, headers);
  }

  if (url.pathname === '/tags') {
    const result = await env.CONTENT.prepare(
      `SELECT j.value AS name, COUNT(DISTINCT p.id) AS post_count
       FROM posts p, json_each(p.tags_json) j
       WHERE p.draft = 0 AND p.deleted_at IS NULL
       GROUP BY j.value ORDER BY post_count DESC, name COLLATE NOCASE`
    ).all();
    return json({ entries: result.results }, 200, headers);
  }

  if (url.pathname === '/tag-relations') {
    const result = await env.CONTENT.prepare(
      `SELECT left_tag.value AS source, right_tag.value AS target,
        COUNT(DISTINCT p.id) AS count
       FROM posts p, json_each(p.tags_json) left_tag,
        json_each(p.tags_json) right_tag
       WHERE p.draft = 0 AND p.deleted_at IS NULL
        AND left_tag.value < right_tag.value
       GROUP BY left_tag.value, right_tag.value
       HAVING COUNT(DISTINCT p.id) >= 2
       ORDER BY count DESC, source COLLATE NOCASE, target COLLATE NOCASE`
    ).all();
    return json({ entries: result.results }, 200, headers);
  }

  if (url.pathname === '/search') {
    const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
    const terms = query.split(/\s+/).filter(Boolean).slice(0, 6);
    if (!terms.length) return json({ entries: [], total: 0 }, 200, headers);
    const filters = terms.map(
      () =>
        `(p.title LIKE ? OR p.description LIKE ? OR p.searchable_text LIKE ? OR p.tags_json LIKE ? OR s.name LIKE ?)`
    );
    const values = terms.flatMap((term) => {
      const pattern = `%${term}%`;
      return [pattern, pattern, pattern, pattern, pattern];
    });
    const result = await env.CONTENT.prepare(
      `SELECT p.slug, p.title, p.description, p.published_at, p.tags_json,
        p.searchable_text, s.name AS series_name
       FROM posts p LEFT JOIN series s ON s.id = p.series_id
       WHERE p.draft = 0 AND p.deleted_at IS NULL
        AND ${filters.join(' AND ')}
       ORDER BY CASE WHEN p.title LIKE ? THEN 0 ELSE 1 END,
        p.published_at DESC, p.id DESC LIMIT 50`
    )
      .bind(...values, `%${query}%`)
      .all();
    const entries = result.results.map((post) => ({
      url: `/blog/${encodeURIComponent(post.slug)}/`,
      plain_excerpt: post.description || post.searchable_text.slice(0, 240),
      meta: {
        title: post.title,
        description: post.description,
        publishedAt: post.published_at,
        tags: JSON.parse(post.tags_json).join(' · '),
        series: post.series_name || '',
      },
    }));
    return json({ entries, total: entries.length }, 200, headers);
  }

  if (url.pathname === '/feed') {
    const result = await env.CONTENT.prepare(
      `SELECT slug, title, description, published_at
       FROM posts WHERE draft = 0 AND deleted_at IS NULL
       ORDER BY published_at DESC, id DESC`
    ).all();
    return json({ entries: result.results }, 200, headers);
  }

  if (url.pathname === '/sitemap-entries') {
    const result = await env.CONTENT.prepare(
      `SELECT slug, updated_at, published_at
       FROM posts WHERE draft = 0 AND deleted_at IS NULL
       ORDER BY published_at DESC, id DESC`
    ).all();
    return json({ entries: result.results }, 200, headers);
  }

  return json({ error: 'Not found' }, 404, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/_stage/health' && env.STAGE_HEALTH === 'true') {
      if (!env.CONTENT)
        return json({ ready: false, reason: 'D1 binding missing' }, 503);
      const [posts, series] = await Promise.all([
        env.CONTENT.prepare('SELECT COUNT(*) AS count FROM posts').first(),
        env.CONTENT.prepare('SELECT COUNT(*) AS count FROM series').first(),
      ]);
      return json({ ready: true, posts: posts.count, series: series.count });
    }
    if (
      url.pathname === '/editor/config' ||
      url.pathname === '/editor/posts' ||
      url.pathname.startsWith('/editor/posts/')
    )
      return editorContent(request, env, url);
    if (
      url.pathname === '/posts' ||
      url.pathname.startsWith('/posts/') ||
      url.pathname === '/series' ||
      url.pathname === '/stats' ||
      url.pathname === '/tags' ||
      url.pathname === '/tag-relations' ||
      url.pathname === '/search' ||
      url.pathname === '/feed' ||
      url.pathname === '/sitemap-entries'
    )
      return publicContent(request, env, url);
    if (url.pathname === '/auth' && request.method === 'GET') {
      if (
        !env.GITHUB_CLIENT_ID ||
        !env.GITHUB_CLIENT_SECRET ||
        !env.SESSION_SECRET
      )
        return json({ error: 'CMS secrets are missing' }, 503);
      const state = crypto.randomUUID();
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
      authorize.searchParams.set('scope', 'public_repo');
      authorize.searchParams.set('state', state);
      return new Response(null, {
        status: 302,
        headers: {
          Location: authorize.href,
          'Set-Cookie': `cms_oauth_state=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
          'Cache-Control': 'no-store',
        },
      });
    }
    if (url.pathname === '/callback' && request.method === 'GET')
      return callback(request, env, url);
    if (url.pathname === '/session' && request.method === 'GET')
      return new Response(null, {
        status: (await authenticated(request, env, 'cms_gate')) ? 204 : 401,
        headers: { 'Cache-Control': 'no-store' },
      });
    if (url.pathname === '/logout' && request.method === 'POST') {
      const headers = cors(request, env);
      if (!headers) return json({ error: 'Forbidden origin' }, 403);
      const result = new Response(null, { status: 204, headers });
      result.headers.append(
        'Set-Cookie',
        'cms_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'
      );
      result.headers.append(
        'Set-Cookie',
        'cms_gate=; Domain=seungjun.sh; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'
      );
      return result;
    }
    if (url.pathname === '/media') return media(request, env, url);
    if (url.pathname.startsWith('/media/objects/'))
      return stageMediaObject(request, env, url);
    return json({ error: 'Not found' }, 404);
  },
};
