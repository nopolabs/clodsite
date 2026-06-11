import assert from 'node:assert/strict';
import test from 'node:test';
import { assetUrl, buildCatalogSet, formatPrice, resolveCatalogComponent } from './resolve-catalog.mjs';

function makeCatalog() {
  return {
    products: [
      {
        slug: 'crow-tee',
        name: 'Crow Tee',
        description: 'A tee with a crow on it.',
        price_minor: 2000,
        active: true,
        images: {
          main: 'commerce/assets/crow-tee-front.png',
          gallery: ['commerce/assets/crow-tee-back.png'],
        },
        options: [
          { name: 'Color', values: [{ value: 'White', hex: '#FFFFFF' }, { value: 'Black', hex: '#000000' }] },
          { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
        ],
        variants: [
          { optionValues: { Color: 'White', Size: 'S' }, fulfillment_ref: '111' },
        ],
        size_guide: {
          unit: 'inches',
          tables: [{
            label: 'Product measurements',
            note: 'May vary.',
            diagram: {
              image: 'commerce/assets/sg-diagram.png',
              steps: [{ label: 'A Length', text: 'Measure down.' }],
            },
            rows: [{ label: 'Length', values: { S: '25.5', M: '26' } }],
          }],
        },
      },
      {
        slug: 'logo-cap',
        name: 'Logo Cap',
        description: 'A cap.',
        price_minor: 1500,
        active: true,
        images: { main: '/assets/images/cap.png' },
      },
      {
        slug: 'retired-tee',
        name: 'Retired Tee',
        description: 'Gone.',
        price_minor: 1000,
        active: false,
        images: { main: 'commerce/assets/retired.png' },
      },
    ],
  };
}

test('formatPrice renders minor units once, at the display boundary', () => {
  assert.equal(formatPrice(2000), '$20.00');
  assert.equal(formatPrice(2000, 'usd'), '$20.00');
  assert.equal(formatPrice(999, 'eur'), '€9.99');
  assert.equal(formatPrice(1500, 'gbp'), '£15.00');
  assert.equal(formatPrice(0), '$0.00');
  assert.equal(formatPrice(2000, 'jpy'), '2000 JPY');     // zero-exponent currency
  assert.equal(formatPrice(2000, 'sek'), '20.00 SEK');    // no symbol mapping
});

test('formatPrice rejects non-integer money (the decimal-string bug class)', () => {
  assert.throws(() => formatPrice('20.00'), /non-negative integer/);
  assert.throws(() => formatPrice(20.5), /non-negative integer/);
  assert.throws(() => formatPrice(-1), /non-negative integer/);
});

test('assetUrl roots commerce asset paths and passes site-root paths through', () => {
  assert.equal(assetUrl('commerce/assets/tee.png'), '/commerce/assets/tee.png');
  assert.equal(assetUrl('/assets/images/cap.png'), '/assets/images/cap.png');
});

test('resolves all active products by default, in catalog order', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog());
  assert.deepEqual(resolved.products.map((p) => p.slug), ['crow-tee', 'logo-cap']);
});

test('applies the products filter in filter order', () => {
  const resolved = resolveCatalogComponent(
    { type: 'catalog', products: ['logo-cap', 'crow-tee'] },
    makeCatalog()
  );
  assert.deepEqual(resolved.products.map((p) => p.slug), ['logo-cap', 'crow-tee']);
});

test('inactive products drop out of filters silently', () => {
  const resolved = resolveCatalogComponent(
    { type: 'catalog', products: ['crow-tee', 'retired-tee'] },
    makeCatalog()
  );
  assert.deepEqual(resolved.products.map((p) => p.slug), ['crow-tee']);
});

test('throws when zero active products resolve', () => {
  assert.throws(
    () => resolveCatalogComponent({ type: 'catalog', products: ['retired-tee'] }, makeCatalog()),
    /zero active products/
  );
});

test('strips variants and fulfillment refs from the resolved shape', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog());
  const serialized = JSON.stringify(resolved);
  assert.ok(!serialized.includes('variants'));
  assert.ok(!serialized.includes('fulfillment_ref'));
  assert.ok(!serialized.includes('111'));
  assert.ok(!serialized.includes('active'));
});

test('keeps price_minor in the resolved shape as the cart cached price', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog());
  assert.equal(resolved.products[0].price_minor, 2000);
  assert.equal(resolved.products[1].price_minor, 1500);
});

test('formats prices and roots image paths in the resolved shape', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog());
  const [tee, cap] = resolved.products;
  assert.equal(tee.price_display, '$20.00');
  assert.equal(cap.price_display, '$15.00');
  assert.equal(tee.images.main, '/commerce/assets/crow-tee-front.png');
  assert.deepEqual(tee.images.gallery, ['/commerce/assets/crow-tee-back.png']);
  assert.deepEqual(cap.images.gallery, []);
});

test('honors the commerce currency', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog(), 'eur');
  assert.equal(resolved.products[0].price_display, '€20.00');
});

test('marks options swatch-capable only when every value has a hex', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog());
  const [color, size] = resolved.products[0].options;
  assert.equal(color.has_swatches, true);
  assert.equal(size.has_swatches, false);
  assert.equal(color.values[0].hex, '#FFFFFF');
});

test('buildCatalogSet emits one key per active variant, values in option order', () => {
  const catalog = makeCatalog();
  catalog.products[0].variants.push({ optionValues: { Color: 'Black', Size: 'M' }, fulfillment_ref: '222' });
  // retired-tee variants must NOT appear: inactive products are excluded.
  catalog.products[2].options = [{ name: 'Size', values: [{ value: 'M' }] }];
  catalog.products[2].variants = [{ optionValues: { Size: 'M' }, fulfillment_ref: '333' }];
  assert.deepEqual(buildCatalogSet(catalog), ['crow-tee:White:S', 'crow-tee:Black:M']);
});

test('buildCatalogSet keys a simple product (empty optionValues) as a bare slug', () => {
  const catalog = makeCatalog();
  catalog.products[1].variants = [{ optionValues: {}, fulfillment_ref: '444' }];
  assert.deepEqual(buildCatalogSet(catalog), ['crow-tee:White:S', 'logo-cap']);
});

test('buildCatalogSet skips products without variants (lookbook-only items)', () => {
  // logo-cap has no variants in the base fixture — displayable, not sellable.
  assert.deepEqual(buildCatalogSet(makeCatalog()), ['crow-tee:White:S']);
});

test('buildCatalogSet keys contain no fulfillment refs', () => {
  const serialized = JSON.stringify(buildCatalogSet(makeCatalog()));
  assert.ok(!serialized.includes('111'));
});

test('resolves size guides with rooted diagram images', () => {
  const resolved = resolveCatalogComponent({ type: 'catalog' }, makeCatalog());
  const guide = resolved.products[0].size_guide;
  assert.equal(guide.unit, 'inches');
  assert.equal(guide.tables[0].diagram.image, '/commerce/assets/sg-diagram.png');
  assert.equal(guide.tables[0].note, 'May vary.');
  assert.deepEqual(guide.tables[0].rows[0].values, { S: '25.5', M: '26' });
  assert.equal(resolved.products[1].size_guide, undefined);
});
