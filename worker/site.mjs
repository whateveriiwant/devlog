const protectedPath = (path) =>
  path === '/write' ||
  path.startsWith('/write/') ||
  path === '/admin' ||
  path.startsWith('/admin/');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!protectedPath(url.pathname)) return env.ASSETS.fetch(request);

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
