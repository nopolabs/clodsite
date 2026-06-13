// Checkout Pages Function template — rendered to functions/api/checkout.js.
//
// The client sends only { items: [{ slug, optionValues, qty,
// personalization_id? }] }. Prices and fulfillment refs are resolved
// server-side from CONFIG (embedded from the commerce catalog at render
// time) — nothing money-shaped or provider-shaped is ever client-controlled.
// Unknown slug/option combinations are a 400.
//
// personalization_id is the one client-supplied opaque value: a capability
// token for a personalization-required product (bbpp design §3). It is
// syntax-checked, then verified live against the site's own origin (HEAD
// must return 200 — never sell a print of nothing) before the Stripe session
// is created. The resolved print-resolution URL travels via session metadata;
// this function never interprets the token beyond substitution.
//
// CONFIG = {
//   currency: 'usd',
//   option_names: { '<slug>': ['Color', 'Size'], ... },   // declared option order
//   items: { '<slug>:<val>:<val>': { name, price_minor, fulfillment_ref }, ... },
//   personalization: { '<slug>': '/parchment/cert/{id}', ... },  // origin-relative url templates
//   shipping: { flat_rate_minor: 500 | null, countries: ['US', ...] },
// }

export async function onRequestPost(context) {
  const { STRIPE_SECRET_KEY } = context.env;
  if (!STRIPE_SECRET_KEY) {
    return Response.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  const CONFIG = {{CONFIG}};

  let data;
  try {
    data = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON' }, { status: 400 });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return Response.json(
      { ok: false, error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  const items = data.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return Response.json(
      { ok: false, error: 'items must be an array of 1-50 entries' },
      { status: 400 },
    );
  }

  const origin = new URL(context.request.url).origin;
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

  // Resolve each cart line against the embedded catalog. The lookup key is
  // slug + option values in declared option order — same identity the cart
  // uses client-side, but rebuilt here from CONFIG so the client cannot
  // reorder or forge it.
  const resolved = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return Response.json({ ok: false, error: 'Invalid item' }, { status: 400 });
    }
    const qty = item.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return Response.json(
        { ok: false, error: 'qty must be an integer between 1 and 99' },
        { status: 400 },
      );
    }
    const slug = item.slug;
    const optionNames = typeof slug === 'string' ? CONFIG.option_names[slug] : undefined;
    if (!optionNames) {
      return Response.json({ ok: false, error: 'Unknown product' }, { status: 400 });
    }
    const optionValues =
      item.optionValues && typeof item.optionValues === 'object' && !Array.isArray(item.optionValues)
        ? item.optionValues
        : {};
    const values = optionNames.map((name) => optionValues[name]);
    if (values.some((value) => typeof value !== 'string' || value === '')) {
      return Response.json({ ok: false, error: 'Unknown product' }, { status: 400 });
    }
    const entry = CONFIG.items[[slug].concat(values).join(':')];
    if (!entry) {
      return Response.json({ ok: false, error: 'Unknown product' }, { status: 400 });
    }

    // Personalization (bbpp design §3, §7): a personalization-required
    // product rejects items without a token; a product without it rejects
    // items that carry one. The token is syntax-checked, then verified live —
    // HEAD against the site's own origin, through the same authenticated
    // proxy every visitor uses. This is the only non-Stripe network call
    // this function makes.
    const urlTemplate = Object.prototype.hasOwnProperty.call(CONFIG.personalization, slug)
      ? CONFIG.personalization[slug]
      : undefined;
    const token = item.personalization_id;
    if (!urlTemplate) {
      if (token !== undefined) {
        return Response.json(
          { ok: false, error: 'Product does not take personalization' },
          { status: 400 },
        );
      }
      resolved.push({ entry, qty });
      continue;
    }
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return Response.json(
        { ok: false, error: 'Personalization required' },
        { status: 400 },
      );
    }
    const resolvedPath = urlTemplate.replace('{id}', token);
    let head;
    try {
      head = await fetch(origin + resolvedPath, { method: 'HEAD' });
    } catch {
      return Response.json({ ok: false, error: 'Personalization unavailable' }, { status: 502 });
    }
    if (!head.ok) {
      return Response.json({ ok: false, error: 'Personalization not found' }, { status: 400 });
    }
    // The print-resolution variant is what fulfillment links to (design §3);
    // resolved server-side so providers stay personalization-agnostic.
    // scale=2 (2400x1700) is the print ceiling: the parchment renderer hits
    // Cloudflare's 128 MB Worker memory cap rasterizing scale=3 (3600x2550,
    // 9.2M px) and returns 1102. 2x is 200 DPI at 12x8.5" / 300 DPI at 8x5.67".
    const printUrl = origin + resolvedPath + (resolvedPath.indexOf('?') === -1 ? '?' : '&') + 'scale=2';
    resolved.push({ entry, qty, personalization_id: token, personalization_url: printUrl });
  }
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', origin + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  body.set('cancel_url', origin + '/?checkout=cancelled');
  resolved.forEach(function (line, i) {
    body.set('line_items[' + i + '][quantity]', String(line.qty));
    body.set('line_items[' + i + '][price_data][currency]', CONFIG.currency);
    body.set('line_items[' + i + '][price_data][unit_amount]', String(line.entry.price_minor));
    body.set('line_items[' + i + '][price_data][product_data][name]', line.entry.name);
  });
  CONFIG.shipping.countries.forEach(function (country, i) {
    body.set('shipping_address_collection[allowed_countries][' + i + ']', country);
  });
  if (typeof CONFIG.shipping.flat_rate_minor === 'number') {
    body.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    body.set('shipping_options[0][shipping_rate_data][display_name]', 'Flat rate shipping');
    body.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(CONFIG.shipping.flat_rate_minor));
    body.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', CONFIG.currency);
  }
  // The webhook fulfills from this metadata — server-resolved refs only.
  // Personalized lines carry the token and the resolved print URL (opaque to
  // everything downstream of parchment, like fulfillment_ref itself).
  const metadataItems = JSON.stringify(
    resolved.map(function (line) {
      const out = { fulfillment_ref: line.entry.fulfillment_ref, qty: line.qty };
      if (line.personalization_id) {
        out.personalization_id = line.personalization_id;
        out.personalization_url = line.personalization_url;
      }
      return out;
    }),
  );
  // Stripe caps a metadata value at 500 characters; with URLs in the array
  // this bounds a session to roughly three personalized line items. Enforce
  // it here with a clear error rather than letting Stripe truncate.
  if (metadataItems.length > 500) {
    return Response.json(
      { ok: false, error: 'Too many items for one checkout — please order in smaller batches' },
      { status: 400 },
    );
  }
  body.set('metadata[items]', metadataItems);

  let session;
  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
      },
      body: body.toString(),
    });
    if (!res.ok) {
      return Response.json({ ok: false, error: 'Checkout unavailable' }, { status: 502 });
    }
    session = await res.json();
  } catch {
    return Response.json({ ok: false, error: 'Checkout unavailable' }, { status: 502 });
  }

  if (!session || typeof session.url !== 'string') {
    return Response.json({ ok: false, error: 'Checkout unavailable' }, { status: 502 });
  }
  return Response.json({ url: session.url });
}
