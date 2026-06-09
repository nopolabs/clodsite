#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

mkdir -p "${SITE_DIR}/src"

node -e "
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const plan = yaml.load(fs.readFileSync('${PLAN}', 'utf8'));

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

  let body = '';
  for (const component of (page.components || [])) {
    if (!component.type) {
      console.error('Error: page ' + page.id + ' has a component with no type');
      process.exit(1);
    }
    body += '{% set component = ' + JSON.stringify(component) + ' %}\n';
    body += '{% include \"' + component.type + '/component.njk\" %}\n';
  }

  const out =
    '---\n' +
    'layout: base.njk\n' +
    'pageTitle: ' + escapeForYaml(page.title) + '\n' +
    'pageHead: ' + JSON.stringify(pageHead) + '\n' +
    'permalink: ' + permalink + '\n' +
    '---\n' +
    body;

  fs.writeFileSync(path.join('${SITE_DIR}', 'src', filename), out);
  console.log('  ✓ ' + filename);
}

console.log('✓ Rendered ' + plan.pages.length + ' page template(s) to ${SITE_DIR}/src/');
"
