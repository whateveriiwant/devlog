export const productionOrigin = 'https://seungjun.sh';

export const canIndex = (origin, allowed) =>
  origin === productionOrigin && allowed === 'true';

export const serializeJsonLd = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

export function structuredData({ origin, pathname, title, description, post }) {
  const canonical = new URL(pathname, origin).href;
  const author = {
    '@type': 'Person',
    '@id': `${origin}/profile/#person`,
    name: '정승준',
    url: `${origin}/profile/`,
  };
  const graph = [];
  if (pathname === '/') {
    graph.push({
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: 'seungjun.sh',
      alternateName: '정승준의 개발 블로그',
      url: origin + '/',
      description,
      inLanguage: 'ko-KR',
      author,
    });
  } else if (pathname === '/profile/') {
    graph.push({
      '@type': 'ProfilePage',
      url: canonical,
      name: title,
      mainEntity: author,
    });
  } else {
    const section = pathname.split('/')[1];
    const labels = { blog: '전체 글', series: '시리즈', tags: '태그' };
    if (labels[section]) {
      const items = [
        { name: 'seungjun.sh', item: origin + '/' },
        { name: labels[section], item: `${origin}/${section}/` },
      ];
      if (pathname !== `/${section}/`)
        items.push({ name: title, item: canonical });
      graph.push({
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          ...item,
        })),
      });
    }
  }
  if (post) {
    graph.push({
      '@type': 'BlogPosting',
      '@id': canonical + '#article',
      mainEntityOfPage: canonical,
      url: canonical,
      headline: title,
      description,
      inLanguage: 'ko-KR',
      datePublished: post.published_at,
      ...(post.updated_at ? { dateModified: post.updated_at } : {}),
      ...(post.thumbnail ? { image: [post.thumbnail] } : {}),
      author,
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function publicRewriter(env, url, { title, description, post } = {}) {
  const indexable =
    canIndex(env.SITE_ORIGIN, env.ALLOW_INDEXING) &&
    url.origin === env.SITE_ORIGIN;
  const robots = indexable
    ? 'index,follow,max-image-preview:large'
    : 'noindex,nofollow';
  const pathname = post
    ? `/blog/${encodeURIComponent(post.slug)}/`
    : url.pathname;
  const canonical = new URL(pathname, env.SITE_ORIGIN || url.origin).href;
  const rewriter = new globalThis.HTMLRewriter()
    .on('meta[name="robots"]', {
      element(element) {
        element.setAttribute('content', robots);
      },
    })
    .on('link[rel="canonical"], meta[property="og:url"]', {
      element(element) {
        element.remove();
      },
    })
    .on('head', {
      element(element) {
        if (!indexable) return;
        element.append(
          `<link rel="canonical" href="${canonical.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"><meta property="og:url" content="${canonical.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">`,
          { html: true }
        );
        if (title)
          element.append(
            `<script type="application/ld+json" data-seo>${serializeJsonLd(structuredData({ origin: env.SITE_ORIGIN, pathname, title, description, post }))}</script>`,
            { html: true }
          );
      },
    });
  if (title || !indexable)
    rewriter.on('script[data-seo]', {
      element(element) {
        element.remove();
      },
    });
  if (title) {
    rewriter.on('title', {
      element(element) {
        element.setInnerContent(`${title} · seungjun.sh`);
      },
    });
    for (const selector of [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ])
      rewriter.on(selector, {
        element(element) {
          element.setAttribute('content', title);
        },
      });
  }
  if (description !== undefined)
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ])
      rewriter.on(selector, {
        element(element) {
          element.setAttribute('content', description);
        },
      });
  if (post) {
    for (const selector of [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ])
      rewriter.on(selector, {
        element(element) {
          element.setAttribute(
            'content',
            post.thumbnail || `${env.SITE_ORIGIN}/blog-og.png`
          );
        },
      });
    rewriter
      .on('meta[property="article:published_time"]', {
        element(element) {
          element.setAttribute('content', post.published_at);
        },
      })
      .on('meta[data-template-updated-meta]', {
        element(element) {
          if (post.updated_at) element.setAttribute('content', post.updated_at);
          else element.remove();
        },
      });
  }
  return rewriter;
}
const { URL } = globalThis;
