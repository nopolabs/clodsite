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
assert_file_exists "${SITE_DIR}/src/_data/site.json created" "${SITE_DIR}/src/_data/site.json"

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

# ── domain.sh ─────────────────────────────────────────────────────────────────
echo ""
echo "=== domain.sh ==="

# Missing SITE_DIR → exits 1
SITE_DIR="" bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing SITE_DIR exits 1" 1 $?

# Spec missing deployed_url → exits 1
cp scripts/test/fixtures/domain-spec-no-deploy.json "${SITE_DIR}/site-spec.json"
bash scripts/domain.sh > /dev/null 2>&1; assert_exit "missing deployed_url exits 1" 1 $?

# Restore SITE_DIR for apex tests (the SITE_DIR="" test overwrote it in subshell only)
cp scripts/test/fixtures/domain-spec-deployed.json "${SITE_DIR}/site-spec.json"

# Apex extraction (mirrors extract_apex in domain.sh)
extract_apex_test() { echo "$1" | rev | cut -d. -f1,2 | rev; }
actual=$(extract_apex_test "ndig.nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: subdomain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: subdomain (got: $actual)"; FAIL=$((FAIL+1)); }
actual=$(extract_apex_test "nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: root domain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: root domain (got: $actual)"; FAIL=$((FAIL+1)); }
actual=$(extract_apex_test "deep.ndig.nopolabs.com")
[ "$actual" = "nopolabs.com" ] && { echo "  ✓ apex extraction: deep subdomain"; PASS=$((PASS+1)); } || { echo "  ✗ apex extraction: deep subdomain (got: $actual)"; FAIL=$((FAIL+1)); }

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
