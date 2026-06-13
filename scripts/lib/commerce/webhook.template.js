// Stripe webhook Pages Function template — rendered to functions/api/webhook.js.
//
// The CREATE_ORDER marker below is replaced at render time with the active
// provider's order.mjs source (with `export ` stripped), defining
// createOrder(order, env).
//
// metadata[items] passes through to createOrder verbatim — including the
// optional personalization_id / personalization_url fields on personalized
// lines (bbpp design §3). The webhook never interprets them.
//
// KV (env.ORDERS) is a best-effort dedup layer (spec §6); the provider
// idempotency key — the Stripe session ID — is what actually guarantees
// exactly-once fulfillment. State machine per Decision 10:
//   completed                  -> 200, duplicate delivery
//   absent                     -> processing (attempts 1), createOrder
//   failed                     -> processing (attempts+1), retry
//   processing, stale (>10min) -> treated as failed, retry
//   processing, fresh          -> 503 WITHOUT calling createOrder
//   createOrder success        -> completed, 200
//   createOrder failure        -> failed + last_error, 500 so Stripe retries

{{CREATE_ORDER}}

// Plan-derived provider configuration (e.g. the manual provider's
// COMMERCE_FULFILLMENT_TO/FROM), overlaid on the runtime env so
// createOrder(order, env) keeps a single signature across providers.
const PROVIDER_ENV = {{PROVIDER_ENV}};

// This site's slug. Stripe delivers every checkout.session.completed on the
// shared account to every site's webhook endpoint; we fulfill only sessions
// our own checkout stamped with this slug (metadata.site).
const SITE = {{SITE}};

const STALE_MS = 10 * 60 * 1000;
const TOLERANCE_SECONDS = 300;

async function verifyStripeSignature(secret, header, rawBody, nowSeconds) {
  if (typeof header !== 'string' || header === '') return false;
  let timestamp = null;
  const candidates = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1') candidates.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const payload = encoder.encode(timestamp + '.' + rawBody);
  for (const candidate of candidates) {
    if (!/^[0-9a-f]+$/i.test(candidate) || candidate.length % 2 !== 0) continue;
    const bytes = new Uint8Array(candidate.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(candidate.slice(i * 2, i * 2 + 2), 16);
    }
    if (await crypto.subtle.verify('HMAC', key, bytes, payload)) return true;
  }
  return false;
}

export async function onRequestPost(context) {
  const { STRIPE_WEBHOOK_SECRET, ORDERS } = context.env;
  if (!STRIPE_WEBHOOK_SECRET || !ORDERS) {
    return Response.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  const rawBody = await context.request.text();
  const signatureOk = await verifyStripeSignature(
    STRIPE_WEBHOOK_SECRET,
    context.request.headers.get('stripe-signature'),
    rawBody,
    Math.floor(Date.now() / 1000),
  );
  if (!signatureOk) {
    return Response.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON' }, { status: 400 });
  }
  if (!event || event.type !== 'checkout.session.completed') {
    return Response.json({ ok: true, ignored: true });
  }

  const session = event.data && event.data.object;
  if (!session || typeof session.id !== 'string' || session.id === '') {
    return Response.json({ ok: false, error: 'Malformed event' }, { status: 400 });
  }

  // Stripe fans every event out to every endpoint on the shared account. A
  // session stamped for another site (or an unstamped legacy session) is not
  // ours to fulfill — ack with 200 so Stripe stops retrying us, and let the
  // owning site's webhook handle it. Without this, every commerce site on the
  // account fulfills every order (cross-tenant fulfillment + buyer PII leak).
  if (!session.metadata || session.metadata.site !== SITE) {
    return Response.json({ ok: true, ignored: true });
  }

  // Sessions without our metadata were not created by this site's checkout.
  let lineItems;
  try {
    lineItems = JSON.parse(session.metadata.items);
  } catch {
    lineItems = null;
  }
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return Response.json({ ok: true, ignored: true });
  }

  const now = Date.now();
  const record = await ORDERS.get(session.id, 'json');
  if (record && record.state === 'completed') {
    return Response.json({ ok: true, duplicate: true });
  }
  if (record && record.state === 'processing' && now - record.updated_at < STALE_MS) {
    return Response.json({ ok: false, error: 'Order in progress' }, { status: 503 });
  }

  const attempts = record ? record.attempts + 1 : 1;
  await ORDERS.put(
    session.id,
    JSON.stringify({ state: 'processing', attempts: attempts, updated_at: now }),
  );

  const collected = session.collected_information && session.collected_information.shipping_details;
  const order = {
    idempotency_key: session.id,
    lineItems: lineItems,
    shipping: collected || session.shipping_details || null,
    email: (session.customer_details && session.customer_details.email) || null,
  };

  try {
    const result = await createOrder(order, Object.assign({}, context.env, PROVIDER_ENV));
    await ORDERS.put(
      session.id,
      JSON.stringify({
        state: 'completed',
        attempts: attempts,
        updated_at: Date.now(),
        provider_order_id: result.provider_order_id,
      }),
    );
    return Response.json({ ok: true });
  } catch (error) {
    await ORDERS.put(
      session.id,
      JSON.stringify({
        state: 'failed',
        attempts: attempts,
        updated_at: Date.now(),
        last_error: {
          at: new Date().toISOString(),
          message: String(error && error.message ? error.message : error),
          provider_detail: (error && error.provider_detail) || null,
        },
      }),
    );
    return Response.json({ ok: false, error: 'Fulfillment failed' }, { status: 500 });
  }
}
