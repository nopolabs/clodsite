// Validates a normalized commerce catalog ($SITE/commerce/catalog.json).
// Shape contract: docs/superpowers/specs/2026-06-10-commerce-design.md §1, §4, §8.
// CLI usage:
//   node scripts/lib/validate-catalog.mjs <catalog-path>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const VALID_UNITS = ['inches', 'cm'];
const MAX_OPTION_DIMENSIONS = 2;

export function readCatalog(catalogPath) {
  let raw;
  try {
    raw = fs.readFileSync(catalogPath, 'utf8');
  } catch (error) {
    throw new Error('cannot read catalog: ' + error.message);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('catalog is not valid JSON: ' + error.message);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Image paths must be site-local: mirrored commerce assets or a site-root
// path. Provider CDN URLs are rejected — the site never hotlinks them.
function isLocalImagePath(value) {
  if (!isNonEmptyString(value)) return false;
  const src = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false;       // any URL scheme
  if (src.startsWith('//')) return false;                   // protocol-relative
  return src.startsWith('commerce/assets/') || (src.startsWith('/') && !src.includes('..'));
}

function checkUnknownFields(value, allowed, tag, errors) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(tag + ' has unknown field "' + field + '"');
    }
  }
}

function validateSizeGuide(guide, tag, errors) {
  if (!isObject(guide)) {
    errors.push(tag + ' must be an object');
    return;
  }
  checkUnknownFields(guide, new Set(['unit', 'tables']), tag, errors);

  if (!VALID_UNITS.includes(guide.unit)) {
    errors.push(tag + '.unit must be one of: ' + VALID_UNITS.join(', '));
  }

  if (!Array.isArray(guide.tables) || guide.tables.length === 0) {
    errors.push(tag + '.tables must be a non-empty array');
    return;
  }

  guide.tables.forEach(function (table, t) {
    const ttag = tag + '.tables[' + t + ']';
    if (!isObject(table)) {
      errors.push(ttag + ' must be an object');
      return;
    }
    checkUnknownFields(table, new Set(['label', 'note', 'diagram', 'rows']), ttag, errors);

    if (!isNonEmptyString(table.label)) {
      errors.push(ttag + '.label must be a non-empty string');
    }
    if ('note' in table && !isNonEmptyString(table.note)) {
      errors.push(ttag + '.note must be a non-empty string');
    }

    if ('diagram' in table) {
      const dtag = ttag + '.diagram';
      if (!isObject(table.diagram)) {
        errors.push(dtag + ' must be an object');
      } else {
        checkUnknownFields(table.diagram, new Set(['image', 'steps']), dtag, errors);
        if (!isLocalImagePath(table.diagram.image)) {
          errors.push(dtag + '.image must be a local commerce/assets/ or site-root path');
        }
        if (!Array.isArray(table.diagram.steps) || table.diagram.steps.length === 0) {
          errors.push(dtag + '.steps must be a non-empty array');
        } else {
          table.diagram.steps.forEach(function (step, s) {
            const stag = dtag + '.steps[' + s + ']';
            if (!isObject(step)) {
              errors.push(stag + ' must be an object');
              return;
            }
            checkUnknownFields(step, new Set(['label', 'text']), stag, errors);
            if (!isNonEmptyString(step.label)) errors.push(stag + '.label must be a non-empty string');
            if (!isNonEmptyString(step.text)) errors.push(stag + '.text must be a non-empty string');
          });
        }
      }
    }

    if (!Array.isArray(table.rows) || table.rows.length === 0) {
      errors.push(ttag + '.rows must be a non-empty array');
      return;
    }
    table.rows.forEach(function (row, r) {
      const rtag = ttag + '.rows[' + r + ']';
      if (!isObject(row)) {
        errors.push(rtag + ' must be an object');
        return;
      }
      checkUnknownFields(row, new Set(['label', 'values']), rtag, errors);
      if (!isNonEmptyString(row.label)) {
        errors.push(rtag + '.label must be a non-empty string');
      }
      if (!isObject(row.values) || Object.keys(row.values).length === 0) {
        errors.push(rtag + '.values must be a non-empty object');
      } else {
        for (const [key, value] of Object.entries(row.values)) {
          if (!isNonEmptyString(value)) {
            errors.push(rtag + '.values.' + key + ' must be a non-empty string');
          }
        }
      }
    });
  });
}

function validateOptions(options, tag, errors) {
  // Returns a Map of option name -> Set of declared values for variant checks.
  const declared = new Map();
  if (!Array.isArray(options)) {
    errors.push(tag + ' must be an array');
    return declared;
  }
  if (options.length > MAX_OPTION_DIMENSIONS) {
    errors.push(tag + ' must have at most ' + MAX_OPTION_DIMENSIONS +
      ' dimensions (variant UI is capped at two in v1)');
  }
  options.forEach(function (option, o) {
    const otag = tag + '[' + o + ']';
    if (!isObject(option)) {
      errors.push(otag + ' must be an object');
      return;
    }
    checkUnknownFields(option, new Set(['name', 'values']), otag, errors);
    if (!isNonEmptyString(option.name)) {
      errors.push(otag + '.name must be a non-empty string');
      return;
    }
    if (declared.has(option.name)) {
      errors.push(tag + ' contains duplicate option name: ' + option.name);
      return;
    }
    const values = new Set();
    declared.set(option.name, values);
    if (!Array.isArray(option.values) || option.values.length === 0) {
      errors.push(otag + '.values must be a non-empty array');
      return;
    }
    option.values.forEach(function (entry, v) {
      const vtag = otag + '.values[' + v + ']';
      if (!isObject(entry)) {
        errors.push(vtag + ' must be an object');
        return;
      }
      checkUnknownFields(entry, new Set(['value', 'hex']), vtag, errors);
      if (!isNonEmptyString(entry.value)) {
        errors.push(vtag + '.value must be a non-empty string');
        return;
      }
      if (values.has(entry.value)) {
        errors.push(otag + '.values contains duplicate value: ' + entry.value);
      }
      values.add(entry.value);
      if ('hex' in entry && !(typeof entry.hex === 'string' && HEX_PATTERN.test(entry.hex))) {
        errors.push(vtag + '.hex must be a #RRGGBB color');
      }
    });
  });
  return declared;
}

function validateVariants(variants, declaredOptions, tag, errors) {
  if (!Array.isArray(variants) || variants.length === 0) {
    errors.push(tag + ' must be a non-empty array');
    return;
  }
  const optionNames = [...declaredOptions.keys()];
  const seenCombos = new Set();
  variants.forEach(function (variant, v) {
    const vtag = tag + '[' + v + ']';
    if (!isObject(variant)) {
      errors.push(vtag + ' must be an object');
      return;
    }
    checkUnknownFields(variant, new Set(['optionValues', 'fulfillment_ref']), vtag, errors);
    if (!isNonEmptyString(variant.fulfillment_ref)) {
      errors.push(vtag + '.fulfillment_ref must be a non-empty string');
    }
    if (!isObject(variant.optionValues)) {
      errors.push(vtag + '.optionValues must be an object');
      return;
    }
    const keys = Object.keys(variant.optionValues);
    for (const name of optionNames) {
      if (!keys.includes(name)) {
        errors.push(vtag + '.optionValues is missing option "' + name + '"');
      }
    }
    for (const key of keys) {
      const values = declaredOptions.get(key);
      if (!values) {
        errors.push(vtag + '.optionValues references undeclared option "' + key + '"');
      } else if (!values.has(variant.optionValues[key])) {
        errors.push(vtag + '.optionValues.' + key + ' references undeclared value "' +
          variant.optionValues[key] + '"');
      }
    }
    const combo = optionNames.map((name) => String(variant.optionValues[name])).join(' ');
    if (seenCombos.has(combo)) {
      errors.push(tag + ' contains duplicate option combination at index ' + v);
    }
    seenCombos.add(combo);
  });
}

export function validateCatalog(catalog) {
  const errors = [];

  if (!isObject(catalog)) {
    errors.push('catalog must be an object');
    return errors;
  }
  checkUnknownFields(catalog, new Set(['products']), 'catalog', errors);

  if (!Array.isArray(catalog.products) || catalog.products.length === 0) {
    errors.push('products must be a non-empty array');
    return errors;
  }

  const seenSlugs = new Set();
  catalog.products.forEach(function (product, i) {
    const tag = 'products[' + i + ']';
    if (!isObject(product)) {
      errors.push(tag + ' must be an object');
      return;
    }
    checkUnknownFields(product, new Set([
      'slug', 'name', 'description', 'price_minor', 'active',
      'images', 'options', 'variants', 'size_guide'
    ]), tag, errors);

    if (!isNonEmptyString(product.slug)) {
      errors.push(tag + '.slug must be a non-empty string');
    } else if (!SLUG_PATTERN.test(product.slug)) {
      errors.push(tag + '.slug must contain only letters, digits, hyphens, and underscores');
    } else if (seenSlugs.has(product.slug)) {
      errors.push(tag + '.slug duplicates an earlier product slug: ' + product.slug);
    } else {
      seenSlugs.add(product.slug);
    }

    if (!isNonEmptyString(product.name)) {
      errors.push(tag + '.name must be a non-empty string');
    }
    if (!isNonEmptyString(product.description)) {
      errors.push(tag + '.description must be a non-empty string');
    }
    if (!Number.isInteger(product.price_minor) || product.price_minor < 0) {
      errors.push(tag + '.price_minor must be a non-negative integer (minor currency units)');
    }
    if (typeof product.active !== 'boolean') {
      errors.push(tag + '.active must be a boolean');
    }

    if (!isObject(product.images)) {
      errors.push(tag + '.images must be an object');
    } else {
      checkUnknownFields(product.images, new Set(['main', 'gallery']), tag + '.images', errors);
      if (!isLocalImagePath(product.images.main)) {
        errors.push(tag + '.images.main must be a local commerce/assets/ or site-root path');
      }
      if ('gallery' in product.images) {
        if (!Array.isArray(product.images.gallery)) {
          errors.push(tag + '.images.gallery must be an array');
        } else {
          product.images.gallery.forEach(function (src, g) {
            if (!isLocalImagePath(src)) {
              errors.push(tag + '.images.gallery[' + g + '] must be a local commerce/assets/ or site-root path');
            }
          });
        }
      }
    }

    const declaredOptions = ('options' in product)
      ? validateOptions(product.options, tag + '.options', errors)
      : new Map();

    // Display-only catalogs (lookbook) may omit variants; when present each
    // variant must carry a fulfillment_ref and reference declared options.
    if ('variants' in product) {
      validateVariants(product.variants, declaredOptions, tag + '.variants', errors);
    }

    if ('size_guide' in product) {
      validateSizeGuide(product.size_guide, tag + '.size_guide', errors);
    }
  });

  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [catalogPath] = process.argv.slice(2);
  if (!catalogPath) {
    console.error('Usage: node validate-catalog.mjs <catalog-path>');
    process.exit(2);
  }
  let catalog;
  try {
    catalog = readCatalog(catalogPath);
  } catch (error) {
    console.error('Catalog validation failed: ' + error.message);
    process.exit(1);
  }
  const errors = validateCatalog(catalog);
  if (errors.length > 0) {
    console.error('Catalog validation failed (' + errors.length + ' error(s)):');
    errors.forEach(function (e) { console.error('  ✗ ' + e); });
    process.exit(1);
  }
  console.log('✓ Catalog is valid (' + catalog.products.length + ' product(s))');
}
