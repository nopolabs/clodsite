// Printful fulfillment provider — sync half (spec §7).
//
// Runs locally under Node (never deployed): fetches the curated products from
// the Printful API, normalizes them into the commerce/catalog.json contract,
// and mirrors every provider image into commerce/assets/ so the built site
// never hotlinks Printful's CDN (its URLs churn — spec §1, Decision 2).
//
// Contract: syncCatalog(config, env)
//   config = { siteDir, commerce }   commerce.printful = { store_id, products }
//   env    = process.env             needs PRINTFUL_API_KEY
// Writes $SITE/commerce/catalog.json + commerce/assets/, pruning mirrored
// assets the new catalog no longer references.
import fs from 'node:fs';
import path from 'node:path';

const PRINTFUL_API = 'https://api.printful.com';

// Provider-specific display knowledge ported from hmc's sync-products.js:
// garment color names are a Printful/Gildan vocabulary, so their swatch hex
// values and chromatic ordering live here, not in the plan or catalog schema.
const DEFAULT_COLOR_ORDER = [
  'White',
  'Red', 'Cardinal', 'Heather Red', 'Maroon', 'Azalea', 'Pink',
  'Mustard',
  'Forest', 'Irish Green', 'Forest Green', 'Leaf',
  'Teal', 'Heather Deep Teal', 'Aqua',
  'Navy', 'Royal', 'Heather True Royal',
  'Black', 'Vintage Black',
];

const COLOR_HEX = {
  'White':              '#FFFFFF',
  'Black':              '#1A1A1A',
  'Vintage Black':      '#2D2D2B',
  'Navy':               '#1A2744',
  'Royal':              '#1A4BA0',
  'Heather True Royal': '#4466BB',
  'Teal':               '#007B8A',
  'Heather Deep Teal':  '#2D7D7A',
  'Aqua':               '#47C5D4',
  'Irish Green':        '#009A44',
  'Forest':             '#2D5016',
  'Forest Green':       '#2D5016',
  'Leaf':               '#5A7A3A',
  'Mustard':            '#C8922A',
  'Red':                '#CC2222',
  'Cardinal':           '#9B1B2A',
  'Heather Red':        '#BB4444',
  'Maroon':             '#6B1A2A',
  'Pink':               '#F4A0B0',
  'Azalea':             '#F06080',
};

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

const SIZE_TABLE_LABELS = {
  product_measure: 'Product measurements',
  measure_yourself: 'Measure yourself',
};

// ── Printful API ──────────────────────────────────────────────────────────────

async function printfulGet(pathname, apiKey) {
  let res;
  try {
    res = await fetch(PRINTFUL_API + pathname, {
      headers: { 'Authorization': 'Bearer ' + apiKey },
    });
  } catch (cause) {
    throw new Error('could not reach the Printful API: ' +
      String(cause && cause.message ? cause.message : cause));
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body falls through to the error below
  }
  const code = json && typeof json.code === 'number' ? json.code : res.status;
  if (code !== 200 || !json || !('result' in json)) {
    const detail = json
      ? (typeof json.result === 'string' && json.result) ||
        (json.error && json.error.message) ||
        JSON.stringify(json).slice(0, 300)
      : 'HTTP ' + res.status;
    const error = new Error('Printful API error for ' + pathname + ': ' + detail);
    error.status = code;
    throw error;
  }
  return json.result;
}

// ── Normalization helpers ─────────────────────────────────────────────────────

// Providers normalize their own HTML at sync time (spec §4): the component
// never renders raw provider markup, so Printful's editor blobs are reduced
// to plain text here.
export function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Printful diagram descriptions are <h6>label</h6> blocks each followed by
// prose; parse them into the structured steps shape from spec §4.
export function parseDiagramSteps(html) {
  if (typeof html !== 'string') return [];
  const steps = [];
  const headingBlock = /<h6[^>]*>([\s\S]*?)<\/h6>([\s\S]*?)(?=<h6|$)/gi;
  let match;
  while ((match = headingBlock.exec(html)) !== null) {
    const label = stripHtml(match[1]);
    const text = stripHtml(match[2]);
    if (label && text) steps.push({ label: label, text: text });
  }
  return steps;
}

function colorToSlug(color) {
  return color.toLowerCase().replace(/\s+/g, '-');
}

function sortSizes(sizes) {
  return [...sizes].sort(function (a, b) {
    const ai = SIZE_ORDER.indexOf(a);
    const bi = SIZE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function orderColors(allColors, colorOrderConfig) {
  if (Array.isArray(colorOrderConfig) && colorOrderConfig.length > 0) {
    // Only colors explicitly listed, in that order; absent = disabled.
    return colorOrderConfig.filter(function (c) { return allColors.includes(c); });
  }
  // Default: White first, then chromatic order, unknowns last alphabetically.
  const known = DEFAULT_COLOR_ORDER.filter(function (c) { return allColors.includes(c); });
  const unknown = allColors.filter(function (c) { return !DEFAULT_COLOR_ORDER.includes(c); }).sort();
  return [...known, ...unknown];
}

function extFromUrl(url) {
  try {
    const match = new URL(url).pathname.match(/\.(png|jpe?g|webp|gif)$/i);
    if (match) return match[0].toLowerCase();
  } catch {
    // fall through to the default
  }
  return '.png';
}

function variantPreviewUrl(variant) {
  // The 'preview' file is the worn-garment mockup in this variant's color;
  // 'default'/'back' entries are artwork previews, not product shots.
  const file = (variant.files || []).find(function (f) {
    return f.type === 'preview' && f.preview_url;
  });
  return file ? file.preview_url : null;
}

function measurementValues(values) {
  const out = {};
  for (const entry of values || []) {
    if (!entry || typeof entry.size !== 'string') continue;
    let value = null;
    if (entry.value != null) {
      value = String(entry.value);
    } else if (entry.min_value != null && entry.max_value != null) {
      value = String(entry.min_value) + '-' + String(entry.max_value);
    } else if (entry.min_value != null || entry.max_value != null) {
      value = String(entry.min_value != null ? entry.min_value : entry.max_value);
    }
    if (value) out[entry.size] = value;
  }
  return out;
}

// sizeTables is Printful's /products/{id}/sizes size_tables array; mirror()
// registers a remote image and returns its local commerce/assets/ path.
export function normalizeSizeGuide(sizeTables, slug, mirror) {
  const tables = [];
  let unit = 'inches';
  for (const type of ['product_measure', 'measure_yourself']) {
    const source = (sizeTables || []).find(function (t) { return t && t.type === type; });
    if (!source) continue;

    const rows = (source.measurements || [])
      .map(function (m) {
        return { label: m.type_label, values: measurementValues(m.values) };
      })
      .filter(function (row) {
        return typeof row.label === 'string' && row.label.trim() !== '' &&
          Object.keys(row.values).length > 0;
      });
    if (rows.length === 0) continue;

    const table = { label: SIZE_TABLE_LABELS[type] };
    const note = stripHtml(source.description);
    if (note) table.note = note;
    const steps = parseDiagramSteps(source.image_description);
    if (source.image_url && steps.length > 0) {
      table.diagram = {
        image: mirror(source.image_url, slug + '-size-' + type.replace(/_/g, '-')),
        steps: steps,
      };
    }
    table.rows = rows;
    tables.push(table);
    if (source.unit === 'inches' || source.unit === 'cm') unit = source.unit;
  }
  return tables.length > 0 ? { unit: unit, tables: tables } : null;
}

// ── Product assembly ──────────────────────────────────────────────────────────

function buildProduct(entry, detail, sizeTables, mirror) {
  const variants = detail.sync_variants || [];
  if (variants.length === 0) {
    throw new Error('Printful product ' + entry.printful_product_id +
      ' ("' + entry.slug + '") has no sync variants');
  }

  const hasColor = variants.some(function (v) { return typeof v.color === 'string' && v.color !== ''; });
  const hasSize = variants.some(function (v) { return typeof v.size === 'string' && v.size !== ''; });

  // Group by color -> size ('' sentinel for a missing dimension).
  const byColor = new Map();
  for (const variant of variants) {
    const color = hasColor ? variant.color || '' : '';
    const size = hasSize ? variant.size || '' : '';
    if (!byColor.has(color)) byColor.set(color, new Map());
    byColor.get(color).set(size, variant);
  }

  const orderedColors = hasColor
    ? orderColors([...byColor.keys()], entry.color_order)
    : [''];
  if (orderedColors.length === 0) {
    throw new Error('"' + entry.slug + '" has no colors left after applying color_order — ' +
      'listed colors must match Printful color names');
  }

  // Options + variants, walked in display order so catalog diffs are stable.
  const sizeUnion = [];
  const catalogVariants = [];
  for (const color of orderedColors) {
    const bySize = byColor.get(color);
    for (const size of sortSizes([...bySize.keys()])) {
      const variant = bySize.get(size);
      const optionValues = {};
      if (hasColor) optionValues['Color'] = color;
      if (hasSize) optionValues['Size'] = size;
      catalogVariants.push({
        optionValues: optionValues,
        fulfillment_ref: String(variant.id),
      });
      if (hasSize && !sizeUnion.includes(size)) sizeUnion.push(size);
    }
  }

  const options = [];
  if (hasColor) {
    options.push({
      name: 'Color',
      values: orderedColors.map(function (color) {
        const value = { value: color };
        if (COLOR_HEX[color]) value.hex = COLOR_HEX[color];
        return value;
      }),
    });
  }
  if (hasSize) {
    options.push({
      name: 'Size',
      values: sortSizes(sizeUnion).map(function (size) { return { value: size }; }),
    });
  }

  // One mirrored mockup per color (Printful's API previews are front views);
  // main = first display color, the rest become the gallery.
  const images = [];
  for (const color of orderedColors) {
    const bySize = byColor.get(color);
    let url = null;
    for (const size of sortSizes([...bySize.keys()])) {
      url = variantPreviewUrl(bySize.get(size));
      if (url) break;
    }
    if (!url) continue;
    const name = hasColor
      ? entry.slug + '-' + colorToSlug(color) + '-front'
      : entry.slug + '-front';
    images.push(mirror(url, name));
  }
  if (images.length === 0 && detail.sync_product && detail.sync_product.thumbnail_url) {
    images.push(mirror(detail.sync_product.thumbnail_url, entry.slug + '-main'));
  }
  if (images.length === 0) {
    throw new Error('Printful returned no preview images for "' + entry.slug + '"');
  }

  const product = {
    slug: entry.slug,
    name: entry.name || (detail.sync_product && detail.sync_product.name) || entry.slug,
    description: entry.description,
    price_minor: entry.price_minor,
    active: true,
    images: images.length > 1
      ? { main: images[0], gallery: images.slice(1) }
      : { main: images[0] },
  };
  if (options.length > 0) product.options = options;
  product.variants = catalogVariants;

  const sizeGuide = normalizeSizeGuide(sizeTables, entry.slug, mirror);
  if (sizeGuide) product.size_guide = sizeGuide;

  return product;
}

// ── Sync entry point ──────────────────────────────────────────────────────────

export async function syncCatalog(config, env) {
  const siteDir = config.siteDir;
  const commerce = config.commerce || {};
  const apiKey = env.PRINTFUL_API_KEY;
  if (!apiKey) {
    throw new Error('PRINTFUL_API_KEY is not set — add it to .env ' +
      '(Printful dashboard > Settings > Stores > API)');
  }
  const printful = commerce.printful;
  if (!printful || !Number.isInteger(printful.store_id) ||
      !Array.isArray(printful.products) || printful.products.length === 0) {
    throw new Error('commerce.printful ({ store_id, products }) is required to sync from Printful');
  }

  // Every remote image is registered here first; downloads happen in one
  // pass after the whole catalog assembles, so a Printful error mid-product
  // never leaves a half-mirrored assets directory behind.
  const assets = new Map(); // local rel path -> remote URL
  function mirror(url, baseName) {
    const rel = 'commerce/assets/' + baseName + extFromUrl(url);
    assets.set(rel, url);
    return rel;
  }

  const products = [];
  for (const entry of printful.products) {
    if (entry.active === false) {
      console.log('⊘ Skipping inactive product "' + entry.slug + '"');
      continue;
    }
    console.log('Syncing "' + entry.slug + '" (Printful product ' + entry.printful_product_id + ')...');
    const detail = await printfulGet(
      '/store/products/' + entry.printful_product_id + '?store_id=' + printful.store_id,
      apiKey,
    );

    // Size guides hang off the underlying catalog product, not the sync
    // product; not every product has one (404 is normal).
    let sizeTables = null;
    const catalogProductId = detail.sync_variants &&
      detail.sync_variants[0] &&
      detail.sync_variants[0].product &&
      detail.sync_variants[0].product.product_id;
    if (catalogProductId) {
      try {
        const sizes = await printfulGet('/products/' + catalogProductId + '/sizes', apiKey);
        sizeTables = sizes.size_tables || null;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }

    products.push(buildProduct(entry, detail, sizeTables, mirror));
  }

  if (products.length === 0) {
    throw new Error('all commerce.printful.products are inactive — nothing to sync');
  }

  const assetsDir = path.join(siteDir, 'commerce', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  for (const [rel, url] of assets) {
    let res;
    try {
      res = await fetch(url);
    } catch (cause) {
      throw new Error('could not download ' + url + ': ' +
        String(cause && cause.message ? cause.message : cause));
    }
    if (!res.ok) {
      throw new Error('could not download ' + url + ' (HTTP ' + res.status + ')');
    }
    fs.writeFileSync(path.join(siteDir, rel), Buffer.from(await res.arrayBuffer()));
    console.log('✓ Mirrored ' + rel);
  }

  const catalog = { products: products };
  fs.writeFileSync(
    path.join(siteDir, 'commerce', 'catalog.json'),
    JSON.stringify(catalog, null, 2) + '\n',
  );
  console.log('✓ Wrote commerce/catalog.json (' + products.length + ' product(s))');

  // commerce/assets/ is wholly sync-owned for this provider (spec §1):
  // mirrored files the new catalog no longer references are pruned.
  const referenced = new Set(
    [...assets.keys()].map(function (rel) { return path.basename(rel); }),
  );
  for (const file of fs.readdirSync(assetsDir)) {
    if (!referenced.has(file)) {
      fs.rmSync(path.join(assetsDir, file));
      console.log('✓ Removed stale commerce/assets/' + file);
    }
  }

  return catalog;
}
