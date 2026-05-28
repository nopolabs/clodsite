# Multi-site Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded `site/` workspace with `sites/<slug>/` so one Clodsite repo can build and manage multiple sites, routing all scripts and commands through a `SITE_DIR` environment variable.

**Architecture:** All scripts replace hardcoded `site/` paths with `${SITE_DIR}`. Commands export `SITE_DIR=sites/<site-name>` once before invoking scripts; all subprocesses (bash and Eleventy's Node.js process) inherit it. A one-time auto-migration script moves an existing `site/` to `sites/<slug>/` on first v2 command.

**Tech Stack:** Bash scripts, Node.js (inline), Eleventy 3.x, Claude Code custom command markdown files.

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Modify | `scripts/test/run-tests.sh` | Use `SITE_DIR` temp dir; add `assert_dir_exists`; add migration tests |
| Create | `scripts/migrate-site.sh` | Auto-migrate `site/` → `sites/<slug>/` |
| Modify | `scripts/validate-spec.sh` | Guard + use `${SITE_DIR}/site-spec.json` |
| Modify | `scripts/write-spec.sh` | Guard + use `${SITE_DIR}/site-spec.json` |
| Modify | `scripts/apply-theme.sh` | Guard + use `${SITE_DIR}/site-spec.json` |
| Modify | `scripts/write-site-json.sh` | Guard + use `${SITE_DIR}/site-spec.json` |
| Modify | `scaffold/.eleventy.js` | Read `process.env.SITE_DIR`; throw if unset |
| Modify | `scripts/build-site.sh` | Guard + use `${SITE_DIR}/dist` and `${SITE_DIR}/images` |
| Modify | `scripts/deploy.sh` | Guard + use `${SITE_DIR}/site-spec.json` and `${SITE_DIR}/dist` |
| Modify | `scripts/deploy-finalize.sh` | Guard + use `${SITE_DIR}/` paths |
| Modify | `scripts/check-artifacts.sh` | Check `sites/` directory instead of `site/` |
| Modify | `scripts/clean.sh` | Accept site slug arg; delete `sites/<slug>/` |
| Modify | `.claude/commands/interview.md` | Require site-name arg; migration preflight; `SITE_DIR` export |
| Modify | `.claude/commands/plan.md` | Require site-name arg; migration preflight; `SITE_DIR` export |
| Modify | `.claude/commands/build.md` | Require site-name arg; migration preflight; `SITE_DIR` export |
| Modify | `.claude/commands/deploy.md` | Require site-name arg; migration preflight; `SITE_DIR` export |
| Modify | `.claude/commands/setup.md` | Update artifacts check; update clean to accept site name |

---

## Task 1: Update test harness + add migration test stubs

**Files:**
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Write new run-tests.sh**

Replace the entire file with the following. The key changes: (1) use an isolated temp `SITE_DIR` instead of creating `site/`, (2) add `assert_dir_exists`, (3) save/restore both `site/` and `sites/` so migration tests don't clobber real data, (4) add migration test cases that will fail until Task 2.

```bash
#!/usr/bin/env bash
set -uo pipefail

PASS=0
FAIL=0

assert_exit() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local desc="$1" file="$2"
  if [ -f "$file" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc ($file not found)"
    FAIL=$((FAIL + 1))
  fi
}

assert_dir_exists() {
  local desc="$1" dir="$2"
  if [ -d "$dir" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc ($dir not found)"
    FAIL=$((FAIL + 1))
  fi
}

# ── Isolated SITE_DIR for all script tests ────────────────────────────────────
export SITE_DIR
SITE_DIR=$(mktemp -d)

# ── Backup real site/ and sites/ so migration tests don't clobber them ────────
SITE_BACKUP=""
if [ -d "site" ]; then
  SITE_BACKUP=$(mktemp -d)
  cp -r site/. "$SITE_BACKUP/"
fi

SITES_BACKUP=""
if [ -d "sites" ]; then
  SITES_BACKUP=$(mktemp -d)
  cp -r sites/. "$SITES_BACKUP/"
fi

cleanup() {
  rm -rf "$SITE_DIR"
  rm -rf site sites
  if [ -n "$SITE_BACKUP" ]; then
    mkdir -p site && cp -r "$SITE_BACKUP/." site/ && rm -rf "$SITE_BACKUP"
  fi
  if [ -n "$SITES_BACKUP" ]; then
    mkdir -p sites && cp -r "$SITES_BACKUP/." sites/ && rm -rf "$SITES_BACKUP"
  fi
}
trap cleanup EXIT

# ── validate-spec.sh ──────────────────────────────────────────────────────────
echo "=== validate-spec.sh ==="

cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "valid spec passes" 0 $?

cp scripts/test/fixtures/invalid-missing-field.json "${SITE_DIR}/site-spec.json"
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "missing field exits 1" 1 $?

cp scripts/test/fixtures/invalid-bad-enum.json "${SITE_DIR}/site-spec.json"
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "bad enum exits 1" 1 $?

# ── write-site-json.sh ────────────────────────────────────────────────────────
echo ""
echo "=== write-site-json.sh ==="

cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
bash scripts/write-site-json.sh > /dev/null 2>&1; assert_exit "write-site-json exits 0" 0 $?
assert_file_exists "scaffold/src/_data/site.json created" "scaffold/src/_data/site.json"

# ── apply-theme.sh ────────────────────────────────────────────────────────────
echo ""
echo "=== apply-theme.sh ==="

cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
bash scripts/apply-theme.sh > /dev/null 2>&1; assert_exit "apply-theme exits 0 for valid style" 0 $?

# ── migrate-site.sh ───────────────────────────────────────────────────────────
echo ""
echo "=== migrate-site.sh ==="

# No site/ present → exits 0 silently
bash scripts/migrate-site.sh > /dev/null 2>&1; assert_exit "no site/ present → exits 0" 0 $?

# Happy path: site/ with valid spec → migrates to sites/nopo-labs/
mkdir -p site
cp scripts/test/fixtures/valid-spec.json site/site-spec.json
bash scripts/migrate-site.sh > /dev/null 2>&1; assert_exit "valid site/ migrates successfully" 0 $?
assert_dir_exists "sites/nopo-labs/ created" "sites/nopo-labs"
if [ ! -d "site" ]; then
  echo "  ✓ site/ removed after migration"
  PASS=$((PASS + 1))
else
  echo "  ✗ site/ still exists after migration"
  FAIL=$((FAIL + 1))
fi

# Destination already exists → exits 1
mkdir -p site
cp scripts/test/fixtures/valid-spec.json site/site-spec.json
# sites/nopo-labs/ still exists from the migration above
bash scripts/migrate-site.sh > /dev/null 2>&1; assert_exit "dest exists → exits 1" 1 $?
rm -rf site sites  # clean up migration test artifacts

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

- [ ] **Step 2: Run tests — expect failures on the existing script tests**

```bash
bash scripts/test/run-tests.sh
```

Expected: `validate-spec.sh`, `write-site-json.sh`, and `apply-theme.sh` tests fail (SITE_DIR not yet wired into those scripts). `migrate-site.sh` tests fail (script doesn't exist). That's correct — these are the failing tests that drive Tasks 2–4.

- [ ] **Step 3: Commit**

```bash
git add scripts/test/run-tests.sh
git commit -m "test: update harness to use SITE_DIR; add migration test cases"
```

---

## Task 2: Create migrate-site.sh

**Files:**
- Create: `scripts/migrate-site.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Auto-migrate a v1 site/ directory to sites/<slug>/.
# Idempotent: exits 0 silently if site/site-spec.json does not exist.

if [ ! -f "site/site-spec.json" ]; then
  exit 0
fi

SLUG=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('site/site-spec.json', 'utf8'));
const slug = spec.site.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+\$/, '');
console.log(slug);
")

DEST="sites/$SLUG"

if [ -d "$DEST" ]; then
  echo "Error: $DEST already exists. Cannot auto-migrate site/ — move it manually to avoid overwriting."
  exit 1
fi

mkdir -p sites
echo "Migrating site/ → $DEST..."
mv site/ "$DEST/"
echo "✓ Migrated: site/ → $DEST/"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/migrate-site.sh
```

- [ ] **Step 3: Run migration tests only**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A 20 "migrate-site.sh"
```

Expected output:
```
=== migrate-site.sh ===
  ✓ no site/ present → exits 0
  ✓ valid site/ migrates successfully
  ✓ sites/nopo-labs/ created
  ✓ site/ removed after migration
  ✓ dest exists → exits 1
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-site.sh
git commit -m "feat: add migrate-site.sh — auto-migrate site/ to sites/<slug>/"
```

---

## Task 3: Update validate-spec.sh, write-spec.sh, apply-theme.sh

**Files:**
- Modify: `scripts/validate-spec.sh`
- Modify: `scripts/write-spec.sh`
- Modify: `scripts/apply-theme.sh`

These three scripts all just need a SITE_DIR guard at the top and their hardcoded `site/` references replaced with `${SITE_DIR}`.

- [ ] **Step 1: Update validate-spec.sh**

Replace lines 1–4 (the shebang, set, and SPEC assignment) with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
SPEC="${1:-${SITE_DIR}/site-spec.json}"
```

The rest of the file is unchanged (it already uses `$SPEC`).

- [ ] **Step 2: Update write-spec.sh**

Replace lines 1–4 with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
SPEC="${SITE_DIR}/site-spec.json"
```

Also update the success echo on line 24 — change `site/site-spec.json` to `${SITE_DIR}/site-spec.json`:

```bash
echo "✓ Spec written to ${SITE_DIR}/site-spec.json"
```

- [ ] **Step 3: Update apply-theme.sh**

Replace lines 1–8 with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found."
  exit 1
fi

STYLE=$(node -e "const s=JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json','utf8')); console.log(s.site.style)")
```

The rest of the file is unchanged.

- [ ] **Step 4: Run tests — expect these three suites to pass now**

```bash
bash scripts/test/run-tests.sh
```

Expected: `validate-spec.sh` (3 pass), `write-site-json.sh` (still fails — not yet updated), `apply-theme.sh` (1 pass), `migrate-site.sh` (5 pass). Total failures should only be the `write-site-json.sh` suite.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-spec.sh scripts/write-spec.sh scripts/apply-theme.sh
git commit -m "feat: wire SITE_DIR into validate-spec, write-spec, apply-theme"
```

---

## Task 4: Update write-site-json.sh

**Files:**
- Modify: `scripts/write-site-json.sh`

- [ ] **Step 1: Rewrite write-site-json.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found. Run /interview first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));

const firstId = spec.nav.order[0];
const navPages = spec.nav.order.map(id => {
  const page = spec.pages.find(p => p.id === id);
  return {
    id: page.id,
    title: page.title,
    href: (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/'
  };
});

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
```

- [ ] **Step 2: Run full test suite — expect all tests to pass**

```bash
bash scripts/test/run-tests.sh
```

Expected output:
```
=== validate-spec.sh ===
  ✓ valid spec passes
  ✓ missing field exits 1
  ✓ bad enum exits 1

=== write-site-json.sh ===
  ✓ write-site-json exits 0
  ✓ scaffold/src/_data/site.json created

=== apply-theme.sh ===
  ✓ apply-theme exits 0 for valid style

=== migrate-site.sh ===
  ✓ no site/ present → exits 0
  ✓ valid site/ migrates successfully
  ✓ sites/nopo-labs/ created
  ✓ site/ removed after migration
  ✓ dest exists → exits 1

Results: 11 passed, 0 failed
```

- [ ] **Step 3: Commit**

```bash
git add scripts/write-site-json.sh
git commit -m "feat: wire SITE_DIR into write-site-json"
```

---

## Task 5: Update .eleventy.js

**Files:**
- Modify: `scaffold/.eleventy.js`

- [ ] **Step 1: Update .eleventy.js**

Replace the entire file:

```js
module.exports = function(eleventyConfig) {
  const siteDir = process.env.SITE_DIR;
  if (!siteDir) {
    throw new Error('SITE_DIR is not set. Export it before running Eleventy.');
  }

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy({ [`${siteDir}/images`]: "images" });

  return {
    dir: {
      input: "src",
      output: `${siteDir}/dist`,
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk"
  };
};
```

- [ ] **Step 2: Smoke-test Eleventy loads the config without error**

```bash
SITE_DIR=sites/ndig bash scripts/build-site.sh 2>&1 | head -5
```

Expected: should fail with "SITE_DIR is not set" for `build-site.sh` (not yet updated) — but the point is Eleventy won't error on the config. We'll verify a full build after Task 6.

Actually run this simpler check instead — just verify the config doesn't throw on require:

```bash
SITE_DIR=/tmp/test-eleventy node -e "require('./scaffold/.eleventy.js')({addPassthroughCopy:()=>{}})" 2>&1
```

Expected: exits 0, no output (the config is a function; calling it with a stub eleventyConfig validates the require path works).

- [ ] **Step 3: Commit**

```bash
git add scaffold/.eleventy.js
git commit -m "feat: wire SITE_DIR into .eleventy.js — required env var, no fallback"
```

---

## Task 6: Update build-site.sh

**Files:**
- Modify: `scripts/build-site.sh`

- [ ] **Step 1: Rewrite build-site.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

echo "Building site with Eleventy..."
echo ""

if [ ! -d "scaffold/node_modules" ]; then
  echo "Installing scaffold dependencies (first build)..."
  (cd scaffold && npm install)
  echo ""
fi

rm -rf "${SITE_DIR}/dist"
mkdir -p "${SITE_DIR}/images"

(cd scaffold && npx @11ty/eleventy 2>&1)

echo ""

if [ ! -d "${SITE_DIR}/dist" ] || [ -z "$(ls -A "${SITE_DIR}/dist" 2>/dev/null)" ]; then
  echo "Error: Build produced an empty ${SITE_DIR}/dist/. Check Eleventy output above."
  exit 1
fi

PAGE_COUNT=$(find "${SITE_DIR}/dist" -name "*.html" | wc -l | tr -d ' ')
echo "✓ Build complete. $PAGE_COUNT HTML file(s) in ${SITE_DIR}/dist/"
echo ""
SITE_NAME=$(basename "${SITE_DIR}")
echo "Next step: run /deploy ${SITE_NAME}"
```

- [ ] **Step 2: Verify the ndig site still builds correctly**

First, confirm `sites/ndig/` exists (from the auto-migration that should have happened when you ran tests — or migrate manually if needed):

```bash
ls sites/
```

If `ndig` is not there yet (it might still be in `site/`), run:

```bash
bash scripts/migrate-site.sh
```

Then do a full build:

```bash
export SITE_DIR=sites/ndig
bash scripts/write-site-json.sh && bash scripts/apply-theme.sh && bash scripts/build-site.sh
```

Expected: Eleventy builds successfully, `sites/ndig/dist/` contains HTML files.

```
✓ scaffold/src/_data/site.json written
✓ Theme: minimal (scaffold/src/css/themes/minimal.css exists)
Building site with Eleventy...
...
✓ Build complete. 2 HTML file(s) in sites/ndig/dist/
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-site.sh
git commit -m "feat: wire SITE_DIR into build-site.sh"
```

---

## Task 7: Update deploy.sh + deploy-finalize.sh

**Files:**
- Modify: `scripts/deploy.sh`
- Modify: `scripts/deploy-finalize.sh`

- [ ] **Step 1: Rewrite deploy.sh**

```bash
#!/usr/bin/env bash
# Note: not using set -e here — we capture wrangler exit code manually

set -uo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
MODE="${1:-}"

# ── --local: serve locally, no Cloudflare token needed ───────────────────────
if [ "$MODE" = "--local" ]; then
  echo "Starting local dev server at http://localhost:8080 (Ctrl-C to stop)..."
  echo ""
  cd scaffold && exec npm run serve
fi

# ── Cloudflare Pages deploy ──────────────────────────────────────────────────

if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source .env
set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set in .env. Run /setup first."
  exit 1
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID not set in .env. Run /setup first."
  exit 1
fi

if [ ! -f "${SITE_DIR}/site-spec.json" ]; then
  echo "Error: ${SITE_DIR}/site-spec.json not found. Run /interview first."
  exit 1
fi

if [ ! -d "${SITE_DIR}/dist" ] || [ -z "$(ls -A "${SITE_DIR}/dist" 2>/dev/null)" ]; then
  echo "Error: ${SITE_DIR}/dist/ is empty or missing. Run /build first."
  exit 1
fi

SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
const slug = spec.site.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+\$/, '');
console.log(slug);
")

echo "Ensuring Pages project '$SITE_NAME' exists in account $CLOUDFLARE_ACCOUNT_ID..."
CREATE_OUT=$(wrangler pages project create "$SITE_NAME" --production-branch main 2>&1)
CREATE_EXIT=$?
if [ "$CREATE_EXIT" -eq 0 ]; then
  echo "✓ Project created."
elif echo "$CREATE_OUT" | grep -qi "already exists\|already taken"; then
  echo "✓ Project already exists in this account."
else
  echo "Error: could not create Pages project '$SITE_NAME'."
  echo "$CREATE_OUT"
  exit 1
fi
echo ""

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

mkdir -p scripts

wrangler pages deploy "${SITE_DIR}/dist" --project-name "$SITE_NAME" \
  > scripts/.deploy-output 2> scripts/.deploy-error
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > scripts/.deploy-exit
exit $WRANGLER_EXIT
```

- [ ] **Step 2: Rewrite deploy-finalize.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "scripts/.deploy-output" ]; then
  echo "Error: No deployment output found. Run /deploy first."
  exit 1
fi

SITE_NAME=$(node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
const slug = spec.site.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/,'');
console.log(slug);
")

PROD_URL="https://${SITE_NAME}.pages.dev"

BUILD_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' scripts/.deploy-output | tail -1)

node -e "
const spec = JSON.parse(require('fs').readFileSync('${SITE_DIR}/site-spec.json', 'utf8'));
if (!spec.meta) spec.meta = {};
spec.meta.deployed_url = '$PROD_URL';
require('fs').writeFileSync('${SITE_DIR}/site-spec.json', JSON.stringify(spec, null, 2) + '\n');
"

sed "s|{{DEPLOY_URL}}|$PROD_URL|g; s|{{SITE_NAME}}|$SITE_NAME|g" \
  scripts/templates/NEXT-STEPS.template.md > "${SITE_DIR}/NEXT-STEPS.md"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Your site is live!                          ║"
echo "║                                              ║"
printf  "║  %-44s ║\n" "$PROD_URL"
echo "╚══════════════════════════════════════════════╝"
echo ""
if [ -n "$BUILD_URL" ] && [ "$BUILD_URL" != "$PROD_URL" ]; then
  echo "This build's snapshot URL: $BUILD_URL"
  echo ""
fi
echo "See ${SITE_DIR}/NEXT-STEPS.md for next steps."
```

- [ ] **Step 3: Confirm test suite still passes**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 11 passed, 0 failed`

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.sh scripts/deploy-finalize.sh
git commit -m "feat: wire SITE_DIR into deploy.sh and deploy-finalize.sh"
```

---

## Task 8: Update check-artifacts.sh + clean.sh

**Files:**
- Modify: `scripts/check-artifacts.sh`
- Modify: `scripts/clean.sh`

- [ ] **Step 1: Rewrite check-artifacts.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Reports whether previous build(s) left artifacts in sites/.
# Used by /setup to offer a clean-or-keep choice. Read-only.

if [ -d "sites" ] && [ -n "$(ls -A sites 2>/dev/null)" ]; then
  echo "ARTIFACTS_FOUND"
  ls -1 sites/
else
  echo "NO_ARTIFACTS"
fi
```

- [ ] **Step 2: Rewrite clean.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Remove a site's build artifacts.
#
# Usage: bash scripts/clean.sh <site-slug>
#
# Destructive: deletes sites/<slug>/ entirely and clears generated scaffold
# files. Intentionally NOT auto-allowed in .claude/settings.json.

SITE="${1:?Usage: bash scripts/clean.sh <site-slug>}"
SITE_DIR="sites/$SITE"

if [ ! -d "$SITE_DIR" ]; then
  echo "Error: $SITE_DIR not found."
  exit 1
fi

echo "Cleaning $SITE_DIR..."
rm -rf "$SITE_DIR"
rm -f scaffold/src/*.njk
rm -f scaffold/src/_data/site.json
echo "✓ Cleaned: $SITE_DIR and scaffold/src/ artifacts"
```

- [ ] **Step 3: Verify check-artifacts.sh detects the ndig site**

```bash
bash scripts/check-artifacts.sh
```

Expected (assuming `sites/ndig/` exists):
```
ARTIFACTS_FOUND
ndig
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-artifacts.sh scripts/clean.sh
git commit -m "feat: update check-artifacts and clean.sh for sites/<slug>/ layout"
```

---

## Task 9: Update interview.md command

**Files:**
- Modify: `.claude/commands/interview.md`

- [ ] **Step 1: Rewrite interview.md**

```markdown
Conduct the Clodsite site interview. You are helping someone build a website. Be conversational, professional, and efficient. Ask one question at a time and wait for the answer before proceeding.

---

**Get site name.** Look at what the user typed after `/interview`. That word or slug is the site name. If they typed `/interview` with nothing after it, respond:

> "Please provide a site name: `/interview <site-name>` — e.g., `/interview acme-corp`"

And stop.

The site name must be a valid slug: lowercase letters, numbers, and hyphens only (e.g., `my-site`, `acme-corp`, `ndig`). If the user typed a name with spaces or capitals, suggest the lowercase-hyphenated version and ask them to confirm before continuing.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

If it prints a migration message, tell the user what happened.

---

**[SCRIPT]** Confirm the site doesn't already exist:

```bash
[ ! -d "sites/<site-name>" ] || echo "EXISTS"
```

If it prints `EXISTS`, tell the user:

> "`sites/<site-name>/` already exists. Use `/plan <site-name>` or `/build <site-name>` to continue it. Use `/setup clean <site-name>` to start over."

And stop.

---

**[SCRIPT]** Create the site directory:

```bash
mkdir -p sites/<site-name>/images
```

---

**Shortcut:** If the user points you to an answers file (e.g. "read from docs/demo/interview-answers.md"), read that file and synthesize the spec directly from it — skip the interactive questions entirely.

---

**[LLM]** Ask the following questions in order. One at a time. The site name is already known (`<site-name>`) — do NOT ask question 1 again; start from question 2:

1. ~~What is the name of your site or brand?~~ *(already provided as `<site-name>`)*
2. In one sentence, what does this site do or offer?
3. Who is this site for?
4. What tone should the writing have? *(professional / casual / technical / friendly)*
5. What visual personality fits best? *(minimal / professional / bold)* — briefly describe each if they ask.
6. What pages do you need? List 2–5 page names. *(e.g., Home, About, Services, Contact)*
7. For each page you listed: what is the purpose of this page in one sentence?
8. Do you have copy ready for the pages, or should I draft it? *(provided / draft)*
9. *(If provided)* Please share the content for each page — paste it or describe it.
   *(If draft)* For each page, describe in a few sentences what it should say.
10. Do you want a contact method on the site? If yes, what email address should visitors use? *(Visitors get a mailto link. A submittable contact form is a v2 feature — not yet available.)*
11. *(Optional)* Do you have a custom domain, or is a `*.pages.dev` URL fine for now?

---

**[LLM]** Once all answers are collected, synthesize them into a single JSON object. The `site.name` field should be the human-readable version of the site name (may differ from the slug). Follow this schema exactly — no extra fields, no comments, no trailing commas:

```json
{
  "site": {
    "name": "...",
    "purpose": "...",
    "audience": "...",
    "tone": "professional|casual|technical|friendly",
    "style": "minimal|professional|bold"
  },
  "pages": [
    {
      "id": "lowercase-slug",
      "title": "Display Name",
      "purpose": "one sentence",
      "content_outline": "user copy or draft directive"
    }
  ],
  "nav": {
    "order": ["page-id-1", "page-id-2"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "address@example.com"
  },
  "domain": {
    "custom": false,
    "hostname": ""
  },
  "content_status": "provided|draft",
  "meta": {
    "generated_at": "ISO-8601 timestamp of right now",
    "spec_version": "1.0"
  }
}
```

Rules:
- `pages[].id` must be lowercase, no spaces, hyphens only (e.g., `home`, `about`, `our-work`)
- `nav.order` must list every page id
- `contact.type` is always `"email"` in v1 (a submittable form is a v2 feature)
- If `contact.enabled = false`, set `type: "email"` and `email: ""`
- If `domain.custom = false`, set `hostname: ""`
- `content_status` = `"provided"` if user supplied copy; `"draft"` if Claude should write it

Write the JSON to `sites/<site-name>/site-spec.json`. Use the Write tool. First run `mkdir -p sites/<site-name>` if the directory doesn't already exist. The file should contain only the JSON — no markdown fences, no explanation.

---

**[SCRIPT]** Run:

```bash
SITE_DIR=sites/<site-name> bash scripts/write-spec.sh
```

This validates the JSON is parseable and pretty-prints it in place.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/interview.md
git commit -m "feat: update /interview command for multi-site — requires site-name arg"
```

---

## Task 10: Update plan.md command

**Files:**
- Modify: `.claude/commands/plan.md`

- [ ] **Step 1: Rewrite plan.md**

```markdown
Generate the Clodsite build plan from the approved spec.

---

**Get site name.** Look at what the user typed after `/plan`. If no site name was provided:

> "Please provide a site name: `/plan <site-name>` — e.g., `/plan acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[SCRIPT]** Validate the spec:

```bash
SITE_DIR=sites/<site-name> bash scripts/validate-spec.sh
```

If this exits with errors, print them clearly to the user and stop. Do not proceed until the spec is valid. The user can edit `sites/<site-name>/site-spec.json` directly or re-run `/interview <site-name>`.

---

**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate the build plan as markdown with these sections:

## Site Overview
Name, purpose, audience, tone, and style. One short paragraph.

## Pages
One section per page. For each:
- **[page title]** — `[page id]`
- Purpose: (from spec)
- Content:
  - If `content_status = "provided"`: use `content_outline` as-is
  - If `content_status = "draft"`: generate complete, publish-ready copy using `content_outline` as your brief. Write real sentences. Match the site tone. This is the copy that will appear on the live site.

## Navigation
Confirm the nav order. Note whether the contact link appears in the nav.

## Contact
How contact is handled: email address shown, contact form, or disabled.

## Build Notes
Anything unusual about this site that `/build` should know (e.g., specific layout needs, contact form handling).

---

Write the complete plan markdown to `sites/<site-name>/build-plan.md`. Use the Write tool. The file should contain the markdown above — no extra commentary.

---

Tell the user: "Review `sites/<site-name>/build-plan.md` — check the page copy and structure. When ready, run `/build <site-name>`."
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/plan.md
git commit -m "feat: update /plan command for multi-site — requires site-name arg"
```

---

## Task 11: Update build.md command

**Files:**
- Modify: `.claude/commands/build.md`

- [ ] **Step 1: Rewrite build.md**

```markdown
Build the Clodsite static site from the approved spec and build plan.

---

**Get site name.** Look at what the user typed after `/build`. If no site name was provided:

> "Please provide a site name: `/build <site-name>` — e.g., `/build acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[SCRIPT]** Write structural site data:

```bash
SITE_DIR=sites/<site-name> bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
SITE_DIR=sites/<site-name> bash scripts/apply-theme.sh
```

---

**[LLM]** Read `sites/<site-name>/site-spec.json` and `sites/<site-name>/build-plan.md`.

Generate an Eleventy Nunjucks template for each page listed in `sites/<site-name>/site-spec.json pages[]`.

**Template rules:**
- The first page in `nav.order` gets `permalink: /` in its front matter and is saved as `scaffold/src/index.njk`
- All other pages get `permalink: /[page-id]/` (with a **trailing slash** — Eleventy v3 requires it for directory-style permalinks) and are saved as `scaffold/src/[page-id].njk`
- Every template uses `layout: base.njk` and sets `pageTitle` to the page's display title
- Write page content directly as HTML — do not use `{{ site.* }}` references for copy. Use site data references only for structural elements you need from the layout (those are already in `base.njk`)
- Use semantic HTML: `<h1>` for the main page heading, `<p>` for paragraphs, `<section>` to group content blocks
- Use the copy from `sites/<site-name>/build-plan.md` exactly as written. Do not shorten, rewrite, or summarize.
- **Images:** place image files in `sites/<site-name>/images/` and reference them as `/images/<filename>` in `<img>` tags. Eleventy copies that directory to the deployed site.
- **Page-specific CSS:** if a page needs custom styling (e.g. a gallery grid), put it in a `<style>` block **inside the page content body**, immediately after the closing `---` of the front matter. The front matter must be the very first thing in the file. **Never modify the theme files** in `scaffold/src/css/themes/`.

**Template format:**

```
---
layout: base.njk
pageTitle: [page title from spec]
permalink: [/ for first page, /[id]/ for others — trailing slash required]
---
[full HTML content from sites/<site-name>/build-plan.md]
```

Use the Write tool to create each file at its exact path.

---

**If `contact.enabled = true`**, also write `scaffold/src/contact.njk` (contact is always a mailto link in v1):

```nunjucks
---
layout: base.njk
pageTitle: Contact
permalink: /contact/
---
<section class="contact-section">
  <h1>Get in Touch</h1>
  <p>Reach us at: <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a></p>
</section>
```

---

**[SCRIPT]** Run the Eleventy build:

```bash
SITE_DIR=sites/<site-name> bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `sites/<site-name>/dist/`. Fix the template(s) and re-run this script.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/build.md
git commit -m "feat: update /build command for multi-site — requires site-name arg"
```

---

## Task 12: Update deploy.md + setup.md commands

**Files:**
- Modify: `.claude/commands/deploy.md`
- Modify: `.claude/commands/setup.md`

- [ ] **Step 1: Rewrite deploy.md**

```markdown
Deploy the built Clodsite site to Cloudflare Pages, or preview it locally.

---

**Get site name.** Look at what the user typed after `/deploy`. Examples: `/deploy acme-corp` or `/deploy acme-corp local`. Extract the site name (first word after `/deploy` that isn't `local`). If no site name was provided:

> "Please provide a site name: `/deploy <site-name>` — e.g., `/deploy acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**If the user typed `/deploy <site-name> local`:**

**[SCRIPT]** Build and serve locally:

```bash
SITE_DIR=sites/<site-name> bash scripts/deploy.sh --local
```

This builds the site and starts the Eleventy dev server at `http://localhost:8080`. No Cloudflare token needed. Press Ctrl-C to stop.

Stop here — do not run the Cloudflare deploy steps below.

---

**[SCRIPT]** Run the deploy script:

```bash
SITE_DIR=sites/<site-name> bash scripts/deploy.sh
```

This reads `.env`, runs `wrangler pages deploy`, and captures the output.

---

**If `deploy.sh` exits with a non-zero code:**

**[LLM]** Read `scripts/.deploy-error`. Interpret the error and explain clearly:
- What went wrong
- Exactly how to fix it

Common cases:
- **Authentication error:** Token has expired or lacks permissions. Run `/setup` to re-enter the token.
- **Project name conflict:** A Pages project with this slug already exists under a different account. Edit `site.name` in `sites/<site-name>/site-spec.json` and re-run `/deploy <site-name>`.
- **dist/ missing:** Run `/build <site-name>` first.
- **Wrangler not found:** Run `npm install -g wrangler`.

Do not attempt to re-run deploy automatically. Print the fix suggestion and stop.

---

**If `deploy.sh` exits with code 0:**

**[SCRIPT]** Finalize the deployment:

```bash
SITE_DIR=sites/<site-name> bash scripts/deploy-finalize.sh
```

This parses the live URL, writes it to `sites/<site-name>/site-spec.json`, generates `sites/<site-name>/NEXT-STEPS.md`, and prints the URL.
```

- [ ] **Step 2: Rewrite setup.md**

```markdown
Set up Clodsite with your Cloudflare credentials.

---

**If the user typed `/setup clean`:**

**[SCRIPT]** Check what sites exist:

```bash
bash scripts/check-artifacts.sh
```

If it prints `NO_ARTIFACTS`, tell the user there's nothing to clean and stop.

If it prints `ARTIFACTS_FOUND` (followed by a list of site slugs), ask:

> "Which site would you like to clean? (This deletes all build artifacts for that site.)"
> `<list of site slugs>`

Wait for the user's answer. Then:

```bash
bash scripts/clean.sh <chosen-site-slug>
```

Then continue with the normal setup steps below.

---

**If the user typed `/setup clean <site-name>`:**

**[SCRIPT]** Clean directly:

```bash
bash scripts/clean.sh <site-name>
```

Then continue with the normal setup steps below.

---

**[SCRIPT]** Check for artifacts from previous builds:

```bash
bash scripts/check-artifacts.sh
```

If it prints `NO_ARTIFACTS`, skip ahead to the wrangler check below.

If it prints `ARTIFACTS_FOUND` (followed by a listing of site slugs), tell the user what was found and ask:

> "Found sites from previous builds in `sites/`: `<slugs>`. Would you like to **keep** them and continue, or **clean** a specific site?"
>
> (You can also run `/setup clean <site-name>` to skip this prompt.)

- If they say **clean**: ask which site, run `bash scripts/clean.sh <site-name>`, then continue below.
- If they say **keep**: continue below.

---

**[SCRIPT]** Check wrangler is installed (offers to install if missing):

```bash
bash scripts/setup.sh --check
```

If this exits with an error, resolve it before continuing.

---

**[SCRIPT]** Check whether a working token already exists:

```bash
bash scripts/setup.sh --verify
```

- If this **exits 0**, a valid token is already in `.env`. Tell the user setup is already complete and they can run `/interview <site-name>`. **Stop here — do not ask for a token.**
- If this **exits non-zero** (no `.env`, or the token is invalid/expired), continue to the next step.

---

**[LLM]** Ask the user:

> "Please paste your Cloudflare API token. You can create one at https://dash.cloudflare.com/profile/api-tokens — it needs **Cloudflare Pages: Edit** permission."

Wait for their reply.

---

**[LLM]** Ask the user:

> "Please paste your Cloudflare Account ID. You can find it in the Cloudflare dashboard — it's the 32-character hex string in the URL after you log in: `dash.cloudflare.com/<account-id>`."

Wait for their reply.

---

**Shortcut:** If the user points you to a credentials file, read the token and account ID from it directly — skip the two prompts above.

**[LLM]** Write both values to `.env` using the Write tool. The file should contain exactly:

```
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ACCOUNT_ID=<account-id>
```

Replace `<token>` and `<account-id>` with what the user provided. No extra lines, no quotes around values.

**Never display the full token or account ID in the chat.** When confirming what was written, show only the first 6 characters followed by `…` — e.g. `cfut_p1…` and `a35fd4…`.

---

**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission.

When it succeeds, tell the user setup is complete and they can run `/interview <site-name>`.
```

- [ ] **Step 3: Run full test suite one final time**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 11 passed, 0 failed`

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/deploy.md .claude/commands/setup.md
git commit -m "feat: update /deploy and /setup commands for multi-site"
```

---

## Task 13: Update CLAUDE.md + end-to-end smoke test

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the command table in CLAUDE.md**

In the "Getting Started" section, update the command table and all `site/` path references to reflect the new `sites/<name>/` layout. Replace the table:

```markdown
| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token |
| 2 | `/interview <site-name>` | 10-question session → `sites/<site-name>/site-spec.json` |
| 3 | `/plan <site-name>` | Review and approve copy → `sites/<site-name>/build-plan.md` |
| 4 | `/build <site-name>` | Generate templates + Eleventy build → `sites/<site-name>/dist/` |
| 5 | `/deploy <site-name>` | Ship to Cloudflare Pages → live URL |
```

And update the example in each command section in CLAUDE.md to use `sites/<site-name>/` paths rather than `site/`.

- [ ] **Step 2: End-to-end smoke test — rebuild the ndig site**

Confirm the full pipeline works with the migrated ndig site:

```bash
export SITE_DIR=sites/ndig
bash scripts/validate-spec.sh
bash scripts/write-site-json.sh
bash scripts/apply-theme.sh
bash scripts/build-site.sh
```

Expected final line: `✓ Build complete. 2 HTML file(s) in sites/ndig/dist/`

Open `sites/ndig/dist/index.html` in a browser or run:
```bash
SITE_DIR=sites/ndig bash scripts/deploy.sh --local
```

Confirm the site renders correctly at `http://localhost:8080`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for multi-site workspace layout"
```

---

## Self-review checklist

- [x] **Spec coverage:**
  - Directory structure (`sites/<slug>/`) — covered in Tasks 3–8 (all scripts)
  - `SITE_DIR` env var threading — covered in Tasks 3–8
  - `.eleventy.js` parameterization — Task 5
  - Command file updates (`/interview`, `/plan`, `/build`, `/deploy`, `/setup`) — Tasks 9–12
  - Auto-migration (`migrate-site.sh`) — Task 2
  - Migration preflight in commands — Tasks 9–12 (each command calls `migrate-site.sh`)
  - `check-artifacts.sh` updated — Task 8
  - `clean.sh` updated — Task 8
  - One `.env` for all sites, no per-site credentials — reflected in setup.md (Task 12), `.env` untouched

- [x] **Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.

- [x] **Type consistency:** `SITE_DIR` used consistently throughout; `SITE_NAME` (the Cloudflare slug derived from the spec) is distinct from `SITE_DIR` (the filesystem path) — used consistently in deploy scripts.
