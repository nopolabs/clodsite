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
    const allowed = new Set(['enabled', 'provider', 'currency', 'checkout', 'preview', 'shipping']);
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
        for (const field of Object.keys(commerce.shipping)) {
          if (field !== 'flat_rate_minor')
            errors.push('commerce.shipping has unknown field "' + field + '"');
        }
        if (!Number.isInteger(commerce.shipping.flat_rate_minor) || commerce.shipping.flat_rate_minor < 0)
          errors.push('commerce.shipping.flat_rate_minor must be a non-negative integer (minor currency units)');
      }
    }
    commerceCheckoutEnabled = commerce.enabled === true && commerce.checkout === 'stripe';
  }
}

// Commerce: a catalog component (or enabled checkout) requires a valid
// commerce/catalog.json next to the plan, and product filters must reference
// catalog slugs (spec §8).
const catalogComponents = [];
(plan.pages || []).forEach(function(p, i) {
  (Array.isArray(p.components) ? p.components : []).forEach(function(c, j) {
    if (c && c.type === 'catalog')
      catalogComponents.push({ component: c, tag: 'pages[' + i + '].components[' + j + ']' });
  });
});

if (catalogComponents.length > 0 || commerceCheckoutEnabled) {
  const catalogPath = path.join(path.dirname(planPath), 'commerce', 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    const requiredBy = catalogComponents.length > 0 ? 'catalog component' : 'commerce.checkout';
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
        catalogComponents.forEach(function(entry) {
          (Array.isArray(entry.component.products) ? entry.component.products : []).forEach(function(slug, k) {
            if (!knownSlugs.has(slug))
              errors.push(entry.tag + '.products[' + k + '] references unknown catalog slug: ' + slug);
          });
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
