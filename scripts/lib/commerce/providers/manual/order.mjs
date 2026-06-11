// Manual fulfillment provider — emails each paid order to the merchant via Resend.
//
// This file is bundled verbatim (with `export ` stripped) into the webhook
// Pages Function at render time, so it must stay self-contained: no imports,
// Workers-compatible APIs only (fetch).
//
// Contract (spec §7): createOrder(order, env) -> { provider_order_id }
//   order = { idempotency_key, lineItems: [{ fulfillment_ref, qty }], shipping, email }
// Throws on failure; the thrown error carries provider_detail for the
// webhook's KV last_error record. The Stripe session ID (idempotency_key) is
// passed to Resend as an Idempotency-Key header, so webhook retries cannot
// send the merchant duplicate order emails.

export async function createOrder(order, env) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.COMMERCE_FULFILLMENT_TO;
  const from = env.COMMERCE_FULFILLMENT_FROM;
  if (!apiKey || !to || !from) {
    const missing = [
      !apiKey && 'RESEND_API_KEY',
      !to && 'COMMERCE_FULFILLMENT_TO',
      !from && 'COMMERCE_FULFILLMENT_FROM',
    ].filter(Boolean).join(', ');
    const error = new Error('manual provider is not configured');
    error.provider_detail = 'missing env: ' + missing;
    throw error;
  }

  const lines = ['New order ' + order.idempotency_key, '', 'Items:'];
  for (const item of order.lineItems) {
    lines.push('  ' + item.qty + ' x ' + item.fulfillment_ref);
  }
  lines.push('', 'Customer email: ' + (order.email || '(none)'));
  const shipping = order.shipping;
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

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Idempotency-Key': order.idempotency_key,
      },
      body: JSON.stringify({
        to: [to],
        from: from,
        subject: 'New order ' + order.idempotency_key,
        text: lines.join('\n'),
      }),
    });
  } catch (cause) {
    const error = new Error('manual provider could not reach Resend');
    error.provider_detail = String(cause && cause.message ? cause.message : cause);
    throw error;
  }

  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try {
      detail += ': ' + (await res.text()).slice(0, 500);
    } catch {
      // status alone is enough
    }
    const error = new Error('manual provider order email failed');
    error.provider_detail = detail;
    throw error;
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Resend always returns JSON on success; fall through to the id check
  }
  if (!body || typeof body.id !== 'string' || body.id === '') {
    const error = new Error('manual provider got no email id from Resend');
    error.provider_detail = 'response missing id';
    throw error;
  }

  return { provider_order_id: body.id };
}
