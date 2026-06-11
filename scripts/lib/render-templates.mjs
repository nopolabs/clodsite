// Renders per-page Eleventy templates from a build-plan.yaml.
// Invoked by scripts/render-templates.sh:
//   node scripts/lib/render-templates.mjs <plan-path> <site-dir>
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { readCatalog } from './validate-catalog.mjs';
import { resolveCatalogComponent } from './resolve-catalog.mjs';

const [planPath, siteDir] = process.argv.slice(2);
if (!planPath || !siteDir) {
  console.error('Usage: node render-templates.mjs <plan-path> <site-dir>');
  process.exit(2);
}

const plan = yaml.load(fs.readFileSync(planPath, 'utf8'));

// Catalog components are resolved here — the offline plan ⋈ catalog join.
// Loaded lazily so non-store sites never touch commerce paths.
let commerceCatalog = null;
function getCommerceCatalog() {
  if (commerceCatalog === null) {
    commerceCatalog = readCatalog(path.join(siteDir, 'commerce', 'catalog.json'));
  }
  return commerceCatalog;
}

function resolvePageComponents(page) {
  return (page.components || []).map(function (component) {
    if (component.type !== 'catalog') return component;
    try {
      const currency = (plan.commerce && plan.commerce.currency) || 'usd';
      return resolveCatalogComponent(component, getCommerceCatalog(), currency);
    } catch (error) {
      console.error('Error: page ' + page.id + ': ' + error.message);
      process.exit(1);
    }
  });
}

const firstId = plan.nav.order[0];
const siteHead = plan.head || {};
const customDomain = typeof plan.custom_domain === 'string' ? plan.custom_domain.trim() : '';
const canonicalOrigin = customDomain ? 'https://' + customDomain : '';

function escapeForYaml(s) {
  if (/^[A-Za-z0-9 _\-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function absoluteImageUrl(src, pageId) {
  if (!src) return '';
  if (/^https:\/\//i.test(src)) return src;
  if (canonicalOrigin) return canonicalOrigin + src;
  console.warn('  ⚠ page ' + pageId + ' share image is root-relative but custom_domain is empty; social image tags omitted');
  return '';
}

for (const page of plan.pages) {
  const permalink = (page.id === firstId) ? '/' : '/' + page.id + '/';
  const filename  = (page.id === firstId) ? 'index.njk' : page.id + '.njk';
  const pageHeadInput = page.head || {};
  const resolvedImage = pageHeadInput.image || siteHead.image || null;
  const description = pageHeadInput.description || siteHead.description || plan.overview;
  const fullTitle = page.title + ' | ' + plan.name;
  const canonicalUrl = canonicalOrigin ? canonicalOrigin + permalink : '';
  const imageUrl = resolvedImage ? absoluteImageUrl(resolvedImage.src, page.id) : '';
  const websiteId = canonicalOrigin ? canonicalOrigin + '/#website' : '';
  let structuredData = null;

  if (canonicalUrl) {
    const website = {
      '@type': 'WebSite',
      '@id': websiteId,
      name: plan.name,
      url: canonicalOrigin + '/',
      description: siteHead.description || plan.overview
    };
    const webPage = {
      '@type': 'WebPage',
      '@id': canonicalUrl + '#webpage',
      url: canonicalUrl,
      name: fullTitle,
      description,
      isPartOf: { '@id': websiteId }
    };
    if (imageUrl) {
      webPage.primaryImageOfPage = {
        '@type': 'ImageObject',
        url: imageUrl,
        caption: resolvedImage.alt
      };
    }
    structuredData = {
      '@context': 'https://schema.org',
      '@graph': [website, webPage]
    };
  }

  const pageHead = {
    title: fullTitle,
    description,
    canonical_url: canonicalUrl,
    image_url: imageUrl,
    image_alt: imageUrl ? resolvedImage.alt : '',
    twitter_card: imageUrl ? 'summary_large_image' : 'summary',
    structured_data: structuredData
  };

  const components = resolvePageComponents(page);

  let body = '';
  for (const [componentIndex, component] of components.entries()) {
    if (!component.type) {
      console.error('Error: page ' + page.id + ' has a component with no type');
      process.exit(1);
    }
    body += '<div class="c-component c-component--' + component.type + '">\n';
    body += '{% set component = pageComponents[' + componentIndex + '] %}\n';
    body += '{% include "' + component.type + '/component.njk" %}\n';
    body += '</div>\n';
  }

  const out =
    '---\n' +
    'layout: base.njk\n' +
    'pageTitle: ' + escapeForYaml(page.title) + '\n' +
    'pageHead: ' + JSON.stringify(pageHead) + '\n' +
    'pageComponents: ' + JSON.stringify(components) + '\n' +
    'permalink: ' + permalink + '\n' +
    '---\n' +
    body;

  fs.writeFileSync(path.join(siteDir, 'src', filename), out);
  console.log('  ✓ ' + filename);
}

console.log('✓ Rendered ' + plan.pages.length + ' page template(s) to ' + siteDir + '/src/');
