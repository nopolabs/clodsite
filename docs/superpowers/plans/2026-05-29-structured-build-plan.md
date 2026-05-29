# Structured Build Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `build-plan.md` with `build-plan.json` so all content decisions happen during `/plan` (inference), and `/build` reads from the JSON to generate templates (rendering, not deciding).

**Architecture:** `/plan` generates `build-plan.json` — a structured document with full per-page content written during inference. `/build` reads `build-plan.json` and passes it to the LLM as a content source for template generation; no content decisions happen at build time. A new `validate-plan.sh` script guards the boundary before `/build` runs. The LLM's role in `/build` shifts from "write the content and the template" to "render this content into a template."

**Tech Stack:** bash, Node.js (for validation), Nunjucks/Eleventy (unchanged)

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `.claude/commands/plan.md` | Modify | Output `build-plan.json` instead of `build-plan.md` |
| `.claude/commands/build.md` | Modify | Read from `build-plan.json`; add validate-plan step |
| `scripts/validate-plan.sh` | Create | Schema validation for `build-plan.json` |
| `scripts/test/fixtures/valid-build-plan.json` | Create | Test fixture |
| `scripts/test/fixtures/invalid-build-plan-missing-content.json` | Create | Test fixture |
| `scripts/test/run-tests.sh` | Modify | Add validate-plan.sh tests |
| `CLAUDE.md` | Modify | Update files table; update /plan and /build descriptions |
| `README.md` | Modify | Update architecture section |
| `ROADMAP.md` | Modify | Mark structured build plan as shipped |
| `docs/superpowers/specs/2026-05-29-structured-build-plan-design.md` | Create | Design spec |

---

## `build-plan.json` Schema

```json
{
  "site_name": "ndig",
  "overview": "One paragraph describing the site — purpose, audience, tone.",
  "style": "minimal",
  "tone": "technical",
  "pages": [
    {
      "id": "home",
      "title": "Home",
      "content": "Full page content in markdown. This is the copy that will appear on the live site."
    }
  ],
  "nav": {
    "order": ["home", "usage"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "owner@example.com"
  },
  "build_notes": "Any special layout or rendering notes for /build."
}
```

`pages[n].content` is markdown. The LLM in `/build` converts it to HTML inside the Nunjucks template.

---

### Task 1: Write the design spec

**Files:**
- Create: `docs/superpowers/specs/2026-05-29-structured-build-plan-design.md`

- [ ] **Step 1: Write the design spec**

```markdown
# Structured Build Plan Design

## Problem

`/plan` produces `build-plan.md` — a markdown document that the LLM re-reads
during `/build` to generate Nunjucks templates. The LLM makes content decisions
in both `/plan` and `/build`. This contradicts the inference-boundary claim: the
spec (and plan) should capture all decisions; `/build` should be a render step.

## Solution

Change `/plan` to produce `build-plan.json`. All page content is written during
`/plan` inference and frozen in the JSON. `/build` reads the JSON and passes it
to the LLM as the content source — the LLM renders, not decides. A
`validate-plan.sh` guard catches malformed plans before `/build` runs.

## Schema

```json
{
  "site_name": "string — matches site.name in site-spec.json",
  "overview": "string — one paragraph, written during /plan",
  "style": "string — one of: minimal, professional, bold",
  "tone": "string — one of: professional, casual, technical, friendly",
  "pages": [
    {
      "id": "string — matches page id in site-spec.json",
      "title": "string — display title",
      "content": "string — full page content in markdown"
    }
  ],
  "nav": {
    "order": ["array of page ids"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "string"
  },
  "build_notes": "string — optional, special rendering instructions"
}
```

## Migration

Existing `build-plan.md` files are not read by the new pipeline. Re-run
`/plan <site-name>` to generate `build-plan.json` for any existing site.

## What does NOT change

- `site-spec.json` schema is unchanged
- The LLM still generates `.njk` templates in `/build`
- Eleventy build process is unchanged
- All other scripts are unchanged
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-29-structured-build-plan-design.md
git commit -m "docs: add structured build-plan.json design spec"
```

---

### Task 2: Write validate-plan.sh

**Files:**
- Create: `scripts/validate-plan.sh`

- [ ] **Step 1: Write the failing test first** (see Task 3 — write tests before the script)

Skip ahead to Task 3 to write tests, then return here.

- [ ] **Step 2: Write the script**

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

if (!plan.site_name)  errors.push('site_name is required');
if (!plan.overview)   errors.push('overview is required');

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

- [ ] **Step 3: Make it executable**

```bash
chmod +x scripts/validate-plan.sh
```

---

### Task 3: Write tests for validate-plan.sh

**Files:**
- Create: `scripts/test/fixtures/valid-build-plan.json`
- Create: `scripts/test/fixtures/invalid-build-plan-missing-content.json`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Write the valid fixture**

```json
{
  "site_name": "nopo-labs",
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
    "order": ["home"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "hello@nopolabs.com"
  },
  "build_notes": ""
}
```

- [ ] **Step 2: Write the invalid fixture**

```json
{
  "site_name": "nopo-labs",
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
    "order": ["home"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
    "email": "hello@nopolabs.com"
  },
  "build_notes": ""
}
```

(Missing `pages[0].content` — the critical field.)

- [ ] **Step 3: Add test cases to run-tests.sh**

Find the line `# ── Results ───` near the end of `scripts/test/run-tests.sh` and insert before it:

```bash
# ── validate-plan.sh ──────────────────────────────────────────────────────────
echo ""
echo "=== validate-plan.sh ==="

cp scripts/test/fixtures/valid-build-plan.json "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid plan passes" 0 $?

cp scripts/test/fixtures/invalid-build-plan-missing-content.json "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing content exits 1" 1 $?

rm -f "${SITE_DIR}/build-plan.json"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing file exits 1" 1 $?
```

- [ ] **Step 4: Run tests — expect the new tests to FAIL (validate-plan.sh doesn't exist yet)**

```bash
bash scripts/test/run-tests.sh
```

Expected: existing tests pass; the three new `validate-plan.sh` tests fail with "not found".

- [ ] **Step 5: Now write validate-plan.sh** (go to Task 2, Step 2)

- [ ] **Step 6: Run tests — all should pass now**

```bash
bash scripts/test/run-tests.sh
```

Expected output ends with: `Results: N passed, 0 failed`

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-plan.sh \
        scripts/test/fixtures/valid-build-plan.json \
        scripts/test/fixtures/invalid-build-plan-missing-content.json \
        scripts/test/run-tests.sh
git commit -m "feat: add validate-plan.sh and tests for build-plan.json"
```

---

### Task 4: Update the `/plan` command

**Files:**
- Modify: `.claude/commands/plan.md`

- [ ] **Step 1: Replace the file**

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

**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate `sites/<site-name>/build-plan.json` using the Write tool.

The JSON must match this schema exactly:

```json
{
  "site_name": "<value of site.name from spec>",
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
    "order": ["<page ids in nav order from spec>"],
    "show_contact_link": <true or false from spec>
  },
  "contact": {
    "enabled": <true or false from spec>,
    "type": "<email>",
    "email": "<email from spec, or omit if contact.enabled is false>"
  },
  "build_notes": "<any special rendering notes, or empty string>"
}
```

**Content rules for `pages[n].content`:**

- If `content_status = "provided"`: use `content_outline` as-is, wrapped in appropriate markdown headings.
- If `content_status = "draft"`: write complete, publish-ready copy using `content_outline` as your brief. Write real sentences. Match the site tone. This is the copy that will appear on the live site.
- Format as markdown: `#` for main heading, `##` for subheadings, plain paragraphs, code blocks with triple backticks, bullet lists.
- Do not include the page title as a heading — that comes from the template. Start with the first content element.

Write the complete JSON to `sites/<site-name>/build-plan.json`. No extra commentary.

---

Tell the user: "Review `sites/<site-name>/build-plan.json` — check the page content and structure. When ready, run `/build <site-name>`."
```

- [ ] **Step 2: Verify the file was written correctly** — read it back and confirm it matches the above.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/plan.md
git commit -m "feat: update /plan to produce build-plan.json instead of build-plan.md"
```

---

### Task 5: Update the `/build` command

**Files:**
- Modify: `.claude/commands/build.md`

- [ ] **Step 1: Replace the file**

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

**[SCRIPT]** Validate the build plan:

```bash
SITE_DIR=sites/<site-name> bash scripts/validate-plan.sh
```

If this exits with errors, print them clearly to the user and stop. The user should re-run `/plan <site-name>` to regenerate the build plan.

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

**[LLM]** Read `sites/<site-name>/build-plan.json`.

Generate an Eleventy Nunjucks template for each page in `pages[]`.

**Template rules:**
- The first page in `nav.order` gets `permalink: /` in its front matter and is saved as `sites/<site-name>/src/index.njk`
- All other pages get `permalink: /[page-id]/` (trailing slash required — Eleventy v3) and are saved as `sites/<site-name>/src/[page-id].njk`
- Every template uses `layout: base.njk` and sets `pageTitle` to the page's `title` from the plan
- Convert `pages[n].content` (markdown) to HTML. Use semantic markup: `<h1>` for `#`, `<h2>` for `##`, `<p>` for paragraphs, `<pre><code>` for fenced code blocks, `<ul><li>` for bullet lists, `<table>` for tables
- Use the content from `build-plan.json` exactly as written. Do not shorten, rewrite, or add to it
- **Images:** place image files in `sites/<site-name>/images/` and reference them as `/images/<filename>` in `<img>` tags
- **Page-specific CSS:** if the `build_notes` field calls for custom styling, put it in a `<style>` block inside the page body, immediately after the `---` of the front matter. **Never modify theme files** in `scaffold/src/css/themes/`

**Template format:**

```
---
layout: base.njk
pageTitle: [page title from build-plan.json]
permalink: [/ for first page, /[id]/ for others — trailing slash required]
---
[page content as HTML, converted from build-plan.json pages[n].content]
```

Use the Write tool to create each file at its exact path.

---

**If `contact.enabled = true`**, also write `sites/<site-name>/src/contact.njk`:

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

- [ ] **Step 2: Verify the file was written correctly** — confirm `validate-plan.sh` is called and `build-plan.json` is the content source.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/build.md
git commit -m "feat: update /build to read from build-plan.json"
```

---

### Task 6: Update CLAUDE.md, README.md, and ROADMAP.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the Files Written During a Run table in CLAUDE.md**

Replace:

```
| `sites/<site-name>/build-plan.md` | `/plan <site-name>` | Approved build plan (review before /build) |
```

With:

```
| `sites/<site-name>/build-plan.json` | `/plan <site-name>` | Structured build plan — all content decisions captured here (review before /build) |
```

- [ ] **Step 2: Update the `/plan` description in CLAUDE.md**

Replace:

```
### `/plan` — `[HYBRID]`
Validate spec. Generate build plan with approved copy. Produces `sites/<site-name>/build-plan.md`.

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate sites/<site-name>/build-plan.md (including copy if content_status=draft)
```
```

With:

```
### `/plan` — `[HYBRID]`
Validate spec. Write all page content. Produces `sites/<site-name>/build-plan.json` — the inference boundary. Everything before this is deciding; everything after is rendering.

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate sites/<site-name>/build-plan.json (full page content if content_status=draft)
```
```

- [ ] **Step 3: Update the `/build` description in CLAUDE.md**

Replace:

```
### `/build` — `[HYBRID]`
Write site data. Generate page templates. Run Eleventy. Produces `sites/<site-name>/dist/`.

```
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Generate sites/<site-name>/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```
```

With:

```
### `/build` — `[HYBRID]`
Render build plan to templates. Run Eleventy. Produces `sites/<site-name>/dist/`. All content is read from `build-plan.json` — no content decisions happen here.

```
[SCRIPT] bash scripts/validate-plan.sh
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Render build-plan.json → sites/<site-name>/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```
```

- [ ] **Step 4: Update the architecture ASCII diagram in README.md**

Replace:

```
/plan        [HYBRID]  — script validates, LLM generates copy
/build       [HYBRID]  — script writes data, LLM writes templates
```

With:

```
/plan        [HYBRID]  — script validates, LLM writes all content → build-plan.json
/build       [HYBRID]  — script validates plan, LLM renders content → templates
```

- [ ] **Step 5: Update "The inference boundary" line in README.md**

Replace:

```
The inference boundary is `site-spec.json`. Before it, Claude. After it, scripts.
```

With:

```
The inference boundary is `build-plan.json`. Before it, Claude decides. After it, scripts (and LLM-as-renderer) execute.
```

- [ ] **Step 6: Add structured build plan to ROADMAP.md Completed section**

Add after the "Sites version control" entry:

```markdown
### Structured build plan (`build-plan.json`)
Shipped May 2026. `/plan` now produces `sites/<name>/build-plan.json` — a
structured document with full per-page content written during inference. `/build`
reads the JSON and the LLM renders it into Nunjucks templates; no content
decisions happen at build time. `validate-plan.sh` guards the boundary before
`/build` runs. Existing `build-plan.md` files are not read by the new pipeline
— re-run `/plan <site-name>` to regenerate.
```

Remove "Structured build plan (`build-plan.json`) and script-generated templates" from the Pending section (or update it to note that the JSON structure is shipped; fully scripted template generation remains pending).

- [ ] **Step 7: Run the test suite to confirm nothing is broken**

```bash
bash scripts/test/run-tests.sh
```

Expected: `Results: N passed, 0 failed`

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md README.md ROADMAP.md
git commit -m "docs: update for build-plan.json — inference boundary, command descriptions, roadmap"
```

---

## Self-Review

**Spec coverage:**
- ✓ `/plan` produces `build-plan.json` with per-page content
- ✓ `/build` reads from `build-plan.json`, not `build-plan.md`
- ✓ `validate-plan.sh` guards the build boundary
- ✓ LLM template generation preserved in `/build`
- ✓ Content decisions entirely in `/plan` inference phase
- ✓ Tests added for validate-plan.sh
- ✓ Docs updated: CLAUDE.md, README.md, ROADMAP.md

**Placeholder scan:** No TBDs, no "implement later", all code blocks complete.

**Type consistency:** `build-plan.json` schema used consistently across validate-plan.sh, plan.md command, and build.md command. Field names (`site_name`, `pages[n].content`, `nav.order`) match in all three.

**Migration note:** Included in ROADMAP entry and design spec. Existing `build-plan.md` files are left in place (non-destructive); users re-run `/plan`.
