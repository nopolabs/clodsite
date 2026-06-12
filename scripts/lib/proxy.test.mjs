// Tests the proxy Pages Function as it ships: render the template from a
// plan proxies entry (renderProxySource), import the tmp module, and drive
// onRequest with a stubbed fetch covering upstream and siteverify.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { buildProxyConfig, renderProxySource, PROXY_MARKER } from './render-functions.mjs';

const PROXY = {
  mount: 'parchment',
  upstream: 'https://parchment-worker.example.workers.dev/parchment',
  headers: { 'X-Site-ID': 'bbpp' },
  secret: 'PARCHMENT_API_KEY',
  authenticated: ['POST issue'],
  turnstile: ['POST issue'],
};

const HOSTNAMES_MARKER = '__CLODSITE_TURNSTILE_HOSTNAMES__';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-proxy-'));
test.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

let moduleCount = 0;
async function loadProxy(proxy, { provisionHostnames } = {}) {
  let source = renderProxySource(proxy);
  if (provisionHostnames) {
    // Simulate deploy provisioning: the quoted marker becomes the JSON
    // hostname allowlist, exactly as provision-turnstile.sh patches it.
    source = source.replace(JSON.stringify(HOSTNAMES_MARKER), JSON.stringify(provisionHostnames));
  }
  const modulePath = path.join(tmpDir, 'proxy-' + (moduleCount += 1) + '.mjs');
  fs.writeFileSync(modulePath, source);
  return import(pathToFileURL(modulePath).href);
}

function makeContext({ method = 'GET', pathSegments = [], search = '', headers = {}, body, env = {} }) {
  // Pages decodes percent-encoded segments before exposing params.path, so
  // the request URL carries the encoded form while params carry the decoded.
  const url = 'https://bbpp.pages.dev/parchment/'
    + pathSegments.map(encodeURIComponent).join('/') + search;
  return {
    env,
    params: { path: pathSegments },
    request: new Request(url, { method, headers, body }),
  };
}

function stubFetch(t, { verification, upstream } = {}) {
  const calls = { verify: [], upstream: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://challenges.cloudflare.com/')) {
      calls.verify.push({ url: String(url), init });
      return new Response(JSON.stringify(verification ?? { success: true }), { status: 200 });
    }
    calls.upstream.push({ url: String(url), init });
    return upstream
      ? upstream(url, init)
      : new Response('upstream-body', {
          status: 200,
          headers: { 'cache-control': 'no-store', 'content-type': 'image/png' },
        });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('rendered source starts with the proxy marker', () => {
  assert.ok(renderProxySource(PROXY).startsWith(PROXY_MARKER));
});

test('buildProxyConfig strips trailing slashes and defaults optional fields', () => {
  const config = buildProxyConfig({ mount: 'svc', upstream: 'https://svc.example.com/base/' });
  assert.equal(config.upstream, 'https://svc.example.com/base');
  assert.deepEqual(config.headers, {});
  assert.equal(config.secret, null);
  assert.deepEqual(config.authenticated, []);
  assert.deepEqual(config.turnstile, { routes: [], action: null, hostnames: [] });
});

test('GET passes through with configured headers and the search string', async (t) => {
  const { onRequest } = await loadProxy(PROXY);
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({
    pathSegments: ['cert', 'tok_aaaaaaaaaaaaaaaaaaaa'],
    search: '?scale=3',
    headers: {
      accept: 'image/png',
      cookie: 'session=secret',
      authorization: 'Bearer client-supplied',
      'x-site-id': 'spoofed',
    },
  }));

  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'upstream-body');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(calls.upstream.length, 1);
  assert.equal(
    calls.upstream[0].url,
    'https://parchment-worker.example.workers.dev/parchment/cert/tok_aaaaaaaaaaaaaaaaaaaa?scale=3',
  );
  const sent = calls.upstream[0].init.headers;
  assert.equal(sent['x-site-id'], 'bbpp');
  assert.equal(sent['accept'], 'image/png');
  assert.equal(sent['cookie'], undefined);
  assert.equal(sent['authorization'], undefined);
});

test('HEAD passes through — the checkout token verify path', async (t) => {
  const { onRequest } = await loadProxy(PROXY);
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({ method: 'HEAD', pathSegments: ['cert', 'tok_bbbbbbbbbbbbbbbbbbbb'] }));

  assert.equal(res.status, 200);
  assert.equal(calls.upstream.length, 1);
  assert.equal(calls.upstream[0].init.method, 'HEAD');
});

test('methods beyond GET/HEAD/POST are rejected without an upstream call', async (t) => {
  const { onRequest } = await loadProxy(PROXY);
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({ method: 'DELETE', pathSegments: ['cert', 'x'] }));

  assert.equal(res.status, 405);
  assert.equal(calls.upstream.length, 0);
});

test('dot-segment traversal that escapes the upstream prefix is a 404', async (t) => {
  const { onRequest } = await loadProxy(PROXY);
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({ pathSegments: ['..', 'admin'] }));

  assert.equal(res.status, 404);
  assert.equal(calls.upstream.length, 0);
});

test('decoded "?" in a segment cannot smuggle a query string', async (t) => {
  const { onRequest } = await loadProxy(PROXY);
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({ pathSegments: ['render?name=x'] }));

  assert.equal(res.status, 200);
  assert.equal(
    calls.upstream[0].url,
    'https://parchment-worker.example.workers.dev/parchment/render%3Fname%3Dx',
  );
});

test('authenticated route attaches the bearer secret from env', async (t) => {
  const { onRequest } = await loadProxy(PROXY, { provisionHostnames: ['bbpp.pages.dev'] });
  const calls = stubFetch(t, { verification: { success: true, action: 'clodsite-proxy-parchment', hostname: 'bbpp.pages.dev' } });

  const res = await onRequest(makeContext({
    method: 'POST',
    pathSegments: ['issue'],
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Margaret+Gale&email=m%40example.com&cf-turnstile-response=tok123',
    env: { PARCHMENT_API_KEY: 'pk_secret', TURNSTILE_SECRET_KEY: 'ts_secret' },
  }));

  assert.equal(res.status, 200);
  assert.equal(calls.verify.length, 1);
  const verifyBody = JSON.parse(calls.verify[0].init.body);
  assert.equal(verifyBody.secret, 'ts_secret');
  assert.equal(verifyBody.response, 'tok123');
  assert.equal(calls.upstream.length, 1);
  const sent = calls.upstream[0].init.headers;
  assert.equal(sent['authorization'], 'Bearer pk_secret');
  assert.equal(sent['x-site-id'], 'bbpp');
  assert.equal(calls.upstream[0].init.body, 'name=Margaret+Gale&email=m%40example.com&cf-turnstile-response=tok123');
});

test('authenticated route with the secret env missing fails closed', async (t) => {
  const { onRequest } = await loadProxy(PROXY, { provisionHostnames: ['bbpp.pages.dev'] });
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({
    method: 'POST',
    pathSegments: ['issue'],
    body: 'cf-turnstile-response=tok123',
    env: { TURNSTILE_SECRET_KEY: 'ts_secret' },
  }));

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Not configured' });
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.upstream.length, 0);
});

test('turnstile route with TURNSTILE_SECRET_KEY missing fails closed', async (t) => {
  const { onRequest } = await loadProxy(PROXY, { provisionHostnames: ['bbpp.pages.dev'] });
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({
    method: 'POST',
    pathSegments: ['issue'],
    body: 'cf-turnstile-response=tok123',
    env: { PARCHMENT_API_KEY: 'pk_secret' },
  }));

  assert.equal(res.status, 500);
  assert.equal(calls.upstream.length, 0);
});

test('turnstile route without a token is a 403 before any network call', async (t) => {
  const { onRequest } = await loadProxy(PROXY, { provisionHostnames: ['bbpp.pages.dev'] });
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({
    method: 'POST',
    pathSegments: ['issue'],
    body: 'name=Margaret+Gale',
    env: { PARCHMENT_API_KEY: 'pk_secret', TURNSTILE_SECRET_KEY: 'ts_secret' },
  }));

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'verification failed' });
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.upstream.length, 0);
});

test('failed verification never reaches upstream', async (t) => {
  const { onRequest } = await loadProxy(PROXY, { provisionHostnames: ['bbpp.pages.dev'] });
  for (const verification of [
    { success: false },
    { success: true, action: 'other-action', hostname: 'bbpp.pages.dev' },
    { success: true, action: 'clodsite-proxy-parchment', hostname: 'evil.example.com' },
  ]) {
    const calls = stubFetch(t, { verification });
    const res = await onRequest(makeContext({
      method: 'POST',
      pathSegments: ['issue'],
      body: 'cf-turnstile-response=tok123',
      env: { PARCHMENT_API_KEY: 'pk_secret', TURNSTILE_SECRET_KEY: 'ts_secret' },
    }));
    assert.equal(res.status, 403);
    assert.equal(calls.upstream.length, 0);
  }
});

test('unprovisioned hostnames marker fails closed', async (t) => {
  // Before deploy provisioning, CONFIG.turnstile.hostnames is still the
  // marker string — no hostname can match, so verification always fails.
  const { onRequest } = await loadProxy(PROXY);
  const calls = stubFetch(t, { verification: { success: true, action: 'clodsite-proxy-parchment', hostname: 'bbpp.pages.dev' } });

  const res = await onRequest(makeContext({
    method: 'POST',
    pathSegments: ['issue'],
    body: 'cf-turnstile-response=tok123',
    env: { PARCHMENT_API_KEY: 'pk_secret', TURNSTILE_SECRET_KEY: 'ts_secret' },
  }));

  assert.equal(res.status, 403);
  assert.equal(calls.upstream.length, 0);
});

test('non-guarded POST routes forward without auth or verification', async (t) => {
  const proxy = { ...PROXY, secret: undefined, authenticated: undefined, turnstile: undefined };
  const { onRequest } = await loadProxy(proxy);
  const calls = stubFetch(t);

  const res = await onRequest(makeContext({
    method: 'POST',
    pathSegments: ['other'],
    headers: { 'content-type': 'text/plain' },
    body: 'payload',
  }));

  assert.equal(res.status, 200);
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.upstream.length, 1);
  assert.equal(calls.upstream[0].init.headers['authorization'], undefined);
});
