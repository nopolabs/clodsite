#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "site/site-spec.json" ]; then
  echo "Error: site/site-spec.json not found. Run /interview first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));

// Build nav pages array with correct hrefs
// First page in nav.order gets href '/', all others get /[id]
const firstId = spec.nav.order[0];
const navPages = spec.nav.order.map(id => {
  const page = spec.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/'
  };
});

// Suppress the extra contact link if a 'contact' page is already in the nav
const hasContactPage = spec.pages.some(p => p.id === 'contact');

const siteData = {
  name: spec.site.name,
  purpose: spec.site.purpose,
  audience: spec.site.audience,
  tone: spec.site.tone,
  style: spec.site.style,
  nav: {
    order: spec.nav.order,
    show_contact_link: spec.nav.show_contact_link && !hasContactPage,
    pages: navPages
  },
  contact: spec.contact || { enabled: false, type: 'email', email: '' }
};

require('fs').mkdirSync('scaffold/src/_data', { recursive: true });
require('fs').writeFileSync(
  'scaffold/src/_data/site.json',
  JSON.stringify(siteData, null, 2)
);
console.log('✓ scaffold/src/_data/site.json written');
console.log('  Site: ' + siteData.name + ' | Style: ' + siteData.style + ' | Pages: ' + siteData.nav.pages.length);
"
