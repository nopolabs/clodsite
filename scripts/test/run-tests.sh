#!/usr/bin/env bash
set -uo pipefail

PASS=0
FAIL=0
ORIGINAL_SITES_DIR="${SITES_DIR:-}"
export SITES_DIR="sites"

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

assert_not_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "  ✗ $desc (did not expect: $needle)"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
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

ENV_BACKUP=""
if [ -f ".env" ]; then
  ENV_BACKUP=$(mktemp)
  cp .env "$ENV_BACKUP"
fi

cleanup() {
  rm -rf "$SITE_DIR"
  rm -rf site sites
  rm -f .env
  if [ -n "$SITE_BACKUP" ]; then
    mkdir -p site && cp -r "$SITE_BACKUP/." site/ && rm -rf "$SITE_BACKUP"
  fi
  if [ -n "$SITES_BACKUP" ]; then
    mkdir -p sites && cp -r "$SITES_BACKUP/." sites/ && rm -rf "$SITES_BACKUP"
  fi
  if [ -n "$ENV_BACKUP" ]; then
    cp "$ENV_BACKUP" .env && rm -f "$ENV_BACKUP"
  fi
  if [ -n "$ORIGINAL_SITES_DIR" ]; then
    export SITES_DIR="$ORIGINAL_SITES_DIR"
  else
    unset SITES_DIR
  fi
  [ -n "${MOCK_BIN:-}" ] && rm -rf "$MOCK_BIN"
  [ -n "${ORIGINAL_PATH:-}" ] && export PATH="$ORIGINAL_PATH"
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

cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/write-site-json.sh > /dev/null 2>&1; assert_exit "write-site-json exits 0" 0 $?
assert_file_exists "${SITE_DIR}/src/_data/site.json created" "${SITE_DIR}/src/_data/site.json"
if node -e "const s=JSON.parse(require('fs').readFileSync('${SITE_DIR}/src/_data/site.json','utf8')); process.exit(s.name === 'Nopo Labs' ? 0 : 1);" 2>/dev/null; then
  echo "  ✓ site.json name set from build-plan"
  PASS=$((PASS + 1))
else
  echo "  ✗ site.json name not set correctly"
  FAIL=$((FAIL + 1))
fi

# ── write-site-json.sh: favicon discovery ─────────────────────────────────────
echo ""
echo "=== write-site-json.sh: favicon discovery ==="

# Case A: no favicons folder → favicons=[], has_custom_favicons=false
rm -rf "${SITE_DIR}/assets"
bash scripts/write-site-json.sh > /dev/null 2>&1
JSON=$(cat "${SITE_DIR}/src/_data/site.json")
assert_contains "no folder → has_custom_favicons false" '"has_custom_favicons": false' "$JSON"
assert_contains "no folder → empty favicons array"      '"favicons": []'                "$JSON"

# Case B: full set of recognized favicons → 6 entries, has_custom_favicons=true
mkdir -p "${SITE_DIR}/assets/favicons"
cp scripts/test/fixtures/favicons-full/* "${SITE_DIR}/assets/favicons/"
bash scripts/write-site-json.sh > /dev/null 2>&1
JSON=$(cat "${SITE_DIR}/src/_data/site.json")
assert_contains "full set → has_custom_favicons true"           '"has_custom_favicons": true' "$JSON"
assert_contains "full set → favicon.ico entry"                  '"href": "/favicon.ico"'      "$JSON"
assert_contains "full set → 16x16 sizes attr"                   '"sizes": "16x16"'            "$JSON"
assert_contains "full set → apple-touch-icon rel"               '"rel": "apple-touch-icon"'   "$JSON"
assert_contains "full set → svg type attr"                      '"type": "image/svg+xml"'     "$JSON"

# Case C: partial set with unknown file → only ico recognized, warning printed
rm -rf "${SITE_DIR}/assets"
mkdir -p "${SITE_DIR}/assets/favicons"
cp scripts/test/fixtures/favicons-partial/* "${SITE_DIR}/assets/favicons/"
STDERR=$(bash scripts/write-site-json.sh 2>&1 >/dev/null)
JSON=$(cat "${SITE_DIR}/src/_data/site.json")
assert_contains "partial → has_custom_favicons true" '"has_custom_favicons": true' "$JSON"
assert_contains "partial → favicon.ico present"     '"href": "/favicon.ico"'      "$JSON"
assert_contains "partial → unknown file warning"    'unrecognized files'           "$STDERR"
assert_contains "partial → unknown.png named"       'unknown.png'                  "$STDERR"

# ── apply-theme.sh ────────────────────────────────────────────────────────────
echo ""
echo "=== apply-theme.sh ==="

cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/apply-theme.sh > /dev/null 2>&1; assert_exit "apply-theme exits 0 for valid style" 0 $?

# Component CSS bundling
rm -f scaffold/src/css/components.css
bash scripts/apply-theme.sh > /dev/null 2>&1
assert_file_exists "components.css written"         "scaffold/src/css/components.css"
BUNDLE=$(cat scaffold/src/css/components.css)
assert_contains   "bundle has c-gallery rule"       ".c-gallery"      "$BUNDLE"
assert_contains   "bundle has c-mailto-form rule"   ".c-mailto-form"  "$BUNDLE"

# Theme navigation wraps below the shared narrow-screen breakpoint.
for theme in minimal professional bold; do
  THEME_CSS=$(cat "scaffold/src/css/themes/${theme}.css")
  assert_contains "${theme} theme has narrow-screen breakpoint" "@media (max-width: 48rem)" "$THEME_CSS"
  assert_contains "${theme} theme stacks site navigation" "flex-direction: column" "$THEME_CSS"
  assert_contains "${theme} theme wraps navigation links" "flex-wrap: wrap" "$THEME_CSS"
done

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

# ── domain.sh ─────────────────────────────────────────────────────────────────
echo ""
echo "=== domain.sh ==="

# Missing SITE_DIR → exits 1
SITE_DIR="" bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing SITE_DIR exits 1" 1 $?

# Missing build-plan → exits 1
rm -f "${SITE_DIR}/build-plan.yaml"
bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing build-plan exits 1" 1 $?

# build-plan without custom_domain → exits 1 before credentials are loaded
cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing custom_domain exits 1" 1 $?

# Apex extraction (mirrors extract_apex in domain.sh)
extract_apex_test() { echo "$1" | rev | cut -d. -f1,2 | rev; }
actual=$(extract_apex_test "ndig.nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: subdomain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: subdomain (got: $actual)"; FAIL=$((FAIL+1)); }
actual=$(extract_apex_test "nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: root domain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: root domain (got: $actual)"; FAIL=$((FAIL+1)); }
actual=$(extract_apex_test "deep.ndig.nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: deep subdomain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: deep subdomain (got: $actual)"; FAIL=$((FAIL+1)); }

# ── teardown.sh ───────────────────────────────────────────────────────────────
echo ""
echo "=== teardown.sh ==="

# Missing SITE_DIR → exits 1
SITE_DIR="" bash scripts/teardown.sh > /dev/null 2>&1; assert_exit "missing SITE_DIR exits 1" 1 $?

# Missing build-plan → exits 1
rm -f "${SITE_DIR}/build-plan.yaml"
bash scripts/teardown.sh > /dev/null 2>&1; assert_exit "missing build-plan exits 1" 1 $?

# build-plan with missing slug → exits 1
printf '%s\n' 'name: No Slug
overview: Test site.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: Hello.
nav:
  order:
    - home
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/teardown.sh > /dev/null 2>&1; assert_exit "missing slug exits 1" 1 $?

# ── deploy-finalize.sh ────────────────────────────────────────────────────────
echo ""
echo "=== deploy-finalize.sh ==="

# Missing .deploy-output → exits 1
rm -f "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "missing .deploy-output exits 1" 1 $?

# Valid .deploy-output → exits 0, writes NEXT-STEPS.md
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
echo "https://abc12345.nopo-labs.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "finalize with output exits 0" 0 $?
assert_file_exists "NEXT-STEPS.md created" "${SITE_DIR}/NEXT-STEPS.md"

# No sites/.git → git block is skipped, exits 0
rm -rf sites/.git
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
echo "https://abc12345.nopo-labs.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "finalize without sites/.git exits 0" 0 $?

# With sites/.git → commit is created
TEST_SITE_NAME="test-finalize-site"
SAVED_SITE_DIR="$SITE_DIR"
export SITE_DIR="sites/${TEST_SITE_NAME}"
mkdir -p "${SITE_DIR}"
git init -q sites
git -C sites config user.email "test@example.com"
git -C sites config user.name "Test"
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
echo "https://abc12345.nopo-labs.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1; assert_exit "finalize with sites/.git exits 0" 0 $?
COMMIT_COUNT=$(git -C sites log --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ "$COMMIT_COUNT" -ge 1 ]; then
  echo "  ✓ git commit created in sites/"
  PASS=$((PASS + 1))
else
  echo "  ✗ no git commit found in sites/"
  FAIL=$((FAIL + 1))
fi
COMMIT_MSG=$(git -C sites log --oneline -1 2>/dev/null | sed 's/^[a-f0-9]* //')
if echo "$COMMIT_MSG" | grep -q "^deploy:"; then
  echo "  ✓ commit message starts with 'deploy:'"
  PASS=$((PASS + 1))
else
  echo "  ✗ unexpected commit message: $COMMIT_MSG"
  FAIL=$((FAIL + 1))
fi
rm -rf sites
# Restore SITE_DIR for any tests that follow
export SITE_DIR="$SAVED_SITE_DIR"

# ── render-templates.sh ───────────────────────────────────────────────────────
echo ""
echo "=== render-templates.sh ==="

cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/src"
bash scripts/render-templates.sh > /dev/null 2>&1
assert_exit "render-templates exits 0" 0 $?
assert_file_exists "home page rendered"    "${SITE_DIR}/src/index.njk"
assert_file_exists "gallery page rendered" "${SITE_DIR}/src/gallery.njk"

INDEX=$(cat "${SITE_DIR}/src/index.njk")
assert_contains "index has front matter"          "permalink: /"          "$INDEX"
assert_contains "index sets pageTitle"            "pageTitle: Home"       "$INDEX"
assert_contains "index includes prose component"  "prose/component.njk"   "$INDEX"

GAL=$(cat "${SITE_DIR}/src/gallery.njk")
assert_contains "gallery permalink"               "permalink: /gallery/"  "$GAL"
assert_contains "gallery includes prose first"    "prose/component.njk"   "$GAL"
assert_contains "gallery includes gallery type"   "gallery/component.njk" "$GAL"

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/src"
bash scripts/write-site-json.sh > /dev/null 2>&1
bash scripts/render-templates.sh > /dev/null 2>&1
assert_exit "render-templates with resend-form exits 0" 0 $?
assert_file_exists "contact page rendered" "${SITE_DIR}/src/contact.njk"
CONTACT=$(cat "${SITE_DIR}/src/contact.njk")
assert_contains "contact includes resend-form component" "resend-form/component.njk" "$CONTACT"
assert_contains "contact permalink" "permalink: /contact/" "$CONTACT"
bash scripts/apply-theme.sh > /dev/null 2>&1
SITE_DIR="${SITE_DIR}" bash scripts/build-site.sh > /dev/null 2>&1
assert_exit "resend-form fixture builds" 0 $?
CONTACT_HTML_PATH=$(find "${SITE_DIR}/dist" -name '*.html' \
  -exec grep -l "c-resend-form__form" {} + 2>/dev/null | head -1)
CONTACT_HTML=$(cat "$CONTACT_HTML_PATH" 2>/dev/null || true)
assert_contains "resend-form HTML has form" "c-resend-form__form" "$CONTACT_HTML"
assert_contains "resend-form HTML has contact endpoint" "fetch('/api/contact'" "$CONTACT_HTML"
assert_not_contains "unprotected resend-form omits Turnstile widget" "cf-turnstile" "$CONTACT_HTML"
assert_not_contains "unprotected resend-form omits site-key marker" "__CLODSITE_TURNSTILE_SITEKEY__" "$CONTACT_HTML"

cp scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/src"
bash scripts/write-site-json.sh > /dev/null 2>&1
bash scripts/render-templates.sh > /dev/null 2>&1
bash scripts/apply-theme.sh > /dev/null 2>&1
SITE_DIR="${SITE_DIR}" bash scripts/build-site.sh > /dev/null 2>&1
assert_exit "protected resend-form fixture builds" 0 $?
PROTECTED_HTML_PATH=$(find "${SITE_DIR}/dist" -name '*.html' \
  -exec grep -l "c-resend-form__form" {} + 2>/dev/null | head -1)
PROTECTED_HTML=$(cat "$PROTECTED_HTML_PATH" 2>/dev/null || true)
assert_contains "protected form loads Turnstile script" "https://challenges.cloudflare.com/turnstile/v0/api.js" "$PROTECTED_HTML"
assert_contains "protected form renders Turnstile widget" 'class="cf-turnstile"' "$PROTECTED_HTML"
assert_contains "protected form has site-key marker" "__CLODSITE_TURNSTILE_SITEKEY__" "$PROTECTED_HTML"
assert_contains "protected form has stable action" 'data-action="clodsite-contact"' "$PROTECTED_HTML"
assert_contains "protected form resets failed challenge" "window.turnstile.reset()" "$PROTECTED_HTML"

cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/src"
bash scripts/render-templates.sh > /dev/null 2>&1
assert_exit "render-templates with media-section exits 0" 0 $?
MEDIA_INDEX=$(cat "${SITE_DIR}/src/index.njk")
assert_contains "index includes media-section component" "media-section/component.njk" "$MEDIA_INDEX"

mkdir -p "${SITE_DIR}/assets"
printf 'fixture' > "${SITE_DIR}/assets/portrait.jpg"
bash scripts/apply-theme.sh > /dev/null 2>&1
MEDIA_BUNDLE=$(cat scaffold/src/css/components.css)
assert_contains "bundle has media-section root" ".c-media-section {" "$MEDIA_BUNDLE"
assert_contains "bundle has image-left modifier" ".c-media-section--image-left" "$MEDIA_BUNDLE"
assert_contains "bundle has image-right modifier" ".c-media-section--image-right" "$MEDIA_BUNDLE"
assert_contains "bundle has media query" "@media (max-width: 48rem)" "$MEDIA_BUNDLE"
SITE_DIR="${SITE_DIR}" bash scripts/build-site.sh > /dev/null 2>&1
assert_exit "media-section fixture builds" 0 $?
MEDIA_HTML=$(cat "${SITE_DIR}/dist/index.html")
assert_contains "media-section HTML has modifier" "c-media-section--image-right" "$MEDIA_HTML"
assert_contains "media-section HTML renders markdown" "<h1>Hello</h1>" "$MEDIA_HTML"
assert_contains "media-section HTML has figure" "<figure" "$MEDIA_HTML"
assert_contains "media-section HTML has image src" 'src="/assets/portrait.jpg"' "$MEDIA_HTML"
assert_contains "media-section HTML has image alt" 'alt="A portrait used by the media-section test"' "$MEDIA_HTML"
assert_contains "media-section HTML has caption" "<figcaption>Optional caption</figcaption>" "$MEDIA_HTML"

for layout in image-left image-right image-above image-below; do
  sed "s/layout: image-right/layout: ${layout}/" \
    scripts/test/fixtures/valid-build-plan-media-section.yaml > "${SITE_DIR}/build-plan.yaml"
  bash scripts/render-templates.sh > /dev/null 2>&1
  SITE_DIR="${SITE_DIR}" bash scripts/build-site.sh > /dev/null 2>&1
  MEDIA_HTML=$(cat "${SITE_DIR}/dist/index.html")
  assert_contains "media-section ${layout} modifier rendered" "c-media-section--${layout}" "$MEDIA_HTML"
  LAYOUT="$layout" HTML_PATH="${SITE_DIR}/dist/index.html" node -e "
const fs = require('fs');
const html = fs.readFileSync(process.env.HTML_PATH, 'utf8');
const prose = html.indexOf('c-media-section__prose');
const media = html.indexOf('c-media-section__media');
const imageFirst = process.env.LAYOUT === 'image-left' || process.env.LAYOUT === 'image-above';
process.exit(imageFirst ? (media < prose ? 0 : 1) : (prose < media ? 0 : 1));
"
  assert_exit "media-section ${layout} DOM order is correct" 0 $?
done

cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
delete p.pages[0].components[0].image.caption;
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/render-templates.sh > /dev/null 2>&1
SITE_DIR="${SITE_DIR}" bash scripts/build-site.sh > /dev/null 2>&1
MEDIA_HTML=$(cat "${SITE_DIR}/dist/index.html")
assert_not_contains "media-section omits absent caption" "<figcaption>" "$MEDIA_HTML"

# ── generate-catalog-md.sh ────────────────────────────────────────────────────
echo ""
echo "=== generate-catalog-md.sh ==="

TMP_CATALOG=$(mktemp)
bash scripts/generate-catalog-md.sh > "$TMP_CATALOG" 2>&1
assert_exit "generate-catalog-md exits 0" 0 $?
CATALOG=$(cat "$TMP_CATALOG")
assert_contains "catalog lists prose"           "## prose"        "$CATALOG"
assert_contains "catalog lists gallery"         "## gallery"      "$CATALOG"
assert_contains "catalog lists mailto-form"     "## mailto-form"  "$CATALOG"
assert_contains "catalog lists media-section"   "## media-section" "$CATALOG"
assert_contains "catalog lists resend-form"      "## resend-form"  "$CATALOG"
assert_contains "catalog shows required field"  "markdown"        "$CATALOG"
assert_contains "catalog shows mailto fields"   "to"              "$CATALOG"
assert_contains "catalog shows layout enum"      "image-left, image-right, image-above, image-below" "$CATALOG"
assert_contains "catalog shows nested image src" '`image.src` (non-empty string)' "$CATALOG"
assert_contains "catalog shows nested image alt" '`image.alt` (non-empty string)' "$CATALOG"
assert_contains "catalog shows optional caption" '`image.caption` (string)' "$CATALOG"
assert_contains "catalog shows media example"    "type: media-section" "$CATALOG"
assert_contains "catalog preserves primitive type" '`markdown` (string)' "$CATALOG"
assert_contains "catalog shows optional Turnstile field" '`turnstile` (boolean)' "$CATALOG"
rm -f "$TMP_CATALOG"

# ── setup.sh --init-sites ─────────────────────────────────────────────────────
echo ""
echo "=== setup.sh --init-sites ==="

# Clean up any sites/ left from migration tests
rm -rf sites

# First run: creates sites/.git and sites/.gitignore
bash scripts/setup.sh --init-sites > /dev/null 2>&1; assert_exit "--init-sites exits 0" 0 $?
assert_dir_exists "sites/.git created" "sites/.git"
assert_file_exists "sites/.gitignore created" "sites/.gitignore"

# .gitignore content is correct
if grep -qxF "*/src/" sites/.gitignore &&
   grep -qxF "*/.deploy-*" sites/.gitignore &&
   grep -qxF "*/.turnstile-*" sites/.gitignore &&
   grep -qxF "*/.wrangler/" sites/.gitignore &&
   grep -qxF "*.swp" sites/.gitignore &&
   ! grep -q "\*/dist/" sites/.gitignore; then
  echo "  ✓ sites/.gitignore has correct entries"
  PASS=$((PASS + 1))
else
  echo "  ✗ sites/.gitignore missing expected entries"
  FAIL=$((FAIL + 1))
fi

# Idempotent: second run doesn't fail
bash scripts/setup.sh --init-sites > /dev/null 2>&1; assert_exit "--init-sites is idempotent" 0 $?

# Idempotent: existing .gitignore is not overwritten
echo "custom content" > sites/.gitignore
bash scripts/setup.sh --init-sites > /dev/null 2>&1
if grep -q "custom content" sites/.gitignore; then
  echo "  ✓ existing sites/.gitignore not overwritten"
  PASS=$((PASS + 1))
else
  echo "  ✗ existing sites/.gitignore was overwritten"
  FAIL=$((FAIL + 1))
fi
assert_contains "existing sites/.gitignore gains Turnstile state pattern" \
  "*/.turnstile-*" "$(cat sites/.gitignore)"
assert_contains "existing sites/.gitignore gains Wrangler state pattern" \
  "*/.wrangler/" "$(cat sites/.gitignore)"
assert_contains "existing sites/.gitignore gains editor swap-file pattern" \
  "*.swp" "$(cat sites/.gitignore)"

rm -rf sites

# ── SITES_DIR path resolution ─────────────────────────────────────────────────
echo ""
echo "=== SITES_DIR path resolution ==="

ALT_SITES_DIR=$(mktemp -d)
mkdir -p "$ALT_SITES_DIR/alt-site"
cp scripts/test/fixtures/valid-build-plan.yaml "$ALT_SITES_DIR/alt-site/build-plan.yaml"
SITES_DIR="$ALT_SITES_DIR" SITE_NAME="alt-site" bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "SITE_NAME resolves inside custom SITES_DIR" 0 $?

SITES_DIR="$ALT_SITES_DIR" bash scripts/setup.sh --init-sites > /dev/null 2>&1
assert_exit "--init-sites respects custom SITES_DIR" 0 $?
assert_dir_exists "custom SITES_DIR .git created" "$ALT_SITES_DIR/.git"
assert_file_exists "custom SITES_DIR .gitignore created" "$ALT_SITES_DIR/.gitignore"
rm -rf "$ALT_SITES_DIR"

RELATIVE_SITES_DIR=".test-clodsite-sites"
mkdir -p "$RELATIVE_SITES_DIR/relative-site"
cp scripts/test/fixtures/valid-build-plan.yaml "$RELATIVE_SITES_DIR/relative-site/build-plan.yaml"
SITES_DIR="$RELATIVE_SITES_DIR" SITE_NAME="relative-site" bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "relative SITES_DIR resolves from repository root" 0 $?
rm -rf "$RELATIVE_SITES_DIR"

# ── validate-plan.sh ──────────────────────────────────────────────────────────
echo ""
echo "=== validate-plan.sh ==="

cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid plan passes" 0 $?

cp scripts/test/fixtures/invalid-build-plan-missing-content.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing content exits 1" 1 $?

rm -f "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing file exits 1" 1 $?

printf '%s\n' 'slug: test
name: Test
overview: Test site.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: Hello.
nav:
  order:
    - home
    - nonexistent
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "nav.order with unknown page id exits 1" 1 $?

# Component validation
cp scripts/test/fixtures/invalid-build-plan-bad-component.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "unknown component type exits 1" 1 $?

cp scripts/test/fixtures/invalid-build-plan-missing-field.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing required field exits 1" 1 $?

cp scripts/test/fixtures/invalid-build-plan-has-build-notes.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "build_notes is rejected" 1 $?

cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid component plan exits 0" 0 $?

# resend-form component validation
cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid resend-form plan passes" 0 $?

cp scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form turnstile true passes" 0 $?

node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[1].components[0].turnstile = false;
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "resend-form turnstile false passes" 0 $?

for invalid_turnstile in '"yes"' '1' '{}' 'null'; do
  cp scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml "${SITE_DIR}/build-plan.yaml"
  TURNSTILE_VALUE="$invalid_turnstile" node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[1].components[0].turnstile = JSON.parse(process.env.TURNSTILE_VALUE);
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
  bash scripts/validate-plan.sh > /dev/null 2>&1
  assert_exit "resend-form invalid turnstile ${invalid_turnstile} exits 1" 1 $?
done

for missing in from to; do
  cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
  FIELD="$missing" node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
delete p.pages[1].components[0][process.env.FIELD];
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
  bash scripts/validate-plan.sh > /dev/null 2>&1
  assert_exit "resend-form missing ${missing} exits 1" 1 $?
done

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[1].components[0].fields = [];
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "resend-form empty fields exits 1" 1 $?

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
delete p.pages[1].components[0].fields[0].label;
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "resend-form field missing label exits 1" 1 $?

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[1].components[0].fields[0].type = 'number';
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "resend-form field invalid type exits 1" 1 $?

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[1].components[0].to = '';
p.pages[1].components[0].fields[0].name = '   ';
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "resend-form empty strings exit 1" 1 $?

# Recursive component schema descriptors
NESTED_COMPONENTS_DIR=$(mktemp -d)
mkdir -p "${NESTED_COMPONENTS_DIR}/media-section"
cat > "${NESTED_COMPONENTS_DIR}/media-section/schema.json" <<'JSON'
{
  "description": "Nested validation test component.",
  "required": {
    "layout": {
      "type": "string",
      "enum": ["image-left", "image-right", "image-above", "image-below"]
    },
    "image": {
      "type": "object",
      "required": {
        "src": { "type": "string", "non_empty": true },
        "alt": { "type": "string", "non_empty": true }
      },
      "optional": {
        "caption": "string"
      }
    },
    "markdown": "string"
  },
  "optional": {}
}
JSON

cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "valid nested component exits 0" 0 $?

for layout in image-left image-right image-above image-below; do
  sed "s/layout: image-right/layout: ${layout}/" \
    scripts/test/fixtures/valid-build-plan-media-section.yaml > "${SITE_DIR}/build-plan.yaml"
  COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh > /dev/null 2>&1
  assert_exit "layout ${layout} exits 0" 0 $?
done

sed 's/layout: image-right/layout: diagonal/' \
  scripts/test/fixtures/valid-build-plan-media-section.yaml > "${SITE_DIR}/build-plan.yaml"
OUTPUT=$(COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh 2>&1)
assert_exit "unknown layout exits 1" 1 $?
assert_contains "unknown layout names full path" "pages[0].components[0].layout" "$OUTPUT"

cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
delete p.pages[0].components[0].image;
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
OUTPUT=$(COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh 2>&1)
assert_exit "missing image exits 1" 1 $?
assert_contains "missing image names full path" "pages[0].components[0].image is required" "$OUTPUT"

for field in src alt; do
  cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
  FIELD="$field" node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
delete p.pages[0].components[0].image[process.env.FIELD];
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
  OUTPUT=$(COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh 2>&1)
  assert_exit "missing image.${field} exits 1" 1 $?
  assert_contains "missing image.${field} names full path" "pages[0].components[0].image.${field} is required" "$OUTPUT"

  for blank in empty whitespace; do
    cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
    FIELD="$field" BLANK="$blank" node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[0].components[0].image[process.env.FIELD] = process.env.BLANK === 'empty' ? '' : '   ';
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
    OUTPUT=$(COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh 2>&1)
    assert_exit "${blank} image.${field} exits 1" 1 $?
    assert_contains "${blank} image.${field} names full path" "pages[0].components[0].image.${field} must be a non-empty string" "$OUTPUT"
  done
done

cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[0].components[0].image.alt = 42;
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
OUTPUT=$(COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh 2>&1)
assert_exit "non-string image.alt exits 1" 1 $?
assert_contains "non-string image.alt names full path" "pages[0].components[0].image.alt must be string" "$OUTPUT"

cp scripts/test/fixtures/valid-build-plan-media-section.yaml "${SITE_DIR}/build-plan.yaml"
COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh > /dev/null 2>&1
assert_exit "optional string image.caption exits 0" 0 $?

node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.pages[0].components[0].image.width = '20rem';
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
OUTPUT=$(COMPONENTS_DIR="$NESTED_COMPONENTS_DIR" bash scripts/validate-plan.sh 2>&1)
assert_exit "unknown image field exits 1" 1 $?
assert_contains "unknown image field names object path" 'pages[0].components[0].image has unknown field "width"' "$OUTPUT"
rm -rf "$NESTED_COMPONENTS_DIR"

printf '%s\n' 'slug: test
name: Test
overview: Test site.
style: minimal
tone: professional
custom_domain: https://example.com/path
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: Hello.
nav:
  order:
    - home
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "custom_domain URL exits 1" 1 $?

# ── finalize-plan.sh ──────────────────────────────────────────────────────────
echo ""
echo "=== finalize-plan.sh ==="

# Happy path: spec + plan without name → injects name, exits 0
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
printf '%s\n' 'slug: nopo-labs
overview: A portfolio site.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: Hello.
nav:
  order:
    - home
contact:
  enabled: false' > "${SITE_DIR}/build-plan.yaml"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan injects name, exits 0" 0 $?
if node -e "const yaml=require('js-yaml'); const p=yaml.load(require('fs').readFileSync('${SITE_DIR}/build-plan.yaml','utf8')); process.exit(p.name === 'Nopo Labs' ? 0 : 1);" 2>/dev/null; then
  echo "  ✓ name correctly injected into build-plan.yaml"
  PASS=$((PASS + 1))
else
  echo "  ✗ name not correctly injected"
  FAIL=$((FAIL + 1))
fi

# Missing spec → exits 1
rm -f "${SITE_DIR}/site-spec.json"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan missing spec exits 1" 1 $?

# Missing plan → exits 1
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
rm -f "${SITE_DIR}/build-plan.yaml"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan missing plan exits 1" 1 $?

# Invalid plan (missing page content) → name injected but validate fails → exits 1
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
cp scripts/test/fixtures/invalid-build-plan-missing-content.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan with invalid plan exits 1" 1 $?

# ── render-functions.sh ───────────────────────────────────────────────────────
echo ""
echo "=== render-functions.sh ==="

cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1
assert_exit "no resend-form exits 0" 0 $?
if [ ! -d "${SITE_DIR}/functions" ]; then
  echo "  ✓ no resend-form leaves functions/ absent"
  PASS=$((PASS + 1))
else
  echo "  ✗ no resend-form unexpectedly created functions/"
  FAIL=$((FAIL + 1))
fi

mkdir -p "${SITE_DIR}/functions/api"
echo "stale" > "${SITE_DIR}/functions/api/contact.js"
bash scripts/render-functions.sh > /dev/null 2>&1
assert_exit "stale contact cleanup exits 0" 0 $?
if [ ! -e "${SITE_DIR}/functions" ]; then
  echo "  ✓ stale contact Function and empty parent directories removed"
  PASS=$((PASS + 1))
else
  echo "  ✗ stale contact Function cleanup left empty directories"
  FAIL=$((FAIL + 1))
fi

mkdir -p "${SITE_DIR}/functions/api"
echo "other" > "${SITE_DIR}/functions/api/other.js"
echo "stale" > "${SITE_DIR}/functions/api/contact.js"
bash scripts/render-functions.sh > /dev/null 2>&1
assert_file_exists "unrelated Function survives stale cleanup" "${SITE_DIR}/functions/api/other.js"
if [ ! -f "${SITE_DIR}/functions/api/contact.js" ]; then
  echo "  ✓ stale contact Function removed without touching other Functions"
  PASS=$((PASS + 1))
else
  echo "  ✗ stale contact Function was not removed"
  FAIL=$((FAIL + 1))
fi

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/functions"
bash scripts/render-functions.sh > /dev/null 2>&1
assert_exit "resend-form Function render exits 0" 0 $?
assert_file_exists "functions/api/contact.js created" "${SITE_DIR}/functions/api/contact.js"
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js")
assert_contains "generated config has to address" "hello@example.com" "$FUNC"
assert_contains "generated config has from address" "noreply@example.com" "$FUNC"
assert_contains "generated config has subject" "Message from resend-test" "$FUNC"
assert_contains "generated Function has handler" "onRequestPost" "$FUNC"
assert_contains "generated config has required metadata" '"required":true' "$FUNC"
assert_contains "generated config has maxLength metadata" '"maxLength":10000' "$FUNC"
assert_contains "unprotected config disables Turnstile" '"turnstile":{"enabled":false}' "$FUNC"
assert_contains "generated Function rejects non-object JSON" "!data || typeof data !== 'object' || Array.isArray(data)" "$FUNC"
assert_not_contains "CONFIG placeholder is replaced" "{{CONFIG}}" "$FUNC"
cp "${SITE_DIR}/functions/api/contact.js" "${SITE_DIR}/functions/api/contact.mjs"
if FUNCTION_URL="file://${SITE_DIR}/functions/api/contact.mjs" node --input-type=module -e "
const { onRequestPost } = await import(process.env.FUNCTION_URL);
const malformed = await onRequestPost({
  env: { RESEND_API_KEY: 'test-key' },
  request: new Request('https://example.com/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  }),
});
const malformedBody = await malformed.json();
const nonObject = await onRequestPost({
  env: { RESEND_API_KEY: 'test-key' },
  request: new Request('https://example.com/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '[]',
  }),
});
const nonObjectBody = await nonObject.json();
process.exit(
  malformed.status === 400 &&
  malformedBody.error === 'Malformed JSON' &&
  nonObject.status === 400 &&
  nonObjectBody.error === 'Request body must be a JSON object'
    ? 0
    : 1
);
" 2>/dev/null; then
  echo "  ✓ generated Function distinguishes malformed JSON from non-object JSON"
  PASS=$((PASS + 1))
else
  echo "  ✗ generated Function does not distinguish invalid request bodies"
  FAIL=$((FAIL + 1))
fi
rm -f "${SITE_DIR}/functions/api/contact.mjs"

cp scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/render-functions.sh > /dev/null 2>&1
PROTECTED_FUNC=$(cat "${SITE_DIR}/functions/api/contact.js")
assert_contains "protected config enables Turnstile" '"turnstile":{"enabled":true' "$PROTECTED_FUNC"
assert_contains "protected config has stable action" '"action":"clodsite-contact"' "$PROTECTED_FUNC"
assert_contains "protected config has hostname marker" "__CLODSITE_TURNSTILE_HOSTNAMES__" "$PROTECTED_FUNC"
cp "${SITE_DIR}/functions/api/contact.js" "${SITE_DIR}/functions/api/contact.mjs"
FUNCTION_PATH="${SITE_DIR}/functions/api/contact.mjs" node -e "
const fs=require('fs');
const path=process.env.FUNCTION_PATH;
const source=fs.readFileSync(path,'utf8')
  .replace('\"__CLODSITE_TURNSTILE_HOSTNAMES__\"', '[\"contact.example.com\"]');
fs.writeFileSync(path, source);
"
if FUNCTION_URL="file://${SITE_DIR}/functions/api/contact.mjs" node --input-type=module -e "
const { onRequestPost } = await import(process.env.FUNCTION_URL);
const payload = {
  name: 'Test',
  email: 'test@example.com',
  message: 'Hello',
  'cf-turnstile-response': 'token',
};
const makeContext = (body, env = {}) => ({
  env: { RESEND_API_KEY: 'resend-key', TURNSTILE_SECRET_KEY: 'turnstile-key', ...env },
  request: new Request('https://contact.example.com/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(body),
  }),
});
let calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('/siteverify')) {
    return Response.json({ success: true, action: 'clodsite-contact', hostname: 'contact.example.com' });
  }
  return Response.json({ id: 'email-id' });
};
const missingSecret = await onRequestPost(makeContext(payload, { TURNSTILE_SECRET_KEY: '' }));
const missingToken = await onRequestPost(makeContext({ ...payload, 'cf-turnstile-response': '' }));
calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return Response.json({ success: false, action: 'clodsite-contact', hostname: 'contact.example.com' });
};
const rejected = await onRequestPost(makeContext(payload));
const rejectedCalls = [...calls];
calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('/siteverify')) {
    return Response.json({ success: true, action: 'clodsite-contact', hostname: 'contact.example.com' });
  }
  return Response.json({ id: 'email-id' });
};
const accepted = await onRequestPost(makeContext(payload));
const emailBody = JSON.parse(calls[1].options.body).text;
process.exit(
  missingSecret.status === 500 &&
  missingToken.status === 400 &&
  rejected.status === 400 &&
  rejectedCalls.length === 1 &&
  accepted.status === 200 &&
  calls.length === 2 &&
  !emailBody.includes('cf-turnstile-response')
    ? 0
    : 1
);
" 2>/dev/null; then
  echo "  ✓ protected Function gates Resend on successful Turnstile verification"
  PASS=$((PASS + 1))
else
  echo "  ✗ protected Function Turnstile enforcement failed"
  FAIL=$((FAIL + 1))
fi
rm -f "${SITE_DIR}/functions/api/contact.mjs"

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
node -e "
const fs=require('fs'), yaml=require('js-yaml');
const p=yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml','utf8'));
p.name = \"O'Brien's Site\";
delete p.pages[1].components[0].subject;
fs.writeFileSync('${SITE_DIR}/build-plan.yaml', yaml.dump(p));
"
bash scripts/render-functions.sh > /dev/null 2>&1
FUNC=$(cat "${SITE_DIR}/functions/api/contact.js")
assert_contains "default subject comes from plan name" "Message from O'Brien's Site" "$FUNC"
if FUNCTION_PATH="${SITE_DIR}/functions/api/contact.js" node -e "
const source=require('fs').readFileSync(process.env.FUNCTION_PATH,'utf8');
const match=source.match(/const CONFIG = (.+);/);
if (!match) process.exit(1);
const config=JSON.parse(match[1]);
process.exit(config.subject === \"Message from O'Brien's Site\" ? 0 : 1);
" 2>/dev/null; then
  echo "  ✓ generated CONFIG is valid JSON with special characters"
  PASS=$((PASS + 1))
else
  echo "  ✗ generated CONFIG is invalid with special characters"
  FAIL=$((FAIL + 1))
fi

# ── deploy-finalize.sh: resend-form warning ────────────────────────────────────
echo ""
echo "=== deploy-finalize.sh: resend-form warning ==="

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
mkdir -p "${SITE_DIR}/functions/api"
echo "// stub" > "${SITE_DIR}/functions/api/contact.js"
echo "https://abc12345.resend-test.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1
assert_exit "finalize with resend-form exits 0" 0 $?
NEXT_STEPS=$(cat "${SITE_DIR}/NEXT-STEPS.md")
assert_contains "NEXT-STEPS has bot-protection warning" "bot protection" "$NEXT_STEPS"
WARNING_SECTION=$(echo "$NEXT_STEPS" | awk '/^---/{block=""} {block=block"\n"$0} END{print block}')
assert_contains "warning substitutes site name" "resend-test" "$WARNING_SECTION"
assert_not_contains "warning has no SITE_NAME placeholder" "{{SITE_NAME}}" "$WARNING_SECTION"

rm -f "${SITE_DIR}/functions/api/contact.js" "${SITE_DIR}/NEXT-STEPS.md"
bash scripts/deploy-finalize.sh > /dev/null 2>&1
NEXT_STEPS=$(cat "${SITE_DIR}/NEXT-STEPS.md")
assert_not_contains "NEXT-STEPS omits warning without contact Function" "bot protection" "$NEXT_STEPS"

cp scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml "${SITE_DIR}/build-plan.yaml"
mkdir -p "${SITE_DIR}/functions/api"
echo "// protected stub" > "${SITE_DIR}/functions/api/contact.js"
echo "https://abc12345.resend-turnstile-test.pages.dev" > "${SITE_DIR}/.deploy-output"
bash scripts/deploy-finalize.sh > /dev/null 2>&1
NEXT_STEPS=$(cat "${SITE_DIR}/NEXT-STEPS.md")
assert_contains "NEXT-STEPS confirms Turnstile protection" "Turnstile is enabled" "$NEXT_STEPS"
assert_not_contains "protected NEXT-STEPS omits bot-protection warning" "no rate limiting or bot protection" "$NEXT_STEPS"

# ── status.sh ─────────────────────────────────────────────────────────────────
echo ""
echo "=== status.sh ==="

printf '%s\n' 'CLOUDFLARE_API_TOKEN=test-token
CLOUDFLARE_ACCOUNT_ID=test-account' > .env

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

# Test 1: empty SITES_DIR → exits 0, prints empty-state message
EMPTY_SITES=$(mktemp -d)
OUTPUT=$(SITES_DIR="$EMPTY_SITES" bash scripts/status.sh 2>/dev/null); STATUS_EXIT=$?
assert_exit "empty SITES_DIR exits 0" 0 "$STATUS_EXIT"
assert_contains "empty SITES_DIR prints empty-state message" "No Clodsite-managed sites found." "$OUTPUT"
assert_contains "empty SITES_DIR lists Cloudflare-only projects" "external-project" "$OUTPUT"
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

# ── provision-turnstile.sh (stub Cloudflare) ─────────────────────────────────
echo ""
echo "=== provision-turnstile.sh (stub Cloudflare) ==="

TURNSTILE_STUB_DIR=$(mktemp -d)
TURNSTILE_STUB_LOG="${TURNSTILE_STUB_DIR}/calls.log"
cat > "${TURNSTILE_STUB_DIR}/curl" << STUB
#!/usr/bin/env bash
method="GET"
url=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in
    --request) method="\$2"; shift 2 ;;
    --data|--header) shift 2 ;;
    --fail-with-body|--silent|--show-error) shift ;;
    *) url="\$1"; shift ;;
  esac
done
echo "\${method} \${url}" >> "${TURNSTILE_STUB_LOG}"
case "\${url}" in
  */pages/projects/resend-turnstile-test)
    printf '%s' '{"success":true,"result":{"subdomain":"resend-turnstile-test.pages.dev"}}'
    ;;
  */challenges/widgets)
    if [ "\${method}" = "POST" ]; then
      printf '%s' '{"success":true,"result":{"sitekey":"0x-test-sitekey","secret":"test-turnstile-secret","name":"clodsite:resend-turnstile-test:resend-form","domains":["contact.example.com","resend-turnstile-test.pages.dev"],"mode":"managed","clearance_level":"no_clearance"}}'
    else
      printf '%s' '{"success":true,"result":[]}'
    fi
    ;;
  */challenges/widgets/0x-test-sitekey)
    printf '%s' '{"success":true,"result":{"sitekey":"0x-test-sitekey","secret":"test-turnstile-secret","name":"clodsite:resend-turnstile-test:resend-form","domains":["contact.example.com","resend-turnstile-test.pages.dev"],"mode":"managed","clearance_level":"no_clearance"}}'
    ;;
  *)
    printf '%s' '{"success":false,"errors":[{"message":"unexpected test URL"}]}'
    exit 22
    ;;
esac
STUB
cat > "${TURNSTILE_STUB_DIR}/wrangler" << STUB
#!/usr/bin/env bash
secret=\$(cat)
echo "wrangler \$* stdin-length=\${#secret}" >> "${TURNSTILE_STUB_LOG}"
exit 0
STUB
chmod +x "${TURNSTILE_STUB_DIR}/curl" "${TURNSTILE_STUB_DIR}/wrangler"

cp scripts/test/fixtures/valid-build-plan-resend-turnstile.yaml "${SITE_DIR}/build-plan.yaml"
rm -rf "${SITE_DIR}/src" "${SITE_DIR}/dist" "${SITE_DIR}/functions" "${SITE_DIR}/.turnstile-state.json"
bash scripts/write-site-json.sh > /dev/null 2>&1
bash scripts/render-templates.sh > /dev/null 2>&1
bash scripts/apply-theme.sh > /dev/null 2>&1
bash scripts/render-functions.sh > /dev/null 2>&1
SITE_DIR="${SITE_DIR}" bash scripts/build-site.sh > /dev/null 2>&1

TURNSTILE_ORIGINAL_PATH="$PATH"
export PATH="${TURNSTILE_STUB_DIR}:${PATH}"
TURNSTILE_OUTPUT=$(CLOUDFLARE_API_TOKEN=test-token CLOUDFLARE_ACCOUNT_ID=test-account \
  SITE_DIR="${SITE_DIR}" bash scripts/provision-turnstile.sh 2>&1)
assert_exit "Turnstile provisioning exits 0" 0 $?
assert_file_exists "Turnstile public state created" "${SITE_DIR}/.turnstile-state.json"
TURNSTILE_STATE=$(cat "${SITE_DIR}/.turnstile-state.json")
assert_contains "Turnstile state has public site key" "0x-test-sitekey" "$TURNSTILE_STATE"
assert_not_contains "Turnstile state omits secret" "test-turnstile-secret" "$TURNSTILE_STATE"
assert_not_contains "Turnstile output omits secret" "test-turnstile-secret" "$TURNSTILE_OUTPUT"
PROVISIONED_HTML=$(find "${SITE_DIR}/dist" -name '*.html' -exec grep -l "0x-test-sitekey" {} + | head -1)
assert_file_exists "Turnstile site key injected into HTML" "$PROVISIONED_HTML"
PROVISIONED_FUNCTION=$(cat "${SITE_DIR}/functions/api/contact.js")
assert_contains "Turnstile Pages hostname injected" "resend-turnstile-test.pages.dev" "$PROVISIONED_FUNCTION"
assert_contains "Turnstile custom hostname injected" "contact.example.com" "$PROVISIONED_FUNCTION"
assert_not_contains "Turnstile site-key marker removed" "__CLODSITE_TURNSTILE_SITEKEY__" "$(cat "$PROVISIONED_HTML")"
assert_not_contains "Turnstile hostname marker removed" "__CLODSITE_TURNSTILE_HOSTNAMES__" "$PROVISIONED_FUNCTION"
TURNSTILE_LOG=$(cat "${TURNSTILE_STUB_LOG}")
assert_contains "Turnstile widget created" "POST https://api.cloudflare.com/client/v4/accounts/test-account/challenges/widgets" "$TURNSTILE_LOG"
assert_contains "Turnstile secret pushed through Wrangler" "pages secret put TURNSTILE_SECRET_KEY" "$TURNSTILE_LOG"

TURNSTILE_OUTPUT=$(CLOUDFLARE_API_TOKEN=test-token CLOUDFLARE_ACCOUNT_ID=test-account \
  SITE_DIR="${SITE_DIR}" bash scripts/provision-turnstile.sh 2>&1)
assert_exit "Turnstile reprovision exits 0" 0 $?
TURNSTILE_LOG=$(cat "${TURNSTILE_STUB_LOG}")
assert_contains "Turnstile reprovision fetches state widget" "GET https://api.cloudflare.com/client/v4/accounts/test-account/challenges/widgets/0x-test-sitekey" "$TURNSTILE_LOG"

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
: > "${TURNSTILE_STUB_LOG}"
CLOUDFLARE_API_TOKEN=test-token CLOUDFLARE_ACCOUNT_ID=test-account \
  SITE_DIR="${SITE_DIR}" bash scripts/provision-turnstile.sh > /dev/null 2>&1
assert_exit "unprotected Turnstile provisioning exits 0" 0 $?
TURNSTILE_LOG=$(cat "${TURNSTILE_STUB_LOG}")
assert_not_contains "unprotected provisioning makes no API calls" "https://api.cloudflare.com" "$TURNSTILE_LOG"

export PATH="$TURNSTILE_ORIGINAL_PATH"
rm -rf "$TURNSTILE_STUB_DIR"

# ── deploy.sh (stub wrangler) ─────────────────────────────────────────────────
echo ""
echo "=== deploy.sh (stub wrangler) ==="

DEPLOY_STUB_DIR=$(mktemp -d)
DEPLOY_STUB_LOG="${DEPLOY_STUB_DIR}/wrangler.log"
cat > "${DEPLOY_STUB_DIR}/wrangler" << STUB
#!/usr/bin/env bash
echo "cwd=\$(pwd)" >> "${DEPLOY_STUB_LOG}"
echo "args=\$*" >> "${DEPLOY_STUB_LOG}"
if [ "\${WRANGLER_SECRET_FAIL:-0}" = "1" ] && echo "\$*" | grep -q "secret put"; then
  exit 1
fi
exit 0
STUB
chmod +x "${DEPLOY_STUB_DIR}/wrangler"
DEPLOY_ORIGINAL_PATH="$PATH"
export PATH="${DEPLOY_STUB_DIR}:${PATH}"

cp scripts/test/fixtures/valid-build-plan-resend.yaml "${SITE_DIR}/build-plan.yaml"
mkdir -p "${SITE_DIR}/dist" "${SITE_DIR}/functions/api"
echo "<html></html>" > "${SITE_DIR}/dist/index.html"
echo "// stub" > "${SITE_DIR}/functions/api/contact.js"

rm -f "${DEPLOY_STUB_LOG}"
( unset RESEND_API_KEY; SITE_DIR="${SITE_DIR}" bash scripts/deploy.sh > /dev/null 2>&1 )
assert_exit "missing RESEND_API_KEY exits 1" 1 $?
DEPLOY_LOG=$(cat "${DEPLOY_STUB_LOG}" 2>/dev/null || true)
assert_not_contains "deploy not called when Resend key missing" "pages deploy" "$DEPLOY_LOG"

rm -f "${DEPLOY_STUB_LOG}"
WRANGLER_SECRET_FAIL=1 RESEND_API_KEY=re_test SITE_DIR="${SITE_DIR}" \
  bash scripts/deploy.sh > /dev/null 2>&1
assert_exit "secret push failure aborts deploy" 1 $?
DEPLOY_LOG=$(cat "${DEPLOY_STUB_LOG}" 2>/dev/null || true)
assert_contains "secret push attempted" "pages secret put" "$DEPLOY_LOG"
assert_not_contains "deploy not called after secret failure" "pages deploy" "$DEPLOY_LOG"

rm -f "${DEPLOY_STUB_LOG}"
RESEND_API_KEY=re_test SITE_DIR="${SITE_DIR}" bash scripts/deploy.sh > /dev/null 2>&1
assert_exit "deploy with contact Function exits 0" 0 $?
DEPLOY_LOG=$(cat "${DEPLOY_STUB_LOG}" 2>/dev/null || true)
assert_contains "secret push called" "pages secret put" "$DEPLOY_LOG"
assert_contains "Pages deploy called" "pages deploy dist" "$DEPLOY_LOG"
assert_contains "Wrangler runs from SITE_DIR" "cwd=${SITE_DIR}" "$DEPLOY_LOG"
assert_file_exists "deploy output written inside site dir" "${SITE_DIR}/.deploy-output"
assert_file_exists "deploy exit written inside site dir" "${SITE_DIR}/.deploy-exit"

rm -f "${SITE_DIR}/functions/api/contact.js" "${DEPLOY_STUB_LOG}"
RESEND_API_KEY=re_test SITE_DIR="${SITE_DIR}" bash scripts/deploy.sh > /dev/null 2>&1
assert_exit "deploy without contact Function exits 0" 0 $?
DEPLOY_LOG=$(cat "${DEPLOY_STUB_LOG}" 2>/dev/null || true)
assert_not_contains "secret push omitted without contact Function" "pages secret put" "$DEPLOY_LOG"
assert_contains "static Pages deploy still called" "pages deploy dist" "$DEPLOY_LOG"

export PATH="$DEPLOY_ORIGINAL_PATH"
rm -rf "$DEPLOY_STUB_DIR"

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
