// Tests the webhook Pages Function the way it ships: render the template with
// the manual provider inlined (renderWebhookSource), write it to a tmp module,
// import it, and drive onRequestPost with a fake KV namespace, a stubbed
// Resend fetch, and real Stripe HMAC signatures.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { renderWebhookSource } from '../render-functions.mjs';

const WEBHOOK_SECRET = 'whsec_test_secret';
const PLAN = {
  commerce: {
    enabled: true,
    provider: 'manual',
    currency: 'usd',
    checkout: 'stripe',
    fulfillment: { to: 'orders@example.com', from: 'shop@example.com' },
  },
};

const PRINTFUL_PLAN = {
  commerce: {
    enabled: true,
    provider: 'printful',
    currency: 'usd',
    checkout: 'stripe',
    printful: {
      store_id: 17828143,
      products: [
        { slug: 'crow-tee', printful_product_id: 428417969, price_minor: 2000, description: 'A tee.' },
      ],
    },
  },
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-webhook-'));
const modulePath = path.join(tmpDir, 'webhook.mjs');
fs.writeFileSync(modulePath, renderWebhookSource(PLAN));
const { onRequestPost } = await import(pathToFileURL(modulePath).href);
const printfulModulePath = path.join(tmpDir, 'webhook-printful.mjs');
fs.writeFileSync(printfulModulePath, renderWebhookSource(PRINTFUL_PLAN));
const { onRequestPost: onRequestPostPrintful } = await import(pathToFileURL(printfulModulePath).href);
test.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function fakeKV(entries = {}) {
  const store = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    store,
    read(key) {
      return store.has(key) ? JSON.parse(store.get(key)) : null;
    },
    async get(key, type) {
      assert.equal(type, 'json');
      return store.has(key) ? JSON.parse(store.get(key)) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function sign(body, { secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const mac = createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
  return 't=' + timestamp + ',v1=' + mac;
}

function makeEvent(overrides = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_abc123',
        metadata: { items: JSON.stringify([{ fulfillment_ref: '4938291', qty: 2 }]) },
        customer_details: { email: 'pat@example.com' },
        shipping_details: {
          name: 'Pat Crow',
          address: { line1: '1 Roost Ln', city: 'Corvid', state: 'CA', postal_code: '90210', country: 'US' },
        },
        ...overrides,
      },
    },
  };
}

function makeContext({ body, signature, orders, env = {} }) {
  return {
    env: {
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RESEND_API_KEY: 're_test_key',
      ORDERS: orders,
      ...env,
    },
    request: new Request('https://example.pages.dev/api/webhook', {
      method: 'POST',
      headers: signature === undefined ? {} : { 'stripe-signature': signature },
      body,
    }),
  };
}

function stubResend(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler
      ? handler(url, init)
      : new Response(JSON.stringify({ id: 'email_ok' }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('rejects a bad signature without touching KV or the provider', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body + 'tampered'), orders }));

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
  assert.equal(orders.store.size, 0);
});

test('rejects a missing signature header', async (t) => {
  stubResend(t);
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: undefined, orders: fakeKV() }));

  assert.equal(res.status, 400);
});

test('rejects a signature older than the 300s tolerance', async (t) => {
  stubResend(t);
  const body = JSON.stringify(makeEvent());
  const stale = sign(body, { timestamp: Math.floor(Date.now() / 1000) - 600 });

  const res = await onRequestPost(makeContext({ body, signature: stale, orders: fakeKV() }));

  assert.equal(res.status, 400);
});

test('returns 500 when secret or KV binding is missing', async (t) => {
  stubResend(t);
  const body = JSON.stringify(makeEvent());

  const noSecret = await onRequestPost(
    makeContext({ body, signature: sign(body), orders: fakeKV(), env: { STRIPE_WEBHOOK_SECRET: undefined } }),
  );
  const noKV = await onRequestPost(
    makeContext({ body, signature: sign(body), orders: undefined }),
  );

  assert.equal(noSecret.status, 500);
  assert.equal(noKV.status, 500);
});

test('ignores event types other than checkout.session.completed', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV();
  const body = JSON.stringify({ ...makeEvent(), type: 'payment_intent.succeeded' });

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, true);
  assert.equal(calls.length, 0);
});

test('ignores completed sessions without our checkout metadata', async (t) => {
  const calls = stubResend(t);
  const body = JSON.stringify(makeEvent({ metadata: {} }));

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders: fakeKV() }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, true);
  assert.equal(calls.length, 0);
});

test('first delivery: fulfills via the provider and records completed', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'cs_test_abc123');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.attempts, 1);
  assert.equal(record.provider_order_id, 'email_ok');
});

test('PROVIDER_ENV overlays plan fulfillment config onto the runtime env', async (t) => {
  const calls = stubResend(t);
  const body = JSON.stringify(makeEvent());

  await onRequestPost(makeContext({ body, signature: sign(body), orders: fakeKV() }));

  const email = JSON.parse(calls[0].init.body);
  assert.deepEqual(email.to, ['orders@example.com']);
  assert.equal(email.from, 'shop@example.com');
  assert.match(email.text, /2 x 4938291/);
  assert.match(email.text, /Pat Crow/);
});

test('duplicate delivery of a completed order returns 200 without refulfilling', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV({
    cs_test_abc123: { state: 'completed', attempts: 1, updated_at: Date.now(), provider_order_id: 'email_ok' },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  assert.equal(calls.length, 0);
});

test('fresh processing record returns 503 WITHOUT calling the provider', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV({
    cs_test_abc123: { state: 'processing', attempts: 1, updated_at: Date.now() - 60 * 1000 },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
  assert.equal(orders.read('cs_test_abc123').state, 'processing');
  assert.equal(orders.read('cs_test_abc123').attempts, 1);
});

test('stale processing record (>10min) is treated as failed and retried', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV({
    cs_test_abc123: { state: 'processing', attempts: 3, updated_at: Date.now() - 11 * 60 * 1000 },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.attempts, 4);
});

test('failed record is retried with attempts incremented', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV({
    cs_test_abc123: {
      state: 'failed',
      attempts: 2,
      updated_at: Date.now() - 5 * 60 * 1000,
      last_error: { at: '2026-06-10T00:00:00.000Z', message: 'boom', provider_detail: 'HTTP 500' },
    },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.attempts, 3);
});

test('printful provider: fulfills end-to-end with the store id overlaid from the plan', async (t) => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const method = (init && init.method) || 'GET';
    calls.push({ method, url, init });
    const { pathname } = new URL(url);
    if (method === 'GET' && pathname.startsWith('/orders/@')) {
      return new Response(JSON.stringify({ code: 404, result: 'Order not found' }), { status: 404 });
    }
    if (method === 'POST' && pathname === '/orders') {
      return new Response(JSON.stringify({ code: 200, result: { id: 77001, status: 'draft' } }), { status: 200 });
    }
    if (method === 'POST' && pathname === '/orders/77001/confirm') {
      return new Response(JSON.stringify({ code: 200, result: { id: 77001, status: 'pending' } }), { status: 200 });
    }
    throw new Error('unexpected fetch: ' + method + ' ' + url);
  };
  t.after(() => {
    globalThis.fetch = original;
  });

  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());
  const res = await onRequestPostPrintful(makeContext({
    body,
    signature: sign(body),
    orders,
    env: { PRINTFUL_API_KEY: 'pf_test_key' },
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'POST']);
  // PRINTFUL_STORE_ID comes from the render-time plan overlay, not the runtime env.
  for (const call of calls) {
    assert.equal(new URL(call.url).searchParams.get('store_id'), '17828143');
    assert.equal(call.init.headers['Authorization'], 'Bearer pf_test_key');
  }
  const created = JSON.parse(calls[1].init.body);
  assert.equal(created.external_id, 'cs_test_abc123');
  assert.deepEqual(created.items, [
    { external_id: 'cs_test_abc123-1', sync_variant_id: 4938291, quantity: 2 },
  ]);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.provider_order_id, '77001');
});

test('provider failure records failed with last_error and returns 500 so Stripe retries', async (t) => {
  stubResend(t, () => new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 }));
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 500);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'failed');
  assert.equal(record.attempts, 1);
  assert.match(record.last_error.message, /order email failed/);
  assert.match(record.last_error.provider_detail, /HTTP 429/);
  assert.ok(record.last_error.at);
});
