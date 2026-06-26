import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const STRIPE_API = 'https://api.stripe.com/v1';
const PRINTFUL_API = 'https://api.printful.com';

export function stripeMode(secretKey) {
  if (/^[sr]k_test_/.test(secretKey || '')) return 'test';
  if (/^[sr]k_live_/.test(secretKey || '')) return 'live';
  return '';
}

export function printfulExternalId(idempotencyKey) {
  const hex = crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex');
  return 'cs_' + hex.slice(0, 24);
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readResponse(res) {
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // caller will report the text
  }
  return { text, json };
}

async function cloudflareRequest(fetchImpl, env, pathname) {
  const res = await fetchImpl(
    CLOUDFLARE_API + '/accounts/' + env.CLOUDFLARE_ACCOUNT_ID + pathname,
    { headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN } },
  );
  const body = await readResponse(res);
  if (!res.ok || !body.json || body.json.success !== true) {
    const message = body.json && Array.isArray(body.json.errors)
      ? body.json.errors.map((error) => error.message).filter(Boolean).join('; ')
      : body.text.slice(0, 300);
    throw new Error('Cloudflare API error: ' + (message || 'HTTP ' + res.status));
  }
  return body.json.result;
}

async function stripeRequest(fetchImpl, env, pathname) {
  const res = await fetchImpl(STRIPE_API + pathname, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(env.STRIPE_SECRET_KEY + ':').toString('base64'),
    },
  });
  const body = await readResponse(res);
  if (!res.ok || !body.json) {
    const message = body.json && body.json.error && body.json.error.message
      ? body.json.error.message
      : body.text.slice(0, 300);
    throw new Error('Stripe API error: ' + (message || 'HTTP ' + res.status));
  }
  return body.json;
}

async function printfulRequest(fetchImpl, env, pathname) {
  const res = await fetchImpl(PRINTFUL_API + pathname, {
    headers: { Authorization: 'Bearer ' + env.PRINTFUL_API_KEY },
  });
  const body = await readResponse(res);
  const code = body.json && typeof body.json.code === 'number' ? body.json.code : res.status;
  if (code === 404) return null;
  if (code < 200 || code >= 300 || !body.json) {
    const message = body.json
      ? (typeof body.json.result === 'string' && body.json.result) ||
        (body.json.error && body.json.error.message) ||
        JSON.stringify(body.json).slice(0, 300)
      : body.text.slice(0, 300);
    throw new Error('Printful API error: ' + (message || 'HTTP ' + code));
  }
  return body.json.result;
}

async function findOrdersNamespace(fetchImpl, env, siteSlug) {
  const title = 'clodsite-' + siteSlug + '-orders';
  let page = 1;
  while (true) {
    const result = await cloudflareRequest(
      fetchImpl,
      env,
      '/storage/kv/namespaces?per_page=100&page=' + page,
    );
    const match = (result || []).find((namespace) => namespace.title === title);
    if (match) return { id: match.id, title };
    if (!Array.isArray(result) || result.length === 0) return { id: '', title };
    page += 1;
  }
}

async function readKvOrder(fetchImpl, env, namespaceId, sessionId) {
  const res = await fetchImpl(
    CLOUDFLARE_API + '/accounts/' + env.CLOUDFLARE_ACCOUNT_ID +
      '/storage/kv/namespaces/' + namespaceId + '/values/' + encodeURIComponent(sessionId),
    { headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN } },
  );
  if (res.status === 404) return null;
  const body = await readResponse(res);
  if (!res.ok) {
    throw new Error('Cloudflare KV value error: ' + (body.text.slice(0, 300) || 'HTTP ' + res.status));
  }
  return body.json || body.text;
}

export async function diagnoseCommerce({ siteDir, sessionId, env = process.env, fetchImpl = fetch }) {
  if (!siteDir) throw new Error('siteDir is required');
  if (!sessionId) throw new Error('sessionId is required');

  const planPath = path.join(siteDir, 'build-plan.yaml');
  const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));
  const siteSlug = plan.slug;
  const provider = plan.commerce && plan.commerce.provider || '';
  const printfulStoreId = plan.commerce && plan.commerce.printful && plan.commerce.printful.store_id;
  const webhookState = readJsonIfExists(path.join(siteDir, '.stripe-webhook-state.json'));
  const stripeKeyMode = stripeMode(env.STRIPE_SECRET_KEY);

  const report = {
    site: siteSlug,
    provider,
    session_id: sessionId,
    stripe_key_mode: stripeKeyMode || null,
    webhook: webhookState ? {
      endpoint_id: webhookState.endpoint_id || null,
      url: webhookState.url || null,
      mode: webhookState.mode || null,
    } : null,
    stripe_session: null,
    orders_namespace: null,
    kv_order: null,
    printful: null,
    errors: [],
  };

  if (env.STRIPE_SECRET_KEY) {
    try {
      const session = await stripeRequest(
        fetchImpl,
        env,
        '/checkout/sessions/' + encodeURIComponent(sessionId),
      );
      report.stripe_session = {
        id: session.id,
        livemode: session.livemode,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        metadata_site: session.metadata && session.metadata.site || null,
        metadata_items: session.metadata && session.metadata.items || null,
        success_url: session.success_url || null,
      };
    } catch (error) {
      report.errors.push(String(error.message || error));
    }
  } else {
    report.errors.push('STRIPE_SECRET_KEY not set; skipping Stripe session lookup');
  }

  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
    try {
      const namespace = await findOrdersNamespace(fetchImpl, env, siteSlug);
      report.orders_namespace = namespace;
      if (namespace.id) {
        report.kv_order = await readKvOrder(fetchImpl, env, namespace.id, sessionId);
      }
    } catch (error) {
      report.errors.push(String(error.message || error));
    }
  } else {
    report.errors.push('CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID not set; skipping ORDERS KV lookup');
  }

  if (provider === 'printful') {
    const externalId = printfulExternalId(sessionId);
    report.printful = {
      store_id: printfulStoreId || null,
      external_id: externalId,
      order: null,
    };
    if (env.PRINTFUL_API_KEY && printfulStoreId) {
      try {
        const order = await printfulRequest(
          fetchImpl,
          env,
          '/orders/@' + encodeURIComponent(externalId) + '?store_id=' + printfulStoreId,
        );
        if (order) {
          report.printful.order = {
            id: order.id,
            external_id: order.external_id,
            status: order.status,
            shipping: order.shipping || null,
          };
        }
      } catch (error) {
        report.errors.push(String(error.message || error));
      }
    } else {
      report.errors.push('PRINTFUL_API_KEY or commerce.printful.store_id missing; skipping Printful order lookup');
    }
  }

  return report;
}

export function formatReport(report) {
  const lines = [];
  lines.push('Commerce Debug');
  lines.push('==============');
  lines.push('Site: ' + report.site);
  lines.push('Provider: ' + (report.provider || 'none'));
  lines.push('Session: ' + report.session_id);
  lines.push('Stripe key mode: ' + (report.stripe_key_mode || 'unknown'));
  lines.push('');

  lines.push('Webhook');
  if (report.webhook) {
    lines.push('  endpoint: ' + (report.webhook.endpoint_id || 'unknown'));
    lines.push('  url: ' + (report.webhook.url || 'unknown'));
    lines.push('  mode: ' + (report.webhook.mode || 'unknown'));
  } else {
    lines.push('  no local .stripe-webhook-state.json');
  }
  lines.push('');

  lines.push('Stripe Session');
  if (report.stripe_session) {
    lines.push('  status: ' + report.stripe_session.status);
    lines.push('  payment_status: ' + report.stripe_session.payment_status);
    lines.push('  amount_total: ' + report.stripe_session.amount_total + ' ' + report.stripe_session.currency);
    lines.push('  metadata.site: ' + (report.stripe_session.metadata_site || 'none'));
    lines.push('  metadata.items: ' + (report.stripe_session.metadata_items || 'none'));
  } else {
    lines.push('  not loaded');
  }
  lines.push('');

  lines.push('ORDERS KV');
  if (report.orders_namespace) {
    lines.push('  namespace: ' + report.orders_namespace.title + (report.orders_namespace.id ? ' (' + report.orders_namespace.id + ')' : ' (not found)'));
    lines.push('  record: ' + (report.kv_order ? JSON.stringify(report.kv_order) : 'none'));
  } else {
    lines.push('  not loaded');
  }
  lines.push('');

  if (report.printful) {
    lines.push('Printful');
    lines.push('  store_id: ' + (report.printful.store_id || 'unknown'));
    lines.push('  external_id: ' + report.printful.external_id);
    if (report.printful.order) {
      lines.push('  order: #' + report.printful.order.id + ' (' + report.printful.order.status + ')');
    } else {
      lines.push('  order: none');
    }
    lines.push('');
  }

  if (report.errors.length > 0) {
    lines.push('Warnings / Errors');
    for (const error of report.errors) lines.push('  - ' + error);
    lines.push('');
  }
  return lines.join('\n');
}

export async function runCli(args) {
  const [siteDir, sessionId] = args;
  if (!siteDir || !sessionId) {
    throw new Error('Usage: node commerce-debug.mjs <site-dir> <stripe-session-id>');
  }
  const report = await diagnoseCommerce({ siteDir, sessionId });
  process.stdout.write(formatReport(report) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exitCode = 1;
  }
}
