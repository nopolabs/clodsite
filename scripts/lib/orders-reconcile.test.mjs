import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  formatReconciliationReport,
  reconcileOrders,
} from './orders-reconcile.mjs';

const NOW = Date.parse('2026-06-30T12:00:00.000Z');

function writeSite(root, name, {
  slug = name,
  commerce = true,
  mode = 'live',
  secretKeyEnv = '',
} = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const checkoutLines = commerce
    ? [
        'commerce:',
        '  enabled: true',
        '  provider: printful',
        '  currency: usd',
        '  checkout:',
        '    provider: stripe',
        '    mode: ' + mode,
        secretKeyEnv ? '    secret_key_env: ' + secretKeyEnv : '',
        '    success_url: /success/?session_id={CHECKOUT_SESSION_ID}',
        '    cancel_url: /',
      ].filter(Boolean)
    : [
        'commerce:',
        '  enabled: false',
      ];
  fs.writeFileSync(path.join(dir, 'build-plan.yaml'), [
    'slug: ' + slug,
    'name: ' + slug,
    'style: minimal',
    ...checkoutLines,
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-orders-reconcile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeSite(root, 'hmc-next-gen', { slug: 'hmc-cycling', secretKeyEnv: 'HMC_STRIPE_SECRET_KEY' });
  writeSite(root, 'anchovy', { slug: 'anchovy' });
  writeSite(root, 'anchovy-mug', { slug: 'anchovy-mug' });
  writeSite(root, 'bbpp', { slug: 'bbpp', secretKeyEnv: 'BBPP_STRIPE_SECRET_KEY' });
  writeSite(root, 'plain-site', { slug: 'plain-site', commerce: false });
  return root;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function session(id, site, overrides = {}) {
  return {
    id,
    livemode: true,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 1499,
    currency: 'usd',
    created: Math.floor(NOW / 1000) - 60,
    metadata: { site },
    ...overrides,
  };
}

function makeFetch({
  stripeByKey,
  namespaces,
  records,
  calls = [],
}) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ url, init });
    if (parsed.hostname === 'api.stripe.com') {
      const auth = init.headers && init.headers.Authorization || '';
      const decoded = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString('utf8');
      const key = decoded.replace(/:$/, '');
      const allSessions = stripeByKey[key] || [];
      const startingAfter = parsed.searchParams.get('starting_after');
      const start = startingAfter
        ? allSessions.findIndex((item) => item.id === startingAfter) + 1
        : 0;
      const page = allSessions.slice(start, start + 2);
      return jsonResponse({
        object: 'list',
        data: page,
        has_more: start + 2 < allSessions.length,
      });
    }
    if (parsed.pathname.endsWith('/storage/kv/namespaces')) {
      return jsonResponse({
        success: true,
        result: namespaces,
        result_info: { page: 1, total_pages: 1 },
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

test('reconcileOrders flags a paid session with no completed KV record', async (t) => {
  const sitesDir = tempSites(t);
  const calls = [];
  const fetchImpl = makeFetch({
    calls,
    stripeByKey: {
      sk_live_hmc: [
        session('cs_paid_completed', 'hmc-cycling'),
        session('cs_paid_missing', 'hmc-cycling'),
        session('cs_paid_failed', 'hmc-cycling'),
      ],
      sk_live_shared: [
        session('cs_anchovy', 'anchovy'),
        session('cs_anchovy_mug', 'anchovy-mug'),
        session('cs_foreign', 'not-a-clodsite'),
      ],
    },
    namespaces: [
      { id: 'kv_hmc', title: 'clodsite-hmc-cycling-orders' },
      { id: 'kv_anchovy', title: 'clodsite-anchovy-orders' },
      { id: 'kv_anchovy_mug', title: 'clodsite-anchovy-mug-orders' },
    ],
    records: {
      kv_hmc: {
        cs_paid_completed: { state: 'completed', attempts: 1 },
        cs_paid_failed: { state: 'failed', attempts: 2 },
      },
      kv_anchovy: {
        cs_anchovy: { state: 'completed', attempts: 1 },
      },
      kv_anchovy_mug: {
        cs_anchovy_mug: { state: 'completed', attempts: 1 },
      },
    },
  });

  const report = await reconcileOrders({
    sitesDir,
    env: {
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
      HMC_STRIPE_SECRET_KEY_LIVE: 'sk_live_hmc',
      STRIPE_SECRET_KEY_LIVE: 'sk_live_shared',
    },
    fetchImpl,
    now: NOW,
  });

  assert.equal(report.accounts.length, 2, 'shared Stripe key is queried once for anchovy + anchovy-mug');
  assert.deepEqual(
    report.accounts.map((account) => account.sites).sort((a, b) => a.join(',').localeCompare(b.join(','))),
    [['anchovy', 'anchovy-mug'], ['hmc-cycling']],
  );
  assert.deepEqual(
    report.unmatched_sessions.map((item) => [item.session.id, item.site, item.reason]),
    [
      ['cs_paid_missing', 'hmc-cycling', 'orders_record_missing'],
      ['cs_paid_failed', 'hmc-cycling', 'orders_record_not_completed'],
    ],
  );
  assert.ok(report.warnings.some((warning) => warning.includes('Coverage is bounded')));
  assert.ok(calls.filter((call) => new URL(call.url).hostname === 'api.stripe.com').length >= 2);

  const output = formatReconciliationReport(report);
  assert.match(output, /Unmatched paid sessions:/);
  assert.match(output, /cs_paid_missing site=hmc-cycling reason=orders_record_missing/);
  assert.match(output, /cs_paid_failed site=hmc-cycling reason=orders_record_not_completed/);
});

test('reconcileOrders reports missing Stripe keys instead of silently skipping sites', async (t) => {
  const sitesDir = tempSites(t);
  const report = await reconcileOrders({
    sitesDir,
    site: 'bbpp',
    env: {
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
    },
    fetchImpl: makeFetch({ stripeByKey: {}, namespaces: [], records: {} }),
    now: NOW,
  });

  assert.equal(report.accounts.length, 0);
  assert.ok(report.warnings.some((warning) =>
    warning === 'Skipping bbpp: BBPP_STRIPE_SECRET_KEY_LIVE is not set.'));
  assert.match(formatReconciliationReport(report), /No Stripe accounts queried/);
});

test('reconcileOrders flags a missing ORDERS namespace for an owning site', async (t) => {
  const sitesDir = tempSites(t);
  const report = await reconcileOrders({
    sitesDir,
    site: 'hmc-cycling',
    env: {
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
      HMC_STRIPE_SECRET_KEY_LIVE: 'sk_live_hmc',
    },
    fetchImpl: makeFetch({
      stripeByKey: { sk_live_hmc: [session('cs_paid_missing_namespace', 'hmc-cycling')] },
      namespaces: [],
      records: {},
    }),
    now: NOW,
  });

  assert.deepEqual(
    report.unmatched_sessions.map((item) => [item.session.id, item.reason, item.namespace]),
    [['cs_paid_missing_namespace', 'orders_namespace_missing', 'clodsite-hmc-cycling-orders']],
  );
});

test('reconcileOrders ignores sessions stamped for sites outside the queried account group', async (t) => {
  const sitesDir = tempSites(t);
  const report = await reconcileOrders({
    sitesDir,
    env: {
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
      HMC_STRIPE_SECRET_KEY_LIVE: 'sk_live_hmc',
      STRIPE_SECRET_KEY_LIVE: 'sk_live_shared',
    },
    fetchImpl: makeFetch({
      stripeByKey: {
        sk_live_hmc: [session('cs_wrong_account', 'anchovy')],
        sk_live_shared: [session('cs_hmc_on_shared', 'hmc-cycling')],
      },
      namespaces: [],
      records: {},
    }),
    now: NOW,
  });

  assert.deepEqual(report.unmatched_sessions, []);
  assert.equal(report.accounts.reduce((sum, account) => sum + account.sessions_ignored, 0), 2);
});

test('reconcileOrders reports Stripe pagination errors as account warnings', async (t) => {
  const sitesDir = tempSites(t);
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.stripe.com') {
      return jsonResponse({ error: { message: 'restricted key lacks scope' } }, 403);
    }
    throw new Error('unexpected URL: ' + url + ' ' + JSON.stringify(init));
  };
  const report = await reconcileOrders({
    sitesDir,
    site: 'hmc-cycling',
    env: {
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
      HMC_STRIPE_SECRET_KEY_LIVE: 'sk_live_hmc',
    },
    fetchImpl,
    now: NOW,
  });

  assert.equal(report.accounts.length, 1);
  assert.deepEqual(report.accounts[0].warnings, ['Stripe API error: restricted key lacks scope']);
});
