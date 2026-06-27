// Shared build-plan parsing and common semantic queries.
// CLI usage:
//   node scripts/lib/build-plan.mjs <plan-path> <selector> [selector...]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const selectors = {
  slug: getSlug,
  style: getStyle,
  'custom-domain': getCustomDomain,
  'required-custom-domain': (plan) => getCustomDomain(plan, { required: true }),
  'resend-turnstile': (plan) => isResendTurnstileEnabled(plan) ? 'true' : 'false',
  'turnstile-consumers': (plan) => hasTurnstileConsumer(plan) ? 'true' : 'false',
  'proxy-secrets': getProxySecrets,
  'commerce-provider': getCommerceProvider,
  'stripe-mode': getStripeMode,
  'printful-api-key-env': (plan) => {
    const printful = plan.commerce && plan.commerce.printful;
    return printful && typeof printful.api_key_env === 'string' ? printful.api_key_env.trim() : '';
  },
  'secret-bindings': (plan) => getSecretBindings(plan)
    .map((b) => b.canonical + ' ' + b.source).join('\n'),
};

export function readBuildPlan(planPath) {
  const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('build-plan.yaml must contain an object');
  }
  return plan;
}

export function getSlug(plan) {
  const slug = typeof plan.slug === 'string' ? plan.slug.trim() : '';
  if (!slug) {
    throw new Error('slug not set in build-plan.yaml');
  }
  return slug;
}

export function getStyle(plan) {
  const style = typeof plan.style === 'string' ? plan.style.trim() : '';
  if (!style) {
    throw new Error('style not set in build-plan.yaml');
  }
  return style;
}

export function getCustomDomain(plan, { required = false } = {}) {
  const hostname = typeof plan.custom_domain === 'string'
    ? plan.custom_domain.trim()
    : '';

  if (required && !hostname) {
    throw new Error('custom_domain not set in build-plan.yaml');
  }
  if (hostname && (/^https?:\/\//i.test(hostname) || hostname.includes('/'))) {
    throw new Error('custom_domain must be a hostname only, e.g. www.example.com');
  }
  return hostname;
}

export function findFirstComponent(plan, type) {
  for (const page of plan.pages || []) {
    const component = (page.components || []).find((item) => item.type === type);
    if (component) {
      return component;
    }
  }
  return null;
}

export function isResendTurnstileEnabled(plan) {
  return findFirstComponent(plan, 'resend-form')?.turnstile === true;
}

export function getProxies(plan) {
  return Array.isArray(plan.proxies) ? plan.proxies : [];
}

// Turnstile provisioning runs when anything in the plan consumes a widget:
// a turnstile-protected resend-form or a proxy with turnstile-guarded routes.
export function hasTurnstileConsumer(plan) {
  return isResendTurnstileEnabled(plan) ||
    getProxies(plan).some((proxy) =>
      proxy && Array.isArray(proxy.turnstile) && proxy.turnstile.length > 0);
}

// Distinct env-var names that proxies declare as bearer credentials —
// deploy.sh requires each in .env and pushes each as a Pages secret.
export function getProxySecrets(plan) {
  const names = new Set();
  for (const proxy of getProxies(plan)) {
    if (proxy && typeof proxy.secret === 'string' && proxy.secret.trim() !== '') {
      names.add(proxy.secret.trim());
    }
  }
  return [...names].join(' ');
}

export function getCommerceProvider(plan) {
  const provider = plan.commerce && typeof plan.commerce.provider === 'string'
    ? plan.commerce.provider.trim()
    : '';
  return provider;
}

// The Stripe mode declared by the plan (item 12): commerce.checkout.mode, one of
// "test" | "live", or '' when undeclared. When declared it selects which Stripe
// key the binding resolves; when omitted, the bare STRIPE_SECRET_KEY is used.
export function getStripeMode(plan) {
  const checkout = plan.commerce && plan.commerce.checkout;
  const mode = checkout && typeof checkout.mode === 'string' ? checkout.mode.trim() : '';
  return mode === 'test' || mode === 'live' ? mode : '';
}

// Resolve the single site-scoped Resend source var declared on resend-form
// components, or '' when none. Site-scoped because v1 generates one /api/contact
// endpoint; validate-plan enforces that every resend-form agrees on the value,
// so the first non-empty declaration is authoritative here.
function getResendApiKeyEnv(plan) {
  for (const page of plan.pages || []) {
    for (const component of (page && page.components) || []) {
      if (component && component.type === 'resend-form' &&
          typeof component.api_key_env === 'string' && component.api_key_env.trim() !== '') {
        return component.api_key_env.trim();
      }
    }
  }
  return '';
}

// Declarative per-site secret bindings (item 12): each entry names the canonical
// env var the deploy/Functions consume and the source var the plan binds into
// it. Names only — never secret values. clodsite_resolve_bindings reads these and
// sets each canonical from its source when the source is present in the
// environment; an undeclared credential keeps its bare-name behavior (#72).
export function getSecretBindings(plan) {
  const bindings = [];
  const commerce = plan.commerce && typeof plan.commerce === 'object' && !Array.isArray(plan.commerce)
    ? plan.commerce
    : null;
  if (commerce) {
    const mode = getStripeMode(plan);
    if (mode) {
      bindings.push({
        canonical: 'STRIPE_SECRET_KEY',
        source: mode === 'live' ? 'STRIPE_SECRET_KEY_LIVE' : 'STRIPE_SECRET_KEY_TEST',
      });
    }
    const printful = commerce.printful;
    if (printful && typeof printful.api_key_env === 'string' && printful.api_key_env.trim() !== '') {
      bindings.push({ canonical: 'PRINTFUL_API_KEY', source: printful.api_key_env.trim() });
    }
  }
  const resendSource = getResendApiKeyEnv(plan);
  if (resendSource) {
    bindings.push({ canonical: 'RESEND_API_KEY', source: resendSource });
  }
  return bindings;
}

export function selectPlanValues(plan, requestedSelectors) {
  return requestedSelectors.map((selector) => {
    const select = selectors[selector];
    if (!select) {
      throw new Error(`unknown build-plan selector: ${selector}`);
    }
    return String(select(plan));
  });
}

export function runCli(args) {
  const [planPath, ...requestedSelectors] = args;
  if (!planPath || requestedSelectors.length === 0) {
    throw new Error(
      'Usage: node build-plan.mjs <plan-path> <selector> [selector...]'
    );
  }

  const plan = readBuildPlan(planPath);
  process.stdout.write(selectPlanValues(plan, requestedSelectors).join('\n') + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exitCode = 1;
  }
}
