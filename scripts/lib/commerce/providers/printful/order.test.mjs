import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrder } from './order.mjs';

const ENV = {
  PRINTFUL_API_KEY: 'pf_test_key',
  PRINTFUL_STORE_ID: '17828143',
};

function makeOrder(overrides = {}) {
  return {
    idempotency_key: 'cs_test_abc123',
    lineItems: [
      { fulfillment_ref: '5270106491', qty: 2 },
      { fulfillment_ref: '5270106489', qty: 1 },
    ],
    shipping: {
      name: 'Pat Crow',
      address: {
        line1: '1 Roost Ln',
        line2: 'Unit 4',
        city: 'Corvid',
        state: 'CA',
        postal_code: '90210',
        country: 'US',
      },
    },
    email: 'pat@example.com',
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFound() {
  return jsonResponse({ code: 404, result: 'Order not found' }, 404);
}

// Routes calls by method + path prefix; unmatched calls throw so a test
// can never silently hit an unexpected endpoint.
function stubFetch(t, routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const method = (init && init.method) || 'GET';
    const { pathname } = new URL(url);
    calls.push({ method, url, pathname, init });
    for (const route of routes) {
      if (route.method === method && pathname.startsWith(route.path)) {
        return route.respond(url, init);
      }
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

const HAPPY_ROUTES = [
  { method: 'GET', path: '/orders/@', respond: () => notFound() },
  {
    method: 'POST',
    path: '/orders/77001/confirm',
    respond: () => jsonResponse({ code: 200, result: { id: 77001, status: 'pending' } }),
  },
  {
    method: 'POST',
    path: '/orders',
    respond: () => jsonResponse({ code: 200, result: { id: 77001, status: 'draft' } }),
  },
];

test('createOrder looks up, creates, and confirms a new order', async (t) => {
  const calls = stubFetch(t, HAPPY_ROUTES);

  const result = await createOrder(makeOrder(), ENV);

  assert.deepEqual(result, { provider_order_id: '77001' });
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.pathname}`),
    ['GET /orders/@cs_test_abc123', 'POST /orders', 'POST /orders/77001/confirm'],
  );
});

test('createOrder scopes every request to the store and authorizes with the API key', async (t) => {
  const calls = stubFetch(t, HAPPY_ROUTES);

  await createOrder(makeOrder(), ENV);

  for (const call of calls) {
    assert.equal(new URL(call.url).searchParams.get('store_id'), '17828143');
    assert.equal(call.init.headers['Authorization'], 'Bearer pf_test_key');
  }
});

test('createOrder builds the Printful order payload from the fulfillment order', async (t) => {
  const calls = stubFetch(t, HAPPY_ROUTES);

  await createOrder(makeOrder(), ENV);

  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.external_id, 'cs_test_abc123');
  assert.deepEqual(body.recipient, {
    name: 'Pat Crow',
    address1: '1 Roost Ln',
    address2: 'Unit 4',
    city: 'Corvid',
    state_code: 'CA',
    country_code: 'US',
    zip: '90210',
    email: 'pat@example.com',
  });
  assert.deepEqual(body.items, [
    { external_id: 'cs_test_abc123-1', sync_variant_id: 5270106491, quantity: 2 },
    { external_id: 'cs_test_abc123-2', sync_variant_id: 5270106489, quantity: 1 },
  ]);
});

test('createOrder tolerates missing recipient name, line2, and email', async (t) => {
  const calls = stubFetch(t, HAPPY_ROUTES);

  await createOrder(
    makeOrder({
      shipping: {
        address: {
          line1: '1 Roost Ln',
          city: 'Corvid',
          state: 'CA',
          postal_code: '90210',
          country: 'US',
        },
      },
      email: undefined,
    }),
    ENV,
  );

  const recipient = JSON.parse(calls[1].init.body).recipient;
  assert.equal(recipient.name, '');
  assert.equal(recipient.address2, '');
  assert.ok(!('email' in recipient));
});

test('createOrder confirms an existing draft without creating a duplicate', async (t) => {
  const calls = stubFetch(t, [
    {
      method: 'GET',
      path: '/orders/@',
      respond: () => jsonResponse({ code: 200, result: { id: 66005, status: 'draft' } }),
    },
    {
      method: 'POST',
      path: '/orders/66005/confirm',
      respond: () => jsonResponse({ code: 200, result: { id: 66005, status: 'pending' } }),
    },
  ]);

  const result = await createOrder(makeOrder(), ENV);

  assert.deepEqual(result, { provider_order_id: '66005' });
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.pathname}`),
    ['GET /orders/@cs_test_abc123', 'POST /orders/66005/confirm'],
  );
});

test('createOrder treats an existing non-draft order as already fulfilled', async (t) => {
  const calls = stubFetch(t, [
    {
      method: 'GET',
      path: '/orders/@',
      respond: () => jsonResponse({ code: 200, result: { id: 66005, status: 'pending' } }),
    },
  ]);

  const result = await createOrder(makeOrder(), ENV);

  assert.deepEqual(result, { provider_order_id: '66005' });
  assert.equal(calls.length, 1, 'lookup only — no create, no confirm');
});

test('createOrder URL-encodes the idempotency key in the lookup path', async (t) => {
  const calls = stubFetch(t, HAPPY_ROUTES);

  await createOrder(makeOrder({ idempotency_key: 'cs test/odd' }), ENV);

  assert.ok(calls[0].url.includes('/orders/@cs%20test%2Fodd'));
});

test('createOrder throws with provider_detail when env config is missing', async (t) => {
  const calls = stubFetch(t, HAPPY_ROUTES);

  await assert.rejects(
    createOrder(makeOrder(), { PRINTFUL_API_KEY: 'pf_test_key' }),
    (error) => {
      assert.match(error.message, /not configured/);
      assert.equal(error.provider_detail, 'missing env: PRINTFUL_STORE_ID');
      return true;
    },
  );
  await assert.rejects(createOrder(makeOrder(), {}), (error) => {
    assert.equal(error.provider_detail, 'missing env: PRINTFUL_API_KEY, PRINTFUL_STORE_ID');
    return true;
  });
  assert.equal(calls.length, 0, 'must not call Printful when unconfigured');
});

test('createOrder throws when the session carried no shipping address', async (t) => {
  const calls = stubFetch(t, [
    { method: 'GET', path: '/orders/@', respond: () => notFound() },
  ]);

  await assert.rejects(createOrder(makeOrder({ shipping: null }), ENV), (error) => {
    assert.match(error.message, /needs a shipping address/);
    assert.equal(error.provider_detail, 'checkout session carried no shipping details');
    return true;
  });
  assert.equal(calls.length, 1, 'lookup only — no create attempt');
});

test('createOrder throws with provider_detail when the order create is rejected', async (t) => {
  stubFetch(t, [
    { method: 'GET', path: '/orders/@', respond: () => notFound() },
    {
      method: 'POST',
      path: '/orders',
      respond: () => jsonResponse({ code: 400, result: 'Invalid recipient country' }, 400),
    },
  ]);

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /printful order create failed/);
    assert.equal(error.provider_detail, 'HTTP 400: Invalid recipient country');
    return true;
  });
});

test('createOrder throws with provider_detail when the confirm step fails', async (t) => {
  stubFetch(t, [
    { method: 'GET', path: '/orders/@', respond: () => notFound() },
    {
      method: 'POST',
      path: '/orders/77001/confirm',
      respond: () => jsonResponse({ code: 400, result: 'Order cannot be confirmed' }, 400),
    },
    {
      method: 'POST',
      path: '/orders',
      respond: () => jsonResponse({ code: 200, result: { id: 77001, status: 'draft' } }),
    },
  ]);

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /printful order confirm failed/);
    assert.equal(error.provider_detail, 'HTTP 400: Order cannot be confirmed');
    return true;
  });
});

test('createOrder throws with provider_detail when fetch itself fails', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  t.after(() => {
    globalThis.fetch = original;
  });

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /could not reach Printful/);
    assert.equal(error.provider_detail, 'network down');
    return true;
  });
});

test('createOrder surfaces a non-JSON response as an HTTP-status error', async (t) => {
  stubFetch(t, [
    {
      method: 'GET',
      path: '/orders/@',
      respond: () => new Response('<html>gateway error</html>', { status: 502 }),
    },
  ]);

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /printful order lookup failed/);
    assert.equal(error.provider_detail, 'HTTP 502: unparseable response');
    return true;
  });
});
