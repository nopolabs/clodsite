// Renders Cloudflare Pages Functions from build-plan.yaml.
// Invoked by scripts/render-functions.sh:
//   node scripts/lib/render-functions.mjs <site-dir> [components-dir]
//
// Three function families:
//   - resend-form component  -> functions/api/contact.js
//   - commerce checkout      -> functions/api/checkout.js + functions/api/webhook.js
//     (rendered only when commerce is live: enabled + checkout stripe + NOT preview;
//      preview mode ships the cart chrome with a disabled checkout button and
//      needs no Stripe keys)
//   - proxies plan block     -> functions/<mount>/[[path]].js per entry
//     (independent of commerce; rendered in preview and live modes alike)
// Functions whose source of truth left the plan are removed (stale cleanup).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { readCatalog } from './validate-catalog.mjs';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

// ── commerce config ───────────────────────────────────────────────────────────

// Server-side resolution table for the checkout function (spec §6): the client
// sends only { slug, optionValues, qty }; everything money- or provider-shaped
// lives here, embedded at render time.
export function buildCheckoutConfig(plan, catalog) {
  const commerce = plan.commerce;
  const optionNames = {};
  const items = {};
  const personalization = {};
  for (const product of catalog.products) {
    if (!product.active) continue;
    const names = (product.options || []).map((option) => option.name);
    optionNames[product.slug] = names;
    for (const variant of product.variants || []) {
      const values = names.map((name) => variant.optionValues[name]);
      items[[product.slug, ...values].join(':')] = {
        name: values.length > 0 ? product.name + ' (' + values.join(' / ') + ')' : product.name,
        price_minor: product.price_minor,
        fulfillment_ref: variant.fulfillment_ref,
      };
    }
    // Personalization-required products (bbpp design §3): checkout validates
    // the client token against this origin-relative url template.
    if (product.personalization) {
      personalization[product.slug] = product.personalization.url;
    }
  }
  const shipping = commerce.shipping || {};
  return {
    currency: commerce.currency,
    option_names: optionNames,
    items,
    personalization,
    shipping: {
      flat_rate_minor: typeof shipping.flat_rate_minor === 'number' ? shipping.flat_rate_minor : null,
      countries: Array.isArray(shipping.countries) && shipping.countries.length > 0
        ? shipping.countries
        : ['US'],
    },
  };
}

export function renderCheckoutSource(plan, catalog) {
  const template = fs.readFileSync(path.join(LIB_DIR, 'commerce', 'checkout.template.js'), 'utf8');
  return template.replace('{{CONFIG}}', JSON.stringify(buildCheckoutConfig(plan, catalog)));
}

export function renderWebhookSource(plan) {
  const provider = plan.commerce.provider;
  const orderPath = path.join(LIB_DIR, 'commerce', 'providers', provider, 'order.mjs');
  if (!fs.existsSync(orderPath)) {
    throw new Error(
      'commerce provider "' + provider + '" has no order.mjs at ' + orderPath +
      ' — only providers with a fulfillment implementation can go live',
    );
  }
  // Inline the provider as plain function declarations.
  const createOrder = fs.readFileSync(orderPath, 'utf8').replace(/^export /gm, '');
  let providerEnv = {};
  if (provider === 'manual') {
    providerEnv = {
      COMMERCE_FULFILLMENT_TO: plan.commerce.fulfillment.to,
      COMMERCE_FULFILLMENT_FROM: plan.commerce.fulfillment.from,
    };
  } else if (provider === 'printful') {
    const storeId = plan.commerce.printful && plan.commerce.printful.store_id;
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new Error(
        'commerce.printful.store_id (a positive integer) is required when provider is printful' +
        ' — the webhook scopes every Printful API call to it',
      );
    }
    providerEnv = { PRINTFUL_STORE_ID: String(storeId) };
  }
  return fs.readFileSync(path.join(LIB_DIR, 'commerce', 'webhook.template.js'), 'utf8')
    .replace('{{CREATE_ORDER}}', () => createOrder)
    .replace('{{PROVIDER_ENV}}', () => JSON.stringify(providerEnv));
}

// ── proxy config ──────────────────────────────────────────────────────────────

// First line of proxy.template.js; identifies clodsite-rendered proxy
// functions so stale cleanup never touches a hand-written Function.
export const PROXY_MARKER = '// clodsite:proxy';

export function buildProxyConfig(proxy) {
  const turnstileRoutes = Array.isArray(proxy.turnstile) ? proxy.turnstile : [];
  return {
    mount: proxy.mount,
    upstream: proxy.upstream.replace(/\/+$/, ''),
    headers: proxy.headers || {},
    secret: typeof proxy.secret === 'string' ? proxy.secret : null,
    authenticated: Array.isArray(proxy.authenticated) ? proxy.authenticated : [],
    turnstile: turnstileRoutes.length > 0
      ? {
          routes: turnstileRoutes,
          action: 'clodsite-proxy-' + proxy.mount,
          hostnames: '__CLODSITE_TURNSTILE_HOSTNAMES__',
        }
      : { routes: [], action: null, hostnames: [] },
  };
}

export function renderProxySource(proxy) {
  const template = fs.readFileSync(path.join(LIB_DIR, 'proxy.template.js'), 'utf8');
  return template.replace('{{CONFIG}}', JSON.stringify(buildProxyConfig(proxy)));
}

// ── resend-form config (behavior unchanged from the previous inline script) ──

function buildContactConfig(plan, component) {
  return {
    to: component.to,
    from: component.from,
    subject: (component.subject || '').trim() || ('Message from ' + plan.name),
    fields: (component.fields || []).map((field) => ({
      name: field.name,
      required: !!field.required,
      maxLength: field.maxLength || 10000,
    })),
    turnstile: component.turnstile
      ? {
          enabled: true,
          action: 'clodsite-contact',
          hostnames: '__CLODSITE_TURNSTILE_HOSTNAMES__',
        }
      : { enabled: false },
  };
}

// ── orchestration ─────────────────────────────────────────────────────────────

function removeIfStale(functionsDir, fileName, reason) {
  const apiDir = path.join(functionsDir, 'api');
  const file = path.join(apiDir, fileName);
  if (!fs.existsSync(file)) return;
  fs.rmSync(file);
  console.log('✓ Removed stale functions/api/' + fileName + ' (' + reason + ')');
}

function pruneEmptyDirs(functionsDir) {
  const apiDir = path.join(functionsDir, 'api');
  if (fs.existsSync(apiDir) && fs.readdirSync(apiDir).length === 0) fs.rmdirSync(apiDir);
  if (fs.existsSync(functionsDir) && fs.readdirSync(functionsDir).length === 0) {
    fs.rmdirSync(functionsDir);
  }
}

export function renderFunctions(siteDir, componentsDir) {
  const plan = yaml.load(fs.readFileSync(path.join(siteDir, 'build-plan.yaml'), 'utf8'));
  const functionsDir = path.join(siteDir, 'functions');
  const apiDir = path.join(functionsDir, 'api');

  // resend-form -> contact.js
  let resendForm = null;
  for (const page of plan.pages || []) {
    for (const component of page.components || []) {
      if (component.type === 'resend-form') {
        resendForm = component;
        break;
      }
    }
    if (resendForm) break;
  }

  if (resendForm) {
    const templatePath = path.join(componentsDir, 'resend-form', 'function.template.js');
    if (!fs.existsSync(templatePath)) {
      throw new Error(templatePath + ' not found.');
    }
    const config = buildContactConfig(plan, resendForm);
    const source = fs.readFileSync(templatePath, 'utf8')
      .replace('{{CONFIG}}', JSON.stringify(config));
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'contact.js'), source);
    console.log('✓ Rendered functions/api/contact.js (to: ' + config.to + ')');
  } else {
    removeIfStale(functionsDir, 'contact.js', 'no resend-form in plan');
  }

  // live commerce -> checkout.js + webhook.js
  const commerce = plan.commerce;
  const commerceLive = !!(
    commerce &&
    commerce.enabled === true &&
    commerce.checkout === 'stripe' &&
    commerce.preview !== true
  );

  if (commerceLive) {
    const catalog = readCatalog(path.join(siteDir, 'commerce', 'catalog.json'));
    // Render both sources before writing either — a provider error must not
    // leave a half-rendered functions/ directory behind.
    const checkoutSource = renderCheckoutSource(plan, catalog);
    const webhookSource = renderWebhookSource(plan);
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'checkout.js'), checkoutSource);
    fs.writeFileSync(path.join(apiDir, 'webhook.js'), webhookSource);
    console.log('✓ Rendered functions/api/checkout.js + webhook.js (provider: ' + commerce.provider + ')');
  } else {
    const reason = commerce && commerce.preview === true
      ? 'commerce is in preview mode'
      : 'commerce checkout is not live';
    removeIfStale(functionsDir, 'checkout.js', reason);
    removeIfStale(functionsDir, 'webhook.js', reason);
  }

  // proxies -> functions/<mount>/[[path]].js
  const proxies = Array.isArray(plan.proxies) ? plan.proxies : [];
  for (const proxy of proxies) {
    const source = renderProxySource(proxy);
    const mountDir = path.join(functionsDir, proxy.mount);
    fs.mkdirSync(mountDir, { recursive: true });
    fs.writeFileSync(path.join(mountDir, '[[path]].js'), source);
    console.log(
      '✓ Rendered functions/' + proxy.mount + '/[[path]].js (upstream: ' +
      buildProxyConfig(proxy).upstream + ')',
    );
  }
  // Stale cleanup: remove marker-stamped proxy functions whose mount left the
  // plan. Hand-written Functions (no marker) are never touched.
  if (fs.existsSync(functionsDir)) {
    const mounts = new Set(proxies.map((proxy) => proxy.mount));
    for (const entry of fs.readdirSync(functionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || mounts.has(entry.name)) continue;
      const file = path.join(functionsDir, entry.name, '[[path]].js');
      if (!fs.existsSync(file)) continue;
      if (!fs.readFileSync(file, 'utf8').startsWith(PROXY_MARKER)) continue;
      fs.rmSync(file);
      const dir = path.join(functionsDir, entry.name);
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      console.log('✓ Removed stale functions/' + entry.name + '/[[path]].js (no matching proxy in plan)');
    }
  }

  pruneEmptyDirs(functionsDir);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [siteDir, componentsDir] = process.argv.slice(2);
  if (!siteDir) {
    console.error('Usage: node render-functions.mjs <site-dir> [components-dir]');
    process.exit(2);
  }
  try {
    renderFunctions(siteDir, componentsDir || 'components');
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exit(1);
  }
}
