const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SESSION_SECONDS = 12 * 60 * 60;
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

async function authenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const value = cookie(request, 'cms_session');
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      }
    : null;
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
  return result;
}

async function media(request, env, url) {
  const headers = cors(request, env);
  if (!headers) return json({ error: 'Forbidden origin' }, 403);
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers });
  if (!(await authenticated(request, env)))
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    if (url.pathname === '/media') return media(request, env, url);
    return json({ error: 'Not found' }, 404);
  },
};
