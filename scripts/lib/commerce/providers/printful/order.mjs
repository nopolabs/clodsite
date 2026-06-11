// Printful fulfillment provider — order half (ports hmc's worker).
//
// This file is bundled verbatim (with `export ` stripped) into the webhook
// Pages Function at render time, so it must stay self-contained: no imports,
// Workers-compatible APIs only (fetch).
//
// Contract (spec §7): createOrder(order, env) -> { provider_order_id }
//   order = { idempotency_key, lineItems: [{ fulfillment_ref, qty }], shipping, email }
// Throws on failure; the thrown error carries provider_detail for the
// webhook's KV last_error record.
//
// Idempotency: the Stripe session ID (idempotency_key) is the Printful order
// external_id — the authoritative duplicate guard (spec §7). Every delivery
// first looks the order up by external_id; an existing order is treated as
// success (drafts get confirmed), so a double-fired fulfillment call cannot
// create a duplicate order.
//
// env (Pages secret + render-time PROVIDER_ENV overlay):
//   PRINTFUL_API_KEY    pushed by deploy.sh
//   PRINTFUL_STORE_ID   embedded from commerce.printful.store_id

async function printfulOrderRequest(env, method, pathname, body, failMessage) {
  const url = 'https://api.printful.com' + pathname +
    (pathname.includes('?') ? '&' : '?') + 'store_id=' + env.PRINTFUL_STORE_ID;
  let res;
  try {
    res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + env.PRINTFUL_API_KEY,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    const error = new Error('printful provider could not reach Printful');
    error.provider_detail = String(cause && cause.message ? cause.message : cause);
    throw error;
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body falls through to the error below
  }
  const code = json && typeof json.code === 'number' ? json.code : res.status;
  if (code === 404) return null;
  if (code < 200 || code >= 300 || !json || json.result == null) {
    const detail = json
      ? (typeof json.result === 'string' && json.result) ||
        (json.error && json.error.message) ||
        JSON.stringify(json).slice(0, 300)
      : 'unparseable response';
    const error = new Error(failMessage);
    error.provider_detail = 'HTTP ' + code + ': ' + detail;
    throw error;
  }
  return json.result;
}

async function confirmPrintfulOrder(env, orderId) {
  await printfulOrderRequest(
    env, 'POST', '/orders/' + orderId + '/confirm', null,
    'printful order confirm failed',
  );
}

export async function createOrder(order, env) {
  if (!env.PRINTFUL_API_KEY || !env.PRINTFUL_STORE_ID) {
    const missing = [
      !env.PRINTFUL_API_KEY && 'PRINTFUL_API_KEY',
      !env.PRINTFUL_STORE_ID && 'PRINTFUL_STORE_ID',
    ].filter(Boolean).join(', ');
    const error = new Error('printful provider is not configured');
    error.provider_detail = 'missing env: ' + missing;
    throw error;
  }

  // A prior delivery may already have created this order — external_id lookup
  // is the authoritative dedup. Drafts (created but not confirmed before a
  // crash) are confirmed; anything further along is already in fulfillment.
  const existing = await printfulOrderRequest(
    env, 'GET', '/orders/@' + encodeURIComponent(order.idempotency_key), null,
    'printful order lookup failed',
  );
  if (existing) {
    if (existing.status === 'draft') {
      await confirmPrintfulOrder(env, existing.id);
    }
    return { provider_order_id: String(existing.id) };
  }

  if (!order.shipping || !order.shipping.address) {
    const error = new Error('printful provider needs a shipping address');
    error.provider_detail = 'checkout session carried no shipping details';
    throw error;
  }
  const address = order.shipping.address;
  const created = await printfulOrderRequest(env, 'POST', '/orders', {
    external_id: order.idempotency_key,
    recipient: {
      name: order.shipping.name || '',
      address1: address.line1 || '',
      address2: address.line2 || '',
      city: address.city || '',
      state_code: address.state || '',
      country_code: address.country || '',
      zip: address.postal_code || '',
      ...(order.email ? { email: order.email } : {}),
    },
    items: order.lineItems.map(function (item, index) {
      return {
        external_id: order.idempotency_key + '-' + (index + 1),
        sync_variant_id: Number(item.fulfillment_ref),
        quantity: item.qty,
      };
    }),
  }, 'printful order create failed');

  await confirmPrintfulOrder(env, created.id);
  return { provider_order_id: String(created.id) };
}
