// Printful shipping-notification Pages Function template — rendered to
// functions/api/printful-webhook.js (item 2 phase 3). Only rendered for a
// live Printful store with commerce.contact configured
// (printfulShippingEnabled), reusing the exact same customer-facing sender as
// the phase-2 order-confirmation email.
//
// Auth model (settled in docs/superpowers/plans/2026-06-30-printful-shipping-notifications.md,
// Decision 1): Printful's v1 webhook payloads are NOT signed, so this Function
// never treats the POSTed body as authoritative. It extracts only the
// Printful order id and shipment id from the payload, then re-fetches
// GET /orders/{order_id} from Printful's own API (our own PRINTFUL_API_KEY,
// scoped to our own PRINTFUL_STORE_ID) and acts only on that authoritative
// response. A forged/replayed POST can at worst trigger one extra
// authenticated GET; it can never fabricate shipment content. The
// PRINTFUL_WEBHOOK_SECRET query-string token is a cheap outer gate against
// opportunistic traffic, not a substitute for the above.
//
// Decoupled from the paid-order webhook (webhook.template.js) entirely: this
// Function never reads or writes its ORDERS KV completed/failed/processing
// records, only its own printful-shipment:<order_id>:<shipment_id> keys
// (Decision 5). Failure mode is the mirror image of the paid-order webhook's
// non-blocking discipline (Decision 6): this endpoint is not on any payment
// critical path, so a genuine transient failure returns 500 to invite a
// Printful retry, while a permanent condition (no recipient email on the
// order, Decision 5 revised) is recorded and acknowledged 200 so repeated
// deliveries stop cleanly instead of retrying forever.

// This site's slug (routing/API identity) and human-facing name (email copy).
const SITE = {{SITE}};
const SITE_NAME = {{SITE_NAME}};

// commerce.contact — settled non-null by printfulShippingEnabled at render
// time (this Function is never rendered without it).
const CONTACT = {{CONTACT}};

const PRINTFUL_STORE_ID = {{PRINTFUL_STORE_ID}};

const FETCH_TIMEOUT_MS = 5 * 1000;

// Same-length string compare with no early-exit on a char mismatch — a cheap
// defense against timing side-channels on the shared secret token. Not a
// substitute for verify-on-receipt (see file header); just makes a brute-
// force guess marginally more expensive.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Authoritative re-fetch (Decision 1) — never trust the webhook payload's
// shipment/tracking content. Returns { ok: true, order } or
// { ok: false, diagnostic }; never throws.
async function fetchAuthoritativeOrder(env, orderId) {
  let res;
  try {
    res = await fetchWithTimeout(
      'https://api.printful.com/orders/' + encodeURIComponent(orderId) + '?store_id=' + PRINTFUL_STORE_ID,
      { headers: { 'Authorization': 'Bearer ' + env.PRINTFUL_API_KEY } },
    );
  } catch (error) {
    return {
      ok: false,
      diagnostic: 'Printful order lookup failed: ' + String(error && error.message ? error.message : error),
    };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // falls through to the error below
  }
  const code = json && typeof json.code === 'number' ? json.code : res.status;
  if (code < 200 || code >= 300 || !json || json.result == null) {
    return { ok: false, diagnostic: 'Printful order lookup failed: HTTP ' + code };
  }
  return { ok: true, order: json.result };
}

// Confirmed against developers.printful.com/docs/#tag/Orders-API/operation/getOrderById:
// shipment.items[] carries only { item_id, quantity, picked, printed } — no
// name. The product name lives on the order's own top-level items[] (each
// with an .id), joined here by item_id.
function shipmentItemName(order, itemId) {
  const items = Array.isArray(order.items) ? order.items : [];
  const match = items.find(function (item) {
    return String(item.id) === String(itemId);
  });
  return (match && match.name) || 'item ' + itemId;
}

function formatEmailSender(name, email) {
  const cleanName = String(name || '').replace(/[\r\n]/g, ' ').trim();
  const cleanEmail = String(email || '').replace(/[\r\n]/g, '').trim();
  if (!cleanName || !cleanEmail) return cleanEmail;
  const quotedName = cleanName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return '"' + quotedName + '" <' + cleanEmail + '>';
}

function buildShippedEmail(orderId, order, shipment) {
  const lines = [
    'Part of your ' + SITE_NAME + ' order has shipped!',
    '',
    'Order: ' + orderId,
  ];
  if (shipment.tracking_number) lines.push('Tracking number: ' + shipment.tracking_number);
  // Prefer the human-readable service name ("DHL Globalmail Parcel Expedited",
  // "Amazon Ground"); carrier is an uppercase machine code ("DHLGLOBALMAIL")
  // and is only shown when no service name is present.
  const carrierLine = shipment.service || shipment.carrier;
  if (carrierLine) lines.push('Carrier: ' + carrierLine);
  if (shipment.tracking_url) lines.push('Track your package: ' + shipment.tracking_url);
  if (shipment.ship_date) lines.push('Shipped: ' + shipment.ship_date);

  const items = Array.isArray(shipment.items) ? shipment.items : [];
  if (items.length > 0) {
    lines.push('', 'Items in this shipment:');
    for (const item of items) {
      const qty = typeof item.quantity === 'number' ? item.quantity : 1;
      lines.push('  ' + qty + ' x ' + shipmentItemName(order, item.item_id));
    }
  }

  const recipient = order.recipient || {};
  if (recipient.address1) {
    lines.push('', 'Shipping to:');
    for (const part of [
      recipient.name,
      recipient.address1,
      recipient.address2,
      [recipient.city, recipient.state_code, recipient.zip].filter(Boolean).join(' '),
      recipient.country_code,
    ]) {
      if (part) lines.push('  ' + part);
    }
  }

  lines.push('', 'Questions about your order? ' +
    (CONTACT.reply_to ? 'Reply to ' + CONTACT.reply_to + '.' : 'Just reply to this email.'));

  return lines.join('\n');
}

async function sendShippedEmail(env, orderId, shipmentId, order, shipment) {
  const email = order.recipient && order.recipient.email;
  if (!email) {
    return { ok: false, permanent: true, diagnostic: 'no recipient email on order' };
  }

  const body = {
    to: [email],
    from: formatEmailSender(SITE_NAME, CONTACT.from),
    subject: 'Your ' + SITE_NAME + ' order has shipped',
    text: buildShippedEmail(orderId, order, shipment),
  };
  if (CONTACT.reply_to) body.reply_to = CONTACT.reply_to;

  let res;
  try {
    res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Idempotency-Key': 'printful-shipment:' + SITE + ':' + orderId + ':' + shipmentId,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, diagnostic: 'Resend send failed: ' + String(error && error.message ? error.message : error) };
  }
  if (!res.ok) {
    return { ok: false, diagnostic: 'Resend send failed: HTTP ' + res.status };
  }
  return { ok: true };
}

export async function onRequestPost(context) {
  const { PRINTFUL_WEBHOOK_SECRET, PRINTFUL_API_KEY, RESEND_API_KEY, ORDERS } = context.env;
  if (!PRINTFUL_WEBHOOK_SECRET || !PRINTFUL_API_KEY || !RESEND_API_KEY || !ORDERS) {
    return Response.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  const token = new URL(context.request.url).searchParams.get('token');
  if (!timingSafeEqual(token || '', PRINTFUL_WEBHOOK_SECRET)) {
    return Response.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(await context.request.text());
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON' }, { status: 400 });
  }

  // Only package_shipped is handled (Decision 3); anything else is
  // acknowledged and ignored, mirroring the paid-order webhook's pattern for
  // irrelevant event types.
  if (!event || event.type !== 'package_shipped') {
    return Response.json({ ok: true, ignored: true });
  }

  const data = event.data || {};
  const orderId = data.order && (data.order.id ?? data.order.order_id);
  const shipmentId = data.shipment && (data.shipment.id ?? data.shipment.shipment_id);
  if (orderId == null || shipmentId == null) {
    return Response.json({ ok: false, error: 'Malformed event' }, { status: 400 });
  }

  const key = 'printful-shipment:' + orderId + ':' + shipmentId;
  const record = await ORDERS.get(key, 'json');
  if (record) {
    return Response.json({ ok: true, duplicate: true });
  }

  const fetched = await fetchAuthoritativeOrder(context.env, orderId);
  if (!fetched.ok) {
    return Response.json({ ok: false, error: fetched.diagnostic }, { status: 500 });
  }

  const shipments = Array.isArray(fetched.order.shipments) ? fetched.order.shipments : [];
  const shipment = shipments.find(function (candidate) {
    return String(candidate.id) === String(shipmentId);
  });
  if (!shipment) {
    return Response.json(
      { ok: false, error: 'Shipment ' + shipmentId + ' not found on order ' + orderId },
      { status: 500 },
    );
  }

  const result = await sendShippedEmail(context.env, orderId, shipmentId, fetched.order, shipment);
  if (result.permanent) {
    // No recipient email can never resolve on retry (Decision 5, revised) —
    // record the skip so repeated deliveries stop here without re-fetching
    // Printful, and acknowledge 200 rather than inviting an endless retry.
    await ORDERS.put(key, JSON.stringify({ skipped: result.diagnostic, at: new Date().toISOString() }));
    return Response.json({ ok: true, skipped: true });
  }
  if (!result.ok) {
    return Response.json({ ok: false, error: result.diagnostic }, { status: 500 });
  }

  await ORDERS.put(key, JSON.stringify({ notified_at: new Date().toISOString() }));
  return Response.json({ ok: true });
}
