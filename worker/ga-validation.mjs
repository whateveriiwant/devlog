import { renderArticle } from './site.mjs';

const origin = 'https://devlog-ga-validation.seungjun-jeong10.workers.dev';
const slugs = ['long', 'short', 'image', 'previous', 'next'];
const headers = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google-analytics.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== origin)
      return new Response('Forbidden origin', { status: 403, headers });
    // No fallback credential: an unset secret must keep every asset private.
    const expected = env.VALIDATION_AUTHORIZATION;
    const supplied = request.headers.get('Authorization') || '';
    const encoder = new TextEncoder();
    const a = encoder.encode(expected || '');
    const b = encoder.encode(supplied);
    const authenticated =
      expected?.startsWith('Basic ') &&
      expected.length >= 50 &&
      (a.length === b.length
        ? crypto.subtle.timingSafeEqual(a, b)
        : !crypto.subtle.timingSafeEqual(a, a));
    if (!authenticated)
      return new Response('Authentication required', {
        status: 401,
        headers: {
          ...headers,
          'WWW-Authenticate':
            'Basic realm="devlog-ga-validation", charset="UTF-8"',
        },
      });
    if (request.method !== 'GET')
      return new Response('Method not allowed', { status: 405, headers });
    let response;
    const match =
      /^\/blog\/ga-validation-(long|short|image|previous|next)\/$/.exec(
        url.pathname
      );
    if (match) {
      const kind = match[1];
      const index = slugs.indexOf(kind);
      const paragraph =
        '<p>합성 검증 문단입니다. 실제 사람·글·방문자 자료를 포함하지 않습니다.</p>';
      const body =
        kind === 'short'
          ? paragraph
          : paragraph.repeat(kind === 'long' ? 100 : 30);
      const post = {
        slug: `ga-validation-${kind}`,
        title: `합성 ${kind}`,
        published_at: '2026-01-01T00:00:00.000Z',
        tags: [],
        headings: [],
        rendered_html:
          body +
          (kind === 'image'
            ? '<img src="/fixture.svg" alt="합성 이미지" width="800" height="1200" loading="lazy" />'
            : ''),
        previous_slug: `ga-validation-${slugs[(index + slugs.length - 1) % slugs.length]}`,
        previous_title: '이전 합성 글',
        next_slug: `ga-validation-${slugs[(index + 1) % slugs.length]}`,
        next_title: '다음 합성 글',
      };
      response = await renderArticle(
        request,
        {
          SITE_ORIGIN: origin,
          GA4_VALIDATION_AUTHENTICATED: 'true',
          CMS: { fetch: async () => Response.json(post) },
          ASSETS: {
            fetch: () =>
              env.ASSETS.fetch(
                new Request(`${origin}/ga-validation/template/`)
              ),
          },
        },
        url
      );
    } else if (
      /^\/_astro\/[A-Za-z0-9_.-]+\.(js|css|woff2)$/.test(url.pathname)
    ) {
      // Only the isolated bundle is uploaded; no blog images or CMS bindings.
      response = await env.ASSETS.fetch(
        new Request(`${origin}${url.pathname}`)
      );
    } else if (url.pathname === '/fixture.svg') {
      response = new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#dbeafe"/><text x="40" y="80" font-size="40">Synthetic fixture</text></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    } else if (url.pathname === '/privacy/') {
      response = new Response(
        '<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>합성 검증 안내</title><body><h1>합성 검증 안내</h1><p>동의 후 테스트 Google Analytics 속성에 합성 글 조회·본문 도달·이동·기기 정보를 전송합니다. 거부하면 Google 태그를 로드하지 않습니다. 선택은 localStorage에 자동 만료 없이 저장됩니다. 허용 뒤 GA 쿠키를 사용할 수 있으며 철회는 앞으로의 수집을 중단합니다. Google 서버의 기존 데이터 삭제와는 다릅니다.</p><p>같은 탭 이동은 출발·목적지 경로, 방향과 시각 한 건을 sessionStorage에 임시 보관하고 다음 페이지에서 읽어 삭제합니다. 10초 이내 동의한 대상 문서에서만 사용하며 읽지 못하면 탭 종료까지 남을 수 있습니다. 철회 시에도 삭제합니다. 식별자나 인증 정보는 임시 값에 넣지 않습니다.</p><p>현재 자동 측정 설정과 쿠키 동작은 검증 대상입니다. 실제 운영 콘텐츠나 개인정보 입력은 사용하지 마세요. 문의: me@seungjun.sh</p></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    } else if (url.pathname === '/robots.txt') {
      response = new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      response = new Response('Not found', { status: 404 });
    }
    const protectedHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers))
      protectedHeaders.set(key, value);
    return new Response(response.body, {
      status: response.status,
      headers: protectedHeaders,
    });
  },
};
