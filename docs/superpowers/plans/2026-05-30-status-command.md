# `/status` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `[SCRIPT]`-only `/status` command that cross-references local `sites/*/build-plan.yaml` with live Cloudflare Pages state and renders a table showing each site's URL, custom domain, and last deploy time.

**Architecture:** A single `scripts/status.sh` that (1) reads local slugs via js-yaml into a temp file, (2) fetches live state via `wrangler pages project list --json` into a second temp file, and (3) joins and renders the table in one Node.js heredoc. Non-Clodsite CF projects appear as a footer line; local sites with no CF project show `⚠ not deployed`.

**Tech Stack:** bash, Node.js (inline via `node << 'NODEJS'` heredoc), js-yaml (already a project dependency), wrangler CLI.

---

## File Map

| File | Change |
|------|--------|
| `scripts/test/fixtures/status-cf-projects.json` | Create — mock wrangler JSON for tests |
| `scripts/status.sh` | Create — main script |
| `scripts/test/run-tests.sh` | Modify — add `assert_contains` helper + status tests |
| `CLAUDE.md` | Modify — add `/status` command entry after `/teardown` |
| `ROADMAP.md` | Modify — move `/status` from Pending to Completed |

---

## Task 1: Create CF fixture for status tests

**Files:**
- Create: `scripts/test/fixtures/status-cf-projects.json`

The fixture represents three Cloudflare Pages projects:
- `site-alpha` — Clodsite-managed, has a custom domain
- `site-beta` — Clodsite-managed, no custom domain
- `external-project` — not managed by Clodsite (no local `sites/` dir)

- [ ] **Step 1: Create the fixture file**

```json
[
  {
    "Project Name": "site-alpha",
    "Project Domains": "site-alpha.pages.dev, alpha.example.com",
    "Git Provider": "No",
    "Last Modified": "2 days ago"
  },
  {
    "Project Name": "site-beta",
    "Project Domains": "site-beta.pages.dev",
    "Git Provider": "No",
    "Last Modified": "1 week ago"
  },
  {
    "Project Name": "external-project",
    "Project Domains": "external-project.pages.dev",
    "Git Provider": "Yes",
    "Last Modified": "1 month ago"
  }
]
```

Save to `scripts/test/fixtures/status-cf-projects.json`.

- [ ] **Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('scripts/test/fixtures/status-cf-projects.json','utf8')); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add scripts/test/fixtures/status-cf-projects.json
git commit -m "test: add CF fixture for /status tests"
```

---

## Task 2: Write `scripts/status.sh`

**Files:**
- Create: `scripts/status.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITES_DIR="${SITES_DIR:-sites}"

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
SITES_DIR="$SITES_DIR" node << 'NODEJS' > "$LOCAL_TMP"
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
```

Save to `scripts/status.sh`.

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/status.sh
```

- [ ] **Step 3: Smoke-test against real state**

```bash
bash scripts/status.sh
```

Expected: table showing clodsite, ndig, nopolabs with their live URLs and custom domains, plus a footer line listing the non-Clodsite CF projects (anchovy, medicarion, mtw4, bbpp, hmc).

- [ ] **Step 4: Commit**

```bash
git add scripts/status.sh
git commit -m "feat: add scripts/status.sh for /status command"
```

---

## Task 3: Add status tests to `run-tests.sh`

**Files:**
- Modify: `scripts/test/run-tests.sh`

Four test cases:
1. Empty `SITES_DIR` → prints "No Clodsite-managed sites found", exits 0
2. Two local sites both matched in CF → table includes both slugs
3. One local site not in CF → output contains "not deployed"
4. CF-only project present → output contains footer line

The PATH-mock technique is used: a fake `wrangler` binary in a temp dir is prepended to `$PATH`, so the real wrangler is never called during tests.

- [ ] **Step 1: Add `assert_contains` helper**

Find the block of `assert_*` helpers near the top of `scripts/test/run-tests.sh` (just before the `SITE_DIR=$(mktemp -d)` line) and add after the last helper:

```bash
assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected to contain: $needle)"
    FAIL=$((FAIL + 1))
  fi
}
```

- [ ] **Step 2: Add status tests at the end of `run-tests.sh`, before the Results section**

Find the `# ── Results` line and insert the following status test block immediately before it:

```bash
# ── status.sh ─────────────────────────────────────────────────────────────────
echo ""
echo "=== status.sh ==="

# Shared mock wrangler setup
MOCK_BIN=$(mktemp -d)
CF_FIXTURE="$(pwd)/scripts/test/fixtures/status-cf-projects.json"
cat > "$MOCK_BIN/wrangler" << WRANGLER_EOF
#!/usr/bin/env bash
cat "$CF_FIXTURE"
WRANGLER_EOF
chmod +x "$MOCK_BIN/wrangler"
ORIGINAL_PATH="$PATH"
export PATH="$MOCK_BIN:$PATH"

# Shared temp SITES_DIR for status tests
STATUS_SITES_DIR=$(mktemp -d)

# Test 1: empty SITES_DIR → exits 0, prints guidance message
EMPTY_SITES=$(mktemp -d)
OUTPUT=$(SITES_DIR="$EMPTY_SITES" bash scripts/status.sh 2>/dev/null); STATUS_EXIT=$?
assert_exit "empty SITES_DIR exits 0" 0 "$STATUS_EXIT"
assert_contains "empty SITES_DIR prints guidance" "No Clodsite-managed sites found" "$OUTPUT"
rm -rf "$EMPTY_SITES"

# Set up fixtures: site-alpha (matched + custom domain), site-beta (matched, no custom domain),
# site-gamma (no CF match → not deployed)
mkdir -p "$STATUS_SITES_DIR/site-alpha" "$STATUS_SITES_DIR/site-beta" "$STATUS_SITES_DIR/site-gamma"
printf 'slug: site-alpha\nname: Site Alpha\noverview: Alpha.\nstyle: minimal\ntone: professional\npages:\n  - id: home\n    title: Home\n    content: Hello.\nnav:\n  order:\n    - home\ncontact:\n  enabled: false\nbuild_notes: ""\n' > "$STATUS_SITES_DIR/site-alpha/build-plan.yaml"
printf 'slug: site-beta\nname: Site Beta\noverview: Beta.\nstyle: minimal\ntone: professional\npages:\n  - id: home\n    title: Home\n    content: Hello.\nnav:\n  order:\n    - home\ncontact:\n  enabled: false\nbuild_notes: ""\n' > "$STATUS_SITES_DIR/site-beta/build-plan.yaml"
printf 'slug: site-gamma\nname: Site Gamma\noverview: Gamma.\nstyle: minimal\ntone: professional\npages:\n  - id: home\n    title: Home\n    content: Hello.\nnav:\n  order:\n    - home\ncontact:\n  enabled: false\nbuild_notes: ""\n' > "$STATUS_SITES_DIR/site-gamma/build-plan.yaml"

OUTPUT=$(SITES_DIR="$STATUS_SITES_DIR" bash scripts/status.sh 2>/dev/null)

# Test 2: matched sites appear in table
assert_contains "site-alpha appears in table" "site-alpha" "$OUTPUT"
assert_contains "site-beta appears in table" "site-beta" "$OUTPUT"
assert_contains "site-alpha custom domain shown" "alpha.example.com" "$OUTPUT"

# Test 3: unmatched local site shows not-deployed marker
assert_contains "site-gamma shows not deployed" "not deployed" "$OUTPUT"

# Test 4: CF-only project appears in footer
assert_contains "non-Clodsite project listed in footer" "external-project" "$OUTPUT"

rm -rf "$STATUS_SITES_DIR" "$MOCK_BIN"
export PATH="$ORIGINAL_PATH"
```

- [ ] **Step 3: Run the tests**

```bash
bash scripts/test/run-tests.sh
```

Expected: all pre-existing tests pass, plus 6 new status tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add scripts/test/run-tests.sh
git commit -m "test: add status.sh test cases"
```

---

## Task 4: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `/status` entry**

Find the `/teardown` section (ends with the closing triple-backtick after `[LLM]    Interpret error if teardown fails`). Insert the following block immediately after that closing backtick and before the `---` separator:

```markdown
### `/status` — `[SCRIPT]`
Show the status of all Clodsite-managed sites, cross-referenced against live Cloudflare Pages state.

```
[SCRIPT] bash scripts/status.sh
```
```

- [ ] **Step 2: Verify formatting**

```bash
grep -A6 "### \`/status\`" CLAUDE.md
```

Expected output:
```
### `/status` — `[SCRIPT]`
Show the status of all Clodsite-managed sites, cross-referenced against live Cloudflare Pages state.

\`\`\`
[SCRIPT] bash scripts/status.sh
\`\`\`
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add /status command to CLAUDE.md"
```

---

## Task 5: Update `ROADMAP.md`

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Move `/status` entry from Pending to Completed**

In `ROADMAP.md`, find the Pending section entry:

```markdown
### The `/status` command

A read-only command that cross-references local `sites/` with live Cloudflare
Pages state. For each site it shows the Pages project name, production URL,
custom domain (if any), and last deployed timestamp — pulled from
`wrangler pages project list` and matched against `sites/*/site-spec.json`.
Also surfaces mismatches: a local site with no Pages project, or a deployed URL
that differs from what's in the spec. Useful once multiple sites are in flight.
```

Delete that block from the Pending section. Then add the following entry to the Completed section (after the last completed entry, before the `---` separator):

```markdown
### The `/status` command
Shipped May 2026. A read-only `[SCRIPT]` command that cross-references local
`sites/` with live Cloudflare Pages state. For each site it shows the
production URL, custom domain (if any), and last deploy timestamp — pulled from
`wrangler pages project list --json` and matched against each site's
`build-plan.yaml`. Flags local sites with no live Cloudflare Pages project as
"not deployed". Lists any Cloudflare Pages projects that exist outside
Clodsite's `sites/` as a footer line. Accepts a `SITES_DIR` env override for
testability.
```

- [ ] **Step 2: Verify Pending section no longer mentions /status**

```bash
grep -c "The \`/status\` command" ROADMAP.md
```

Expected output: `1` (appears only in Completed now).

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark /status command shipped in ROADMAP"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: N passed, 0 failed` where N ≥ (prior count + 6).

- [ ] **Step 2: Run `/status` for real**

```bash
bash scripts/status.sh
```

Expected: table with clodsite, ndig, nopolabs rows; footer listing anchovy, medicarion, mtw4, bbpp, hmc.

- [ ] **Step 3: Verify SITES_DIR override works**

```bash
SITES_DIR=/tmp bash scripts/status.sh
```

Expected: `No Clodsite-managed sites found. Run /interview first.`
