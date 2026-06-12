import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrder } from './order.mjs';

const ENV = {
  RESEND_API_KEY: 're_test_key',
  COMMERCE_FULFILLMENT_TO: 'orders@example.com',
  COMMERCE_FULFILLMENT_FROM: 'shop@example.com',
};

function makeOrder(overrides = {}) {
  return {
    idempotency_key: 'cs_test_abc123',
    lineItems: [
      { fulfillment_ref: '4938291', qty: 2 },
      { fulfillment_ref: '5500110', qty: 1 },
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

function stubFetch(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('createOrder emails the order via Resend and returns the email id', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));

  const result = await createOrder(makeOrder(), ENV);

  assert.deepEqual(result, { provider_order_id: 'email_123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Authorization'], 'Bearer re_test_key');
});

test('createOrder passes the idempotency key as the Resend Idempotency-Key header', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));

  await createOrder(makeOrder(), ENV);

  assert.equal(calls[0].init.headers['Idempotency-Key'], 'cs_test_abc123');
});

test('createOrder addresses the email from the fulfillment env vars', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));

  await createOrder(makeOrder(), ENV);

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['orders@example.com']);
  assert.equal(body.from, 'shop@example.com');
  assert.equal(body.subject, 'New order cs_test_abc123');
});

test('createOrder renders line items, customer email, and shipping in the body', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));

  await createOrder(makeOrder(), ENV);

  const text = JSON.parse(calls[0].init.body).text;
  assert.match(text, /2 x 4938291/);
  assert.match(text, /1 x 5500110/);
  assert.match(text, /Customer email: pat@example\.com/);
  assert.match(text, /Pat Crow/);
  assert.match(text, /1 Roost Ln/);
  assert.match(text, /Unit 4/);
  assert.match(text, /Corvid CA 90210/);
  assert.match(text, /US/);
});

test('createOrder renders personalization token and print link for personalized lines only', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));
  const token = 'tok_aaaaaaaaaaaaaaaaaaaa';
  const printUrl = 'https://shop.example.com/parchment/cert/' + token + '?scale=3';

  await createOrder(makeOrder({
    lineItems: [
      { fulfillment_ref: 'bbpp-print', qty: 1, personalization_id: token, personalization_url: printUrl },
      { fulfillment_ref: '5500110', qty: 1 },
    ],
  }), ENV);

  const text = JSON.parse(calls[0].init.body).text;
  assert.ok(text.includes('1 x bbpp-print'));
  assert.ok(text.includes('personalization: ' + token));
  assert.ok(text.includes('print file: ' + printUrl));
  // The plain line carries no personalization detail.
  const plainLineIndex = text.indexOf('1 x 5500110');
  assert.ok(plainLineIndex !== -1);
  assert.ok(!text.slice(plainLineIndex).includes('personalization:'));
});

test('createOrder tolerates a missing shipping block and missing email', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));

  await createOrder(makeOrder({ shipping: null, email: undefined }), ENV);

  const text = JSON.parse(calls[0].init.body).text;
  assert.match(text, /Customer email: \(none\)/);
  assert.ok(!text.includes('Ship to:'));
});

test('createOrder throws with provider_detail when env config is missing', async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ id: 'email_123' }));

  await assert.rejects(
    createOrder(makeOrder(), { RESEND_API_KEY: 're_test_key' }),
    (error) => {
      assert.match(error.message, /not configured/);
      assert.match(error.provider_detail, /COMMERCE_FULFILLMENT_TO/);
      assert.match(error.provider_detail, /COMMERCE_FULFILLMENT_FROM/);
      return true;
    },
  );
  assert.equal(calls.length, 0, 'must not call Resend when unconfigured');
});

test('createOrder throws with provider_detail when Resend rejects the email', async (t) => {
  stubFetch(t, () => jsonResponse({ message: 'invalid from address' }, 422));

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /order email failed/);
    assert.match(error.provider_detail, /HTTP 422/);
    assert.match(error.provider_detail, /invalid from address/);
    return true;
  });
});

test('createOrder throws with provider_detail when fetch itself fails', async (t) => {
  stubFetch(t, () => {
    throw new Error('network down');
  });

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /could not reach Resend/);
    assert.equal(error.provider_detail, 'network down');
    return true;
  });
});

test('createOrder throws when Resend returns success without an email id', async (t) => {
  stubFetch(t, () => jsonResponse({}));

  await assert.rejects(createOrder(makeOrder(), ENV), (error) => {
    assert.match(error.message, /no email id/);
    assert.equal(error.provider_detail, 'response missing id');
    return true;
  });
});
