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

function escapeForYaml(s) {
  if (/^[A-Za-z0-9 _\-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

for (const page of plan.pages) {
  const permalink = (page.id === firstId) ? '/' : '/' + page.id + '/';
  const filename  = (page.id === firstId) ? 'index.njk' : page.id + '.njk';

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
    'permalink: ' + permalink + '\n' +
    '---\n' +
    body;

  fs.writeFileSync(path.join('${SITE_DIR}', 'src', filename), out);
  console.log('  ✓ ' + filename);
}

console.log('✓ Rendered ' + plan.pages.length + ' page template(s) to ${SITE_DIR}/src/');
"
