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

echo "=== validate-spec.sh ==="

cp scripts/test/fixtures/valid-spec.json site-spec.json
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "valid spec passes" 0 $?

cp scripts/test/fixtures/invalid-missing-field.json site-spec.json
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "missing field exits 1" 1 $?

cp scripts/test/fixtures/invalid-bad-enum.json site-spec.json
bash scripts/validate-spec.sh > /dev/null 2>&1; assert_exit "bad enum exits 1" 1 $?

echo ""
echo "=== write-site-json.sh ==="

cp scripts/test/fixtures/valid-spec.json site-spec.json
bash scripts/write-site-json.sh > /dev/null 2>&1; assert_exit "write-site-json exits 0" 0 $?
assert_file_exists "site.json created" "scaffold/src/_data/site.json"

echo ""
echo "=== apply-theme.sh ==="

cp scripts/test/fixtures/valid-spec.json site-spec.json
bash scripts/apply-theme.sh > /dev/null 2>&1; assert_exit "apply-theme exits 0 for valid style" 0 $?

# Clean up test artifacts
rm -f site-spec.json
# Restore stub site.json
cat > scaffold/src/_data/site.json << 'ENDJSON'
{
  "name": "Clodsite",
  "purpose": "Stub — run /interview and /build to populate",
  "audience": "",
  "tone": "professional",
  "style": "minimal",
  "nav": { "order": ["home"], "show_contact_link": false, "pages": [{ "id": "home", "title": "Home", "href": "/" }] },
  "contact": { "enabled": false, "type": "email", "email": "" }
}
ENDJSON

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
