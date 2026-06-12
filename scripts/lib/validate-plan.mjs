// Validates a build-plan.yaml against the component catalog.
// Invoked by scripts/validate-plan.sh:
//   node scripts/lib/validate-plan.mjs <plan-path> <components-dir>
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { readCatalog, validateCatalog } from './validate-catalog.mjs';

const [planPath, componentsDir] = process.argv.slice(2);
if (!planPath || !componentsDir) {
  console.error('Usage: node validate-plan.mjs <plan-path> <components-dir>');
  process.exit(2);
}

const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));
const errors = [];

if (!plan.slug)     errors.push('slug is required');
if (!plan.name)     errors.push('name is required');
if (!plan.overview) errors.push('overview is required');

const validStyles = ['minimal', 'professional', 'bold'];
if (!validStyles.includes(plan.style))
  errors.push('style must be one of: ' + validStyles.join(', ') + ' (got: ' + plan.style + ')');

if ('theme_selector' in plan) {
  const selector = plan.theme_selector;
  if (!isObject(selector)) {
    errors.push('theme_selector must be an object');
  } else {
    const allowed = new Set(['enabled', 'options']);
    for (const field of Object.keys(selector)) {
      if (!allowed.has(field))
        errors.push('theme_selector has unknown field "' + field + '"');
    }
    if (typeof selector.enabled !== 'boolean')
      errors.push('theme_selector.enabled must be a boolean');
    if (!Array.isArray(selector.options)) {
      errors.push('theme_selector.options must be an array');
    } else {
      const seen = new Set();
      selector.options.forEach(function(option, index) {
        if (!validStyles.includes(option))
          errors.push('theme_selector.options[' + index + '] must be one of: ' + validStyles.join(', '));
        if (seen.has(option))
          errors.push('theme_selector.options contains duplicate value: ' + option);
        seen.add(option);
      });
      if (selector.enabled === true && selector.options.length < 2)
        errors.push('theme_selector.options must contain at least two themes when enabled');
      if (selector.enabled === true && !seen.has(plan.style))
        errors.push('theme_selector.options must include the site style when enabled');
    }
  }
}

const validTones = ['professional', 'casual', 'technical', 'friendly'];
if (!validTones.includes(plan.tone))
  errors.push('tone must be one of: ' + validTones.join(', ') + ' (got: ' + plan.tone + ')');

if ('build_notes' in plan)
  errors.push('build_notes is no longer supported (removed in component-catalog v1)');

if ('custom_domain' in plan && plan.custom_domain !== null && typeof plan.custom_domain !== 'string')
  errors.push('custom_domain must be a string hostname or omitted');
if (typeof plan.custom_domain === 'string' && plan.custom_domain.trim() !== '') {
  const domain = plan.custom_domain.trim();
  if (/^https?:\/\//i.test(domain) || domain.includes('/'))
    errors.push('custom_domain must be a hostname only, e.g. www.example.com');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNonEmptyString(value, fieldPath) {
  if (typeof value !== 'string') {
    errors.push(fieldPath + ' must be a string');
    return false;
  }
  if (value.trim().length === 0) {
    errors.push(fieldPath + ' must be a non-empty string');
    return false;
  }
  return true;
}

function validateHead(head, fieldPath) {
  if (!isObject(head)) {
    errors.push(fieldPath + ' must be an object');
    return;
  }

  const allowed = new Set(['description', 'image']);
  for (const field of Object.keys(head)) {
    if (!allowed.has(field))
      errors.push(fieldPath + ' has unknown field "' + field + '"');
  }

  if ('description' in head)
    validateNonEmptyString(head.description, fieldPath + '.description');

  if ('image' in head) {
    const imagePath = fieldPath + '.image';
    if (!isObject(head.image)) {
      errors.push(imagePath + ' must be an object');
      return;
    }

    const imageAllowed = new Set(['src', 'alt']);
    for (const field of Object.keys(head.image)) {
      if (!imageAllowed.has(field))
        errors.push(imagePath + ' has unknown field "' + field + '"');
    }

    for (const field of ['src', 'alt']) {
      if (!(field in head.image)) {
        errors.push(imagePath + '.' + field + ' is required');
      } else {
        validateNonEmptyString(head.image[field], imagePath + '.' + field);
      }
    }

    if (typeof head.image.src === 'string' && head.image.src.trim().length > 0) {
      const src = head.image.src.trim();
      let validAbsoluteUrl = false;
      if (/^https:\/\//i.test(src)) {
        try {
          const parsed = new URL(src);
          validAbsoluteUrl = parsed.protocol === 'https:' && parsed.hostname.length > 0;
        } catch (_) {
          validAbsoluteUrl = false;
        }
      }
      if (!(src.startsWith('/') && !src.startsWith('//')) && !validAbsoluteUrl)
        errors.push(imagePath + '.src must be a site-root path or absolute https:// URL');
    }
  }
}

if ('head' in plan)
  validateHead(plan.head, 'head');

if ('headers' in plan) {
  if (!Array.isArray(plan.headers) || plan.headers.length === 0) {
    errors.push('headers must be a non-empty array');
  } else {
    if (plan.headers.length > 100)
      errors.push('headers must contain at most 100 rules');

    const seenPaths = new Set();
    plan.headers.forEach(function(rule, i) {
      const tag = 'headers[' + i + ']';
      if (!isObject(rule)) {
        errors.push(tag + ' must be an object');
        return;
      }

      const allowed = new Set(['path', 'values']);
      for (const field of Object.keys(rule)) {
        if (!allowed.has(field))
          errors.push(tag + ' has unknown field "' + field + '"');
      }

      if (!('path' in rule)) {
        errors.push(tag + '.path is required');
      } else if (validateNonEmptyString(rule.path, tag + '.path')) {
        const headerPath = rule.path.trim();
        let validAbsoluteUrl = false;
        if (/^https:\/\//i.test(headerPath)) {
          try {
            const parsed = new URL(headerPath);
            validAbsoluteUrl = parsed.protocol === 'https:' && parsed.hostname.length > 0;
          } catch (_) {
            validAbsoluteUrl = false;
          }
        }
        if (!(headerPath.startsWith('/') || validAbsoluteUrl))
          errors.push(tag + '.path must begin with / or https://');
        if (/[\r\n]/.test(rule.path))
          errors.push(tag + '.path must be a single-line string');
        if (headerPath.length > 2000)
          errors.push(tag + '.path produces a line longer than 2000 characters');
        if (seenPaths.has(headerPath))
          errors.push(tag + '.path duplicates an earlier header path: ' + headerPath);
        seenPaths.add(headerPath);
      }

      if (!('values' in rule)) {
        errors.push(tag + '.values is required');
      } else if (!isObject(rule.values) || Object.keys(rule.values).length === 0) {
        errors.push(tag + '.values must be a non-empty object');
      } else {
        const seenNames = new Set();
        for (const [name, value] of Object.entries(rule.values)) {
          const valuePath = tag + '.values.' + name;
          const normalizedName = name.toLowerCase();
          if (seenNames.has(normalizedName))
            errors.push(tag + '.values has duplicate header name "' + name + '"');
          seenNames.add(normalizedName);

          if (name.startsWith('!'))
            errors.push(valuePath + ' uses unsupported header-removal syntax');
          if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name))
            errors.push(valuePath + ' has an invalid header name');
          if (validateNonEmptyString(value, valuePath)) {
            if (/[\r\n]/.test(value))
              errors.push(valuePath + ' must be a single-line string');
            if (('  ' + name + ': ' + value).length > 2000)
              errors.push(valuePath + ' produces a line longer than 2000 characters');
          }
        }
      }
    });
  }
}

const catalog = {};
if (fs.existsSync(componentsDir)) {
  for (const name of fs.readdirSync(componentsDir)) {
    const schemaPath = path.join(componentsDir, name, 'schema.json');
    if (fs.existsSync(schemaPath)) {
      catalog[name] = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    }
  }
}

function checkType(value, type) {
  if (type === 'string')  return typeof value === 'string';
  if (type === 'array')   return Array.isArray(value);
  if (type === 'object')  return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number')  return typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
}

function validateValue(value, descriptor, fieldPath) {
  if (typeof descriptor === 'string') {
    if (!checkType(value, descriptor))
      errors.push(fieldPath + ' must be ' + descriptor);
    return;
  }

  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor) ||
      typeof descriptor.type !== 'string') {
    errors.push('invalid schema descriptor for ' + fieldPath);
    return;
  }

  const descriptorKeys = new Set([
    'type', 'enum', 'non_empty', 'required', 'optional', 'items', 'min_items',
    'max_items', 'format'
  ]);
  const unknownDescriptorKey = Object.keys(descriptor).find(key => !descriptorKeys.has(key));
  if (unknownDescriptorKey) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': unknown rule "' + unknownDescriptorKey + '"');
    return;
  }
  if ('enum' in descriptor &&
      (descriptor.type !== 'string' || !Array.isArray(descriptor.enum))) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': enum requires type string');
    return;
  }
  if ('non_empty' in descriptor &&
      (descriptor.type !== 'string' || typeof descriptor.non_empty !== 'boolean')) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': non_empty requires type string');
    return;
  }
  if (('required' in descriptor || 'optional' in descriptor) && descriptor.type !== 'object') {
    errors.push('invalid schema descriptor for ' + fieldPath + ': required/optional require type object');
    return;
  }
  if (descriptor.type === 'object' &&
      (('required' in descriptor && !checkType(descriptor.required, 'object')) ||
       ('optional' in descriptor && !checkType(descriptor.optional, 'object')))) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': required/optional must be objects');
    return;
  }
  if ('items' in descriptor && descriptor.type !== 'array') {
    errors.push('invalid schema descriptor for ' + fieldPath + ': items requires type array');
    return;
  }
  if ('min_items' in descriptor &&
      (descriptor.type !== 'array' || !Number.isInteger(descriptor.min_items) ||
       descriptor.min_items < 0)) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': min_items requires a non-negative integer and type array');
    return;
  }
  if ('max_items' in descriptor &&
      (descriptor.type !== 'array' || !Number.isInteger(descriptor.max_items) ||
       descriptor.max_items < 0)) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': max_items requires a non-negative integer and type array');
    return;
  }
  if ('min_items' in descriptor && 'max_items' in descriptor &&
      descriptor.max_items < descriptor.min_items) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': max_items must be greater than or equal to min_items');
    return;
  }
  if ('format' in descriptor &&
      (descriptor.type !== 'string' || descriptor.format !== 'href')) {
    errors.push('invalid schema descriptor for ' + fieldPath + ': format must be href and requires type string');
    return;
  }

  if (!checkType(value, descriptor.type)) {
    errors.push(fieldPath + ' must be ' + descriptor.type);
    return;
  }

  if (descriptor.type === 'string') {
    if (descriptor.non_empty === true && value.trim().length === 0)
      errors.push(fieldPath + ' must be a non-empty string');
    if (Array.isArray(descriptor.enum) && !descriptor.enum.includes(value))
      errors.push(fieldPath + ' must be one of: ' + descriptor.enum.join(', '));
    if (descriptor.format === 'href') {
      const hasControlCharacters = /[\u0000-\u001f\u007f]/.test(value);
      const isRootPath = /^\/(?!\/)\S*$/.test(value);
      const isFragment = /^#[^\s#]+$/.test(value);
      const isMailto = /^mailto:[^\s@]+@[^\s@]+$/i.test(value);
      let isHttps = false;
      try {
        const parsed = new URL(value);
        isHttps = parsed.protocol === 'https:' && parsed.hostname.length > 0;
      } catch (_) {
        isHttps = false;
      }
      if (hasControlCharacters || !(isRootPath || isFragment || isMailto || isHttps))
        errors.push(fieldPath + ' must be a root-relative path, fragment, HTTPS URL, or mailto URL');
    }
  }

  if (descriptor.type === 'object') {
    const required = descriptor.required || {};
    const optional = descriptor.optional || {};

    for (const [field, nestedDescriptor] of Object.entries(required)) {
      const nestedPath = fieldPath + '.' + field;
      if (!(field in value)) {
        errors.push(nestedPath + ' is required');
      } else {
        validateValue(value[field], nestedDescriptor, nestedPath);
      }
    }

    for (const [field, nestedDescriptor] of Object.entries(optional)) {
      if (field in value)
        validateValue(value[field], nestedDescriptor, fieldPath + '.' + field);
    }

    const allowed = new Set([...Object.keys(required), ...Object.keys(optional)]);
    for (const field of Object.keys(value)) {
      if (!allowed.has(field))
        errors.push(fieldPath + ' has unknown field "' + field + '"');
    }
  }

  if (descriptor.type === 'array') {
    if (typeof descriptor.min_items === 'number' && value.length < descriptor.min_items)
      errors.push(fieldPath + ' must have at least ' + descriptor.min_items + ' item(s)');
    if (typeof descriptor.max_items === 'number' && value.length > descriptor.max_items)
      errors.push(fieldPath + ' must have at most ' + descriptor.max_items + ' item(s)');
    if (descriptor.items) {
      value.forEach(function(item, idx) {
        validateValue(item, descriptor.items, fieldPath + '[' + idx + ']');
      });
    }
  }
}

if (!Array.isArray(plan.pages) || plan.pages.length < 1) {
  errors.push('pages must be a non-empty array');
} else {
  plan.pages.forEach(function(p, i) {
    const tag = 'pages[' + i + ']';
    if (!p.id)    errors.push(tag + '.id is required');
    if (!p.title) errors.push(tag + '.title is required');
    if ('head' in p)
      validateHead(p.head, tag + '.head');
    if ('content' in p)
      errors.push(tag + '.content is no longer supported — use components: [{ type: prose, markdown: ... }]');
    if (!Array.isArray(p.components) || p.components.length === 0) {
      errors.push(tag + '.components must be a non-empty array');
    } else {
      let heroCount = 0;
      p.components.forEach(function(c, j) {
        const ctag = tag + '.components[' + j + ']';
        if (!c.type) {
          errors.push(ctag + '.type is required');
          return;
        }
        if (c.type === 'hero') {
          heroCount += 1;
          if (j !== 0)
            errors.push(ctag + ' hero must be the first component on the page');
        }
        const schema = catalog[c.type];
        if (!schema) {
          errors.push(ctag + '.type "' + c.type + '" is not a known component (see ' + componentsDir + '/CATALOG.md)');
          return;
        }
        const required = schema.required || {};
        for (const [field, descriptor] of Object.entries(required)) {
          if (!(field in c)) {
            errors.push(ctag + '.' + field + ' is required');
          } else {
            validateValue(c[field], descriptor, ctag + '.' + field);
          }
        }
        const optional = schema.optional || {};
        for (const [field, descriptor] of Object.entries(optional)) {
          if (field in c)
            validateValue(c[field], descriptor, ctag + '.' + field);
        }
        const allowed = new Set(['type', ...Object.keys(required), ...Object.keys(optional)]);
        for (const key of Object.keys(c)) {
          if (!allowed.has(key)) {
            errors.push(ctag + ' has unknown field "' + key + '" for component type "' + c.type + '"');
          }
        }
      });
      if (heroCount > 1)
        errors.push(tag + ' may contain at most one hero component');
    }
  });
}

// Commerce block (spec §2, §8): known provider, stripe-only checkout,
// integer minor-unit money.
const KNOWN_PROVIDERS = ['printful', 'manual'];
let commerceCheckoutEnabled = false;
if ('commerce' in plan) {
  const commerce = plan.commerce;
  if (!isObject(commerce)) {
    errors.push('commerce must be an object');
  } else {
    const allowed = new Set(['enabled', 'provider', 'currency', 'checkout', 'preview', 'shipping', 'fulfillment', 'printful']);
    for (const field of Object.keys(commerce)) {
      if (!allowed.has(field))
        errors.push('commerce has unknown field "' + field + '"');
    }
    if (typeof commerce.enabled !== 'boolean')
      errors.push('commerce.enabled must be a boolean');
    if (!KNOWN_PROVIDERS.includes(commerce.provider))
      errors.push('commerce.provider must be one of: ' + KNOWN_PROVIDERS.join(', ') + ' (got: ' + commerce.provider + ')');
    if (!(typeof commerce.currency === 'string' && /^[a-z]{3}$/.test(commerce.currency)))
      errors.push('commerce.currency must be a lowercase three-letter currency code, e.g. usd');
    if ('checkout' in commerce && commerce.checkout !== 'stripe')
      errors.push('commerce.checkout must be stripe (the only v1 value)');
    if ('preview' in commerce) {
      if (typeof commerce.preview !== 'boolean')
        errors.push('commerce.preview must be a boolean');
      if (!('checkout' in commerce))
        errors.push('commerce.preview requires commerce.checkout (preview only disables the checkout button)');
    }
    if ('shipping' in commerce) {
      if (!isObject(commerce.shipping)) {
        errors.push('commerce.shipping must be an object');
      } else {
        const allowedShipping = new Set(['flat_rate_minor', 'countries']);
        for (const field of Object.keys(commerce.shipping)) {
          if (!allowedShipping.has(field))
            errors.push('commerce.shipping has unknown field "' + field + '"');
        }
        if (!Number.isInteger(commerce.shipping.flat_rate_minor) || commerce.shipping.flat_rate_minor < 0)
          errors.push('commerce.shipping.flat_rate_minor must be a non-negative integer (minor currency units)');
        if ('countries' in commerce.shipping) {
          // Stripe shipping_address_collection needs explicit allowed_countries.
          const countries = commerce.shipping.countries;
          if (!Array.isArray(countries) || countries.length === 0 ||
              !countries.every(function(c) { return typeof c === 'string' && /^[A-Z]{2}$/.test(c); }))
            errors.push('commerce.shipping.countries must be a non-empty array of two-letter uppercase country codes, e.g. [US, CA]');
        }
      }
    }
    // The manual provider emails orders to the merchant; checkout cannot
    // fulfill without a destination.
    if ('fulfillment' in commerce) {
      if (!isObject(commerce.fulfillment)) {
        errors.push('commerce.fulfillment must be an object');
      } else {
        for (const field of Object.keys(commerce.fulfillment)) {
          if (field !== 'to' && field !== 'from')
            errors.push('commerce.fulfillment has unknown field "' + field + '"');
        }
        if (!(typeof commerce.fulfillment.to === 'string' && commerce.fulfillment.to.trim() !== ''))
          errors.push('commerce.fulfillment.to must be a non-empty string');
        if (!(typeof commerce.fulfillment.from === 'string' && commerce.fulfillment.from.trim() !== ''))
          errors.push('commerce.fulfillment.from must be a non-empty string');
      }
    } else if (commerce.provider === 'manual' && 'checkout' in commerce) {
      errors.push('commerce.fulfillment ({ to, from }) is required when provider is manual and checkout is set — the manual provider emails orders to the merchant');
    }
    // The printful provider curates products in the plan (spec §1, tier 1):
    // which sync products to sell, at what price, with what description.
    if ('printful' in commerce) {
      if (commerce.provider !== 'printful') {
        errors.push('commerce.printful is only valid when commerce.provider is printful (got: ' + commerce.provider + ')');
      } else if (!isObject(commerce.printful)) {
        errors.push('commerce.printful must be an object ({ store_id, products })');
      } else {
        const printful = commerce.printful;
        for (const field of Object.keys(printful)) {
          if (field !== 'store_id' && field !== 'products')
            errors.push('commerce.printful has unknown field "' + field + '"');
        }
        if (!Number.isInteger(printful.store_id) || printful.store_id <= 0)
          errors.push('commerce.printful.store_id must be a positive integer (Printful dashboard > Settings > Stores)');
        if (!Array.isArray(printful.products) || printful.products.length === 0) {
          errors.push('commerce.printful.products must be a non-empty array');
        } else {
          const seenSlugs = new Set();
          printful.products.forEach(function(entry, i) {
            const tag = 'commerce.printful.products[' + i + ']';
            if (!isObject(entry)) {
              errors.push(tag + ' must be an object');
              return;
            }
            const allowedEntry = new Set(['slug', 'printful_product_id', 'price_minor', 'description', 'name', 'color_order', 'active']);
            for (const field of Object.keys(entry)) {
              if (!allowedEntry.has(field))
                errors.push(tag + ' has unknown field "' + field + '"');
            }
            if (!(typeof entry.slug === 'string' && entry.slug.trim() !== '')) {
              errors.push(tag + '.slug must be a non-empty string');
            } else if (seenSlugs.has(entry.slug)) {
              errors.push(tag + '.slug duplicates "' + entry.slug + '"');
            } else {
              seenSlugs.add(entry.slug);
            }
            if (!Number.isInteger(entry.printful_product_id) || entry.printful_product_id <= 0)
              errors.push(tag + '.printful_product_id must be a positive integer (the sync product id)');
            if (!Number.isInteger(entry.price_minor) || entry.price_minor < 0)
              errors.push(tag + '.price_minor must be a non-negative integer (minor currency units)');
            if (!(typeof entry.description === 'string' && entry.description.trim() !== ''))
              errors.push(tag + '.description must be a non-empty string');
            if ('name' in entry && !(typeof entry.name === 'string' && entry.name.trim() !== ''))
              errors.push(tag + '.name must be a non-empty string');
            if ('color_order' in entry) {
              if (!Array.isArray(entry.color_order) || entry.color_order.length === 0 ||
                  !entry.color_order.every(function(c) { return typeof c === 'string' && c.trim() !== ''; }))
                errors.push(tag + '.color_order must be a non-empty array of non-empty strings');
            }
            if ('active' in entry && typeof entry.active !== 'boolean')
              errors.push(tag + '.active must be a boolean');
          });
        }
      }
    } else if (commerce.provider === 'printful') {
      errors.push('commerce.printful ({ store_id, products }) is required when provider is printful — commerce-sync.sh reads it to sync the catalog');
    }
    commerceCheckoutEnabled = commerce.enabled === true && commerce.checkout === 'stripe';
  }
}

// Commerce: a catalog component (or enabled checkout) requires a valid
// commerce/catalog.json next to the plan, and product filters must reference
// catalog slugs (spec §8).
const catalogComponents = [];
const personalizedComponents = [];
(plan.pages || []).forEach(function(p, i) {
  (Array.isArray(p.components) ? p.components : []).forEach(function(c, j) {
    if (c && c.type === 'catalog')
      catalogComponents.push({ component: c, tag: 'pages[' + i + '].components[' + j + ']' });
    if (c && c.type === 'personalized-product')
      personalizedComponents.push({ component: c, tag: 'pages[' + i + '].components[' + j + ']' });
  });
});

// A personalized-product page is a buy page — it has no meaning without a
// live checkout to send the token to (bbpp design §3).
if (personalizedComponents.length > 0 && !commerceCheckoutEnabled) {
  personalizedComponents.forEach(function(entry) {
    errors.push(entry.tag + ' (personalized-product) requires commerce.enabled: true with checkout: stripe');
  });
}

if (catalogComponents.length > 0 || personalizedComponents.length > 0 || commerceCheckoutEnabled) {
  const catalogPath = path.join(path.dirname(planPath), 'commerce', 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    const requiredBy = catalogComponents.length > 0 ? 'catalog component'
      : personalizedComponents.length > 0 ? 'personalized-product component'
      : 'commerce.checkout';
    errors.push(requiredBy + ' requires ' + catalogPath + ' — sync or hand-write the commerce catalog first');
  } else {
    let commerceCatalog = null;
    try {
      commerceCatalog = readCatalog(catalogPath);
    } catch (e) {
      errors.push('commerce/catalog.json: ' + e.message);
    }
    if (commerceCatalog !== null) {
      const catalogErrors = validateCatalog(commerceCatalog);
      catalogErrors.forEach(function(e) { errors.push('commerce/catalog.json: ' + e); });
      if (catalogErrors.length === 0) {
        const knownSlugs = new Set(commerceCatalog.products.map(function(p) { return p.slug; }));
        const bySlug = new Map(commerceCatalog.products.map(function(p) { return [p.slug, p]; }));
        catalogComponents.forEach(function(entry) {
          (Array.isArray(entry.component.products) ? entry.component.products : []).forEach(function(slug, k) {
            if (!knownSlugs.has(slug)) {
              errors.push(entry.tag + '.products[' + k + '] references unknown catalog slug: ' + slug);
            } else if (bySlug.get(slug).personalization) {
              // Personalization-required products have no meaning in a grid —
              // there is no token to sell against (bbpp design §7). The
              // default-all selection skips them silently in the resolver;
              // an explicit reference is a mistake worth a loud error.
              errors.push(entry.tag + '.products[' + k + '] references "' + slug + '" which requires personalization — use a personalized-product component instead');
            }
          });
        });
        personalizedComponents.forEach(function(entry) {
          const slug = entry.component.product;
          if (typeof slug !== 'string' || slug === '') return; // schema validation already flagged it
          const product = bySlug.get(slug);
          if (!product) {
            errors.push(entry.tag + '.product references unknown catalog slug: ' + slug);
          } else {
            if (!product.personalization)
              errors.push(entry.tag + '.product references "' + slug + '" which does not declare personalization');
            if (product.active !== true)
              errors.push(entry.tag + '.product references inactive product: ' + slug);
          }
        });
        if (commerceCheckoutEnabled) {
          // Checkout resolves (slug, optionValues) → fulfillment_ref, so every
          // sellable product needs at least one variant (spec §6, Decision 9).
          commerceCatalog.products.forEach(function(product) {
            if (product.active === true && !(Array.isArray(product.variants) && product.variants.length > 0))
              errors.push('commerce/catalog.json: product "' + product.slug + '" is active with checkout enabled but has no variants — checkout cannot resolve a fulfillment_ref');
          });
        }
      }
    }
  }
}

// Proxies (proxy-functions design §1): each entry renders an authenticated
// pass-through Function at functions/<mount>/[[path]].js.
const RESERVED_MOUNTS = ['api', 'assets', 'commerce'];
const RESERVED_SECRET_NAMES = [
  'TURNSTILE_SECRET_KEY', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET', 'PRINTFUL_API_KEY',
];
const FORBIDDEN_PROXY_HEADERS = ['authorization', 'host', 'cookie'];
if ('proxies' in plan) {
  if (!Array.isArray(plan.proxies) || plan.proxies.length === 0) {
    errors.push('proxies must be a non-empty array');
  } else {
    if (plan.proxies.length > 10)
      errors.push('proxies must contain at most 10 entries');
    const seenMounts = new Set();
    const pageIds = new Set((plan.pages || []).map(function(p) { return p.id; }));
    plan.proxies.forEach(function(proxy, i) {
      const tag = 'proxies[' + i + ']';
      if (!isObject(proxy)) {
        errors.push(tag + ' must be an object');
        return;
      }
      const allowed = new Set(['mount', 'upstream', 'headers', 'secret', 'authenticated', 'turnstile']);
      for (const field of Object.keys(proxy)) {
        if (!allowed.has(field))
          errors.push(tag + ' has unknown field "' + field + '"');
      }

      if (typeof proxy.mount !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(proxy.mount)) {
        errors.push(tag + '.mount must be a short lowercase path segment matching ^[a-z][a-z0-9-]{0,31}$');
      } else {
        if (RESERVED_MOUNTS.includes(proxy.mount))
          errors.push(tag + '.mount "' + proxy.mount + '" is reserved for clodsite-generated content');
        if (seenMounts.has(proxy.mount))
          errors.push(tag + '.mount duplicates "' + proxy.mount + '"');
        seenMounts.add(proxy.mount);
        if (pageIds.has(proxy.mount))
          errors.push(tag + '.mount "' + proxy.mount + '" collides with a page id — the proxy Function would shadow the page');
      }

      if (typeof proxy.upstream !== 'string' || !/^https:\/\//.test(proxy.upstream)) {
        errors.push(tag + '.upstream must be an absolute https:// URL');
      } else {
        let parsed = null;
        try { parsed = new URL(proxy.upstream); } catch (_) {}
        if (!parsed || parsed.hostname.length === 0) {
          errors.push(tag + '.upstream must be an absolute https:// URL');
        } else if (proxy.upstream.includes('?') || proxy.upstream.includes('#')) {
          errors.push(tag + '.upstream must not contain a query or fragment');
        }
      }

      if ('headers' in proxy) {
        if (!isObject(proxy.headers) || Object.keys(proxy.headers).length === 0) {
          errors.push(tag + '.headers must be a non-empty object');
        } else {
          for (const [name, value] of Object.entries(proxy.headers)) {
            if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name))
              errors.push(tag + '.headers has an invalid header name "' + name + '"');
            else if (FORBIDDEN_PROXY_HEADERS.includes(name.toLowerCase()))
              errors.push(tag + '.headers must not set "' + name + '" — credentials travel via secret/authenticated, never the plan');
            if (typeof value !== 'string' || value.trim() === '' || /[\r\n]/.test(value))
              errors.push(tag + '.headers.' + name + ' must be a non-empty single-line string');
          }
        }
      }

      for (const field of ['authenticated', 'turnstile']) {
        if (!(field in proxy)) continue;
        if (!Array.isArray(proxy[field]) || proxy[field].length === 0) {
          errors.push(tag + '.' + field + ' must be a non-empty array of "<METHOD> <subpath>" routes');
          continue;
        }
        const seenRoutes = new Set();
        proxy[field].forEach(function(route, k) {
          const rtag = tag + '.' + field + '[' + k + ']';
          if (typeof route !== 'string' || !/^(GET|POST) [A-Za-z0-9_\-.~/]+$/.test(route)) {
            errors.push(rtag + ' must be "<METHOD> <subpath>" with METHOD GET or POST, e.g. "POST issue"');
            return;
          }
          const subpath = route.split(' ')[1];
          if (subpath.split('/').some(function(s) { return s === '' || s === '.' || s === '..'; }))
            errors.push(rtag + ' subpath must be plain path segments without leading/trailing slashes or dot segments');
          if (field === 'turnstile' && !route.startsWith('POST '))
            errors.push(rtag + ' turnstile routes must use POST — the token travels in the form body');
          if (seenRoutes.has(route))
            errors.push(rtag + ' duplicates "' + route + '"');
          seenRoutes.add(route);
        });
      }

      const hasAuthenticated = Array.isArray(proxy.authenticated) && proxy.authenticated.length > 0;
      if ('secret' in proxy) {
        if (typeof proxy.secret !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(proxy.secret)) {
          errors.push(tag + '.secret must be an env-var name matching ^[A-Z][A-Z0-9_]{2,63}$');
        } else if (RESERVED_SECRET_NAMES.includes(proxy.secret) || proxy.secret.startsWith('CLOUDFLARE_')) {
          errors.push(tag + '.secret "' + proxy.secret + '" is a reserved name');
        }
        if (!hasAuthenticated)
          errors.push(tag + '.secret has no effect without authenticated routes');
      } else if (hasAuthenticated) {
        errors.push(tag + '.secret is required when authenticated routes are declared — it names the env var holding the bearer credential');
      }
    });
  }
}

// certificate-award ↔ proxy pairing (proxy-functions design §3): the award
// flow only works through a proxy whose "POST issue" route is guarded by
// both Turnstile and authentication — an unguarded issue route is
// bot-spammable, and an unauthenticated one can't reach the upstream at all.
const proxiesByMount = new Map();
(Array.isArray(plan.proxies) ? plan.proxies : []).forEach(function(proxy) {
  if (isObject(proxy) && typeof proxy.mount === 'string')
    proxiesByMount.set(proxy.mount, proxy);
});
(plan.pages || []).forEach(function(p, i) {
  const awards = [];
  (Array.isArray(p.components) ? p.components : []).forEach(function(c, j) {
    if (c && c.type === 'certificate-award')
      awards.push({ component: c, tag: 'pages[' + i + '].components[' + j + ']' });
  });
  if (awards.length > 1)
    errors.push('pages[' + i + '] may contain at most one certificate-award component — each renders its own Turnstile widget');
  awards.forEach(function(entry) {
    const mount = entry.component.proxy;
    if (typeof mount !== 'string' || mount.trim() === '') return; // schema validation already flagged it
    const proxy = proxiesByMount.get(mount);
    if (!proxy) {
      errors.push(entry.tag + '.proxy references unknown proxy mount: ' + mount);
      return;
    }
    const guarded = function(field) {
      return Array.isArray(proxy[field]) && proxy[field].includes('POST issue');
    };
    if (!guarded('turnstile') || !guarded('authenticated'))
      errors.push(entry.tag + '.proxy "' + mount + '" must guard "POST issue" with both turnstile and authenticated — an unguarded issue route is bot-spammable; an unauthenticated one cannot reach the upstream');
  });
});

if (!plan.nav || !Array.isArray(plan.nav.order) || plan.nav.order.length < 1)
  errors.push('nav.order must be a non-empty array');

if (plan.nav && Array.isArray(plan.nav.order)) {
  const pageIds = (plan.pages || []).map(function(p) { return p.id; });
  plan.nav.order.forEach(function(id) {
    if (!pageIds.includes(id))
      errors.push('nav.order references unknown page id: ' + id);
  });
}

if (errors.length > 0) {
  console.error('Plan validation failed (' + errors.length + ' error(s)):');
  errors.forEach(function(e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
console.log('✓ Plan is valid (' + plan.pages.length + ' pages, style: ' + plan.style + ')');
