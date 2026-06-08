#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

PLAN="$PLAN" COMPONENTS_DIR="$COMPONENTS_DIR" SITE_DIR="$SITE_DIR" node <<'NODE'
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const plan = yaml.load(fs.readFileSync(process.env.PLAN, 'utf8'));
const componentsDir = process.env.COMPONENTS_DIR;
const siteDir = process.env.SITE_DIR;
const functionsDir = path.join(siteDir, 'functions');

let found = null;
for (const page of plan.pages || []) {
  for (const component of page.components || []) {
    if (component.type === 'resend-form') {
      found = component;
      break;
    }
  }
  if (found) break;
}

if (!found) {
  const apiDir = path.join(functionsDir, 'api');
  const contactFile = path.join(apiDir, 'contact.js');
  if (fs.existsSync(contactFile)) {
    fs.rmSync(contactFile);
    if (fs.readdirSync(apiDir).length === 0) fs.rmdirSync(apiDir);
    if (fs.existsSync(functionsDir) && fs.readdirSync(functionsDir).length === 0) {
      fs.rmdirSync(functionsDir);
    }
    console.log('✓ Removed stale functions/api/contact.js (no resend-form in plan)');
  }
  process.exit(0);
}

const templatePath = path.join(componentsDir, 'resend-form', 'function.template.js');
if (!fs.existsSync(templatePath)) {
  console.error('Error: ' + templatePath + ' not found.');
  process.exit(1);
}

const config = {
  to: found.to,
  from: found.from,
  subject: (found.subject || '').trim() || ('Message from ' + plan.name),
  fields: (found.fields || []).map((field) => ({
    name: field.name,
    required: !!field.required,
    maxLength: field.maxLength || 10000,
  })),
};

const source = fs.readFileSync(templatePath, 'utf8')
  .replace('{{CONFIG}}', JSON.stringify(config));

const outDir = path.join(functionsDir, 'api');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'contact.js'), source);
console.log('✓ Rendered functions/api/contact.js (to: ' + config.to + ')');
NODE
