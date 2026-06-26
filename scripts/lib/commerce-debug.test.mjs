import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  diagnoseCommerce,
  formatReport,
  printfulExternalId,
  stripeMode,
} from './commerce-debug.mjs';

function tempSite() {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-commerce-debug-'));
  fs.writeFileSync(path.join(siteDir, 'build-plan.yaml'), [
    'slug: anchovy-mug',
    'name: Anchovy Mug',
    'style: bold',
    'commerce:',
    '  enabled: true',
    '  provider: printful',
    '  currency: usd',
    '  printful:',
    '    store_id: 18385983',
    '    products:',
    '      - slug: anchovy-mug',
    '        printful_product_id: 442832209',
    '        price_minor: 1000',
    '        description: Mug.',
    'pages:',
    '  - id: home',
    '    title: Home',
    '    components:',
    '      - type: prose',
    '        markdown: Hi',
    'nav:',
    '  order: [home]',
    'contact:',
    '  enabled: false',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(siteDir, '.stripe-webhook-state.json'), JSON.stringify({
    endpoint_id: 'we_123',
    url: 'https://anchovy-mug.nopolabs.com/api/webhook',
    mode: 'live',
  }));
  return siteDir;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test('stripeMode identifies live and test secret keys', () => {
  assert.equal(stripeMode('sk_live_123'), 'live');
  assert.equal(stripeMode('rk_live_123'), 'live');
  assert.equal(stripeMode('sk_test_123'), 'test');
  assert.equal(stripeMode('bad'), '');
});

test('printfulExternalId matches the provider order id shape', () => {
  assert.equal(printfulExternalId('cs_test_abc123'), 'cs_71d330da3cfb1ee326a53caf');
});

test('diagnoseCommerce reports Stripe, KV, and Printful state', async (t) => {
  const siteDir = tempSite();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const sessionId = 'cs_live_example';
  const externalId = printfulExternalId(sessionId);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/checkout/sessions/')) {
      return jsonResponse({
        id: sessionId,
        livemode: true,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 1649,
        currency: 'usd',
        metadata: {
          site: 'anchovy-mug',
          items: '[{"fulfillment_ref":"5371505149","qty":1}]',
        },
        success_url: 'https://anchovy-mug.nopolabs.com/success/?session_id={CHECKOUT_SESSION_ID}',
      });
    }
    if (url.includes('/storage/kv/namespaces?')) {
      return jsonResponse({ success: true, result: [{ id: 'kv_123', title: 'clodsite-anchovy-mug-orders' }] });
    }
    if (url.includes('/storage/kv/namespaces/kv_123/values/')) {
      return jsonResponse({
        state: 'completed',
        attempts: 1,
        provider_order_id: '77001',
      });
    }
    if (url.includes('/orders/@')) {
      assert.ok(url.includes(encodeURIComponent(externalId)));
      return jsonResponse({
        code: 200,
        result: { id: 77001, external_id: externalId, status: 'canceled' },
      });
    }
    throw new Error('unexpected URL: ' + url);
  };

  const report = await diagnoseCommerce({
    siteDir,
    sessionId,
    env: {
      STRIPE_SECRET_KEY: 'sk_live_test',
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
      PRINTFUL_API_KEY: 'pf_test',
    },
    fetchImpl,
  });

  assert.equal(report.site, 'anchovy-mug');
  assert.equal(report.webhook.endpoint_id, 'we_123');
  assert.equal(report.stripe_session.payment_status, 'paid');
  assert.equal(report.orders_namespace.id, 'kv_123');
  assert.equal(report.kv_order.state, 'completed');
  assert.equal(report.printful.external_id, externalId);
  assert.equal(report.printful.order.status, 'canceled');
  assert.equal(report.errors.length, 0);
  assert.ok(calls.length >= 4);

  const output = formatReport(report);
  assert.match(output, /Commerce Debug/);
  assert.match(output, /metadata\.site: anchovy-mug/);
  assert.match(output, /order: #77001 \(canceled\)/);
});

test('diagnoseCommerce records provider failure from KV even when Printful lookup is absent', async (t) => {
  const siteDir = tempSite();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const fetchImpl = async (url) => {
    if (url.includes('/storage/kv/namespaces?')) {
      return jsonResponse({ success: true, result: [{ id: 'kv_123', title: 'clodsite-anchovy-mug-orders' }] });
    }
    if (url.includes('/storage/kv/namespaces/kv_123/values/')) {
      return jsonResponse({
        state: 'failed',
        attempts: 2,
        last_error: {
          message: 'printful order create failed',
          provider_detail: 'HTTP 400: Item 0: Sync variant not found',
        },
      });
    }
    throw new Error('unexpected URL: ' + url);
  };

  const report = await diagnoseCommerce({
    siteDir,
    sessionId: 'cs_live_failed',
    env: {
      CLOUDFLARE_API_TOKEN: 'cf_test',
      CLOUDFLARE_ACCOUNT_ID: 'acct_test',
    },
    fetchImpl,
  });

  assert.equal(report.kv_order.state, 'failed');
  assert.equal(report.kv_order.last_error.provider_detail, 'HTTP 400: Item 0: Sync variant not found');
  assert.match(formatReport(report), /Sync variant not found/);
  assert.ok(report.errors.includes('STRIPE_SECRET_KEY not set; skipping Stripe session lookup'));
});
