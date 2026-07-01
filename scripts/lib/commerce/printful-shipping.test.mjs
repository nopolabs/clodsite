// Tests the Printful shipping-notification Function the way it ships: render
// the template (renderPrintfulShippingSource), write it to a tmp module,
// import it, and drive onRequestPost with a fake KV namespace and a stubbed
// fetch that discriminates between the Printful order-lookup call and the
// Resend send by URL host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { renderPrintfulShippingSource } from '../render-functions.mjs';

const SITE_SLUG = 'crow-shop';
const WEBHOOK_SECRET = 'ptok_test_secret';
const STORE_ID = '17828143';

const PLAN = {
  slug: SITE_SLUG,
  name: 'Crow Shop',
  commerce: {
    enabled: true,
    provider: 'printful',
    currency: 'usd',
    checkout: {
      provider: 'stripe',
      success_url: '/success/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: '/',
    },
    contact: { from: 'confirm@example.com', reply_to: 'support@example.com' },
    printful: { store_id: Number(STORE_ID), products: [] },
  },
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-printful-shipping-'));
const modulePath = path.join(tmpDir, 'printful-webhook.mjs');
fs.writeFileSync(modulePath, renderPrintfulShippingSource(PLAN));
const { onRequestPost } = await import(pathToFileURL(modulePath).href);
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

function makeContext({ body, token = WEBHOOK_SECRET, orders, env = {} }) {
  const url = 'https://example.pages.dev/api/printful-webhook' +
    (token === null ? '' : '?token=' + encodeURIComponent(token));
  return {
    env: {
      PRINTFUL_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PRINTFUL_API_KEY: 'pf_test_key',
      RESEND_API_KEY: 're_test_key',
      ORDERS: orders,
      ...env,
    },
    request: new Request(url, { method: 'POST', body }),
  };
}

function makeEvent(overrides = {}) {
  return {
    type: 'package_shipped',
    data: {
      order: { id: 5001 },
      shipment: { id: 'ship_1' },
    },
    ...overrides,
  };
}

// The order this "authoritative" Printful order lookup returns — the payload
// above never carries the actual shipment content, only the ids used to look
// this up.
function makeOrder(overrides = {}) {
  return {
    recipient: {
      name: 'Pat Crow',
      address1: '1 Roost Ln',
      city: 'Corvid',
      state_code: 'CA',
      zip: '90210',
      country_code: 'US',
      email: 'pat@example.com',
    },
    shipments: [
      {
        id: 'ship_1',
        tracking_number: '1Z999AA10123456784',
        carrier: 'UPS',
        service: 'Ground',
        tracking_url: 'https://example.com/track/1Z999AA10123456784',
        ship_date: '2026-07-01',
        items: [{ quantity: 2, name: 'Crow Tee (Pink / L)' }],
      },
    ],
    ...overrides,
  };
}

function stubFetch(t, { orderResponse, resendHandler } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://api.printful.com/orders/')) {
      if (orderResponse) return orderResponse(url, init);
      return new Response(JSON.stringify({ code: 200, result: makeOrder() }), { status: 200 });
    }
    if (String(url).startsWith('https://api.resend.com/')) {
      return resendHandler
        ? resendHandler(url, init)
        : new Response(JSON.stringify({ id: 'ship_email_ok' }), { status: 200 });
    }
    throw new Error('unexpected fetch: ' + url);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('token mismatch returns 401 without any Printful/Resend calls', async (t) => {
  const calls = stubFetch(t);
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, token: 'wrong', orders: fakeKV() }));

  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('missing token returns 401', async (t) => {
  stubFetch(t);
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, token: null, orders: fakeKV() }));

  assert.equal(res.status, 401);
});

test('returns 500 when required env is missing', async (t) => {
  stubFetch(t);
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(
    makeContext({ body, orders: fakeKV(), env: { RESEND_API_KEY: undefined } }),
  );

  assert.equal(res.status, 500);
});

test('malformed JSON body returns 400', async (t) => {
  stubFetch(t);

  const res = await onRequestPost(makeContext({ body: 'not json', orders: fakeKV() }));

  assert.equal(res.status, 400);
});

test('non-package_shipped event is ignored', async (t) => {
  const calls = stubFetch(t);
  const body = JSON.stringify({ ...makeEvent(), type: 'order_updated' });

  const res = await onRequestPost(makeContext({ body, orders: fakeKV() }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, true);
  assert.equal(calls.length, 0);
});

test('malformed event without order/shipment ids returns 400', async (t) => {
  stubFetch(t);
  const body = JSON.stringify({ type: 'package_shipped', data: {} });

  const res = await onRequestPost(makeContext({ body, orders: fakeKV() }));

  assert.equal(res.status, 400);
});

test('first delivery sends a shipped email from the authoritative order, not the payload', async (t) => {
  const calls = stubFetch(t);
  const orders = fakeKV();
  // The payload itself carries no tracking data to trust (verify-on-receipt,
  // Decision 1) — only the order/shipment ids used to look the real order up.
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 200);
  const printfulCall = calls.find((c) => c.url.startsWith('https://api.printful.com/'));
  assert.equal(printfulCall.url, 'https://api.printful.com/orders/5001?store_id=' + STORE_ID);
  assert.equal(printfulCall.init.headers['Authorization'], 'Bearer pf_test_key');

  const resendCall = calls.find((c) => c.url.startsWith('https://api.resend.com/'));
  const email = JSON.parse(resendCall.init.body);
  assert.deepEqual(email.to, ['pat@example.com']);
  assert.equal(email.from, 'confirm@example.com');
  assert.equal(email.reply_to, 'support@example.com');
  assert.match(email.subject, /Crow Shop/);
  assert.match(email.text, /Order: 5001/);
  assert.match(email.text, /1Z999AA10123456784/);
  assert.match(email.text, /UPS.*Ground/);
  assert.match(email.text, /Pat Crow/);
  assert.equal(resendCall.init.headers['Idempotency-Key'], 'printful-shipment:crow-shop:5001:ship_1');

  const record = orders.read('printful-shipment:5001:ship_1');
  assert.ok(record.notified_at);
});

test('duplicate delivery of the same (order_id, shipment_id) returns 200 without re-fetching or re-sending', async (t) => {
  const calls = stubFetch(t);
  const orders = fakeKV({ 'printful-shipment:5001:ship_1': { notified_at: '2026-07-01T00:00:00.000Z' } });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  assert.equal(calls.length, 0);
});

test('a second, different shipment on the same order sends its own notification', async (t) => {
  const calls = stubFetch(t, {
    orderResponse: () => new Response(JSON.stringify({
      code: 200,
      result: makeOrder({
        shipments: [
          { id: 'ship_1', tracking_number: 'AAA' },
          { id: 'ship_2', tracking_number: 'BBB' },
        ],
      }),
    }), { status: 200 }),
  });
  const orders = fakeKV({ 'printful-shipment:5001:ship_1': { notified_at: '2026-07-01T00:00:00.000Z' } });
  const body = JSON.stringify(makeEvent({ data: { order: { id: 5001 }, shipment: { id: 'ship_2' } } }));

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 200);
  const resendCall = calls.find((c) => c.url.startsWith('https://api.resend.com/'));
  assert.match(JSON.parse(resendCall.init.body).text, /BBB/);
  assert.ok(orders.read('printful-shipment:5001:ship_2').notified_at);
});

test('order lookup failure returns 500 with no KV write', async (t) => {
  stubFetch(t, {
    orderResponse: () => new Response(JSON.stringify({ code: 404, result: 'Order not found' }), { status: 404 }),
  });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 500);
  assert.equal(orders.read('printful-shipment:5001:ship_1'), null);
});

test('order found but shipment id absent from shipments[] returns 500 with no KV write', async (t) => {
  stubFetch(t, {
    orderResponse: () => new Response(JSON.stringify({
      code: 200,
      result: makeOrder({ shipments: [{ id: 'some_other_shipment' }] }),
    }), { status: 200 }),
  });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 500);
  assert.equal(orders.read('printful-shipment:5001:ship_1'), null);
});

test('missing recipient email is a permanent skip: 200, recorded, no Resend call', async (t) => {
  const calls = stubFetch(t, {
    orderResponse: () => new Response(JSON.stringify({
      code: 200,
      result: makeOrder({ recipient: { ...makeOrder().recipient, email: undefined } }),
    }), { status: 200 }),
  });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).skipped, true);
  assert.equal(calls.some((c) => c.url.startsWith('https://api.resend.com/')), false);
  const record = orders.read('printful-shipment:5001:ship_1');
  assert.match(record.skipped, /no recipient email/);
});

test('a repeat delivery after a permanent skip short-circuits without hitting Printful again', async (t) => {
  const calls = stubFetch(t);
  const orders = fakeKV({
    'printful-shipment:5001:ship_1': { skipped: 'no recipient email on order', at: '2026-07-01T00:00:00.000Z' },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  assert.equal(calls.length, 0);
});

test('Resend send failure returns 500 with no KV write, so a Printful retry can help', async (t) => {
  stubFetch(t, { resendHandler: () => new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 }) });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, orders }));

  assert.equal(res.status, 500);
  assert.equal(orders.read('printful-shipment:5001:ship_1'), null);
});
