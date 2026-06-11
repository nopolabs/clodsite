import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readCatalog, validateCatalog } from './validate-catalog.mjs';

const modulePath = fileURLToPath(new URL('./validate-catalog.mjs', import.meta.url));

function makeProduct(overrides = {}) {
  return {
    slug: 'crow-tee',
    name: 'Crow Tee',
    description: 'A tee with a crow on it.',
    price_minor: 2000,
    active: true,
    images: {
      main: 'commerce/assets/crow-tee-white-front.png',
      gallery: ['commerce/assets/crow-tee-white-back.png'],
    },
    options: [
      { name: 'Color', values: [{ value: 'White', hex: '#FFFFFF' }, { value: 'Black', hex: '#000000' }] },
      { name: 'Size', values: [{ value: 'S' }, { value: 'M' }] },
    ],
    variants: [
      { optionValues: { Color: 'White', Size: 'S' }, fulfillment_ref: '111' },
      { optionValues: { Color: 'White', Size: 'M' }, fulfillment_ref: '112' },
      { optionValues: { Color: 'Black', Size: 'S' }, fulfillment_ref: '113' },
    ],
    ...overrides,
  };
}

function makeCatalog(overrides = {}) {
  return { products: [makeProduct()], ...overrides };
}

function makeSizeGuide(overrides = {}) {
  return {
    unit: 'inches',
    tables: [
      {
        label: 'Product measurements',
        note: 'May vary by up to 2".',
        diagram: {
          image: 'commerce/assets/sg-tee-diagram.png',
          steps: [{ label: 'A Length', text: 'Measure from the collar down.' }],
        },
        rows: [{ label: 'Length', values: { S: '25.5', M: '26' } }],
      },
    ],
    ...overrides,
  };
}

test('accepts a fully-populated catalog', () => {
  assert.deepEqual(validateCatalog(makeCatalog()), []);
});

test('accepts a minimal lookbook product (no options, no variants)', () => {
  const product = makeProduct();
  delete product.options;
  delete product.variants;
  assert.deepEqual(validateCatalog({ products: [product] }), []);
});

test('accepts a product with a size guide', () => {
  const product = makeProduct({ size_guide: makeSizeGuide() });
  assert.deepEqual(validateCatalog({ products: [product] }), []);
});

test('rejects a non-object catalog', () => {
  assert.deepEqual(validateCatalog(null), ['catalog must be an object']);
  assert.deepEqual(validateCatalog([]), ['catalog must be an object']);
});

test('rejects unknown top-level fields', () => {
  const errors = validateCatalog(makeCatalog({ provider: 'printful' }));
  assert.ok(errors.some((e) => e.includes('unknown field "provider"')));
});

test('rejects an empty products array', () => {
  assert.deepEqual(validateCatalog({ products: [] }), ['products must be a non-empty array']);
});

test('rejects duplicate slugs', () => {
  const errors = validateCatalog({ products: [makeProduct(), makeProduct()] });
  assert.ok(errors.some((e) => e.includes('duplicates an earlier product slug: crow-tee')));
});

test('rejects unsafe slugs', () => {
  const errors = validateCatalog({ products: [makeProduct({ slug: 'crow tee:large' })] });
  assert.ok(errors.some((e) => e.includes('products[0].slug must contain only')));
});

test('rejects non-integer and negative price_minor', () => {
  for (const price of ['20.00', 20.5, -1]) {
    const errors = validateCatalog({ products: [makeProduct({ price_minor: price })] });
    assert.ok(
      errors.some((e) => e.includes('price_minor must be a non-negative integer')),
      'expected price_minor error for ' + JSON.stringify(price)
    );
  }
});

test('rejects a missing active flag', () => {
  const product = makeProduct();
  delete product.active;
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('active must be a boolean')));
});

test('rejects remote image URLs (no provider-CDN hotlinks)', () => {
  for (const src of ['https://cdn.printful.com/tee.png', '//cdn.printful.com/tee.png', 'javascript:alert(1)']) {
    const errors = validateCatalog({
      products: [makeProduct({ images: { main: src } })],
    });
    assert.ok(
      errors.some((e) => e.includes('images.main must be a local')),
      'expected local-path error for ' + src
    );
  }
});

test('accepts site-root image paths alongside commerce/assets paths', () => {
  const product = makeProduct({ images: { main: '/assets/images/tee.png' } });
  assert.deepEqual(validateCatalog({ products: [product] }), []);
});

test('rejects more than two option dimensions', () => {
  const product = makeProduct({
    options: [
      { name: 'Color', values: [{ value: 'White' }] },
      { name: 'Size', values: [{ value: 'M' }] },
      { name: 'Fit', values: [{ value: 'Relaxed' }] },
    ],
    variants: [{ optionValues: { Color: 'White', Size: 'M', Fit: 'Relaxed' }, fulfillment_ref: '1' }],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('at most 2 dimensions')));
});

test('rejects duplicate option names and duplicate option values', () => {
  const product = makeProduct({
    options: [
      { name: 'Size', values: [{ value: 'M' }, { value: 'M' }] },
      { name: 'Size', values: [{ value: 'L' }] },
    ],
    variants: [{ optionValues: { Size: 'M' }, fulfillment_ref: '1' }],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('duplicate option name: Size')));
  assert.ok(errors.some((e) => e.includes('duplicate value: M')));
});

test('rejects malformed hex colors', () => {
  const product = makeProduct({
    options: [{ name: 'Color', values: [{ value: 'White', hex: 'white' }] }],
    variants: [{ optionValues: { Color: 'White' }, fulfillment_ref: '1' }],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('hex must be a #RRGGBB color')));
});

test('rejects variants that reference undeclared options or values', () => {
  const product = makeProduct({
    variants: [
      { optionValues: { Color: 'White', Size: 'XXL' }, fulfillment_ref: '1' },
      { optionValues: { Color: 'White', Size: 'M', Fabric: 'Cotton' }, fulfillment_ref: '2' },
    ],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('references undeclared value "XXL"')));
  assert.ok(errors.some((e) => e.includes('references undeclared option "Fabric"')));
});

test('rejects variants missing a declared option dimension', () => {
  const product = makeProduct({
    variants: [{ optionValues: { Color: 'White' }, fulfillment_ref: '1' }],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('is missing option "Size"')));
});

test('rejects duplicate variant combinations', () => {
  const product = makeProduct({
    variants: [
      { optionValues: { Color: 'White', Size: 'M' }, fulfillment_ref: '1' },
      { optionValues: { Color: 'White', Size: 'M' }, fulfillment_ref: '2' },
    ],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('duplicate option combination')));
});

test('rejects variants without a fulfillment_ref', () => {
  const product = makeProduct({
    variants: [{ optionValues: { Color: 'White', Size: 'M' } }],
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('fulfillment_ref must be a non-empty string')));
});

test('rejects size guides with bad units, empty tables, or malformed rows', () => {
  const badUnit = makeProduct({ size_guide: makeSizeGuide({ unit: 'furlongs' }) });
  assert.ok(validateCatalog({ products: [badUnit] }).some((e) => e.includes('unit must be one of: inches, cm')));

  const noTables = makeProduct({ size_guide: makeSizeGuide({ tables: [] }) });
  assert.ok(validateCatalog({ products: [noTables] }).some((e) => e.includes('tables must be a non-empty array')));

  const badRow = makeProduct({
    size_guide: makeSizeGuide({
      tables: [{ label: 'Measurements', rows: [{ label: 'Length', values: {} }] }],
    }),
  });
  assert.ok(validateCatalog({ products: [badRow] }).some((e) => e.includes('values must be a non-empty object')));
});

test('rejects size-guide diagrams with remote images or empty steps', () => {
  const remoteDiagram = makeProduct({
    size_guide: makeSizeGuide({
      tables: [{
        label: 'Measurements',
        diagram: { image: 'https://cdn.printful.com/diagram.png', steps: [{ label: 'A', text: 'Measure.' }] },
        rows: [{ label: 'Length', values: { M: '26' } }],
      }],
    }),
  });
  assert.ok(validateCatalog({ products: [remoteDiagram] }).some((e) => e.includes('diagram.image must be a local')));

  const noSteps = makeProduct({
    size_guide: makeSizeGuide({
      tables: [{
        label: 'Measurements',
        diagram: { image: 'commerce/assets/diagram.png', steps: [] },
        rows: [{ label: 'Length', values: { M: '26' } }],
      }],
    }),
  });
  assert.ok(validateCatalog({ products: [noSteps] }).some((e) => e.includes('steps must be a non-empty array')));
});

test('rejects unknown fields on nested commerce shapes', () => {
  const product = makeProduct({
    images: { main: 'commerce/assets/tee.png', zoom: 'commerce/assets/zoom.png' },
    size_guide: makeSizeGuide({ source: 'printful' }),
  });
  const errors = validateCatalog({ products: [product] });
  assert.ok(errors.some((e) => e.includes('products[0].images has unknown field "zoom"')));
  assert.ok(errors.some((e) => e.includes('size_guide has unknown field "source"')));
});

test('readCatalog throws on missing files and invalid JSON', () => {
  assert.throws(() => readCatalog('/nonexistent/catalog.json'), /cannot read catalog/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-catalog-'));
  const catalogPath = path.join(directory, 'catalog.json');
  try {
    fs.writeFileSync(catalogPath, '{ not json');
    assert.throws(() => readCatalog(catalogPath), /catalog is not valid JSON/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI exits 0 on a valid catalog and 1 on an invalid one', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clodsite-catalog-cli-'));
  const catalogPath = path.join(directory, 'catalog.json');
  try {
    fs.writeFileSync(catalogPath, JSON.stringify(makeCatalog()));
    const ok = spawnSync(process.execPath, [modulePath, catalogPath], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /✓ Catalog is valid \(1 product\(s\)\)/);

    fs.writeFileSync(catalogPath, JSON.stringify({ products: [] }));
    const bad = spawnSync(process.execPath, [modulePath, catalogPath], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /products must be a non-empty array/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
