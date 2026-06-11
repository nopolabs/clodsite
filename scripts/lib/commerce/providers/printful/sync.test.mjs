// Unit tests for the printful sync module: fixture-based, with a stubbed
// fetch standing in for the Printful API and CDN.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncCatalog, stripHtml, parseDiagramSteps, normalizeSizeGuide } from './sync.mjs';
import { validateCatalog } from '../../../validate-catalog.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../test/fixtures');
const PRODUCT_FIXTURE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'printful-store-product.json'), 'utf8'));
const SIZES_FIXTURE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'printful-sizes.json'), 'utf8'));

const ENV = { PRINTFUL_API_KEY: 'pf_test_key' };

function commerceConfig(productOverrides = {}, printfulOverrides = {}) {
  return {
    enabled: true,
    provider: 'printful',
    currency: 'usd',
    checkout: 'stripe',
    printful: {
      store_id: 17828143,
      products: [{
        slug: 'crow-tee',
        printful_product_id: 428417969,
        price_minor: 2000,
        description: 'A tee with a crow on it.',
        ...productOverrides,
      }],
      ...printfulOverrides,
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function imageResponse() {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode('image-bytes').buffer,
  };
}

// Routes Printful API + CDN URLs; records every requested URL in calls.
function stubFetch(t, calls, overrides = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    for (const [prefixOrMatch, response] of Object.entries(overrides)) {
      if (String(url).includes(prefixOrMatch)) {
        return typeof response === 'function' ? response(url) : response;
      }
    }
    if (String(url).includes('/store/products/428417969')) {
      return jsonResponse({ code: 200, result: PRODUCT_FIXTURE });
    }
    if (String(url).includes('/products/849/sizes')) {
      return jsonResponse({ code: 200, result: SIZES_FIXTURE });
    }
    if (String(url).includes('files.cdn.printful.com')) {
      return imageResponse();
    }
    return jsonResponse({ code: 404, result: 'Not found' }, 404);
  };
  t.after(() => { globalThis.fetch = original; });
}

function makeSiteDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-printful-sync-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readCatalog(siteDir) {
  return JSON.parse(fs.readFileSync(path.join(siteDir, 'commerce', 'catalog.json'), 'utf8'));
}

test('sync writes a catalog that passes validate-catalog', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const catalog = readCatalog(siteDir);
  assert.deepEqual(validateCatalog(catalog), []);
  assert.equal(catalog.products.length, 1);
});

test('plan curation supplies price, description, and slug; Printful supplies the name', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const product = readCatalog(siteDir).products[0];
  assert.equal(product.slug, 'crow-tee');
  assert.equal(product.price_minor, 2000);
  assert.equal(product.description, 'A tee with a crow on it.');
  assert.equal(product.name, "Women's Basic Softstyle T-Shirt HMC Crow Front and Back");
  assert.equal(product.active, true);
});

test('plan name overrides the Printful product name', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig({ name: 'HMC Crow Tee' }) }, ENV);
  assert.equal(readCatalog(siteDir).products[0].name, 'HMC Crow Tee');
});

test('colors are ordered White-first with hex swatches; sizes sorted', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const options = readCatalog(siteDir).products[0].options;
  assert.deepEqual(options[0], {
    name: 'Color',
    values: [
      { value: 'White', hex: '#FFFFFF' },
      { value: 'Black', hex: '#1A1A1A' },
    ],
  });
  assert.deepEqual(options[1], {
    name: 'Size',
    values: [{ value: 'S' }, { value: 'M' }],
  });
});

test('variants carry the sync variant id as an opaque fulfillment_ref, in display order', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const variants = readCatalog(siteDir).products[0].variants;
  assert.deepEqual(variants, [
    { optionValues: { Color: 'White', Size: 'S' }, fulfillment_ref: '5270106491' },
    { optionValues: { Color: 'White', Size: 'M' }, fulfillment_ref: '5270106492' },
    { optionValues: { Color: 'Black', Size: 'S' }, fulfillment_ref: '5270106489' },
    { optionValues: { Color: 'Black', Size: 'M' }, fulfillment_ref: '5270106490' },
  ]);
});

test('one mockup per color is mirrored: main from the first color, gallery from the rest', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const images = readCatalog(siteDir).products[0].images;
  assert.equal(images.main, 'commerce/assets/crow-tee-white-front.jpg');
  assert.deepEqual(images.gallery, ['commerce/assets/crow-tee-black-front.jpg']);
  assert.ok(fs.existsSync(path.join(siteDir, 'commerce/assets/crow-tee-white-front.jpg')));
  assert.ok(fs.existsSync(path.join(siteDir, 'commerce/assets/crow-tee-black-front.jpg')));
});

test('size guide tables are normalized and the provider HTML never survives', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const guide = readCatalog(siteDir).products[0].size_guide;
  assert.equal(guide.unit, 'inches');
  assert.equal(guide.tables.length, 2);

  const [pm, my] = guide.tables;
  assert.equal(pm.label, 'Product measurements');
  assert.equal(pm.note, 'Measurements are provided by our suppliers. Product measurements may vary by up to 2" (5 cm).');
  assert.equal(pm.diagram.image, 'commerce/assets/crow-tee-size-product-measure.png');
  assert.deepEqual(pm.diagram.steps.map((s) => s.label), ['A Length', 'B Width']);
  assert.ok(pm.diagram.steps[0].text.startsWith('Place the end of the tape beside the collar'));
  assert.deepEqual(pm.rows[0], { label: 'Length', values: { S: '25.5', M: '26' } });

  assert.equal(my.label, 'Measure yourself');
  assert.deepEqual(my.rows[0], { label: 'Chest', values: { S: '31-34', M: '35-38' } });

  assert.ok(!JSON.stringify(guide).includes('<'), 'no HTML tags in the normalized guide');
  assert.ok(fs.existsSync(path.join(siteDir, 'commerce/assets/crow-tee-size-product-measure.png')));
  assert.ok(fs.existsSync(path.join(siteDir, 'commerce/assets/crow-tee-size-measure-yourself.png')));
});

test('color_order restricts and reorders colors; unlisted colors are disabled', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await syncCatalog({ siteDir, commerce: commerceConfig({ color_order: ['Black'] }) }, ENV);
  const product = readCatalog(siteDir).products[0];
  assert.deepEqual(product.options[0].values.map((v) => v.value), ['Black']);
  assert.ok(product.variants.every((v) => v.optionValues.Color === 'Black'));
  assert.equal(product.images.main, 'commerce/assets/crow-tee-black-front.jpg');
  assert.equal(product.images.gallery, undefined);
});

test('inactive plan products are skipped without fetching them', async (t) => {
  const siteDir = makeSiteDir(t);
  const calls = [];
  stubFetch(t, calls);
  const commerce = commerceConfig();
  commerce.printful.products.push({
    slug: 'retired-tee',
    printful_product_id: 999999,
    price_minor: 1000,
    description: 'No longer sold.',
    active: false,
  });
  await syncCatalog({ siteDir, commerce }, ENV);
  assert.equal(readCatalog(siteDir).products.length, 1);
  assert.ok(!calls.some((url) => url.includes('999999')));
});

test('all products inactive is an error, not an empty catalog', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  await assert.rejects(
    () => syncCatalog({ siteDir, commerce: commerceConfig({ active: false }) }, ENV),
    /nothing to sync/,
  );
});

test('missing PRINTFUL_API_KEY fails before any network call', async (t) => {
  const siteDir = makeSiteDir(t);
  const calls = [];
  stubFetch(t, calls);
  await assert.rejects(
    () => syncCatalog({ siteDir, commerce: commerceConfig() }, {}),
    /PRINTFUL_API_KEY is not set/,
  );
  assert.equal(calls.length, 0);
});

test('missing commerce.printful config is a clear error', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  const commerce = commerceConfig();
  delete commerce.printful;
  await assert.rejects(
    () => syncCatalog({ siteDir, commerce }, ENV),
    /commerce\.printful \(\{ store_id, products \}\) is required/,
  );
});

test('a Printful API error surfaces with its detail and writes nothing', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, [], {
    '/store/products/428417969': jsonResponse({ code: 400, result: 'Bad request - store not found' }, 400),
  });
  await assert.rejects(
    () => syncCatalog({ siteDir, commerce: commerceConfig() }, ENV),
    /Printful API error.*store not found/,
  );
  assert.ok(!fs.existsSync(path.join(siteDir, 'commerce', 'catalog.json')));
});

test('a product without a size guide (404) syncs without one', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, [], {
    '/products/849/sizes': jsonResponse({ code: 404, result: 'Not found' }, 404),
  });
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  const product = readCatalog(siteDir).products[0];
  assert.equal(product.size_guide, undefined);
  assert.deepEqual(validateCatalog(readCatalog(siteDir)), []);
});

test('stale mirrored assets are pruned after a successful sync', async (t) => {
  const siteDir = makeSiteDir(t);
  stubFetch(t, []);
  fs.mkdirSync(path.join(siteDir, 'commerce', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'commerce/assets/old-product.png'), 'stale');
  await syncCatalog({ siteDir, commerce: commerceConfig() }, ENV);
  assert.ok(!fs.existsSync(path.join(siteDir, 'commerce/assets/old-product.png')));
  assert.ok(fs.existsSync(path.join(siteDir, 'commerce/assets/crow-tee-white-front.jpg')));
});

test('a single-dimension product (size only) gets only a Size option', async (t) => {
  const siteDir = makeSiteDir(t);
  const detail = {
    sync_product: { id: 555, name: 'Logo Socks', thumbnail_url: 'https://files.cdn.printful.com/files/sock_preview.png' },
    sync_variants: [
      {
        id: 7000001, color: null, size: 'M', product: { product_id: 777 },
        files: [{ type: 'preview', preview_url: 'https://files.cdn.printful.com/files/sock-m_preview.jpg' }],
      },
      {
        id: 7000002, color: null, size: 'L', product: { product_id: 777 },
        files: [{ type: 'preview', preview_url: 'https://files.cdn.printful.com/files/sock-m_preview.jpg' }],
      },
    ],
  };
  stubFetch(t, [], {
    '/store/products/555': jsonResponse({ code: 200, result: detail }),
    '/products/777/sizes': jsonResponse({ code: 404, result: 'Not found' }, 404),
  });
  const commerce = commerceConfig();
  commerce.printful.products = [{
    slug: 'logo-socks', printful_product_id: 555, price_minor: 1200, description: 'Socks.',
  }];
  await syncCatalog({ siteDir, commerce }, ENV);
  const product = readCatalog(siteDir).products[0];
  assert.deepEqual(product.options, [{ name: 'Size', values: [{ value: 'M' }, { value: 'L' }] }]);
  assert.deepEqual(product.variants, [
    { optionValues: { Size: 'M' }, fulfillment_ref: '7000001' },
    { optionValues: { Size: 'L' }, fulfillment_ref: '7000002' },
  ]);
  assert.equal(product.images.main, 'commerce/assets/logo-socks-front.jpg');
  assert.deepEqual(validateCatalog(readCatalog(siteDir)), []);
});

test('stripHtml flattens tags and decodes entities', () => {
  assert.equal(
    stripHtml('<p dir="ltr"><span>May vary by up to 2&quot; (5&nbsp;cm) &amp; more.</span></p>'),
    'May vary by up to 2" (5 cm) & more.',
  );
  assert.equal(stripHtml(null), '');
});

test('parseDiagramSteps pairs each h6 heading with its following prose', () => {
  const steps = parseDiagramSteps(
    '<h6 dir="ltr">A Length</h6>\n<p><span>Measure down.</span></p>' +
    '<h6><strong>B Width</strong></h6>\n<p>Measure across.</p>',
  );
  assert.deepEqual(steps, [
    { label: 'A Length', text: 'Measure down.' },
    { label: 'B Width', text: 'Measure across.' },
  ]);
  assert.deepEqual(parseDiagramSteps('<p>no headings</p>'), []);
});

test('normalizeSizeGuide omits the diagram when there is no image or no steps', () => {
  const mirror = (url, name) => 'commerce/assets/' + name + '.png';
  const guide = normalizeSizeGuide([{
    type: 'product_measure',
    unit: 'inches',
    description: '<p>Note.</p>',
    image_url: null,
    image_description: '<h6>A</h6><p>Step.</p>',
    measurements: [{ type_label: 'Length', values: [{ size: 'S', value: '25' }] }],
  }], 'tee', mirror);
  assert.equal(guide.tables[0].diagram, undefined);
  assert.deepEqual(guide.tables[0].rows, [{ label: 'Length', values: { S: '25' } }]);
});
