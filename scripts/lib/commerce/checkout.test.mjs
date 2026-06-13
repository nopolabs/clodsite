// Tests the checkout Pages Function as it ships: render the template with a
// real catalog config (renderCheckoutSource), import the tmp module, and
// drive onRequestPost with a stubbed Stripe fetch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { renderCheckoutSource } from '../render-functions.mjs';

const PLAN = {
  slug: 'crow-shop',
  commerce: {
    enabled: true,
    provider: 'manual',
    currency: 'usd',
    checkout: 'stripe',
    shipping: { flat_rate_minor: 500, countries: ['US', 'CA'] },
    fulfillment: { to: 'orders@example.com', from: 'shop@example.com' },
  },
};

const CATALOG = {
  products: [
    {
      slug: 'crow-tee',
      name: 'Crow Tee',
      price_minor: 2000,
      active: true,
      options: [
        { name: 'Color', values: [{ value: 'White' }, { value: 'Black' }] },
        { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
      ],
      variants: [
        { optionValues: { Color: 'White', Size: 'S' }, fulfillment_ref: '4938291' },
      ],
    },
    {
      slug: 'logo-cap',
      name: 'Logo Cap',
      price_minor: 1500,
      active: true,
      variants: [{ optionValues: {}, fulfillment_ref: '5500110' }],
    },
    {
      slug: 'retired-tee',
      name: 'Retired Tee',
      price_minor: 1000,
      active: false,
      variants: [{ optionValues: {}, fulfillment_ref: '9999999' }],
    },
    {
      slug: 'printed-certificate',
      name: 'Printed Certificate',
      price_minor: 4500,
      active: true,
      variants: [{ optionValues: {}, fulfillment_ref: 'bbpp-print' }],
      personalization: { required: true, url: '/parchment/cert/{id}' },
    },
  ],
};

const TOKEN = 'tok_aaaaaaaaaaaaaaaaaaaa';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-checkout-'));
const modulePath = path.join(tmpDir, 'checkout.mjs');
fs.writeFileSync(modulePath, renderCheckoutSource(PLAN, CATALOG));
const { onRequestPost } = await import(pathToFileURL(modulePath).href);
test.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeContext(body, env = {}) {
  return {
    env: { STRIPE_SECRET_KEY: 'sk_test_key', ...env },
    request: new Request('https://shop.example.com/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  };
}

function stubStripe(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, params: new URLSearchParams(init.body) });
    return handler
      ? handler(url, init)
      : new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('valid cart creates a Stripe session and returns its url', async (t) => {
  const calls = stubStripe(t);

  const res = await onRequestPost(makeContext({
    items: [
      { slug: 'crow-tee', optionValues: { Color: 'White', Size: 'S' }, qty: 2 },
      { slug: 'logo-cap', optionValues: {}, qty: 1 },
    ],
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: 'https://checkout.stripe.com/c/pay/cs_test_abc' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(calls[0].init.headers['Authorization'], 'Bearer sk_test_key');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  // The session is stamped with the originating site so each webhook on the
  // shared Stripe account fulfills only its own orders.
  assert.equal(calls[0].params.get('metadata[site]'), 'crow-shop');
});

test('line items carry server-resolved prices, never client prices', async (t) => {
  const calls = stubStripe(t);

  await onRequestPost(makeContext({
    items: [{ slug: 'crow-tee', optionValues: { Color: 'White', Size: 'S' }, qty: 2, price_minor: 1 }],
  }));

  const params = calls[0].params;
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('line_items[0][quantity]'), '2');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2000');
  assert.equal(params.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(params.get('line_items[0][price_data][product_data][name]'), 'Crow Tee (White / S)');
});

test('session metadata holds the server-resolved fulfillment refs', async (t) => {
  const calls = stubStripe(t);

  await onRequestPost(makeContext({
    items: [{ slug: 'crow-tee', optionValues: { Color: 'White', Size: 'S' }, qty: 2 }],
  }));

  assert.deepEqual(JSON.parse(calls[0].params.get('metadata[items]')), [
    { fulfillment_ref: '4938291', qty: 2 },
  ]);
});

test('shipping countries and flat rate come from the plan', async (t) => {
  const calls = stubStripe(t);

  await onRequestPost(makeContext({
    items: [{ slug: 'logo-cap', optionValues: {}, qty: 1 }],
  }));

  const params = calls[0].params;
  assert.equal(params.get('shipping_address_collection[allowed_countries][0]'), 'US');
  assert.equal(params.get('shipping_address_collection[allowed_countries][1]'), 'CA');
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '500');
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][currency]'), 'usd');
});

test('success and cancel URLs derive from the request origin', async (t) => {
  const calls = stubStripe(t);

  await onRequestPost(makeContext({
    items: [{ slug: 'logo-cap', optionValues: {}, qty: 1 }],
  }));

  const params = calls[0].params;
  assert.equal(
    params.get('success_url'),
    'https://shop.example.com/?checkout=success&session_id={CHECKOUT_SESSION_ID}',
  );
  assert.equal(params.get('cancel_url'), 'https://shop.example.com/?checkout=cancelled');
});

test('unknown slug, unknown variant, and inactive product are 400s', async (t) => {
  const calls = stubStripe(t);

  for (const items of [
    [{ slug: 'no-such-thing', optionValues: {}, qty: 1 }],
    [{ slug: 'crow-tee', optionValues: { Color: 'White', Size: 'M' }, qty: 1 }],
    [{ slug: 'crow-tee', optionValues: {}, qty: 1 }],
    [{ slug: 'retired-tee', optionValues: {}, qty: 1 }],
  ]) {
    const res = await onRequestPost(makeContext({ items }));
    assert.equal(res.status, 400, JSON.stringify(items));
    assert.equal((await res.json()).error, 'Unknown product');
  }
  assert.equal(calls.length, 0);
});

test('item count and qty bounds are enforced', async (t) => {
  const calls = stubStripe(t);
  const cap = { slug: 'logo-cap', optionValues: {}, qty: 1 };

  for (const body of [
    { items: [] },
    { items: Array.from({ length: 51 }, () => cap) },
    { items: [{ ...cap, qty: 0 }] },
    { items: [{ ...cap, qty: 100 }] },
    { items: [{ ...cap, qty: 1.5 }] },
    { items: [{ ...cap, qty: '2' }] },
    { items: 'not-an-array' },
  ]) {
    const res = await onRequestPost(makeContext(body));
    assert.equal(res.status, 400);
  }
  assert.equal(calls.length, 0);
});

test('malformed JSON is a 400 and a missing key is a 500', async (t) => {
  stubStripe(t);

  const malformed = await onRequestPost(makeContext('{nope'));
  const unconfigured = await onRequestPost(
    makeContext({ items: [{ slug: 'logo-cap', optionValues: {}, qty: 1 }] }, { STRIPE_SECRET_KEY: undefined }),
  );

  assert.equal(malformed.status, 400);
  assert.equal(unconfigured.status, 500);
});

// Personalized items make two kinds of fetch calls: a HEAD against the
// site's own origin (token verification) and the Stripe session POST.
// Route by method so each can be controlled independently.
function stubFetchWithHead(t, { headStatus = 200, headThrows = false } = {}) {
  const calls = { head: [], stripe: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init && init.method === 'HEAD') {
      calls.head.push({ url });
      if (headThrows) throw new TypeError('network down');
      return new Response(null, { status: headStatus });
    }
    calls.stripe.push({ url, init, params: new URLSearchParams(init.body) });
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('a personalized item is HEAD-verified, then carried in metadata with its print URL', async (t) => {
  const calls = stubFetchWithHead(t);

  const res = await onRequestPost(makeContext({
    items: [{ slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: TOKEN }],
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(calls.head.map((c) => c.url), ['https://shop.example.com/parchment/cert/' + TOKEN]);
  assert.equal(calls.stripe.length, 1);
  assert.deepEqual(JSON.parse(calls.stripe[0].params.get('metadata[items]')), [
    {
      fulfillment_ref: 'bbpp-print',
      qty: 1,
      personalization_id: TOKEN,
      personalization_url: 'https://shop.example.com/parchment/cert/' + TOKEN + '?scale=2',
    },
  ]);
});

test('a personalized item without a token (or with bad syntax) is a 400', async (t) => {
  const calls = stubFetchWithHead(t);

  for (const item of [
    { slug: 'printed-certificate', optionValues: {}, qty: 1 },
    { slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: 'short' },
    { slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: 'tok_!!!invalid!!!chars' },
    { slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: 'x'.repeat(65) },
    { slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: 42 },
  ]) {
    const res = await onRequestPost(makeContext({ items: [item] }));
    assert.equal(res.status, 400, JSON.stringify(item));
    assert.equal((await res.json()).error, 'Personalization required');
  }
  assert.equal(calls.head.length, 0);
  assert.equal(calls.stripe.length, 0);
});

test('a token on a non-personalized product is a 400', async (t) => {
  const calls = stubFetchWithHead(t);

  const res = await onRequestPost(makeContext({
    items: [{ slug: 'logo-cap', optionValues: {}, qty: 1, personalization_id: TOKEN }],
  }));

  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Product does not take personalization');
  assert.equal(calls.head.length, 0);
  assert.equal(calls.stripe.length, 0);
});

test('a token the origin does not recognize is a 400 and Stripe is never called', async (t) => {
  const calls = stubFetchWithHead(t, { headStatus: 404 });

  const res = await onRequestPost(makeContext({
    items: [{ slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: TOKEN }],
  }));

  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Personalization not found');
  assert.equal(calls.stripe.length, 0);
});

test('an unreachable verification origin is a 502', async (t) => {
  const calls = stubFetchWithHead(t, { headThrows: true });

  const res = await onRequestPost(makeContext({
    items: [{ slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: TOKEN }],
  }));

  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'Personalization unavailable');
  assert.equal(calls.stripe.length, 0);
});

test('metadata over the 500-char Stripe cap is a clear 400, not a truncation', async (t) => {
  const calls = stubFetchWithHead(t);

  const res = await onRequestPost(makeContext({
    items: Array.from({ length: 3 }, () => (
      { slug: 'printed-certificate', optionValues: {}, qty: 1, personalization_id: TOKEN }
    )),
  }));

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Too many items for one checkout/);
  assert.equal(calls.stripe.length, 0);
});

test('Stripe errors surface as 502 without leaking detail', async (t) => {
  stubStripe(t, () => new Response(JSON.stringify({ error: { message: 'secret stuff' } }), { status: 402 }));

  const res = await onRequestPost(makeContext({
    items: [{ slug: 'logo-cap', optionValues: {}, qty: 1 }],
  }));

  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, 'Checkout unavailable');
  assert.ok(!JSON.stringify(body).includes('secret stuff'));
});
