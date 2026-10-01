import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';

const origin = process.env.SITE_ORIGIN || 'https://seungjun.sh';
const get = async (path) =>
  globalThis.fetch(new URL(path, origin), { redirect: 'manual' });

for (const path of [
  '/api/content/posts',
  '/api/content/search?q=deploy-check',
]) {
  const response = await get(path);
  assert.equal(response.status, 200, `${path} must be available`);
}

for (const path of ['/api/auth/session', '/api/content/editor/posts']) {
  const response = await get(path);
  assert.equal(
    response.status,
    401,
    `${path} must reject an anonymous request`
  );
}

const login = await get('/login/');
assert.equal(login.status, 200, 'Login page must be available');
assert.equal(login.headers.get('x-frame-options'), 'DENY');
const policy = login.headers.get('content-security-policy') || '';
assert.match(policy, /frame-ancestors 'none'/);
assert.match(policy, /style-src 'self' 'unsafe-inline'/);
const html = await login.text();
const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(([tag]) => tag);
assert.ok(scripts.length > 0, 'Login page contains its expected scripts');
const nonces = scripts.map((tag) => tag.match(/\bnonce="([^"]+)"/i)?.[1]);
assert.ok(nonces.every(Boolean), 'Every script has a response nonce');
const policyNonce = policy.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
assert.ok(policyNonce, 'CSP contains a script nonce');
assert.ok(
  nonces.every((nonce) => nonce === policyNonce),
  'CSP and HTML nonces match'
);

console.log(
  'PASS: public reads, anonymous auth rejection, and login CSP/frame/nonce headers'
);
