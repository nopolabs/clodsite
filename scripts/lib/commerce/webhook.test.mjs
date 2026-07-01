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
const SITE_SLUG = 'crow-shop';
const PLAN = {
  slug: SITE_SLUG,
  commerce: {
    enabled: true,
    provider: 'manual',
    currency: 'usd',
    checkout: {
      provider: 'stripe',
      success_url: '/success/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: '/',
    },
    fulfillment: { to: 'orders@example.com', from: 'shop@example.com' },
  },
};

const CONTACT_PLAN = {
  slug: SITE_SLUG,
  commerce: {
    enabled: true,
    provider: 'manual',
    currency: 'usd',
    checkout: {
      provider: 'stripe',
      success_url: '/success/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: '/',
    },
    fulfillment: { to: 'orders@example.com', from: 'shop@example.com' },
    contact: { from: 'confirm@example.com', reply_to: 'support@example.com' },
  },
};

const PRINTFUL_PLAN = {
  slug: SITE_SLUG,
  commerce: {
    enabled: true,
    provider: 'printful',
    currency: 'usd',
    checkout: {
      provider: 'stripe',
      success_url: '/success/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: '/',
    },
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
const contactModulePath = path.join(tmpDir, 'webhook-contact.mjs');
fs.writeFileSync(contactModulePath, renderWebhookSource(CONTACT_PLAN));
const { onRequestPost: onRequestPostWithContact } = await import(pathToFileURL(contactModulePath).href);
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
        metadata: { site: SITE_SLUG, items: JSON.stringify([{ fulfillment_ref: '4938291', qty: 2 }]) },
        customer_details: { email: 'pat@example.com' },
        shipping_details: {
          name: 'Pat Crow',
          address: { line1: '1 Roost Ln', city: 'Corvid', state: 'CA', postal_code: '90210', country: 'US' },
        },
        currency: 'usd',
        amount_subtotal: 4000,
        amount_total: 4500,
        shipping_cost: { amount_total: 500 },
        ...overrides,
      },
    },
  };
}

function makeContext({ body, signature, orders, env = {} }) {
  return {
    env: {
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_SECRET_KEY: 'sk_test_key',
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

function alertEnv() {
  return {
    CLODSITE_COMMERCE_ALERT_TO: 'ops@example.com',
    CLODSITE_COMMERCE_ALERT_FROM: 'alerts@example.com',
  };
}

function stubManualFailureAndAlerts(t) {
  return stubResend(t, (url, init) => {
    const body = JSON.parse(init.body);
    if (body.subject && body.subject.startsWith('New order ')) {
      return new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 });
    }
    return new Response(JSON.stringify({ id: 'alert_ok' }), { status: 200 });
  });
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

test('ignores a session stamped for another site (shared Stripe account fan-out)', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV();
  // A valid, fully-formed session from a different site on the same account.
  const body = JSON.stringify(makeEvent({
    metadata: { site: 'other-shop', items: JSON.stringify([{ fulfillment_ref: '4938291', qty: 2 }]) },
  }));

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, true);
  assert.equal(calls.length, 0, 'must not fulfill another site\'s order');
  assert.equal(orders.read('cs_test_abc123'), null, 'must not even record a KV order for a foreign session');
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

test('completed order does not emit an operator alert', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({
    body,
    signature: sign(body),
    orders,
    env: alertEnv(),
  }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const email = JSON.parse(calls[0].init.body);
  assert.match(email.subject, /^New order /);
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

// ── order-confirmation email (item 2 phase 2) ──────────────────────────────

const DEFAULT_LINE_ITEMS = [
  { description: 'Crow Tee (Pink / L)', quantity: 2, amount_total: 4000 },
];

// Confirmation flow makes up to three network calls, all through the same
// stubbed fetch: the manual provider's merchant order email, the Stripe
// line_items retrieve, and the customer confirmation email — discriminated by
// URL host and (for the two Resend sends) subject prefix, mirroring
// stubManualFailureAndAlerts.
function stubConfirmationFlow(t, { lineItems = DEFAULT_LINE_ITEMS, stripeStatus = 200, onConfirmation } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).startsWith('https://api.stripe.com/')) {
      if (stripeStatus !== 200) return new Response('{}', { status: stripeStatus });
      return new Response(JSON.stringify({ line_items: { data: lineItems } }), { status: 200 });
    }
    const body = JSON.parse(init.body);
    if (body.subject && body.subject.startsWith('New order ')) {
      return new Response(JSON.stringify({ id: 'order_ok' }), { status: 200 });
    }
    return onConfirmation
      ? onConfirmation(url, init, body)
      : new Response(JSON.stringify({ id: 'confirm_ok' }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('completed order sends a store-branded confirmation when commerce.contact.from is set', async (t) => {
  const calls = stubConfirmationFlow(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 3, 'merchant order email, Stripe line_items retrieve, confirmation email');
  const stripeCall = calls.find((c) => String(c.url).startsWith('https://api.stripe.com/'));
  assert.equal(stripeCall.url, 'https://api.stripe.com/v1/checkout/sessions/cs_test_abc123?expand[]=line_items');
  assert.equal(stripeCall.init.headers['Authorization'], 'Bearer sk_test_key');

  const confirmation = JSON.parse(calls[2].init.body);
  assert.deepEqual(confirmation.to, ['pat@example.com']);
  assert.equal(confirmation.from, 'confirm@example.com');
  assert.equal(confirmation.reply_to, 'support@example.com');
  assert.match(confirmation.subject, /crow-shop/);
  assert.match(confirmation.text, /Order: cs_test_abc123/);
  assert.match(confirmation.text, /2 x Crow Tee \(Pink \/ L\) — \$40\.00 USD/);
  assert.match(confirmation.text, /Subtotal: \$40\.00 USD/);
  assert.match(confirmation.text, /Shipping: \$5\.00 USD/);
  assert.match(confirmation.text, /Total: \$45\.00 USD/);
  assert.match(confirmation.text, /Pat Crow/);
  assert.equal(calls[2].init.headers['Idempotency-Key'], 'commerce-confirmation:crow-shop:cs_test_abc123');

  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.ok(record.confirmation_sent_at);
});

test('no confirmation email when commerce.contact.from is unset', async (t) => {
  const calls = stubResend(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, 'only the merchant order email sends');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.confirmation_sent_at, undefined);
});

test('absent customer_details.email skips the confirmation with a diagnostic; order unaffected', async (t) => {
  const calls = stubConfirmationFlow(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent({ customer_details: undefined }));

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, 'no Stripe retrieve or confirmation send once email is absent');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.confirmation_sent_at, undefined);
  assert.match(record.confirmation_error, /customer_details\.email missing/);
});

test('Stripe line_items retrieve failure leaves the order completed, unaffected', async (t) => {
  stubConfirmationFlow(t, { stripeStatus: 500 });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.confirmation_sent_at, undefined);
  assert.match(record.confirmation_error, /Stripe line_items retrieve failed/);
});

test('Resend confirmation-send failure leaves the order completed, unaffected', async (t) => {
  stubConfirmationFlow(t, {
    onConfirmation: () => new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 }),
  });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.confirmation_sent_at, undefined);
  assert.match(record.confirmation_error, /Resend send failed/);
});

test('idempotent: a prior confirmation_sent_at is preserved and the confirmation is not resent', async (t) => {
  const calls = stubConfirmationFlow(t);
  const sentAt = '2026-01-01T00:00:00.000Z';
  const orders = fakeKV({
    cs_test_abc123: {
      state: 'failed',
      attempts: 1,
      updated_at: Date.now() - 5 * 60 * 1000,
      confirmation_sent_at: sentAt,
      last_error: { at: '2026-06-10T00:00:00.000Z', message: 'boom', provider_detail: 'HTTP 500' },
    },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, 'only the merchant order email retries; no Stripe retrieve or resend');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.confirmation_sent_at, sentAt);
});

test('duplicate delivery of a completed order recovers a never-attempted confirmation without refulfilling', async (t) => {
  // Simulates a Worker interrupted between the completed-state write and the
  // confirmation write: state is completed, but neither confirmation_sent_at
  // nor confirmation_error was ever recorded (review finding on PR #109).
  const calls = stubConfirmationFlow(t);
  const orders = fakeKV({
    cs_test_abc123: { state: 'completed', attempts: 1, updated_at: Date.now(), provider_order_id: 'order_ok' },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  assert.equal(calls.length, 2, 'only the Stripe line_items retrieve and the confirmation send — no merchant order email');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.attempts, 1, 'createOrder never reruns');
  assert.ok(record.confirmation_sent_at);
});

test('duplicate-delivery confirmation recovery records a diagnostic on failure without refulfilling', async (t) => {
  stubConfirmationFlow(t, { stripeStatus: 500 });
  const orders = fakeKV({
    cs_test_abc123: { state: 'completed', attempts: 1, updated_at: Date.now(), provider_order_id: 'order_ok' },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'completed');
  assert.equal(record.confirmation_sent_at, undefined);
  assert.match(record.confirmation_error, /Stripe line_items retrieve failed/);
});

test('duplicate delivery does not retry a confirmation that already failed once (confirmation_error set)', async (t) => {
  const calls = stubConfirmationFlow(t);
  const orders = fakeKV({
    cs_test_abc123: {
      state: 'completed',
      attempts: 1,
      updated_at: Date.now(),
      provider_order_id: 'order_ok',
      confirmation_error: 'Resend send failed: HTTP 429',
    },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPostWithContact(makeContext({ body, signature: sign(body), orders }));

  assert.equal(res.status, 200);
  assert.equal(calls.length, 0, 'no retry once a confirmation attempt has already been recorded');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.confirmation_sent_at, undefined);
  assert.equal(record.confirmation_error, 'Resend send failed: HTTP 429');
});

test('duplicate delivery never attempts confirmation recovery when commerce.contact.from is unset', async (t) => {
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

test('personalization fields pass through metadata to the provider verbatim', async (t) => {
  const calls = stubResend(t);
  const token = 'tok_aaaaaaaaaaaaaaaaaaaa';
  const printUrl = 'https://shop.example.com/parchment/cert/' + token + '?scale=3';
  const body = JSON.stringify(makeEvent({
    metadata: {
      site: SITE_SLUG,
      items: JSON.stringify([
        { fulfillment_ref: 'bbpp-print', qty: 1, personalization_id: token, personalization_url: printUrl },
      ]),
    },
  }));

  const res = await onRequestPost(makeContext({ body, signature: sign(body), orders: fakeKV() }));

  assert.equal(res.status, 200);
  const email = JSON.parse(calls[0].init.body);
  assert.match(email.text, /1 x bbpp-print/);
  assert.match(email.text, new RegExp('personalization: ' + token));
  assert.ok(email.text.includes('print file: ' + printUrl));
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
  assert.equal(created.external_id, 'cs_71d330da3cfb1ee326a53caf');
  assert.deepEqual(created.items, [
    { external_id: 'cs_71d330da3cfb1ee326a53caf-1', sync_variant_id: 4938291, quantity: 2 },
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

test('provider failure emits one operator alert and records alert state', async (t) => {
  const calls = stubManualFailureAndAlerts(t);
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({
    body,
    signature: sign(body),
    orders,
    env: alertEnv(),
  }));

  assert.equal(res.status, 500);
  assert.equal(calls.length, 2);
  const alert = JSON.parse(calls[1].init.body);
  assert.deepEqual(alert.to, ['ops@example.com']);
  assert.equal(alert.from, 'alerts@example.com');
  assert.match(alert.subject, /\[crow-shop\] Commerce fulfillment failed: cs_test_abc123/);
  assert.match(alert.text, /Site: crow-shop/);
  assert.match(alert.text, /Stripe session: cs_test_abc123/);
  assert.match(alert.text, /Attempts: 1/);
  assert.match(alert.text, /manual provider order email failed/);
  assert.equal(calls[1].init.headers['Idempotency-Key'], 'commerce-alert:crow-shop:cs_test_abc123:1');
  assert.ok(calls[1].init.signal instanceof AbortSignal);

  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'failed');
  assert.equal(record.alert_count, 1);
  assert.ok(record.alerted_at);
});

test('operator alert non-2xx leaves failed record unalerted for retry', async (t) => {
  const calls = stubResend(t, (url, init) => {
    const body = JSON.parse(init.body);
    if (body.subject && body.subject.startsWith('New order ')) {
      return new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 });
    }
    return new Response(JSON.stringify({ message: 'alert unavailable' }), { status: 503 });
  });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({
    body,
    signature: sign(body),
    orders,
    env: alertEnv(),
  }));

  assert.equal(res.status, 500);
  assert.equal(calls.length, 2);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'failed');
  assert.equal(record.attempts, 1);
  assert.equal(record.alerted_at, undefined);
  assert.equal(record.alert_count, undefined);
});

test('operator alert throw leaves failed record unalerted for retry', async (t) => {
  const calls = stubResend(t, (url, init) => {
    const body = JSON.parse(init.body);
    if (body.subject && body.subject.startsWith('New order ')) {
      return new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 });
    }
    throw new Error('network unavailable');
  });
  const orders = fakeKV();
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({
    body,
    signature: sign(body),
    orders,
    env: alertEnv(),
  }));

  assert.equal(res.status, 500);
  assert.equal(calls.length, 2);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'failed');
  assert.equal(record.attempts, 1);
  assert.equal(record.alerted_at, undefined);
  assert.equal(record.alert_count, undefined);
});

test('failed retry inside alert backoff does not send another operator alert', async (t) => {
  const calls = stubManualFailureAndAlerts(t);
  const orders = fakeKV({
    cs_test_abc123: {
      state: 'failed',
      attempts: 1,
      updated_at: Date.now() - 5 * 60 * 1000,
      alerted_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      alert_count: 1,
      last_error: { at: '2026-06-10T00:00:00.000Z', message: 'boom', provider_detail: 'HTTP 500' },
    },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({
    body,
    signature: sign(body),
    orders,
    env: alertEnv(),
  }));

  assert.equal(res.status, 500);
  assert.equal(calls.length, 1, 'only the provider failure call happens');
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'failed');
  assert.equal(record.attempts, 2);
  assert.equal(record.alert_count, 1);
});

test('failed retry after alert backoff sends another operator alert', async (t) => {
  const calls = stubManualFailureAndAlerts(t);
  const orders = fakeKV({
    cs_test_abc123: {
      state: 'failed',
      attempts: 1,
      updated_at: Date.now() - 7 * 60 * 60 * 1000,
      alerted_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      alert_count: 1,
      last_error: { at: '2026-06-10T00:00:00.000Z', message: 'boom', provider_detail: 'HTTP 500' },
    },
  });
  const body = JSON.stringify(makeEvent());

  const res = await onRequestPost(makeContext({
    body,
    signature: sign(body),
    orders,
    env: alertEnv(),
  }));

  assert.equal(res.status, 500);
  assert.equal(calls.length, 2);
  const alert = JSON.parse(calls[1].init.body);
  assert.match(alert.subject, /Commerce fulfillment failed/);
  const record = orders.read('cs_test_abc123');
  assert.equal(record.state, 'failed');
  assert.equal(record.attempts, 2);
  assert.equal(record.alert_count, 2);
});
