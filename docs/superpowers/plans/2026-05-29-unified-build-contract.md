# Unified Build Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `build-plan.json` the sole input to `/build` by injecting the site display name into it at the end of `/plan`, then switching `write-site-json.sh` and `apply-theme.sh` to read from the plan instead of the spec.

**Architecture:** A new `finalize-plan.sh` script runs at the end of `/plan`, reads `site.name` from `site-spec.json`, injects it into `build-plan.json` as `name`, and validates the completed plan. `/build` scripts are updated to read from `build-plan.json` only. The field `site_name` is renamed to `slug` for clarity. Existing `sites/*/build-plan.json` files are migrated inline.

**Tech Stack:** Bash, Node.js (inline -e scripts, consistent with existing scripts), JSON

---

## File Map

| File | Change |
|---|---|
| `scripts/validate-plan.sh` | Check `slug` + `name`; drop `site_name` check |
| `scripts/finalize-plan.sh` | New: inject `name` from spec, call `validate-plan.sh` |
| `scripts/write-site-json.sh` | Read from `build-plan.json`; drop `purpose`/`audience`/`tone` |
| `scripts/apply-theme.sh` | Read `style` from `build-plan.json` |
| `scripts/test/run-tests.sh` | Update write-site-json + apply-theme tests; add finalize-plan tests |
| `scripts/test/fixtures/valid-build-plan.json` | `site_name` → `slug`; add `name` |
| `scripts/test/fixtures/invalid-build-plan-missing-content.json` | Same schema update |
| `.claude/commands/plan.md` | LLM schema: `slug` not `site_name`; note `name` is script-injected |
| `CLAUDE.md` | Add `finalize-plan.sh` step to `/plan` sequence |
| `sites/nopolabs/build-plan.json` | Migration: `site_name` → `slug`, add `name` |
| `sites/ndig/build-plan.json` | Migration: `site_name` → `slug`, add `name` |

---

## Task 1: Update test fixtures and `validate-plan.sh`

**Files:**
- Modify: `scripts/test/fixtures/valid-build-plan.json`
- Modify: `scripts/test/fixtures/invalid-build-plan-missing-content.json`
- Modify: `scripts/validate-plan.sh`

- [ ] **Step 1: Update `valid-build-plan.json`**

Replace the entire file:

```json
{
  "slug": "nopo-labs",
  "name": "Nopo Labs",
  "overview": "nopo-labs is a portfolio site for a software engineer.",
  "style": "minimal",
  "tone": "professional",
  "pages": [
    {
      "id": "home",
      "title": "Home",
      "content": "# Welcome\n\nThis is the home page."
    }
  ],
  "nav": {
    "order": ["home"]
  },
  "contact": {
    "enabled": true,
    "email": "hello@nopolabs.com"
  },
  "build_notes": ""
}
```

- [ ] **Step 2: Update `invalid-build-plan-missing-content.json`**

Replace the entire file. The only intentional invalidity is the missing `content` field in `pages[0]` — fix the stale `show_contact_link` and `contact.type` fields while here:

```json
{
  "slug": "nopo-labs",
  "name": "Nopo Labs",
  "overview": "A portfolio site.",
  "style": "minimal",
  "tone": "professional",
  "pages": [
    {
      "id": "home",
      "title": "Home"
    }
  ],
  "nav": {
    "order": ["home"]
  },
  "contact": {
    "enabled": true,
    "email": "hello@nopolabs.com"
  },
  "build_notes": ""
}
```

- [ ] **Step 3: Run tests — expect validate-plan.sh tests to fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A5 "validate-plan"
```

Expected: "valid plan passes" now fails because `valid-build-plan.json` has `slug` but the validator still checks `site_name`. The "missing content exits 1" test may pass or fail depending on ordering — both are fine; we care that the suite reflects the schema change.

- [ ] **Step 4: Update `validate-plan.sh`**

Replace the entire file:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.json"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node -e "
const plan = JSON.parse(require('fs').readFileSync('$PLAN', 'utf8'));
const errors = [];

if (!plan.slug)     errors.push('slug is required');
if (!plan.name)     errors.push('name is required');
if (!plan.overview) errors.push('overview is required');

const validStyles = ['minimal', 'professional', 'bold'];
if (!validStyles.includes(plan.style))
  errors.push('style must be one of: ' + validStyles.join(', ') + ' (got: ' + plan.style + ')');

const validTones = ['professional', 'casual', 'technical', 'friendly'];
if (!validTones.includes(plan.tone))
  errors.push('tone must be one of: ' + validTones.join(', ') + ' (got: ' + plan.tone + ')');

if (!Array.isArray(plan.pages) || plan.pages.length < 1) {
  errors.push('pages must be a non-empty array');
} else {
  plan.pages.forEach(function(p, i) {
    if (!p.id)      errors.push('pages[' + i + '].id is required');
    if (!p.title)   errors.push('pages[' + i + '].title is required');
    if (!p.content) errors.push('pages[' + i + '].content is required');
  });
}

if (!plan.nav || !Array.isArray(plan.nav.order) || plan.nav.order.length < 1)
  errors.push('nav.order must be a non-empty array');

if (errors.length > 0) {
  console.error('Plan validation failed (' + errors.length + ' error(s)):');
  errors.forEach(function(e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
console.log('✓ Plan is valid (' + plan.pages.length + ' pages, style: ' + plan.style + ')');
"
```

- [ ] **Step 5: Run tests — expect validate-plan.sh section to pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A10 "=== validate-plan"
```

Expected output:
```
=== validate-plan.sh ===
  ✓ valid plan passes
  ✓ missing content exits 1
  ✓ missing file exits 1
```

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-plan.sh \
        scripts/test/fixtures/valid-build-plan.json \
        scripts/test/fixtures/invalid-build-plan-missing-content.json
git commit -m "feat: rename site_name to slug, add name field to build-plan schema"
```

---

## Task 2: Create `finalize-plan.sh` and its tests

**Files:**
- Create: `scripts/finalize-plan.sh`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Add failing tests to `run-tests.sh`**

Insert the following block in `run-tests.sh` between the `validate-plan.sh` section and the `write-site-json.sh` section (after line 279, before line 281 `echo ""`):

```bash
# ── finalize-plan.sh ──────────────────────────────────────────────────────────
echo ""
echo "=== finalize-plan.sh ==="

# Happy path: spec + plan without name → injects name, exits 0
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
printf '%s\n' '{
  "slug": "nopo-labs",
  "overview": "A portfolio site.",
  "style": "minimal",
  "tone": "professional",
  "pages": [{ "id": "home", "title": "Home", "content": "Hello." }],
  "nav": { "order": ["home"] },
  "contact": { "enabled": false },
  "build_notes": ""
}' > "${SITE_DIR}/build-plan.json"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan injects name, exits 0" 0 $?
if node -e "const p=JSON.parse(require('fs').readFileSync('${SITE_DIR}/build-plan.json','utf8')); process.exit(p.name === 'Nopo Labs' ? 0 : 1);" 2>/dev/null; then
  echo "  ✓ name correctly injected into build-plan.json"
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
rm -f "${SITE_DIR}/build-plan.json"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan missing plan exits 1" 1 $?

# Invalid plan (missing page content) → name injected but validate fails → exits 1
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
cp scripts/test/fixtures/invalid-build-plan-missing-content.json "${SITE_DIR}/build-plan.json"
bash scripts/finalize-plan.sh > /dev/null 2>&1; assert_exit "finalize-plan with invalid plan exits 1" 1 $?
```

- [ ] **Step 2: Run tests — expect finalize-plan section to fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A15 "=== finalize-plan"
```

Expected: all 5 finalize-plan assertions fail (script doesn't exist yet).

- [ ] **Step 3: Create `scripts/finalize-plan.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

SPEC="${SITE_DIR}/site-spec.json"
PLAN="${SITE_DIR}/build-plan.json"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan LLM step first."
  exit 1
fi

node -e "
const spec = JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'));
const plan = JSON.parse(require('fs').readFileSync('$PLAN', 'utf8'));

plan.name = spec.site.name;

require('fs').writeFileSync('$PLAN', JSON.stringify(plan, null, 2));
console.log('✓ Injected name: ' + plan.name);
"

bash scripts/validate-plan.sh
```

Make it executable:

```bash
chmod +x scripts/finalize-plan.sh
```

- [ ] **Step 4: Run tests — expect finalize-plan section to pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A15 "=== finalize-plan"
```

Expected:
```
=== finalize-plan.sh ===
  ✓ finalize-plan injects name, exits 0
  ✓ name correctly injected into build-plan.json
  ✓ finalize-plan missing spec exits 1
  ✓ finalize-plan missing plan exits 1
  ✓ finalize-plan with invalid plan exits 1
```

- [ ] **Step 5: Commit**

```bash
git add scripts/finalize-plan.sh scripts/test/run-tests.sh
git commit -m "feat: add finalize-plan.sh — inject display name from spec into build-plan"
```

---

## Task 3: Switch `write-site-json.sh` and `apply-theme.sh` to read from `build-plan.json`

**Files:**
- Modify: `scripts/write-site-json.sh`
- Modify: `scripts/apply-theme.sh`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Update `write-site-json.sh` tests in `run-tests.sh`**

Find the `write-site-json.sh` test section (starts with `echo "=== write-site-json.sh ===" `). Replace the entire section with:

```bash
# ── write-site-json.sh ────────────────────────────────────────────────────────
echo ""
echo "=== write-site-json.sh ==="

cp scripts/test/fixtures/valid-build-plan.json "${SITE_DIR}/build-plan.json"
bash scripts/write-site-json.sh > /dev/null 2>&1; assert_exit "write-site-json exits 0" 0 $?
assert_file_exists "${SITE_DIR}/src/_data/site.json created" "${SITE_DIR}/src/_data/site.json"
if node -e "const s=JSON.parse(require('fs').readFileSync('${SITE_DIR}/src/_data/site.json','utf8')); process.exit(s.name === 'Nopo Labs' ? 0 : 1);" 2>/dev/null; then
  echo "  ✓ site.json name set from build-plan"
  PASS=$((PASS + 1))
else
  echo "  ✗ site.json name not set correctly"
  FAIL=$((FAIL + 1))
fi
```

- [ ] **Step 2: Update `apply-theme.sh` test in `run-tests.sh`**

Find the `apply-theme.sh` test section. Replace the fixture setup line:

Old:
```bash
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
bash scripts/apply-theme.sh > /dev/null 2>&1; assert_exit "apply-theme exits 0 for valid style" 0 $?
```

New:
```bash
cp scripts/test/fixtures/valid-build-plan.json "${SITE_DIR}/build-plan.json"
bash scripts/apply-theme.sh > /dev/null 2>&1; assert_exit "apply-theme exits 0 for valid style" 0 $?
```

- [ ] **Step 3: Run tests — expect write-site-json and apply-theme sections to fail**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -E "(write-site-json|apply-theme|✗)" | head -20
```

Expected: write-site-json and apply-theme tests fail (scripts still read from spec).

- [ ] **Step 4: Rewrite `write-site-json.sh`**

Replace the entire file:

```bash
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
```

- [ ] **Step 5: Rewrite `apply-theme.sh`**

Replace the entire file:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/build-plan.json" ]; then
  echo "Error: ${SITE_DIR}/build-plan.json not found."
  exit 1
fi

STYLE=$(node -e "const s=JSON.parse(require('fs').readFileSync('${SITE_DIR}/build-plan.json','utf8')); console.log(s.style)")
THEME_FILE="scaffold/src/css/themes/${STYLE}.css"

if [ ! -f "$THEME_FILE" ]; then
  echo "Error: Theme file not found: $THEME_FILE"
  echo "Valid styles: minimal, professional, bold"
  exit 1
fi

echo "✓ Theme: $STYLE ($THEME_FILE exists)"
```

- [ ] **Step 6: Run the full test suite — expect all tests to pass**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: N passed, 0 failed`

- [ ] **Step 7: Commit**

```bash
git add scripts/write-site-json.sh scripts/apply-theme.sh scripts/test/run-tests.sh
git commit -m "feat: switch write-site-json and apply-theme to read from build-plan.json"
```

---

## Task 4: Update `/plan` prompt and `CLAUDE.md`

**Files:**
- Modify: `.claude/commands/plan.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `.claude/commands/plan.md`**

Find the `[LLM]` section that shows the JSON schema. Replace the schema block — change `site_name` to `slug` and add a note that `name` must not be included (it's injected by the script):

Old schema block:
```json
{
  "site_name": "<value of site.name from spec>",
  "overview": "<one paragraph — purpose, audience, tone>",
  ...
```

New schema block:
```json
{
  "slug": "<site directory name — same as what was passed to /plan, e.g. acme-corp>",
  "overview": "<one paragraph — purpose, audience, tone>",
  ...
```

Also add after the schema block, before the content rules:

```
Do not include a `name` field — the display name is injected automatically by `finalize-plan.sh` after this step.
```

- [ ] **Step 2: Add the `finalize-plan.sh` step to `.claude/commands/plan.md`**

After the `[LLM]` Write tool step, add a new script step:

Old ending:
```
Write the complete JSON to `sites/<site-name>/build-plan.json`. No extra commentary in the file.

---

Tell the user: "Review `sites/<site-name>/build-plan.json`...
```

New ending:
```
Write the complete JSON to `sites/<site-name>/build-plan.json`. No extra commentary in the file.

---

**[SCRIPT]** Finalize the plan — injects display name from the spec and validates:

```bash
SITE_DIR=sites/<site-name> bash scripts/finalize-plan.sh
```

If this exits with errors, print them clearly and stop.

---

Tell the user: "Review `sites/<site-name>/build-plan.json`...
```

- [ ] **Step 3: Update `CLAUDE.md` `/plan` sequence**

Find the `/plan` command block. The sequence currently shows:

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate sites/<site-name>/build-plan.json (full page content if content_status=draft)
```

Replace with:

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate sites/<site-name>/build-plan.json (full page content if content_status=draft)
[SCRIPT] SITE_DIR=sites/<site-name> bash scripts/finalize-plan.sh
```

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/plan.md CLAUDE.md
git commit -m "docs: update /plan sequence — slug field, finalize-plan.sh step"
```

---

## Task 5: Migrate existing `sites/*/build-plan.json` files

**Files:**
- Modify: `sites/nopolabs/build-plan.json`
- Modify: `sites/ndig/build-plan.json`

- [ ] **Step 1: Read `sites/nopolabs/site-spec.json` to get display name**

```bash
node -e "const s=JSON.parse(require('fs').readFileSync('sites/nopolabs/site-spec.json','utf8')); console.log(s.site.name)"
```

Expected output: `Nopo Labs`

- [ ] **Step 2: Migrate `sites/nopolabs/build-plan.json`**

```bash
node -e "
const plan = JSON.parse(require('fs').readFileSync('sites/nopolabs/build-plan.json', 'utf8'));
const spec = JSON.parse(require('fs').readFileSync('sites/nopolabs/site-spec.json', 'utf8'));
plan.slug = plan.site_name;
delete plan.site_name;
plan.name = spec.site.name;
require('fs').writeFileSync('sites/nopolabs/build-plan.json', JSON.stringify(plan, null, 2));
console.log('migrated nopolabs: slug=' + plan.slug + ', name=' + plan.name);
"
```

- [ ] **Step 3: Validate the migrated plan**

```bash
SITE_DIR=sites/nopolabs bash scripts/validate-plan.sh
```

Expected: `✓ Plan is valid (1 pages, style: minimal)`

- [ ] **Step 4: Read `sites/ndig/site-spec.json` to get display name**

```bash
node -e "const s=JSON.parse(require('fs').readFileSync('sites/ndig/site-spec.json','utf8')); console.log(s.site.name)"
```

Note the output — it's the display name to use in step 5.

- [ ] **Step 5: Migrate `sites/ndig/build-plan.json`**

```bash
node -e "
const plan = JSON.parse(require('fs').readFileSync('sites/ndig/build-plan.json', 'utf8'));
const spec = JSON.parse(require('fs').readFileSync('sites/ndig/site-spec.json', 'utf8'));
plan.slug = plan.site_name;
delete plan.site_name;
plan.name = spec.site.name;
require('fs').writeFileSync('sites/ndig/build-plan.json', JSON.stringify(plan, null, 2));
console.log('migrated ndig: slug=' + plan.slug + ', name=' + plan.name);
"
```

- [ ] **Step 6: Validate the migrated plan**

```bash
SITE_DIR=sites/ndig bash scripts/validate-plan.sh
```

Expected: `✓ Plan is valid (2 pages, style: minimal)`

- [ ] **Step 7: Run the full test suite one final time**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: N passed, 0 failed`

- [ ] **Step 8: Commit in the main repo and the sites repo**

```bash
git add sites/nopolabs/build-plan.json sites/ndig/build-plan.json
git commit -m "chore: migrate existing build-plan.json files to slug/name schema"
```

```bash
git -C sites add nopolabs/build-plan.json ndig/build-plan.json
git -C sites commit -m "chore: migrate build-plan.json to slug/name schema"
```
