#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/build-plan.json" ]; then
  echo "Error: ${SITE_DIR}/build-plan.json not found. Run /plan first."
  exit 1
fi

node -e "
const plan = JSON.parse(require('fs').readFileSync('${SITE_DIR}/build-plan.json', 'utf8'));

const firstId = plan.nav.order[0];
const navPages = plan.nav.order.map(id => {
  const page = plan.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/'
  };
});

const contact = plan.contact || {};
const siteData = {
  name: plan.name,
  style: plan.style,
  nav: {
    order: plan.nav.order,
    pages: navPages
  },
  contact: contact.enabled
    ? { enabled: true, email: contact.email }
    : { enabled: false }
};

require('fs').mkdirSync('${SITE_DIR}/src/_data', { recursive: true });
require('fs').writeFileSync(
  '${SITE_DIR}/src/_data/site.json',
  JSON.stringify(siteData, null, 2)
);
console.log('✓ ${SITE_DIR}/src/_data/site.json written');
console.log('  Site: ' + siteData.name + ' | Style: ' + siteData.style + ' | Pages: ' + siteData.nav.pages.length);
"
