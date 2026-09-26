const protectedPath = (path) =>
  path === '/write' ||
  path.startsWith('/write/') ||
  path === '/admin' ||
  path.startsWith('/admin/');
const contentReadsEnabled = (env) => env.CONTENT_READS === 'true';

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]
  );

const tagSlug = (tag) =>
  tag
    .replaceAll('C++', 'cpp')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

function articleMarkup(post) {
  const tags = post.tags
    .map(
      (tag) =>
        `<a href="/tags/${encodeURIComponent(tagSlug(tag))}/" data-tag="${escapeHtml(tag)}"><span class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold">#${escapeHtml(tag)}</span></a>`
    )
    .join('');
  const series = post.series_slug
    ? `<span class="mx-2 text-muted-foreground">/</span><a href="/series/${encodeURIComponent(post.series_slug)}/">${escapeHtml(post.series_name)}</a>`
    : '';
  const headings = post.headings
    .map(
      (heading) =>
        `<li><a href="#${encodeURIComponent(heading.slug)}">${escapeHtml(heading.text)}</a></li>`
    )
    .join('');
  const pagination = [
    post.previous_slug
      ? `<a href="/blog/${encodeURIComponent(post.previous_slug)}/"><span>← ${post.series_id ? '시리즈 이전 글' : '이전 기록'}</span><strong>${escapeHtml(post.previous_title)}</strong></a>`
      : '<span></span>',
    post.next_slug
      ? `<a class="text-right" href="/blog/${encodeURIComponent(post.next_slug)}/"><span>${post.series_id ? '시리즈 다음 글' : '다음 기록'} →</span><strong>${escapeHtml(post.next_title)}</strong></a>`
      : '<span></span>',
  ].join('');
  return { tags, series, headings, pagination };
}

async function renderArticle(request, env, url) {
  const slug = decodeURIComponent(
    url.pathname.slice('/blog/'.length).replace(/\/$/, '')
  );
  if (!slug || slug.includes('/')) return env.ASSETS.fetch(request);

  let response;
  try {
    response = await env.CMS.fetch(
      new Request(
        `https://cms-api.seungjun.sh/posts/${encodeURIComponent(slug)}`
      )
    );
  } catch {
    return env.ASSETS.fetch(request);
  }
  if (response.status === 404) return env.ASSETS.fetch(request);
  if (!response.ok) return env.ASSETS.fetch(request);

  const post = await response.json();
  const template = await env.ASSETS.fetch(
    new Request(new URL('/article-template/', request.url))
  );
  if (!template.ok)
    return new Response('Article template unavailable', { status: 503 });
  const canonical = `${url.origin}/blog/${encodeURIComponent(post.slug)}/`;
  const published = new Date(post.published_at);
  const updated = post.updated_at ? new Date(post.updated_at) : null;
  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(published);
  const markup = articleMarkup(post);
  const html = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(`${post.title} · seungjun.sh`);
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute(
          'content',
          post.description || '정승준 테크 블로그'
        );
      },
    })
    .on('meta[name="robots"]', {
      element(element) {
        element.setAttribute('content', 'index,follow');
      },
    })
    .on('link[data-template-canonical]', {
      element(element) {
        element.setAttribute('href', canonical);
      },
    })
    .on('meta[property="og:title"]', {
      element(element) {
        element.setAttribute('content', post.title);
      },
    })
    .on('meta[property="og:description"]', {
      element(element) {
        element.setAttribute(
          'content',
          post.description || '정승준 테크 블로그'
        );
      },
    })
    .on('meta[property="og:url"]', {
      element(element) {
        element.setAttribute('content', canonical);
      },
    })
    .on('meta[property="og:image"]', {
      element(element) {
        if (post.thumbnail) element.setAttribute('content', post.thumbnail);
      },
    })
    .on('meta[property="article:published_time"]', {
      element(element) {
        element.setAttribute('content', post.published_at);
      },
    })
    .on('meta[data-template-updated-meta]', {
      element(element) {
        if (updated) element.setAttribute('content', post.updated_at);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(element) {
        element.setAttribute('content', post.title);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(element) {
        element.setAttribute(
          'content',
          post.description || '정승준 테크 블로그'
        );
      },
    })
    .on('meta[name="twitter:image"]', {
      element(element) {
        if (post.thumbnail) element.setAttribute('content', post.thumbnail);
      },
    })
    .on('[data-template-title]', {
      element(element) {
        element.setInnerContent(post.title);
      },
    })
    .on('[data-template-description]', {
      element(element) {
        if (post.description) element.setInnerContent(post.description);
        else element.remove();
      },
    })
    .on('[data-template-breadcrumb]', {
      element(element) {
        element.setInnerContent(
          `<a href="/blog/">전체 글</a>${markup.series}`,
          { html: true }
        );
      },
    })
    .on('[data-template-published]', {
      element(element) {
        element.setAttribute('datetime', post.published_at);
        element.setInnerContent(formattedDate);
      },
    })
    .on('[data-template-updated]', {
      element(element) {
        if (updated && updated.getTime() !== published.getTime()) {
          element.removeAttribute('hidden');
          element.setAttribute('datetime', post.updated_at);
          element.setInnerContent(
            ` · ${new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(updated)} 수정`
          );
        }
      },
    })
    .on('[data-template-tags]', {
      element(element) {
        element.setInnerContent(markup.tags, { html: true });
      },
    })
    .on('[data-template-body]', {
      element(element) {
        element.setInnerContent(post.rendered_html, { html: true });
      },
    })
    .on('[data-template-pagination]', {
      element(element) {
        element.setInnerContent(markup.pagination, { html: true });
      },
    })
    .on('[data-template-mobile-toc]', {
      element(element) {
        if (post.headings.length)
          element.setInnerContent(
            `<details><summary class="cursor-pointer font-medium">이 글의 목차</summary><nav aria-label="이 글의 목차"><ol class="toc-list mt-4">${markup.headings}</ol></nav></details>`,
            { html: true }
          );
        else element.remove();
      },
    })
    .on('[data-template-toc]', {
      element(element) {
        if (post.headings.length)
          element.setInnerContent(
            `<nav aria-label="이 글의 목차"><h2 class="rail-heading mb-5">이 글에서</h2><ol class="toc-list">${markup.headings}</ol></nav>`,
            { html: true }
          );
        else element.remove();
      },
    })
    .transform(template);
  const headers = new Headers(html.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(html.body, { status: 200, headers });
}

async function cmsJson(env, path) {
  const response = await env.CMS.fetch(
    new Request(`https://cms-api.seungjun.sh${path}`)
  );
  if (!response.ok) throw new Error(`CMS read failed: ${response.status}`);
  return response.json();
}

const dateLabel = (value) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })
    .format(new Date(value))
    .replaceAll('-', '.');

function postRows(entries, { numbered = false, endpoint, cursor } = {}) {
  const rows = entries
    .map((post, index) => {
      const date = dateLabel(post.published_at);
      const image = post.thumbnail
        ? `<img src="${escapeHtml(post.thumbnail)}" alt="" loading="lazy" class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]">`
        : '';
      const series = post.series_name || '개별 기록';
      const tags = (post.tags || []).slice(0, 3).join(' · ');
      return `<li data-published-at="${escapeHtml(post.published_at)}"><a href="/blog/${encodeURIComponent(post.slug)}/" class="post-row group grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 rounded-none px-2 py-4 transition-colors hover:bg-accent/60 md:grid-cols-[160px_minmax(0,1fr)] md:gap-4"><div class="row-span-2 aspect-[5/3] self-center overflow-hidden rounded-md bg-muted">${image}</div><div class="min-w-0"><div class="post-row-index pt-0.5 text-xs text-muted-foreground tabular-nums">${numbered ? String(index + 1).padStart(2, '0') : `<time datetime="${escapeHtml(post.published_at)}">${date}</time>`}</div><strong class="block text-sm leading-6 font-medium wrap-anywhere">${escapeHtml(post.title)}</strong><div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span class="rounded-md bg-secondary px-2 py-0.5">${escapeHtml(series)}</span><span>${escapeHtml(tags)}</span>${numbered ? `<time datetime="${escapeHtml(post.published_at)}">${date}</time>` : ''}</div></div></a></li>`;
    })
    .join('');
  const more = cursor
    ? `<button type="button" data-content-more data-endpoint="${escapeHtml(endpoint)}" data-cursor="${escapeHtml(cursor)}" class="mt-5 rounded-md border px-4 py-2 text-sm">더 보기</button><p data-content-status class="mt-2 text-sm text-muted-foreground" role="status"></p>`
    : '';
  return `<ol class="m-0 list-none divide-y p-0" data-post-list>${rows}</ol>${more}<script src="/d1-content.js" defer></script>`;
}

function collectionRows(entries) {
  return `<div class="divide-y">${entries
    .map(
      (series) =>
        `<a href="/series/${encodeURIComponent(series.slug)}/" class="flex flex-nowrap items-center gap-4 px-2 py-5"><span class="min-w-0 flex-1"><strong class="block text-base leading-6 font-medium">${escapeHtml(series.name)}</strong><span class="mt-1 block text-sm leading-6 text-muted-foreground">${escapeHtml(series.latest_title || series.description || '')}</span></span><span class="shrink-0 rounded-md bg-secondary px-2 py-1 text-sm">${series.post_count}개의 글</span></a>`
    )
    .join('')}</div>`;
}

function tagSlugForRoute(tag) {
  return tag
    .replaceAll('C++', 'cpp')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

async function renderCollection(request, env, url) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  let selector;
  let markup;
  let collection;
  try {
    if (path === '/blog') {
      const result = await cmsJson(env, '/posts?limit=20');
      selector = '[data-d1-collection="posts"]';
      markup = postRows(result.entries, {
        endpoint: '/api/content/posts?limit=20',
        cursor: result.nextCursor,
      });
    } else if (path === '/series') {
      const result = await cmsJson(env, '/series');
      selector = '[data-d1-collection="series"]';
      markup = collectionRows(result.entries);
    } else if (path.startsWith('/series/')) {
      const slug = decodeURIComponent(path.slice('/series/'.length));
      const series = (await cmsJson(env, '/series')).entries.find(
        (item) => item.slug === slug
      );
      if (!series) return env.ASSETS.fetch(request);
      collection = {
        title: series.name,
        description:
          series.description ||
          `${series.name}에 관한 ${series.post_count}개의 글을 이어 읽습니다.`,
        count: series.post_count,
        root: '/series/',
        rootLabel: '시리즈',
      };
      const result = await cmsJson(
        env,
        `/posts?limit=20&series=${encodeURIComponent(series.id)}`
      );
      selector = '[data-d1-collection="series-posts"]';
      markup = postRows(result.entries, {
        numbered: true,
        endpoint: `/api/content/posts?limit=20&series=${encodeURIComponent(series.id)}`,
        cursor: result.nextCursor,
      });
    } else if (path.startsWith('/tags/')) {
      const slug = decodeURIComponent(path.slice('/tags/'.length));
      const tag = (await cmsJson(env, '/tags')).entries.find(
        (item) => tagSlugForRoute(item.name) === slug
      );
      if (!tag) return env.ASSETS.fetch(request);
      collection = {
        title: `#${tag.name}`,
        description: `${tag.post_count}개의 글`,
        count: tag.post_count,
        root: '/tags/',
        rootLabel: '태그',
      };
      const result = await cmsJson(
        env,
        `/posts?limit=20&tag=${encodeURIComponent(tag.name)}`
      );
      selector = '[data-d1-collection="tag-posts"]';
      markup = postRows(result.entries, {
        endpoint: `/api/content/posts?limit=20&tag=${encodeURIComponent(tag.name)}`,
        cursor: result.nextCursor,
      });
    } else {
      return env.ASSETS.fetch(request);
    }
  } catch {
    return env.ASSETS.fetch(request);
  }

  const asset = await env.ASSETS.fetch(
    path === '/blog'
      ? new Request(new URL('/list-template/', request.url))
      : request
  );
  if (!asset.ok) {
    if (!collection) return asset;
    const template = await env.ASSETS.fetch(
      new Request(new URL('/collection-template/', request.url))
    );
    if (!template.ok) return asset;
    const canonical = `${url.origin}${url.pathname}`;
    const page = new HTMLRewriter()
      .on('title', {
        element(element) {
          element.setInnerContent(`${collection.title} · seungjun.sh`);
        },
      })
      .on('meta[name="description"]', {
        element(element) {
          element.setAttribute('content', collection.description);
        },
      })
      .on('meta[name="robots"]', {
        element(element) {
          element.setAttribute('content', 'index,follow');
        },
      })
      .on('link[data-collection-canonical]', {
        element(element) {
          element.setAttribute('href', canonical);
        },
      })
      .on('meta[property="og:title"]', {
        element(element) {
          element.setAttribute('content', collection.title);
        },
      })
      .on('meta[property="og:description"]', {
        element(element) {
          element.setAttribute('content', collection.description);
        },
      })
      .on('meta[property="og:url"]', {
        element(element) {
          element.setAttribute('content', canonical);
        },
      })
      .on('[data-collection-root]', {
        element(element) {
          element.setAttribute('href', collection.root);
          element.setInnerContent(collection.rootLabel);
        },
      })
      .on('[data-collection-title]', {
        element(element) {
          element.setInnerContent(collection.title);
        },
      })
      .on('[data-collection-description]', {
        element(element) {
          element.setInnerContent(collection.description);
        },
      })
      .on('[data-collection-count]', {
        element(element) {
          element.setInnerContent(`${collection.count}개의 글`);
        },
      })
      .on('[data-collection-posts]', {
        element(element) {
          element.setInnerContent(markup, { html: true });
        },
      })
      .transform(template);
    const headers = new Headers(page.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(page.body, { status: 200, headers });
  }
  let rewriter = new HTMLRewriter().on(selector, {
    element(element) {
      if (
        url.pathname.startsWith('/series/') &&
        !url.pathname.endsWith('/series/')
      )
        element.setAttribute('data-numbered', 'true');
      element.setInnerContent(markup, { html: true });
    },
  });
  if (path === '/blog') {
    rewriter = rewriter
      .on('title', {
        element(element) {
          element.setInnerContent('글 · seungjun.sh');
        },
      })
      .on('meta[name="robots"]', {
        element(element) {
          element.setAttribute('content', 'index,follow');
        },
      })
      .on('link[data-list-canonical]', {
        element(element) {
          element.setAttribute('href', `${url.origin}/blog/`);
        },
      });
  }
  const rewritten = rewriter.transform(asset);
  const headers = new Headers(rewritten.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

const xmlEscape = (value) =>
  String(value ?? '').replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]
  );

async function renderFeed(request, env, url) {
  try {
    const { entries } = await cmsJson(env, '/feed');
    const origin = url.origin;
    const items = entries
      .map(
        (post) =>
          `<item><title>${xmlEscape(post.title)}</title><description>${xmlEscape(post.description)}</description><link>${origin}/blog/${encodeURIComponent(post.slug)}/</link><guid isPermaLink="true">${origin}/blog/${encodeURIComponent(post.slug)}/</guid><pubDate>${new Date(post.published_at).toUTCString()}</pubDate></item>`
      )
      .join('');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>seungjun.dev</title><link>${origin}</link><description>웹 개발과 컴퓨터 기초, 배움의 기록</description><language>ko</language>${items}</channel></rss>`,
      {
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch {
    return env.ASSETS.fetch(request);
  }
}

async function renderSitemap(request, env, url) {
  try {
    const [{ entries }, { entries: series }, { entries: tags }] =
      await Promise.all([
        cmsJson(env, '/sitemap-entries'),
        cmsJson(env, '/series'),
        cmsJson(env, '/tags'),
      ]);
    const paths = ['/', '/blog/', '/series/', '/tags/', '/profile/'];
    const urls = [
      ...paths.map(
        (path) => `<url><loc>${xmlEscape(url.origin + path)}</loc></url>`
      ),
      ...entries.map(
        (post) =>
          `<url><loc>${xmlEscape(`${url.origin}/blog/${encodeURIComponent(post.slug)}/`)}</loc><lastmod>${new Date(post.updated_at || post.published_at).toISOString()}</lastmod></url>`
      ),
      ...series.map(
        (item) =>
          `<url><loc>${xmlEscape(`${url.origin}/series/${encodeURIComponent(item.slug)}/`)}</loc><lastmod>${new Date(item.latest_at).toISOString()}</lastmod></url>`
      ),
      ...tags.map(
        (item) =>
          `<url><loc>${xmlEscape(`${url.origin}/tags/${encodeURIComponent(tagSlugForRoute(item.name))}/`)}</loc></url>`
      ),
    ].join('');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
      {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch {
    return env.ASSETS.fetch(request);
  }
}

function contentApiPath(path) {
  if (path === '/api/content/editor-config') return '/editor/config';
  if (path === '/api/content/editor/posts') return '/editor/posts';
  if (path.startsWith('/api/content/editor/posts/'))
    return `/editor/posts/${path.slice('/api/content/editor/posts/'.length)}`;
  if (path === '/api/content/posts') return '/posts';
  if (path.startsWith('/api/content/posts/'))
    return `/posts/${path.slice('/api/content/posts/'.length)}`;
  if (path === '/api/content/series') return '/series';
  if (path === '/api/content/tags') return '/tags';
  if (path === '/api/content/tag-relations') return '/tag-relations';
  if (path === '/api/content/search') return '/search';
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname === '/article-template/' ||
      url.pathname === '/article-template'
    )
      return new Response('Not found', { status: 404 });
    if (
      url.pathname === '/collection-template/' ||
      url.pathname === '/collection-template'
    )
      return new Response('Not found', { status: 404 });
    if (url.pathname === '/list-template/' || url.pathname === '/list-template')
      return new Response('Not found', { status: 404 });
    if (request.method === 'GET' && url.pathname === '/rss.xml')
      return contentReadsEnabled(env)
        ? renderFeed(request, env, url)
        : env.ASSETS.fetch(request);
    if (
      request.method === 'GET' &&
      (url.pathname === '/sitemap.xml' || url.pathname === '/sitemap-index.xml')
    )
      return !contentReadsEnabled(env)
        ? env.ASSETS.fetch(request)
        : url.pathname === '/sitemap.xml'
          ? renderSitemap(request, env, url)
          : new Response(
              `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${url.origin}/sitemap.xml</loc></sitemap></sitemapindex>`,
              {
                headers: {
                  'Content-Type': 'application/xml; charset=utf-8',
                  'Cache-Control': 'no-store',
                },
              }
            );
    if (
      contentReadsEnabled(env) &&
      request.method === 'GET' &&
      (url.pathname === '/blog/' ||
        url.pathname === '/series/' ||
        url.pathname === '/tags/' ||
        url.pathname.startsWith('/series/') ||
        url.pathname.startsWith('/tags/'))
    )
      return renderCollection(request, env, url);
    if (
      contentReadsEnabled(env) &&
      url.pathname.startsWith('/blog/') &&
      request.method === 'GET'
    )
      return renderArticle(request, env, url);
    const contentPath = contentApiPath(url.pathname);
    if (
      contentPath &&
      (request.method === 'GET' ||
        request.method === 'POST' ||
        request.method === 'DELETE' ||
        request.method === 'OPTIONS')
    ) {
      const editorApi = contentPath.startsWith('/editor/');
      if (!editorApi && !contentReadsEnabled(env))
        return env.ASSETS.fetch(request);
      const requestOrigin = request.headers.get('Origin');
      if (editorApi && requestOrigin && requestOrigin !== env.SITE_ORIGIN)
        return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        });
      const target = new URL(request.url);
      target.pathname = contentPath;
      if (editorApi) {
        const headers = new Headers(request.headers);
        headers.set('Origin', env.SITE_ORIGIN);
        return env.CMS.fetch(
          new Request(target, {
            method: request.method,
            headers,
            body:
              request.method === 'GET' || request.method === 'OPTIONS'
                ? undefined
                : request.body,
          })
        );
      }
      return env.CMS.fetch(new Request(target, request));
    }
    if (!protectedPath(url.pathname)) return env.ASSETS.fetch(request);

    if (
      env.STAGE_EDITOR_PREVIEW === 'true' &&
      ['/write', '/write/'].includes(url.pathname)
    ) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set('Cache-Control', 'private, no-store');
      return new Response(asset.body, { status: asset.status, headers });
    }

    const cookie = request.headers.get('Cookie') || '';
    if (
      !cookie.split(';').some((part) => part.trim().startsWith('cms_gate='))
    ) {
      return Response.redirect(`${url.origin}/login/`, 302);
    }

    try {
      const session = await env.CMS.fetch(
        new Request('https://cms-api.seungjun.sh/session', {
          headers: { Cookie: cookie },
        })
      );
      if (session.status !== 204)
        return Response.redirect(`${url.origin}/login/`, 302);
    } catch {
      return new Response('로그인 확인에 실패했습니다.', { status: 503 });
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(asset.body, { status: asset.status, headers });
  },
};
