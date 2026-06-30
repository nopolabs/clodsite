import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditOrders,
  formatAuditReport,
  STALE_PROCESSING_MS,
} from './orders-audit.mjs';

const NOW = Date.parse('2026-06-30T12:00:00.000Z');

function writeSite(root, name, { slug = name, commerce = true, provider = 'printful' } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const commerceBlock = commerce
    ? [
        'commerce:',
        '  enabled: true',
        '  provider: ' + provider,
        '  currency: usd',
        '  checkout:',
        '    provider: stripe',
        '    mode: test',
        '    success_url: /success/?session_id={CHECKOUT_SESSION_ID}',
        '    cancel_url: /',
      ]
    : [
        'commerce:',
        '  enabled: false',
      ];
  fs.writeFileSync(path.join(dir, 'build-plan.yaml'), [
    'slug: ' + slug,
    'name: ' + slug,
    'style: minimal',
    ...commerceBlock,
    'pages:',
    '  - id: home',
    '    title: Home',
    '    components:',
    '      - type: prose',
    '        markdown: Hi',
    'nav:',
    '  order: [home]',
    '',
  ].join('\n'));
}

function tempSites(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-orders-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeSite(root, 'hmc-next-gen', { slug: 'hmc-cycling' });
  writeSite(root, 'anchovy-mug', { slug: 'anchovy-mug' });
  writeSite(root, 'plain-site', { slug: 'plain-site', commerce: false });
  return root;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function makeFetch({ namespaces, records }) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/storage/kv/namespaces')) {
      return jsonResponse({
        success: true,
        result: namespaces,
        result_info: { page: 1, total_pages: 1 },
      });
    }
    const keyMatch = parsed.pathname.match(/\/storage\/kv\/namespaces\/([^/]+)\/keys$/);
    if (keyMatch) {
      const namespaceId = keyMatch[1];
      return jsonResponse({
        success: true,
        result: Object.keys(records[namespaceId] || {}).map((name) => ({ name })),
        result_info: { cursor: '' },
      });
    }
    const valueMatch = parsed.pathname.match(/\/storage\/kv\/namespaces\/([^/]+)\/values\/(.+)$/);
    if (valueMatch) {
      const namespaceId = valueMatch[1];
      const key = decodeURIComponent(valueMatch[2]);
      const record = records[namespaceId] && records[namespaceId][key];
      if (!record) return new Response('not found', { status: 404 });
      return jsonResponse(record);
    }
    throw new Error('unexpected URL: ' + url);
  };
}

test('auditOrders groups failed, stale processing, processing, and completed orders', async (t) => {
  const sitesDir = tempSites(t);
  const fetchImpl = makeFetch({
    namespaces: [
      { id: 'kv_hmc', title: 'clodsite-hmc-cycling-orders' },
      { id: 'kv_anchovy', title: 'clodsite-anchovy-mug-orders' },
    ],
    records: {
      kv_hmc: {
        cs_completed: {
          state: 'completed',
          attempts: 1,
          updated_at: NOW - 60 * 1000,
          provider_order_id: '77001',
        },
        cs_failed: {
          state: 'failed',
          attempts: 2,
          updated_at: NOW - 2 * 60 * 1000,
          last_error: {
            message: 'printful order create failed',
            provider_detail: 'HTTP 400: bad variant',
          },
          alerted_at: '2026-06-30T11:55:00.000Z',
          alert_count: 1,
        },
        cs_processing_stale: {
          state: 'processing',
          attempts: 1,
          updated_at: NOW - STALE_PROCESSING_MS - 1,
        },
        cs_processing_fresh: {
          state: 'processing',
          attempts: 1,
          updated_at: NOW - 60 * 1000,
        },
      },
      kv_anchovy: {},
    },
  });

  const report = await auditOrders({
    sitesDir,
    env: { CLOUDFLARE_API_TOKEN: 'cf_test', CLOUDFLARE_ACCOUNT_ID: 'acct_test' },
    fetchImpl,
    now: NOW,
  });

  assert.equal(report.sites.length, 2);
  const hmc = report.sites.find((site) => site.site === 'hmc-cycling');
  assert.deepEqual(hmc.counts, {
    completed: 1,
    failed: 1,
    processing: 1,
    stale_processing: 1,
    other: 0,
  });
  assert.equal(hmc.orders.find((order) => order.key === 'cs_processing_stale').stale, true);
  assert.equal(hmc.orders.find((order) => order.key === 'cs_processing_fresh').stale, false);

  const output = formatAuditReport(report);
  assert.match(output, /Commerce Orders Audit/);
  assert.match(output, /hmc-cycling \(hmc-next-gen\)/);
  assert.match(output, /FAILED cs_failed/);
  assert.match(output, /STALE processing cs_processing_stale/);
  assert.match(output, /completed=1 failed=1 stale_processing=1 processing=1 other=0/);
  assert.match(output, /Attention: none/);
});

test('auditOrders records a warning when an ORDERS namespace is missing', async (t) => {
  const sitesDir = tempSites(t);
  const report = await auditOrders({
    sitesDir,
    site: 'anchovy-mug',
    env: { CLOUDFLARE_API_TOKEN: 'cf_test', CLOUDFLARE_ACCOUNT_ID: 'acct_test' },
    fetchImpl: makeFetch({
      namespaces: [{ id: 'kv_hmc', title: 'clodsite-hmc-cycling-orders' }],
      records: { kv_hmc: {} },
    }),
    now: NOW,
  });

  assert.equal(report.sites.length, 1);
  assert.equal(report.sites[0].site, 'anchovy-mug');
  assert.deepEqual(report.sites[0].counts, {
    completed: 0,
    failed: 0,
    processing: 0,
    stale_processing: 0,
    other: 0,
  });
  assert.match(report.sites[0].warnings[0], /ORDERS KV namespace not found/);
  assert.match(formatAuditReport(report), /Warning: ORDERS KV namespace not found/);
});

test('auditOrders reports unmatched site filters instead of silently succeeding', async (t) => {
  const sitesDir = tempSites(t);
  const report = await auditOrders({
    sitesDir,
    site: 'missing-site',
    env: { CLOUDFLARE_API_TOKEN: 'cf_test', CLOUDFLARE_ACCOUNT_ID: 'acct_test' },
    fetchImpl: makeFetch({ namespaces: [], records: {} }),
    now: NOW,
  });

  assert.equal(report.sites.length, 0);
  assert.deepEqual(report.warnings, ['No commerce site matched "missing-site".']);
  assert.match(formatAuditReport(report), /No commerce sites found/);
  assert.match(formatAuditReport(report), /No commerce site matched "missing-site"/);
});

test('auditOrders requires Cloudflare credentials', async (t) => {
  const sitesDir = tempSites(t);
  await assert.rejects(
    () => auditOrders({ sitesDir, env: {}, fetchImpl: makeFetch({ namespaces: [], records: {} }) }),
    /CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID/,
  );
});
