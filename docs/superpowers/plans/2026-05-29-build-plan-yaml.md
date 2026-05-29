# Build Plan YAML Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch `build-plan.json` to `build-plan.yaml` with GitHub Flavored Markdown in YAML literal block scalars for page content, making plans human-readable while specifying an unambiguous markup dialect.

**Architecture:** Add `js-yaml` as a root-level Node dependency. Update all four build-pipeline scripts to parse YAML instead of JSON. Replace JSON test fixtures with YAML equivalents. Update the `/plan` LLM prompt to generate YAML with GFM content. Migrate existing site build plans from `.json` to `.yaml`.

**Tech Stack:** Bash, Node.js (inline `-e` scripts), js-yaml v4, GFM (GitHub Flavored Markdown)

---

## File Map

| File | Change |
|---|---|
| `package.json` (root) | Create — js-yaml dependency |
| `scripts/validate-plan.sh` | Parse `build-plan.yaml` with js-yaml |
| `scripts/finalize-plan.sh` | Parse and write `build-plan.yaml` with js-yaml |
| `scripts/write-site-json.sh` | Parse `build-plan.yaml` with js-yaml |
| `scripts/apply-theme.sh` | Parse `build-plan.yaml` with js-yaml |
| `scripts/test/fixtures/valid-build-plan.yaml` | New YAML fixture |
| `scripts/test/fixtures/valid-build-plan.json` | Deleted |
| `scripts/test/fixtures/invalid-build-plan-missing-content.yaml` | New YAML fixture |
| `scripts/test/fixtures/invalid-build-plan-missing-content.json` | Deleted |
| `scripts/test/run-tests.sh` | All `.json` fixture references → `.yaml` |
| `.claude/commands/plan.md` | Schema → YAML; content rules → GFM + block scalar |
| `.claude/commands/build.md` | Reference `build-plan.yaml` |
| `CLAUDE.md` | `/plan` sequence + Files Written table |
| `sites/nopolabs/build-plan.yaml` | Migrated from `.json` |
| `sites/nopolabs/build-plan.json` | Deleted |
| `sites/ndig/build-plan.yaml` | Migrated from `.json` |
| `sites/ndig/build-plan.json` | Deleted |

---

## Task 1: Install js-yaml

**Files:**
- Create: `package.json` (project root — `/Users/danrevel/dev/clodsite/package.json`)

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "clodsite",
  "version": "1.0.0",
  "private": true,
  "description": "Script dependencies for Clodsite build pipeline",
  "dependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: `node_modules/js-yaml/` created, `package-lock.json` written.

- [ ] **Step 3: Verify js-yaml is loadable from the project root**

```bash
node -e "const yaml = require('js-yaml'); console.log(yaml.load('key: value').key)"
```

Expected output: `value`

- [ ] **Step 4: Add `node_modules` and `package-lock.json` to `.gitignore` if not already present**

Check:
```bash
cat .gitignore 2>/dev/null || echo "(no .gitignore)"
```

If `node_modules` is not listed, create or append to `.gitignore` at the project root:
```
node_modules/
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add js-yaml dependency for YAML build plan parsing"
```

---

## Task 2: Create YAML fixtures and update all test references

**Files:**
- Create: `scripts/test/fixtures/valid-build-plan.yaml`
- Delete: `scripts/test/fixtures/valid-build-plan.json`
- Create: `scripts/test/fixtures/invalid-build-plan-missing-content.yaml`
- Delete: `scripts/test/fixtures/invalid-build-plan-missing-content.json`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Create `valid-build-plan.yaml`**

Write `scripts/test/fixtures/valid-build-plan.yaml`:

```yaml
slug: nopo-labs
name: Nopo Labs
overview: nopo-labs is a portfolio site for a software engineer.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    content: |
      # Welcome

      This is the home page.
nav:
  order:
    - home
contact:
  enabled: true
  email: hello@nopolabs.com
build_notes: ""
```

- [ ] **Step 2: Create `invalid-build-plan-missing-content.yaml`**

Write `scripts/test/fixtures/invalid-build-plan-missing-content.yaml`:

```yaml
slug: nopo-labs
name: Nopo Labs
overview: A portfolio site.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
nav:
  order:
    - home
contact:
  enabled: true
  email: hello@nopolabs.com
build_notes: ""
```

(No `content` field under `home` — that is the intentional invalidity.)

- [ ] **Step 3: Delete the old JSON fixtures**

```bash
rm scripts/test/fixtures/valid-build-plan.json
rm scripts/test/fixtures/invalid-build-plan-missing-content.json
```

- [ ] **Step 4: Update `run-tests.sh` — write-site-json section (line 85)**

Old:
```bash
cp scripts/test/fixtures/valid-build-plan.json "${SITE_DIR}/build-plan.json"
```

New:
```bash
cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
```

- [ ] **Step 5: Update `run-tests.sh` — apply-theme section (line 100)**

Old:
```bash
cp scripts/test/fixtures/valid-build-plan.json "${SITE_DIR}/build-plan.json"
```

New:
```bash
cp scripts/test/fixtures/valid-build-plan.yaml "${SITE_DIR}/build-plan.yaml"
```

- [ ] **Step 6: Update `run-tests.sh` — validate-plan section (lines 260–280)**

Replace the entire validate-plan test section:

Old:
```bash
cp scripts/test/fixtures/valid-build-plan.json "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid plan passes" 0 $?

cp scripts/test/fixtures/invalid-build-plan-missing-content.json "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing content exits 1" 1 $?

rm -f "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing file exits 1" 1 $?

printf '%s\n' '{
  "slug": "test",
  "name": "Test",
  "overview": "Test site.",
  "style": "minimal",
  "tone": "professional",
  "pages": [{ "id": "home", "title": "Home", "content": "Hello." }],
  "nav": { "order": ["home", "nonexistent"] },
  "contact": { "enabled": false },
  "build_notes": ""
}' > "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "nav.order with unknown page id exits 1" 1 $?
```

New:
```bash
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
    content: Hello.
nav:
  order:
    - home
    - nonexistent
contact:
  enabled: false
build_notes: ""' > "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "nav.order with unknown page id exits 1" 1 $?
```

- [ ] **Step 7: Update `run-tests.sh` — finalize-plan section (lines 282–319)**

Replace the entire finalize-plan test section:

Old:
```bash
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

New:
```bash
# Happy path: spec + plan without name → injects name, exits 0
cp scripts/test/fixtures/valid-spec.json "${SITE_DIR}/site-spec.json"
printf '%s\n' 'slug: nopo-labs
overview: A portfolio site.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    content: Hello.
nav:
  order:
    - home
contact:
  enabled: false
build_notes: ""' > "${SITE_DIR}/build-plan.yaml"
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
```

- [ ] **Step 8: Run tests — expect failures in validate-plan, finalize-plan, write-site-json, apply-theme sections**

```bash
bash scripts/test/run-tests.sh 2>&1 | tail -5
```

Expected: multiple failures (scripts still read `.json`). This is the expected TDD red state.

- [ ] **Step 9: Commit**

```bash
git add scripts/test/fixtures/valid-build-plan.yaml \
        scripts/test/fixtures/invalid-build-plan-missing-content.yaml \
        scripts/test/run-tests.sh
git rm scripts/test/fixtures/valid-build-plan.json \
       scripts/test/fixtures/invalid-build-plan-missing-content.json
git commit -m "test: switch fixtures and test references from JSON to YAML build plan"
```

---

## Task 3: Update `validate-plan.sh`

**Files:**
- Modify: `scripts/validate-plan.sh`

- [ ] **Step 1: Replace `validate-plan.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const plan = yaml.load(require('fs').readFileSync('$PLAN', 'utf8'));
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

if (plan.nav && Array.isArray(plan.nav.order)) {
  const pageIds = (plan.pages || []).map(function(p) { return p.id; });
  plan.nav.order.forEach(function(id) {
    if (!pageIds.includes(id))
      errors.push('nav.order references unknown page id: ' + id);
  });
}

if (errors.length > 0) {
  console.error('Plan validation failed (' + errors.length + ' error(s)):');
  errors.forEach(function(e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
console.log('✓ Plan is valid (' + plan.pages.length + ' pages, style: ' + plan.style + ')');
"
```

- [ ] **Step 2: Run tests — validate-plan section must pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A8 "=== validate-plan"
```

Expected:
```
=== validate-plan.sh ===
  ✓ valid plan passes
  ✓ missing content exits 1
  ✓ missing file exits 1
  ✓ nav.order with unknown page id exits 1
```

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-plan.sh
git commit -m "feat: validate-plan.sh reads build-plan.yaml via js-yaml"
```

---

## Task 4: Update `finalize-plan.sh`

**Files:**
- Modify: `scripts/finalize-plan.sh`

- [ ] **Step 1: Replace `finalize-plan.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

SPEC="${SITE_DIR}/site-spec.json"
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$SPEC" ]; then
  echo "Error: $SPEC not found. Run /interview first."
  exit 1
fi

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan LLM step first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const spec = JSON.parse(require('fs').readFileSync('$SPEC', 'utf8'));
const plan = yaml.load(require('fs').readFileSync('$PLAN', 'utf8'));

plan.name = spec.site.name;

require('fs').writeFileSync('$PLAN', yaml.dump(plan, { lineWidth: -1, noRefs: true }));
console.log('✓ Injected name: ' + plan.name);
"

bash scripts/validate-plan.sh
```

- [ ] **Step 2: Run tests — finalize-plan section must pass**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A10 "=== finalize-plan"
```

Expected:
```
=== finalize-plan.sh ===
  ✓ finalize-plan injects name, exits 0
  ✓ name correctly injected into build-plan.yaml
  ✓ finalize-plan missing spec exits 1
  ✓ finalize-plan missing plan exits 1
  ✓ finalize-plan with invalid plan exits 1
```

- [ ] **Step 3: Commit**

```bash
git add scripts/finalize-plan.sh
git commit -m "feat: finalize-plan.sh reads and writes build-plan.yaml via js-yaml"
```

---

## Task 5: Update `write-site-json.sh` and `apply-theme.sh`

**Files:**
- Modify: `scripts/write-site-json.sh`
- Modify: `scripts/apply-theme.sh`

- [ ] **Step 1: Replace `write-site-json.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/build-plan.yaml" ]; then
  echo "Error: ${SITE_DIR}/build-plan.yaml not found. Run /plan first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const plan = yaml.load(require('fs').readFileSync('${SITE_DIR}/build-plan.yaml', 'utf8'));

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

- [ ] **Step 2: Replace `apply-theme.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"

if [ ! -f "${SITE_DIR}/build-plan.yaml" ]; then
  echo "Error: ${SITE_DIR}/build-plan.yaml not found."
  exit 1
fi

STYLE=$(node -e "const yaml=require('js-yaml'); const s=yaml.load(require('fs').readFileSync('${SITE_DIR}/build-plan.yaml','utf8')); console.log(s.style)")
THEME_FILE="scaffold/src/css/themes/${STYLE}.css"

if [ ! -f "$THEME_FILE" ]; then
  echo "Error: Theme file not found: $THEME_FILE"
  echo "Valid styles: minimal, professional, bold"
  exit 1
fi

echo "✓ Theme: $STYLE ($THEME_FILE exists)"
```

- [ ] **Step 3: Run the full test suite — all tests must pass**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 42 passed, 0 failed`

- [ ] **Step 4: Commit**

```bash
git add scripts/write-site-json.sh scripts/apply-theme.sh
git commit -m "feat: write-site-json and apply-theme read build-plan.yaml via js-yaml"
```

---

## Task 6: Update LLM prompts and `CLAUDE.md`

**Files:**
- Modify: `.claude/commands/plan.md`
- Modify: `.claude/commands/build.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `.claude/commands/plan.md` — instruction line**

Old:
```
**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate `sites/<site-name>/build-plan.json` using the Write tool.

The JSON must match this schema exactly:
```

New:
```
**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate `sites/<site-name>/build-plan.yaml` using the Write tool.

The YAML must match this schema exactly:
```

- [ ] **Step 2: Update `.claude/commands/plan.md` — replace JSON schema block with YAML**

Old (the ```json ... ``` block):
```json
{
  "slug": "<site directory name — same as what was passed to /plan, e.g. acme-corp>",
  "overview": "<one paragraph — purpose, audience, tone>",
  "style": "<value of site.style from spec>",
  "tone": "<value of site.tone from spec>",
  "pages": [
    {
      "id": "<page id from spec>",
      "title": "<page title from spec>",
      "content": "<full page content in markdown — see rules below>"
    }
  ],
  "nav": {
    "order": ["<page ids in nav order from spec>"]
  },
  "contact": {
    "enabled": "<true or false from spec>",
    "email": "<email address, or omit key if contact.enabled is false>"
  },
  "build_notes": "<any special rendering notes for /build, or empty string>"
}
```

New (a ```yaml ... ``` block):
```yaml
slug: <site directory name — same as what was passed to /plan, e.g. acme-corp>
overview: >-
  <one paragraph — purpose, audience, tone>
style: <value of site.style from spec>
tone: <value of site.tone from spec>
pages:
  - id: <page id from spec>
    title: <page title from spec>
    content: |
      <full page content in GFM — see rules below>
nav:
  order:
    - <page ids in nav order from spec>
contact:
  enabled: <true or false from spec>
  email: <email address — omit this key if contact.enabled is false>
build_notes: <any special rendering notes for /build, or empty string>
```

- [ ] **Step 3: Update `.claude/commands/plan.md` — update content rules**

Old:
```
- Format as markdown: `#` for main heading, `##` for subheadings, plain paragraphs, fenced code blocks with triple backticks, bullet lists.
```

New:
```
- Format as GFM (GitHub Flavored Markdown): `#` for main heading, `##` for subheadings, plain paragraphs, fenced code blocks with triple backticks, bullet lists, pipe tables.
- The `content` field uses a YAML literal block scalar (`|`). Write content starting on the next line, indented 6 spaces (2 beyond the `content:` key at 4 spaces). Do not add a leading `#` heading — the template handles the page title.
```

- [ ] **Step 4: Update `.claude/commands/plan.md` — final write instruction**

Old:
```
Write the complete JSON to `sites/<site-name>/build-plan.json`. No extra commentary in the file.
```

New:
```
Write the complete YAML to `sites/<site-name>/build-plan.yaml`. No extra commentary in the file.
```

- [ ] **Step 5: Update `.claude/commands/build.md` — all `build-plan.json` references**

Line 45: `**[LLM]** Read \`sites/<site-name>/build-plan.json\`.`
→ `**[LLM]** Read \`sites/<site-name>/build-plan.yaml\`.`

Line 62: `pageTitle: [page title from build-plan.json pages[n].title]`
→ `pageTitle: [page title from build-plan.yaml pages[n].title]`

Line 65: `[page content as HTML, converted from build-plan.json pages[n].content]`
→ `[page content as HTML, converted from build-plan.yaml pages[n].content]`

- [ ] **Step 6: Update `CLAUDE.md` — `/plan` sequence**

Old:
```
[LLM]    Generate sites/<site-name>/build-plan.json (full page content if content_status=draft)
```

New:
```
[LLM]    Generate sites/<site-name>/build-plan.yaml (full page content in GFM if content_status=draft)
```

- [ ] **Step 7: Update `CLAUDE.md` — Files Written table**

Old:
```
| `sites/<site-name>/build-plan.json` | `/plan <site-name>` | Structured build plan — all content decisions captured here (review before /build) |
```

New:
```
| `sites/<site-name>/build-plan.yaml` | `/plan <site-name>` | Structured build plan with GFM page content — review before /build |
```

- [ ] **Step 8: Commit**

```bash
git add .claude/commands/plan.md .claude/commands/build.md CLAUDE.md
git commit -m "docs: update /plan prompt and CLAUDE.md for build-plan.yaml + GFM"
```

---

## Task 7: Migrate existing site build plans

**Files:**
- Create: `sites/nopolabs/build-plan.yaml`
- Delete: `sites/nopolabs/build-plan.json`
- Create: `sites/ndig/build-plan.yaml`
- Delete: `sites/ndig/build-plan.json`

- [ ] **Step 1: Migrate `sites/nopolabs/build-plan.json` → `.yaml`**

```bash
node -e "
const yaml = require('js-yaml');
const plan = JSON.parse(require('fs').readFileSync('sites/nopolabs/build-plan.json', 'utf8'));
require('fs').writeFileSync(
  'sites/nopolabs/build-plan.yaml',
  yaml.dump(plan, { lineWidth: -1, noRefs: true })
);
console.log('migrated nopolabs');
"
```

- [ ] **Step 2: Validate migrated nopolabs plan**

```bash
SITE_DIR=sites/nopolabs bash scripts/validate-plan.sh
```

Expected: `✓ Plan is valid (1 pages, style: minimal)`

- [ ] **Step 3: Delete `sites/nopolabs/build-plan.json`**

```bash
rm sites/nopolabs/build-plan.json
```

- [ ] **Step 4: Migrate `sites/ndig/build-plan.json` → `.yaml`**

```bash
node -e "
const yaml = require('js-yaml');
const plan = JSON.parse(require('fs').readFileSync('sites/ndig/build-plan.json', 'utf8'));
require('fs').writeFileSync(
  'sites/ndig/build-plan.yaml',
  yaml.dump(plan, { lineWidth: -1, noRefs: true })
);
console.log('migrated ndig');
"
```

- [ ] **Step 5: Validate migrated ndig plan**

```bash
SITE_DIR=sites/ndig bash scripts/validate-plan.sh
```

Expected: `✓ Plan is valid (2 pages, style: minimal)`

- [ ] **Step 6: Delete `sites/ndig/build-plan.json`**

```bash
rm sites/ndig/build-plan.json
```

- [ ] **Step 7: Run the full test suite one final time**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: 42 passed, 0 failed`

- [ ] **Step 8: Commit in the main repo**

```bash
git rm sites/nopolabs/build-plan.json sites/ndig/build-plan.json
git add sites/nopolabs/build-plan.yaml sites/ndig/build-plan.yaml
git commit -m "chore: migrate sites build plans from JSON to YAML"
```

- [ ] **Step 9: Commit in the sites sub-repo**

```bash
git -C sites add nopolabs/build-plan.yaml ndig/build-plan.yaml
git -C sites rm nopolabs/build-plan.json ndig/build-plan.json
git -C sites commit -m "chore: migrate build-plan.json to build-plan.yaml (GFM in YAML block scalars)"
```
