import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  getStripeSecretKeyEnv,
  readBuildPlan,
} from './build-plan.mjs';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const STRIPE_API = 'https://api.stripe.com/v1';
export const DEFAULT_LOOKBACK_DAYS = 7;

function isCommerceSite(plan) {
  return Boolean(plan.commerce && plan.commerce.enabled === true && plan.commerce.checkout);
}

function shortFingerprint(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function stripeMode(secretKey) {
  if (/^[sr]k_test_/.test(secretKey || '')) return 'test';
  if (/^[sr]k_live_/.test(secretKey || '')) return 'live';
  return 'unknown';
}

function resolvedStripeBinding(plan, env) {
  const source = getStripeSecretKeyEnv(plan) || 'STRIPE_SECRET_KEY';
  return {
    source,
    value: env[source] || '',
  };
}

function discoverCommerceSites(sitesDir, env, siteFilter = '') {
  const entries = fs.readdirSync(sitesDir, { withFileTypes: true });
  const sites = [];
  const warnings = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const siteDir = path.join(sitesDir, entry.name);
    const planPath = path.join(siteDir, 'build-plan.yaml');
    if (!fs.existsSync(planPath)) continue;

    let plan;
    try {
      plan = readBuildPlan(planPath);
    } catch (error) {
      warnings.push('Could not read build plan for ' + entry.name + ': ' + String(error.message || error));
      continue;
    }
    if (!isCommerceSite(plan)) continue;

    const slug = typeof plan.slug === 'string' && plan.slug.trim() !== ''
      ? plan.slug.trim()
      : entry.name;
    if (siteFilter && siteFilter !== slug && siteFilter !== entry.name) continue;

    const binding = resolvedStripeBinding(plan, env);
    sites.push({
      dir: entry.name,
      siteDir,
      slug,
      provider: plan.commerce.provider || '',
      stripe_source: binding.source,
      stripe_key: binding.value,
      stripe_mode: stripeMode(binding.value),
    });
  }
  return {
    sites: sites.sort((a, b) => a.slug.localeCompare(b.slug)),
    warnings,
  };
}

async function readResponse(res) {
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Callers include the raw text when JSON parsing is not possible.
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
  return body.json;
}

async function findOrdersNamespace(fetchImpl, env, siteSlug) {
  const title = 'clodsite-' + siteSlug + '-orders';
  let page = 1;
  while (true) {
    const response = await cloudflareRequest(
      fetchImpl,
      env,
      '/storage/kv/namespaces?per_page=100&page=' + page,
    );
    const result = response.result || [];
    const match = result.find((namespace) => namespace.title === title);
    if (match) return { id: match.id, title };
    if (response.result_info && page >= response.result_info.total_pages) return { id: '', title };
    if (!Array.isArray(result) || result.length === 0) return { id: '', title };
    page += 1;
  }
}

async function readKvOrder(fetchImpl, env, namespaceId, key) {
  const res = await fetchImpl(
    CLOUDFLARE_API + '/accounts/' + env.CLOUDFLARE_ACCOUNT_ID +
      '/storage/kv/namespaces/' + namespaceId + '/values/' + encodeURIComponent(key),
    { headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN } },
  );
  if (res.status === 404) return null;
  const body = await readResponse(res);
  if (!res.ok) {
    throw new Error('Cloudflare KV value error: ' + (body.text.slice(0, 300) || 'HTTP ' + res.status));
  }
  return body.json || body.text;
}

async function stripeRequest(fetchImpl, secretKey, pathname) {
  const res = await fetchImpl(STRIPE_API + pathname, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
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

async function listPaidCheckoutSessions(fetchImpl, secretKey, sinceSeconds) {
  const sessions = [];
  let startingAfter = '';
  while (true) {
    const query = new URLSearchParams({
      limit: '100',
      payment_status: 'paid',
    });
    query.set('created[gte]', String(sinceSeconds));
    if (startingAfter) query.set('starting_after', startingAfter);
    const page = await stripeRequest(fetchImpl, secretKey, '/checkout/sessions?' + query.toString());
    const data = Array.isArray(page.data) ? page.data : [];
    sessions.push(...data);
    if (!page.has_more) return sessions;
    if (data.length === 0) {
      throw new Error('Stripe pagination reported has_more but returned no sessions');
    }
    startingAfter = data[data.length - 1].id;
  }
}

function groupByStripeKey(sites) {
  const groups = new Map();
  for (const site of sites) {
    if (!site.stripe_key) continue;
    const key = site.stripe_key;
    if (!groups.has(key)) {
      groups.set(key, {
        fingerprint: shortFingerprint(key),
        mode: site.stripe_mode,
        sources: new Set(),
        sites: [],
        secretKey: key,
      });
    }
    const group = groups.get(key);
    group.sources.add(site.stripe_source);
    group.sites.push(site);
  }
  return [...groups.values()].map((group) => ({
    fingerprint: group.fingerprint,
    mode: group.mode,
    sources: [...group.sources].sort(),
    sites: group.sites.sort((a, b) => a.slug.localeCompare(b.slug)),
    secretKey: group.secretKey,
  }));
}

function publicSession(session) {
  return {
    id: session.id,
    livemode: session.livemode,
    status: session.status || null,
    payment_status: session.payment_status || null,
    amount_total: typeof session.amount_total === 'number' ? session.amount_total : null,
    currency: session.currency || null,
    metadata_site: session.metadata && session.metadata.site || null,
    created: typeof session.created === 'number' ? session.created : null,
  };
}

export async function reconcileOrders({
  sitesDir,
  site = '',
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
} = {}) {
  if (!sitesDir) throw new Error('sitesDir is required');
  if (!fs.existsSync(sitesDir)) throw new Error('sitesDir does not exist: ' + sitesDir);
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for order reconciliation');
  }

  const sinceSeconds = Math.floor((now - lookbackDays * 24 * 60 * 60 * 1000) / 1000);
  const discovered = discoverCommerceSites(sitesDir, env, site);
  const report = {
    generated_at: new Date(now).toISOString(),
    lookback_days: lookbackDays,
    coverage_start: new Date(sinceSeconds * 1000).toISOString(),
    site_filter: site || null,
    accounts: [],
    unmatched_sessions: [],
    warnings: [
      'Coverage is bounded to paid checkout sessions created at or after ' +
        new Date(sinceSeconds * 1000).toISOString() + '.',
      ...discovered.warnings,
    ],
  };

  if (site && discovered.sites.length === 0) {
    report.warnings.push('No commerce site matched "' + site + '".');
  }

  const missingKeySites = discovered.sites.filter((commerceSite) => !commerceSite.stripe_key);
  for (const commerceSite of missingKeySites) {
    report.warnings.push(
      'Skipping ' + commerceSite.slug + ': ' + commerceSite.stripe_source + ' is not set.',
    );
  }

  const groups = groupByStripeKey(discovered.sites);
  const siteBySlug = new Map(discovered.sites.map((commerceSite) => [commerceSite.slug, commerceSite]));
  const namespaceCache = new Map();
  async function namespaceFor(siteSlug) {
    if (!namespaceCache.has(siteSlug)) {
      const commerceSite = siteBySlug.get(siteSlug);
      if (!commerceSite) return null;
      namespaceCache.set(siteSlug, findOrdersNamespace(fetchImpl, env, siteSlug));
    }
    return namespaceCache.get(siteSlug);
  }

  for (const group of groups) {
    const accountReport = {
      fingerprint: group.fingerprint,
      mode: group.mode,
      sources: group.sources,
      sites: group.sites.map((commerceSite) => commerceSite.slug),
      sessions_checked: 0,
      sessions_ignored: 0,
      warnings: [],
    };
    try {
      const sessions = await listPaidCheckoutSessions(fetchImpl, group.secretKey, sinceSeconds);
      for (const session of sessions) {
        const metadataSite = session.metadata && session.metadata.site || '';
        if (!metadataSite || !siteBySlug.has(metadataSite)) {
          accountReport.sessions_ignored += 1;
          continue;
        }
        const owningSite = siteBySlug.get(metadataSite);
        if (owningSite.stripe_key !== group.secretKey) {
          accountReport.sessions_ignored += 1;
          continue;
        }
        accountReport.sessions_checked += 1;
        try {
          const namespace = await namespaceFor(metadataSite);
          if (!namespace || !namespace.id) {
            report.unmatched_sessions.push({
              site: metadataSite,
              reason: 'orders_namespace_missing',
              namespace: namespace ? namespace.title : 'clodsite-' + metadataSite + '-orders',
              session: publicSession(session),
            });
            continue;
          }
          const record = await readKvOrder(fetchImpl, env, namespace.id, session.id);
          if (!record || record.state !== 'completed') {
            report.unmatched_sessions.push({
              site: metadataSite,
              reason: record ? 'orders_record_not_completed' : 'orders_record_missing',
              namespace: namespace.title,
              session: publicSession(session),
              orders_record: record || null,
            });
          }
        } catch (error) {
          accountReport.warnings.push(
            'Could not check session ' + session.id + ' for ' + metadataSite + ': ' +
              String(error.message || error),
          );
        }
      }
    } catch (error) {
      accountReport.warnings.push(String(error.message || error));
    }
    report.accounts.push(accountReport);
  }

  return report;
}

function formatMoney(amount, currency) {
  if (amount === null || !currency) return 'unknown amount';
  return (amount / 100).toFixed(2) + ' ' + currency.toUpperCase();
}

export function formatReconciliationReport(report) {
  const lines = [];
  lines.push('Commerce Orders Reconciliation');
  lines.push('==============================');
  lines.push('Generated: ' + report.generated_at);
  lines.push('Coverage start: ' + report.coverage_start + ' (' + report.lookback_days + 'd lookback)');
  if (report.site_filter) lines.push('Site filter: ' + report.site_filter);
  lines.push('');

  if (report.accounts.length === 0) {
    lines.push('No Stripe accounts queried.');
  } else {
    lines.push('Stripe accounts queried:');
    for (const account of report.accounts) {
      lines.push(
        '  - ' + account.fingerprint +
        ' mode=' + account.mode +
        ' sources=' + account.sources.join(',') +
        ' sites=' + account.sites.join(',') +
        ' checked=' + account.sessions_checked +
        ' ignored=' + account.sessions_ignored,
      );
      for (const warning of account.warnings) {
        lines.push('    warning: ' + warning);
      }
    }
  }
  lines.push('');

  if (report.unmatched_sessions.length === 0) {
    lines.push('Unmatched paid sessions: none');
  } else {
    lines.push('Unmatched paid sessions:');
    for (const item of report.unmatched_sessions) {
      const session = item.session;
      lines.push(
        '  - ' + session.id +
        ' site=' + item.site +
        ' reason=' + item.reason +
        ' amount=' + formatMoney(session.amount_total, session.currency) +
        ' created=' + (session.created ? new Date(session.created * 1000).toISOString() : 'unknown'),
      );
    }
  }

  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings');
    for (const warning of report.warnings) {
      lines.push('  - ' + warning);
    }
  }
  return lines.join('\n');
}

export async function runCli(args) {
  const [sitesDir, site] = args;
  if (!sitesDir) {
    throw new Error('Usage: node orders-reconcile.mjs <sites-dir> [site]');
  }
  const report = await reconcileOrders({ sitesDir, site });
  process.stdout.write(formatReconciliationReport(report) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exitCode = 1;
  }
}
