// Resolves catalog components against the synced commerce catalog at
// template-render time — the offline plan ⋈ catalog join (spec §1).
//
// The resolved product shape is display-only: prices are formatted here
// (the single money-formatting point, spec §8), asset paths become
// site-root URLs, and variants/fulfillment refs are stripped so provider
// identifiers never reach the page (spec Decision 9).

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

// component: a `type: catalog` entry from the plan (optional products filter).
// catalog: parsed, validated commerce/catalog.json.
// Returns the component with the filter replaced by resolved product objects.
export function resolveCatalogComponent(component, catalog, currency = 'usd') {
  const active = catalog.products.filter((product) => product.active);

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
