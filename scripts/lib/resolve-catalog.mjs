// Resolves catalog components against the synced commerce catalog at
// template-render time — the offline plan ⋈ catalog join (spec §1).
//
// The resolved product shape is display-only: prices are formatted here
// (the single money-formatting point, spec §8), asset paths become
// site-root URLs, and variants/fulfillment refs are stripped so provider
// identifiers never reach the page (spec Decision 9). price_minor stays in
// the resolved shape as the cart's cached display price (cosmetic, spec §5);
// checkout re-prices server-side from the committed catalog.

// Minor-unit exponents; currencies not listed use 2 (cents-style).
const CURRENCY_EXPONENTS = { jpy: 0, krw: 0 };
const CURRENCY_SYMBOLS = { usd: '$', cad: '$', aud: '$', eur: '€', gbp: '£' };

export function formatPrice(minor, currency = 'usd') {
  if (!Number.isInteger(minor) || minor < 0) {
    throw new Error('price must be a non-negative integer in minor units (got: ' + minor + ')');
  }
  const code = String(currency).toLowerCase();
  const exponent = code in CURRENCY_EXPONENTS ? CURRENCY_EXPONENTS[code] : 2;
  const amount = (minor / Math.pow(10, exponent)).toFixed(exponent);
  const symbol = CURRENCY_SYMBOLS[code];
  return symbol ? symbol + amount : amount + ' ' + code.toUpperCase();
}

// commerce/assets/foo.png → /commerce/assets/foo.png; site-root paths pass
// through. Validation (validate-catalog.mjs) has already rejected URLs.
export function assetUrl(src) {
  return src.startsWith('/') ? src : '/' + src;
}

function resolveSizeGuide(guide) {
  return {
    unit: guide.unit,
    tables: guide.tables.map((table) => ({
      label: table.label,
      ...(table.note ? { note: table.note } : {}),
      ...(table.diagram ? {
        diagram: {
          image: assetUrl(table.diagram.image),
          steps: table.diagram.steps.map((step) => ({ label: step.label, text: step.text })),
        },
      } : {}),
      rows: table.rows.map((row) => ({ label: row.label, values: { ...row.values } })),
    })),
  };
}

function resolveProduct(product, currency) {
  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    price_minor: product.price_minor,
    price_display: formatPrice(product.price_minor, currency),
    images: {
      main: assetUrl(product.images.main),
      gallery: (product.images.gallery || []).map(assetUrl),
    },
    options: (product.options || []).map((option) => ({
      name: option.name,
      values: option.values.map((entry) => ({
        value: entry.value,
        ...('hex' in entry ? { hex: entry.hex } : {}),
      })),
      // Swatches need a color for every value; mixed options fall back to a dropdown.
      has_swatches: option.values.every((entry) => 'hex' in entry),
    })),
    ...(product.size_guide ? { size_guide: resolveSizeGuide(product.size_guide) } : {}),
  };
}

// The cart's purge set (spec §5): every sellable (slug, optionValues) tuple
// as a "slug:val1:val2" string, values in declared option order; a simple
// product (one variant, empty optionValues) is a bare "slug". The cart drops
// stored items whose key is no longer in this set, and add-to-cart refuses
// combinations outside it. Keys carry no fulfillment refs (spec Decision 9).
export function buildCatalogSet(catalog) {
  const keys = [];
  for (const product of catalog.products) {
    if (!product.active) continue;
    // Personalized products are buy-now only (bbpp design §3, Decision 4):
    // they never enter the cart, so they are not in the purge set either.
    if (product.personalization) continue;
    const optionNames = (product.options || []).map((option) => option.name);
    for (const variant of product.variants || []) {
      const values = optionNames.map((name) => variant.optionValues[name]);
      keys.push([product.slug, ...values].join(':'));
    }
  }
  return keys;
}

// component: a `type: catalog` entry from the plan (optional products filter).
// catalog: parsed, validated commerce/catalog.json.
// Returns the component with the filter replaced by resolved product objects.
// Personalization-required products never render in the grid — they have no
// meaning without a token (bbpp design §7); validate-plan rejects explicit
// filter references, and the default-all selection skips them here.
export function resolveCatalogComponent(component, catalog, currency = 'usd') {
  const active = catalog.products.filter(
    (product) => product.active && !product.personalization,
  );

  let selected;
  if (Array.isArray(component.products)) {
    const bySlug = new Map(active.map((product) => [product.slug, product]));
    selected = component.products
      .map((slug) => bySlug.get(slug))
      .filter(Boolean); // inactive products drop out of filters silently
  } else {
    selected = active;
  }

  if (selected.length === 0) {
    throw new Error('catalog component resolves to zero active products');
  }

  return {
    type: 'catalog',
    products: selected.map((product) => resolveProduct(product, currency)),
  };
}

// component: a `type: personalized-product` entry from the plan
// ({ product: slug, param?: query parameter name }).
// Resolves the one personalization-required product the page sells
// (bbpp design §3). The url template stays a template here — the browser
// substitutes the token from the query parameter at view time; checkout
// substitutes it server-side at validation time.
export function resolvePersonalizedProductComponent(component, catalog, currency = 'usd') {
  const product = catalog.products.find((entry) => entry.slug === component.product);
  if (!product) {
    throw new Error('personalized-product references unknown catalog slug: ' + component.product);
  }
  if (!product.active) {
    throw new Error('personalized-product references inactive product: ' + component.product);
  }
  if (!product.personalization) {
    throw new Error(
      'personalized-product references "' + component.product +
      '" which does not declare personalization',
    );
  }
  return {
    type: 'personalized-product',
    param: typeof component.param === 'string' && component.param !== '' ? component.param : 'cert',
    personalization_url: product.personalization.url,
    product: resolveProduct(product, currency),
  };
}
