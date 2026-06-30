import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

function readPlan(file) {
  const plan = yaml.load(fs.readFileSync(file, 'utf8'));
  return plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
}

function isCommerceSite(plan) {
  return Boolean(plan.commerce && plan.commerce.enabled === true && plan.commerce.checkout);
}

function discoverCommerceSites(sitesDir, siteFilter = '') {
  const entries = fs.readdirSync(sitesDir, { withFileTypes: true });
  const sites = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const siteDir = path.join(sitesDir, entry.name);
    const planPath = path.join(siteDir, 'build-plan.yaml');
    if (!fs.existsSync(planPath)) continue;
    const plan = readPlan(planPath);
    if (!isCommerceSite(plan)) continue;
    const slug = typeof plan.slug === 'string' && plan.slug.trim() !== ''
      ? plan.slug.trim()
      : entry.name;
    if (siteFilter && siteFilter !== slug && siteFilter !== entry.name) continue;
    sites.push({
      dir: entry.name,
      siteDir,
      slug,
      provider: plan.commerce.provider || '',
    });
  }
  return sites.sort((a, b) => a.slug.localeCompare(b.slug));
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

async function listKvKeys(fetchImpl, env, namespaceId) {
  const keys = [];
  let cursor = '';
  while (true) {
    const query = new URLSearchParams({ limit: '1000' });
    if (cursor) query.set('cursor', cursor);
    const response = await cloudflareRequest(
      fetchImpl,
      env,
      '/storage/kv/namespaces/' + namespaceId + '/keys?' + query.toString(),
    );
    for (const item of response.result || []) {
      if (item && typeof item.name === 'string') keys.push(item.name);
    }
    cursor = response.result_info && response.result_info.cursor || '';
    if (!cursor) return keys;
  }
}

async function readKvOrder(fetchImpl, env, namespaceId, key) {
  const res = await fetchImpl(
    CLOUDFLARE_API + '/accounts/' + env.CLOUDFLARE_ACCOUNT_ID +
      '/storage/kv/namespaces/' + namespaceId + '/values/' + encodeURIComponent(key),
    { headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN } },
  );
  const body = await readResponse(res);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Cloudflare KV value error: ' + (body.text.slice(0, 300) || 'HTTP ' + res.status));
  }
  return body.json || body.text;
}

function classifyOrder(key, record, now, staleMs) {
  const state = record && typeof record === 'object' && !Array.isArray(record)
    ? String(record.state || 'unknown')
    : 'unknown';
  const updatedAt = record && typeof record.updated_at === 'number' ? record.updated_at : null;
  const ageMs = updatedAt === null ? null : Math.max(0, now - updatedAt);
  const stale = state === 'processing' && ageMs !== null && ageMs >= staleMs;
  return {
    key,
    state,
    attempts: record && typeof record.attempts === 'number' ? record.attempts : null,
    updated_at: updatedAt,
    age_ms: ageMs,
    stale,
    last_error: record && record.last_error || null,
    provider_order_id: record && record.provider_order_id || null,
    alerted_at: record && record.alerted_at || null,
    alert_count: record && typeof record.alert_count === 'number' ? record.alert_count : null,
  };
}

function emptyCounts() {
  return {
    completed: 0,
    failed: 0,
    processing: 0,
    stale_processing: 0,
    other: 0,
  };
}

function addCount(counts, order) {
  if (order.state === 'completed') counts.completed += 1;
  else if (order.state === 'failed') counts.failed += 1;
  else if (order.state === 'processing' && order.stale) counts.stale_processing += 1;
  else if (order.state === 'processing') counts.processing += 1;
  else counts.other += 1;
}

export async function auditOrders({
  sitesDir,
  site = '',
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
  staleMs = STALE_PROCESSING_MS,
} = {}) {
  if (!sitesDir) throw new Error('sitesDir is required');
  if (!fs.existsSync(sitesDir)) throw new Error('sitesDir does not exist: ' + sitesDir);
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for order audit');
  }

  const commerceSites = discoverCommerceSites(sitesDir, site);
  const report = {
    generated_at: new Date(now).toISOString(),
    stale_processing_ms: staleMs,
    site_filter: site || null,
    sites: [],
    warnings: [],
  };
  if (site && commerceSites.length === 0) {
    report.warnings.push('No commerce site matched "' + site + '".');
  }

  for (const commerceSite of commerceSites) {
    const siteReport = {
      site: commerceSite.slug,
      dir: commerceSite.dir,
      provider: commerceSite.provider,
      namespace: null,
      counts: emptyCounts(),
      orders: [],
      warnings: [],
    };
    try {
      const namespace = await findOrdersNamespace(fetchImpl, env, commerceSite.slug);
      siteReport.namespace = namespace;
      if (!namespace.id) {
        siteReport.warnings.push('ORDERS KV namespace not found: ' + namespace.title);
        report.sites.push(siteReport);
        continue;
      }
      const keys = await listKvKeys(fetchImpl, env, namespace.id);
      for (const key of keys.sort()) {
        try {
          const record = await readKvOrder(fetchImpl, env, namespace.id, key);
          const order = classifyOrder(key, record, now, staleMs);
          siteReport.orders.push(order);
          addCount(siteReport.counts, order);
        } catch (error) {
          siteReport.warnings.push('Could not read order "' + key + '": ' + String(error.message || error));
        }
      }
    } catch (error) {
      siteReport.warnings.push(String(error.message || error));
    }
    report.sites.push(siteReport);
  }
  return report;
}

function formatAge(ms) {
  if (ms === null) return 'unknown age';
  if (ms < 60 * 1000) return Math.round(ms / 1000) + 's';
  if (ms < 60 * 60 * 1000) return Math.round(ms / (60 * 1000)) + 'm';
  if (ms < 24 * 60 * 60 * 1000) return Math.round(ms / (60 * 60 * 1000)) + 'h';
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 'd';
}

function formatDate(ms) {
  return ms === null ? 'unknown' : new Date(ms).toISOString();
}

function errorSummary(order) {
  if (!order.last_error) return '';
  const message = order.last_error.message || '';
  const detail = order.last_error.provider_detail || '';
  return [message, detail].filter(Boolean).join(' — ');
}

export function formatAuditReport(report) {
  const lines = [];
  lines.push('Commerce Orders Audit');
  lines.push('=====================');
  lines.push('Generated: ' + report.generated_at);
  lines.push('Stale processing threshold: ' + formatAge(report.stale_processing_ms));
  if (report.site_filter) lines.push('Site filter: ' + report.site_filter);
  lines.push('');

  if (report.sites.length === 0) {
    lines.push('No commerce sites found.');
  }

  for (const site of report.sites) {
    lines.push(site.site + ' (' + site.dir + ')');
    lines.push('-'.repeat(site.site.length + site.dir.length + 3));
    lines.push('Provider: ' + (site.provider || 'unknown'));
    if (site.namespace) {
      lines.push('ORDERS KV: ' + site.namespace.title + (site.namespace.id ? ' (' + site.namespace.id + ')' : ' (not found)'));
    } else {
      lines.push('ORDERS KV: not loaded');
    }
    lines.push(
      'Summary: completed=' + site.counts.completed +
      ' failed=' + site.counts.failed +
      ' stale_processing=' + site.counts.stale_processing +
      ' processing=' + site.counts.processing +
      ' other=' + site.counts.other,
    );

    const attention = site.orders.filter((order) => order.state === 'failed' || order.stale);
    if (attention.length > 0) {
      lines.push('Attention:');
      for (const order of attention) {
        const label = order.stale ? 'STALE processing' : 'FAILED';
        const parts = [
          '  - ' + label,
          order.key,
          'attempts=' + (order.attempts === null ? '?' : order.attempts),
          'updated=' + formatDate(order.updated_at),
        ];
        if (order.stale) parts.push('age=' + formatAge(order.age_ms));
        const summary = errorSummary(order);
        if (summary) parts.push('error=' + summary);
        lines.push(parts.join(' '));
      }
    } else {
      lines.push('Attention: none');
    }

    if (site.orders.length > 0) {
      lines.push('Orders:');
      for (const order of site.orders) {
        lines.push(
          '  - ' + order.key +
          ' state=' + order.state +
          ' attempts=' + (order.attempts === null ? '?' : order.attempts) +
          ' updated=' + formatDate(order.updated_at),
        );
      }
    }
    for (const warning of site.warnings) {
      lines.push('Warning: ' + warning);
    }
    lines.push('');
  }

  for (const warning of report.warnings) {
    lines.push('Warning: ' + warning);
  }
  return lines.join('\n');
}

export async function runCli(args) {
  const [sitesDir, site] = args;
  if (!sitesDir) {
    throw new Error('Usage: node orders-audit.mjs <sites-dir> [site]');
  }
  const report = await auditOrders({ sitesDir, site });
  process.stdout.write(formatAuditReport(report) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exitCode = 1;
  }
}
