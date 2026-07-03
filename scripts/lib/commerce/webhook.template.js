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
//
// On createOrder success, when commerce.contact.from is set (item 2 phase 2),
// a store-branded order-confirmation email also sends to the customer — purely
// additive, never affects the state machine above or the response.

{{CREATE_ORDER}}

// Plan-derived provider configuration (e.g. the manual provider's
// COMMERCE_FULFILLMENT_TO/FROM), overlaid on the runtime env so
// createOrder(order, env) keeps a single signature across providers.
const PROVIDER_ENV = {{PROVIDER_ENV}};

// This site's slug. Stripe delivers every checkout.session.completed on the
// shared account to every site's webhook endpoint; we fulfill only sessions
// our own checkout stamped with this slug (metadata.site).
const SITE = {{SITE}};

// Human-facing site name for customer email copy. Routing, metadata filtering,
// and idempotency keys continue to use SITE, the stable slug.
const SITE_NAME = {{SITE_NAME}};

// commerce.contact (item 2 phase 2): the customer-facing order-confirmation
// sender, or null when the site has not opted in. A plan value, not a secret.
const CONTACT = {{CONTACT}};

const STALE_MS = 10 * 60 * 1000;
const ALERT_BACKOFF_MS = 6 * 60 * 60 * 1000;
const ALERT_TIMEOUT_MS = 5 * 1000;
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

function shouldSendAlert(record, now) {
  if (!record || !record.alerted_at) return true;
  const alertedAt = Date.parse(record.alerted_at);
  if (!Number.isFinite(alertedAt)) return true;
  return now - alertedAt >= ALERT_BACKOFF_MS;
}

async function sendFailureAlert(context, session, failedRecord, priorRecord, now) {
  const {
    RESEND_API_KEY,
    CLODSITE_COMMERCE_ALERT_TO,
    CLODSITE_COMMERCE_ALERT_FROM,
  } = context.env;
  if (!RESEND_API_KEY || !CLODSITE_COMMERCE_ALERT_TO || !CLODSITE_COMMERCE_ALERT_FROM) {
    return failedRecord;
  }
  if (!shouldSendAlert(priorRecord, now)) {
    return {
      ...failedRecord,
      alerted_at: priorRecord.alerted_at,
      alert_count: priorRecord.alert_count || 1,
    };
  }

  const lastError = failedRecord.last_error || {};
  const lines = [
    'Clodsite commerce fulfillment failed.',
    '',
    'Site: ' + SITE,
    'Stripe session: ' + session.id,
    'Attempts: ' + failedRecord.attempts,
    'Error: ' + (lastError.message || '(unknown)'),
  ];
  if (lastError.provider_detail) {
    lines.push('Provider detail: ' + lastError.provider_detail);
  }
  lines.push('', 'Stripe will retry this webhook. Check the ORDERS KV record and provider dashboard.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Idempotency-Key': 'commerce-alert:' + SITE + ':' + session.id + ':' + failedRecord.attempts,
      },
      body: JSON.stringify({
        to: [CLODSITE_COMMERCE_ALERT_TO],
        from: CLODSITE_COMMERCE_ALERT_FROM,
        subject: '[' + SITE + '] Commerce fulfillment failed: ' + session.id,
        text: lines.join('\n'),
      }),
    });
    if (!res.ok) return failedRecord;
  } catch {
    return failedRecord;
  } finally {
    clearTimeout(timeout);
  }

  return {
    ...failedRecord,
    alerted_at: new Date(now).toISOString(),
    alert_count: (priorRecord && priorRecord.alert_count ? priorRecord.alert_count : 0) + 1,
  };
}

function formatMoney(amountMinor, currency) {
  if (typeof amountMinor !== 'number') return null;
  return '$' + (amountMinor / 100).toFixed(2) + ' ' + String(currency || 'usd').toUpperCase();
}

function formatEmailSender(name, email) {
  const cleanName = String(name || '').replace(/[\r\n]/g, ' ').trim();
  const cleanEmail = String(email || '').replace(/[\r\n]/g, '').trim();
  if (!cleanName || !cleanEmail) return cleanEmail;
  const quotedName = cleanName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return '"' + quotedName + '" <' + cleanEmail + '>';
}

// Order-confirmation body (item 2 phase 2). Totals/currency/shipping/email
// come from the session the webhook already holds; only the renderable line
// items (with variant baked into `description`) require a Stripe retrieve.
function buildConfirmationEmail(session, lineItems) {
  const lines = [
    'Thanks for your order from ' + SITE_NAME + '!',
    '',
    'Order: ' + session.id,
    '',
    'Items:',
  ];
  for (const item of lineItems) {
    const amount = formatMoney(item.amount_total, session.currency);
    lines.push('  ' + item.quantity + ' x ' + item.description + (amount ? ' — ' + amount : ''));
  }
  const subtotal = formatMoney(session.amount_subtotal, session.currency);
  const shippingAmount = session.shipping_cost && formatMoney(session.shipping_cost.amount_total, session.currency);
  const total = formatMoney(session.amount_total, session.currency);
  if (subtotal || shippingAmount || total) lines.push('');
  if (subtotal) lines.push('Subtotal: ' + subtotal);
  if (shippingAmount) lines.push('Shipping: ' + shippingAmount);
  if (total) lines.push('Total: ' + total);

  const shipping = (session.collected_information && session.collected_information.shipping_details)
    || session.shipping_details;
  if (shipping && shipping.address) {
    const address = shipping.address;
    lines.push('', 'Ship to:');
    for (const part of [
      shipping.name,
      address.line1,
      address.line2,
      [address.city, address.state, address.postal_code].filter(Boolean).join(' '),
      address.country,
    ]) {
      if (part) lines.push('  ' + part);
    }
  }

  lines.push('', 'Your order is in production — we will follow up once it ships.');
  if (CONTACT && CONTACT.reply_to) lines.push('', 'Questions? Reply to ' + CONTACT.reply_to + '.');

  return lines.join('\n');
}

// Sends the store-branded order-confirmation email on fulfillment success
// (Decision 2, item-2 phase 2 spec) — supplements Stripe's payment receipt
// with ship-to address, our order id, and a fulfillment expectation. Resolved
// independently of sendFailureAlert: a missing customer email or a Resend/
// Stripe failure here returns a diagnostic and never touches the order
// outcome (Reliability, same spec). Returns null when the feature is unused
// (no commerce.contact.from or no RESEND_API_KEY) so the caller writes nothing.
async function sendConfirmationEmail(context, session, now) {
  if (!CONTACT || !CONTACT.from) return null;
  const { RESEND_API_KEY, STRIPE_SECRET_KEY } = context.env;
  if (!RESEND_API_KEY) return null;

  // The whole body is one try/catch, not per-step: this function is called
  // both from the fulfillment success path (inside its own try/catch, whose
  // catch treats any throw as a *fulfillment* failure and would otherwise
  // flip an already-completed order back to failed and retrigger createOrder)
  // and from the completed-duplicate recovery path below. Nothing here may
  // ever throw — every failure mode returns a diagnostic instead.
  try {
    const email = session.customer_details && session.customer_details.email;
    if (!email) {
      return { ok: false, diagnostic: 'customer_details.email missing on session' };
    }

    let lineItems;
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), ALERT_TIMEOUT_MS);
    try {
      const res = await fetch(
        'https://api.stripe.com/v1/checkout/sessions/' + session.id + '?expand[]=line_items',
        { signal: fetchController.signal, headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY } },
      );
      if (!res.ok) {
        return { ok: false, diagnostic: 'Stripe line_items retrieve failed: HTTP ' + res.status };
      }
      const full = await res.json();
      lineItems = (full.line_items && full.line_items.data) || [];
    } finally {
      clearTimeout(fetchTimeout);
    }

    const body = {
      to: [email],
      from: formatEmailSender(SITE_NAME, CONTACT.from),
      subject: 'Your ' + SITE_NAME + ' order is confirmed',
      text: buildConfirmationEmail(session, lineItems),
    };
    if (CONTACT.reply_to) body.reply_to = CONTACT.reply_to;

    const sendController = new AbortController();
    const sendTimeout = setTimeout(() => sendController.abort(), ALERT_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: sendController.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + RESEND_API_KEY,
          'Idempotency-Key': 'commerce-confirmation:' + SITE + ':' + session.id,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { ok: false, diagnostic: 'Resend send failed: HTTP ' + res.status };
      }
    } finally {
      clearTimeout(sendTimeout);
    }

    return { ok: true, sentAt: new Date(now).toISOString() };
  } catch (error) {
    return {
      ok: false,
      diagnostic: 'order-confirmation email failed: ' + String(error && error.message ? error.message : error),
    };
  }
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
    // Recovery, not re-fulfillment: createOrder never runs again here. A
    // completed record can legitimately lack both confirmation_sent_at and
    // confirmation_error if the Worker was interrupted between the two KV
    // writes on the success path (below) — this is the only place that gap
    // gets a second chance, on Stripe's next redelivery of the same session.
    if (CONTACT && CONTACT.from && !record.confirmation_sent_at && !record.confirmation_error) {
      const confirmation = await sendConfirmationEmail(context, session, now);
      if (confirmation) {
        const updated = confirmation.ok
          ? { ...record, confirmation_sent_at: confirmation.sentAt }
          : { ...record, confirmation_error: confirmation.diagnostic };
        await ORDERS.put(session.id, JSON.stringify(updated));
      }
    }
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
    let completedRecord = {
      state: 'completed',
      attempts: attempts,
      updated_at: Date.now(),
      provider_order_id: result.provider_order_id,
    };
    // A prior failed/processing record never carries confirmation_sent_at in
    // practice (it's only ever written here, on success) — checked anyway so
    // a retry can never double-send (Reliability, item-2 phase 2 spec).
    const alreadySent = record && record.confirmation_sent_at;
    if (alreadySent) completedRecord.confirmation_sent_at = record.confirmation_sent_at;
    await ORDERS.put(session.id, JSON.stringify(completedRecord));

    if (!alreadySent) {
      const confirmation = await sendConfirmationEmail(context, session, Date.now());
      if (confirmation) {
        completedRecord = confirmation.ok
          ? { ...completedRecord, confirmation_sent_at: confirmation.sentAt }
          : { ...completedRecord, confirmation_error: confirmation.diagnostic };
        await ORDERS.put(session.id, JSON.stringify(completedRecord));
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    const failedAt = Date.now();
    const failedRecord = {
      state: 'failed',
      attempts: attempts,
      updated_at: failedAt,
      last_error: {
        at: new Date(failedAt).toISOString(),
        message: String(error && error.message ? error.message : error),
        provider_detail: (error && error.provider_detail) || null,
      },
    };
    await ORDERS.put(session.id, JSON.stringify(failedRecord));
    const alertedRecord = await sendFailureAlert(context, session, failedRecord, record, failedAt);
    if (alertedRecord !== failedRecord) {
      await ORDERS.put(session.id, JSON.stringify(alertedRecord));
    }
    return Response.json({ ok: false, error: 'Fulfillment failed' }, { status: 500 });
  }
}
