#!/usr/bin/env bash
set -euo pipefail

export SITES_DIR="${SITES_DIR:-sites}"

# ── Credentials ───────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi
set -a; source .env; set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set in .env. Run /setup first."
  exit 1
fi

# ── Temp files ────────────────────────────────────────────────────────────────
LOCAL_TMP=$(mktemp)
CF_TMP=$(mktemp)
CF_ERR_TMP=$(mktemp)
trap 'rm -f "$LOCAL_TMP" "$CF_TMP" "$CF_ERR_TMP"' EXIT

# ── Discover local Clodsite sites ─────────────────────────────────────────────
node << 'NODEJS' > "$LOCAL_TMP"
const fs = require('fs');
const yaml = require('js-yaml');
const sitesDir = process.env.SITES_DIR;
let dirs = [];
try {
  dirs = fs.readdirSync(sitesDir).filter(d => {
    try { fs.accessSync(sitesDir + '/' + d + '/build-plan.yaml'); return true; }
    catch { return false; }
  });
} catch { /* sitesDir missing or unreadable */ }
const sites = dirs.map(d => {
  const plan = yaml.load(fs.readFileSync(sitesDir + '/' + d + '/build-plan.yaml', 'utf8'));
  return { dir: d, slug: plan.slug };
});
process.stdout.write(JSON.stringify(sites) + '\n');
NODEJS

LOCAL_SITES=$(cat "$LOCAL_TMP")
if [ "$LOCAL_SITES" = "[]" ]; then
  echo "No Clodsite-managed sites found. Run /interview first."
  exit 0
fi

# ── Live Cloudflare Pages state ───────────────────────────────────────────────
if ! wrangler pages project list --json > "$CF_TMP" 2> "$CF_ERR_TMP"; then
  echo "Error: wrangler pages project list failed:"
  cat "$CF_ERR_TMP"
  exit 1
fi

# ── Join and render ───────────────────────────────────────────────────────────
LOCAL_JSON="$LOCAL_TMP" CF_JSON="$CF_TMP" node << 'NODEJS'
const fs = require('fs');

const localSites = JSON.parse(fs.readFileSync(process.env.LOCAL_JSON, 'utf8'));
const cfProjects = JSON.parse(fs.readFileSync(process.env.CF_JSON, 'utf8'));

const cfByName = {};
cfProjects.forEach(p => { cfByName[p['Project Name']] = p; });

const clodSlugs = new Set(localSites.map(s => s.slug));
const others = cfProjects.map(p => p['Project Name']).filter(n => !clodSlugs.has(n));

const rows = localSites.map(site => {
  const cf = cfByName[site.slug];
  if (!cf) {
    return { site: site.slug, url: '—', customDomain: '—', lastDeploy: '⚠ not deployed' };
  }
  const domains = cf['Project Domains'].split(', ');
  const url = domains.find(d => d.endsWith('.pages.dev')) || '—';
  const customDomain = domains.find(d => !d.endsWith('.pages.dev')) || '—';
  return { site: site.slug, url, customDomain, lastDeploy: cf['Last Modified'] };
});

const headers = ['Site', 'URL', 'Custom Domain', 'Last Deploy'];
const keys = ['site', 'url', 'customDomain', 'lastDeploy'];
const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[keys[i]].length)));

const sep = (l, m, r, c) => l + widths.map(w => c.repeat(w + 2)).join(m) + r;
const row = cells => '│ ' + cells.map((c, i) => c.padEnd(widths[i])).join(' │ ') + ' │';

console.log(sep('┌', '┬', '┐', '─'));
console.log(row(headers));
console.log(sep('├', '┼', '┤', '─'));
rows.forEach(r => console.log(row([r.site, r.url, r.customDomain, r.lastDeploy])));
console.log(sep('└', '┴', '┘', '─'));

if (others.length > 0) {
  console.log('');
  console.log('Other Cloudflare Pages projects (not managed by Clodsite): ' + others.join(', '));
}
NODEJS
