# Component Catalog v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `[LLM]` render step in `/build` with a script that composes pages from a typed component catalog. Make `/build` fully `[SCRIPT]`.

**Architecture:** New top-level `components/` directory holds three components (`prose`, `gallery`, `mailto-form`), each a self-contained triple of `component.njk` + `component.css` + `schema.json`. A new `render-templates.sh` script reads each page's `components: [...]` array from `build-plan.yaml` and emits one Nunjucks file per page that `{% include %}`s the right component templates in order. `validate-plan.sh` enforces component types against schemas. `apply-theme.sh` concatenates component CSS into a single `components.css` always loaded by `base.njk`. A `generate-catalog-md.sh` script produces `components/CATALOG.md` from the schemas — the LLM at `/plan` time picks from this catalog and can't invent component types.

**Tech Stack:** Bash, Node.js (via `js-yaml` in root `package.json`, `markdown-it` to be added in `scaffold/package.json`), Eleventy, Nunjucks.

**Spec:** `docs/superpowers/specs/2026-05-31-component-catalog-design.md`

---

## File Structure

**Created:**
- `components/prose/component.njk`, `component.css`, `schema.json`
- `components/gallery/component.njk`, `component.css`, `schema.json`
- `components/mailto-form/component.njk`, `component.css`, `schema.json`
- `components/CATALOG.md` (generated; committed)
- `scripts/render-templates.sh` — emits per-page `.njk` files from `build-plan.yaml`
- `scripts/generate-catalog-md.sh` — emits `components/CATALOG.md` from schemas
- `scripts/migrate-plan-to-components.sh` — one-shot migration of existing sites
- `scripts/test/fixtures/valid-build-plan-components.yaml`
- `scripts/test/fixtures/invalid-build-plan-bad-component.yaml`
- `scripts/test/fixtures/invalid-build-plan-missing-field.yaml`
- `scripts/test/fixtures/invalid-build-plan-has-build-notes.yaml`

**Modified:**
- `scaffold/.eleventy.js` — register `md` Nunjucks filter; add `components/` to include search path
- `scaffold/package.json` — add `markdown-it` dependency
- `scaffold/src/_includes/base.njk` — one `<link>` to `/css/components.css`
- `scripts/apply-theme.sh` — also concatenate `components/*/component.css` → `scaffold/src/css/components.css`
- `scripts/validate-plan.sh` — drop `content:` requirement; validate `components: [...]` against schemas; reject `build_notes`
- `scripts/test/run-tests.sh` — assertions for the new behaviors
- `scripts/test/fixtures/valid-build-plan.yaml` — convert to component shape
- `.claude/commands/plan.md` — schema teaching switches from `content:` to `components: [...]`; references `components/CATALOG.md`
- `.claude/commands/build.md` — remove the entire `[LLM]` template-render section; add a `render-templates.sh` call
- `CLAUDE.md` — `/build` pipeline drops the `[LLM]` step, adds `render-templates.sh`
- `.gitignore` — add `scaffold/src/css/components.css`
- `ROADMAP.md` — mark "Page-type / component catalog" and "Script-generated templates" as shipped
- All five site plans under `sites/*/build-plan.yaml` — migrated to component shape

**Deleted:** Nothing. (The `images/` migration was already done in slice 1.)

---

### Task 1: Add `md` Nunjucks filter via markdown-it

**Files:**
- Modify: `scaffold/package.json`
- Modify: `scaffold/.eleventy.js`

- [ ] **Step 1: Install `markdown-it` in the scaffold.**

```bash
cd scaffold && npm install markdown-it@^14.1.0 && cd ..
```

Confirm `scaffold/package.json` now lists `markdown-it` under `dependencies` and that `scaffold/node_modules/markdown-it` exists.

- [ ] **Step 2: Register a `md` Nunjucks filter in `scaffold/.eleventy.js`.**

At the top of the file, after the `const fs = require('fs');` line, add:

```js
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
```

Inside `module.exports = function(eleventyConfig) {`, immediately after the opening brace and before the `const siteDir = …` line, add:

```js
  eleventyConfig.addFilter('md', (str) => md.render(str || ''));
  eleventyConfig.addFilter('mdInline', (str) => md.renderInline(str || ''));
```

- [ ] **Step 3: Smoke-test the filter via a one-off Eleventy build.**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
SITE_DIR=sites/clodsite bash scripts/build-site.sh 2>&1 | tail -3
```

Expected: build completes with the existing 4 HTML files. The filter is registered but not yet used; this just confirms `.eleventy.js` still loads.

- [ ] **Step 4: Commit.**

```bash
git add scaffold/package.json scaffold/package-lock.json scaffold/.eleventy.js
git commit -m "feat(eleventy): add md filter via markdown-it for component rendering"
```

If `scaffold/package-lock.json` is gitignored, omit it from the `git add`.

---

### Task 2: Create components/ + prose component

**Files:**
- Create: `components/prose/component.njk`
- Create: `components/prose/component.css`
- Create: `components/prose/schema.json`
- Modify: `scaffold/.eleventy.js`

- [ ] **Step 1: Create the directory and the prose component files.**

```bash
mkdir -p components/prose
```

`components/prose/component.njk`:

```njk
<div class="c-prose">
{{ component.markdown | md | safe }}
</div>
```

`components/prose/component.css`: (empty file — prose styling lives in theme CSS)

```css
/* prose styling lives in scaffold/src/css/themes/<theme>.css */
```

`components/prose/schema.json`:

```json
{
  "description": "Renders a Markdown body to HTML. Supports GFM: headings, paragraphs, lists, links, inline code, blockquotes, tables, fenced code blocks.",
  "required": {
    "markdown": "string"
  },
  "optional": {}
}
```

- [ ] **Step 2: Add `components/` to the Nunjucks include search path.**

Eleventy's `dir.includes` config accepts only one path. To give Nunjucks an additional search path (so `{% include "<name>/component.njk" %}` resolves to repo-root `components/`), hand Eleventy a pre-configured Nunjucks environment via `eleventyConfig.setLibrary('njk', …)`. This requires `nunjucks` as a direct dependency in the scaffold:

```bash
cd scaffold && npm install nunjucks@^3.2.4 && cd ..
```

Then overwrite `scaffold/.eleventy.js` with the version below. Compared to the current file, this version:

- Adds `markdown-it` and `nunjucks` requires at the top.
- Defines the `md` filter and `mdInline` filter (covering Task 1's intent).
- Computes `componentsDir = path.join(repoRoot, 'components')`.
- Calls `eleventyConfig.setLibrary('njk', nunjucks.configure([_includes, componentsDir], { autoescape: false, throwOnUndefined: false }))` so Nunjucks searches both directories. `autoescape: false` matches Eleventy's default for `.njk` templates.
- Leaves the passthrough block and `return { dir: … }` block unchanged.

Final contents of `scaffold/.eleventy.js`:

```js
const path = require('path');
const fs   = require('fs');
const MarkdownIt = require('markdown-it');
const nunjucks   = require('nunjucks');

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });

const FAVICON_FILES = [
  'favicon.ico',
  'favicon.svg',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'apple-touch-icon.png',
];

module.exports = function(eleventyConfig) {
  const siteDir = process.env.SITE_DIR;
  if (!siteDir) {
    throw new Error('SITE_DIR is not set. Export it before running Eleventy.');
  }

  const repoRoot     = path.resolve(__dirname, '..');
  const sharedSrc    = path.join(__dirname, 'src');
  const siteSrc      = path.resolve(repoRoot, siteDir, 'src');
  const siteDist     = path.resolve(repoRoot, siteDir, 'dist');
  const siteAssets   = path.resolve(repoRoot, siteDir, 'assets');
  const siteFavicons = path.join(siteAssets, 'favicons');
  const componentsDir = path.join(repoRoot, 'components');

  eleventyConfig.addFilter('md',       (str) => md.render(str || ''));
  eleventyConfig.addFilter('mdInline', (str) => md.renderInline(str || ''));

  // Hand Eleventy a Nunjucks env that can resolve {% include "<name>/component.njk" %}
  eleventyConfig.setLibrary('njk', nunjucks.configure(
    [path.join(sharedSrc, '_includes'), componentsDir],
    { autoescape: false, throwOnUndefined: false }
  ));

  // Shared scaffold passthroughs
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'css')]: 'css' });
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'favicon.svg')]: 'favicon.svg' });

  // Per-site assets subtree
  if (fs.existsSync(siteAssets)) {
    eleventyConfig.addPassthroughCopy({ [siteAssets]: 'assets' });
  }

  if (fs.existsSync(siteFavicons) && fs.statSync(siteFavicons).isDirectory()) {
    for (const name of FAVICON_FILES) {
      const src = path.join(siteFavicons, name);
      if (fs.existsSync(src)) {
        eleventyConfig.addPassthroughCopy({ [src]: name });
      }
    }
  }

  return {
    dir: {
      input:    siteSrc,
      output:   siteDist,
      includes: path.relative(siteSrc, path.join(sharedSrc, '_includes')),
      data:     '_data'
    },
    templateFormats: ['njk', 'html'],
    htmlTemplateEngine: 'njk'
  };
};
```

Overwrite `scaffold/.eleventy.js` with exactly the contents above.

- [ ] **Step 3: Smoke-test that an existing site still builds.**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
SITE_DIR=sites/clodsite bash scripts/build-site.sh 2>&1 | tail -4
```

Expected: build succeeds. The component include path is wired but not yet exercised.

- [ ] **Step 4: Commit.**

```bash
git add components/prose scaffold/.eleventy.js scaffold/package.json
git commit -m "feat(components): add prose component and wire include path"
```

---

### Task 3: Add gallery component

**Files:**
- Create: `components/gallery/component.njk`
- Create: `components/gallery/component.css`
- Create: `components/gallery/schema.json`

- [ ] **Step 1: Create the three files.**

```bash
mkdir -p components/gallery
```

`components/gallery/component.njk`:

```njk
<div class="c-gallery">
  {% for img in component.images %}
  <figure class="c-gallery__item">
    <img src="{{ img.src }}" alt="{{ img.alt }}">
    {% if img.caption %}<figcaption>{{ img.caption }}</figcaption>{% endif %}
  </figure>
  {% endfor %}
</div>
```

`components/gallery/component.css`:

```css
.c-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}
.c-gallery__item {
  margin: 0;
}
.c-gallery img {
  width: 100%;
  height: 400px;
  object-fit: cover;
  display: block;
}
.c-gallery figcaption {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  text-align: center;
}
```

`components/gallery/schema.json`:

```json
{
  "description": "Responsive image grid. Each image: { src (string), alt (string), caption (optional string) }.",
  "required": {
    "images": "array"
  },
  "optional": {}
}
```

- [ ] **Step 2: Commit.**

```bash
git add components/gallery
git commit -m "feat(components): add gallery component"
```

---

### Task 4: Add mailto-form component

**Files:**
- Create: `components/mailto-form/component.njk`
- Create: `components/mailto-form/component.css`
- Create: `components/mailto-form/schema.json`

- [ ] **Step 1: Create the three files.**

```bash
mkdir -p components/mailto-form
```

`components/mailto-form/component.njk`:

```njk
<form class="c-mailto-form"
      data-mailto-to="{{ component.to }}"
      {% if component.subject %}data-mailto-subject="{{ component.subject }}"{% endif %}>
  {% for field in component.fields %}
  <div class="c-mailto-form__field">
    <label for="mf-{{ field.name }}">
      {{ field.label }}{% if field.required %} <span class="c-mailto-form__required">*</span>{% endif %}
    </label>
    {% if field.type == 'textarea' %}
    <textarea id="mf-{{ field.name }}" name="{{ field.name }}"{% if field.required %} required{% endif %}></textarea>
    {% else %}
    <input id="mf-{{ field.name }}" name="{{ field.name }}" type="{{ field.type }}"{% if field.required %} required{% endif %}>
    {% endif %}
  </div>
  {% endfor %}
  <button type="submit" class="c-mailto-form__submit">{{ component.submit_label or "Send" }}</button>
  <script>
    (function(){
      var script = document.currentScript;
      var form = script.closest('form');
      form.addEventListener('submit', function(e){
        e.preventDefault();
        var to = form.dataset.mailtoTo;
        var subject = form.dataset.mailtoSubject || '';
        var body = '';
        for (var i = 0; i < form.elements.length; i++) {
          var el = form.elements[i];
          if (el.name) {
            var labelEl = form.querySelector('label[for="' + el.id + '"]');
            var label = labelEl ? labelEl.textContent.replace(/\s*\*\s*$/, '').trim() : el.name;
            body += label + ': ' + el.value + '\n\n';
          }
        }
        var params = new URLSearchParams();
        if (subject) params.set('subject', subject);
        params.set('body', body);
        window.location.href = 'mailto:' + to + '?' + params.toString();
      });
    })();
  </script>
</form>
```

`components/mailto-form/component.css`:

```css
.c-mailto-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 480px;
}
.c-mailto-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.c-mailto-form__field label {
  font-weight: 600;
  font-size: 0.95rem;
}
.c-mailto-form__field input,
.c-mailto-form__field textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
  font-size: 1rem;
}
.c-mailto-form__field textarea {
  min-height: 6rem;
  resize: vertical;
}
.c-mailto-form__required {
  color: #c00;
}
.c-mailto-form__submit {
  align-self: flex-start;
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 4px;
  background: #222;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.c-mailto-form__submit:hover {
  background: #444;
}
```

`components/mailto-form/schema.json`:

```json
{
  "description": "Client-side contact form. On submit, composes a mailto: URL from field values and navigates to it. No backend.",
  "required": {
    "to": "string",
    "fields": "array"
  },
  "optional": {
    "subject": "string",
    "submit_label": "string"
  }
}
```

- [ ] **Step 2: Commit.**

```bash
git add components/mailto-form
git commit -m "feat(components): add mailto-form component"
```

---

### Task 5: Write `generate-catalog-md.sh` and emit `components/CATALOG.md`

**Files:**
- Create: `scripts/generate-catalog-md.sh`
- Create: `components/CATALOG.md` (generated and committed)
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Write the failing test.**

In `scripts/test/run-tests.sh`, find the line `# ── setup.sh --init-sites ─────────…` near line 265 (it's a section separator). Immediately *above* that line (after the deploy-finalize block ends), insert:

```bash
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
assert_contains "catalog shows required field"  "markdown"        "$CATALOG"
assert_contains "catalog shows mailto fields"   "to"              "$CATALOG"
rm -f "$TMP_CATALOG"
```

- [ ] **Step 2: Run the failing test.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A1 'generate-catalog-md'
```

Expected: `generate-catalog-md exits 0 (expected exit 0, got 127)` — the script does not yet exist.

- [ ] **Step 3: Implement the script.**

Create `scripts/generate-catalog-md.sh` and make it executable:

```bash
#!/usr/bin/env bash
set -euo pipefail

COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -d "$COMPONENTS_DIR" ]; then
  echo "Error: $COMPONENTS_DIR/ not found"
  exit 1
fi

node -e "
const fs = require('fs');
const path = require('path');
const dir = '${COMPONENTS_DIR}';
const names = fs.readdirSync(dir)
  .filter(n => fs.statSync(path.join(dir, n)).isDirectory())
  .sort();

let out = '# Component Catalog\n\n';
out += '> Generated by scripts/generate-catalog-md.sh — do not edit by hand.\n';
out += '> The /plan LLM reads this file to learn what components exist.\n\n';
out += 'A page in build-plan.yaml is a list of components stacked vertically.\n';
out += 'Each component has a \`type\` field naming one of the entries below.\n\n';
out += '---\n\n';

for (const name of names) {
  const schemaPath = path.join(dir, name, 'schema.json');
  if (!fs.existsSync(schemaPath)) continue;
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  out += '## ' + name + '\n\n';
  out += (schema.description || '_no description_') + '\n\n';

  out += '**Required fields:**\n\n';
  const req = schema.required || {};
  if (Object.keys(req).length === 0) {
    out += '_(none)_\n\n';
  } else {
    for (const [field, type] of Object.entries(req)) {
      out += '- \`' + field + '\` (' + type + ')\n';
    }
    out += '\n';
  }

  out += '**Optional fields:**\n\n';
  const opt = schema.optional || {};
  if (Object.keys(opt).length === 0) {
    out += '_(none)_\n\n';
  } else {
    for (const [field, type] of Object.entries(opt)) {
      out += '- \`' + field + '\` (' + type + ')\n';
    }
    out += '\n';
  }
}

process.stdout.write(out);
"
```

```bash
chmod +x scripts/generate-catalog-md.sh
```

- [ ] **Step 4: Run the test — expect green.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A6 'generate-catalog-md'
```

Expected: all six assertions (`✓`) pass.

- [ ] **Step 5: Generate and commit `components/CATALOG.md`.**

```bash
bash scripts/generate-catalog-md.sh > components/CATALOG.md
```

Inspect: `cat components/CATALOG.md`. Should contain headings for prose, gallery, mailto-form with their required/optional fields.

- [ ] **Step 6: Commit.**

```bash
git add scripts/generate-catalog-md.sh scripts/test/run-tests.sh components/CATALOG.md
git commit -m "feat(catalog): generate CATALOG.md from component schemas"
```

---

### Task 6: Bundle component CSS into `components.css`

**Files:**
- Modify: `scripts/apply-theme.sh`
- Modify: `.gitignore`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Read the current `apply-theme.sh`.**

```bash
cat scripts/apply-theme.sh
```

You need to know its current shape so the append is clean. It validates the theme file exists and prints a status line.

- [ ] **Step 2: Write the failing test.**

In `scripts/test/run-tests.sh`, find the `=== apply-theme.sh ===` section. Immediately *after* its existing assertions but *before* the next `# ── …` separator, add:

```bash
# Component CSS bundling
rm -f scaffold/src/css/components.css
bash scripts/apply-theme.sh > /dev/null 2>&1
assert_file_exists "components.css written"         "scaffold/src/css/components.css"
BUNDLE=$(cat scaffold/src/css/components.css)
assert_contains   "bundle has c-gallery rule"       ".c-gallery"      "$BUNDLE"
assert_contains   "bundle has c-mailto-form rule"   ".c-mailto-form"  "$BUNDLE"
```

- [ ] **Step 3: Run the failing test.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A4 'components.css'
```

Expected: `components.css written (scaffold/src/css/components.css not found)`.

- [ ] **Step 4: Implement the bundling at the end of `apply-theme.sh`.**

Append the following block to the end of `scripts/apply-theme.sh`:

```bash

# Concatenate all components/*/component.css into scaffold/src/css/components.css
# (overwritten on every build; gitignored).
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"
OUT="scaffold/src/css/components.css"
{
  echo "/* Generated by scripts/apply-theme.sh — do not edit by hand. */"
  for css in "${COMPONENTS_DIR}"/*/component.css; do
    [ -f "$css" ] || continue
    name=$(basename "$(dirname "$css")")
    echo ""
    echo "/* --- ${name} --- */"
    cat "$css"
  done
} > "$OUT"
echo "✓ ${OUT} written ($(ls -1 "${COMPONENTS_DIR}"/*/component.css 2>/dev/null | wc -l | tr -d ' ') component(s))"
```

- [ ] **Step 5: Add `scaffold/src/css/components.css` to `.gitignore`.**

Open `.gitignore` and add after the `scaffold/node_modules/` line:

```
scaffold/src/css/components.css
```

- [ ] **Step 6: Run the test — expect green.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A4 'components.css'
```

All three assertions pass.

- [ ] **Step 7: Commit.**

```bash
git add scripts/apply-theme.sh scripts/test/run-tests.sh .gitignore
git commit -m "feat(build): bundle components/*/component.css into components.css"
```

---

### Task 7: Load `components.css` in base layout

**Files:**
- Modify: `scaffold/src/_includes/base.njk`

- [ ] **Step 1: Add one `<link>` after the theme stylesheet line.**

In `scaffold/src/_includes/base.njk`, locate the existing line:

```html
  <link rel="stylesheet" href="/css/themes/{{ site.style }}.css">
```

Immediately *after* it, add:

```html
  <link rel="stylesheet" href="/css/components.css">
```

- [ ] **Step 2: Smoke-rebuild an existing site and confirm the link appears.**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
SITE_DIR=sites/clodsite bash scripts/apply-theme.sh
SITE_DIR=sites/clodsite bash scripts/build-site.sh 2>&1 | tail -3
grep -n 'components.css' sites/clodsite/dist/index.html
```

Expected: build succeeds; `grep` finds one line containing `href="/css/components.css"` in the rendered HTML.

- [ ] **Step 3: Commit.**

```bash
git add scaffold/src/_includes/base.njk
git commit -m "feat(layout): load components.css in base layout"
```

---

### Task 8: Write `render-templates.sh`

**Files:**
- Create: `scripts/render-templates.sh`
- Create: `scripts/test/fixtures/valid-build-plan-components.yaml`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Create the fixture plan.**

`scripts/test/fixtures/valid-build-plan-components.yaml`:

```yaml
slug: render-test
name: Render Test
overview: Fixture for render-templates.sh.
style: minimal
tone: professional
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: |
          ## Hello
          A paragraph.
  - id: gallery
    title: Gallery
    components:
      - type: prose
        markdown: |
          ## Gallery
      - type: gallery
        images:
          - { src: /assets/a.jpg, alt: A }
          - { src: /assets/b.jpg, alt: B }
nav:
  order: [home, gallery]
contact:
  enabled: false
```

- [ ] **Step 2: Write failing tests in `run-tests.sh`.**

Add a new block immediately above the `=== setup.sh --init-sites ===` separator:

```bash
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
```

- [ ] **Step 3: Run failing tests.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A10 '=== render-templates.sh'
```

Expected: script-missing failures (exit 127).

- [ ] **Step 4: Implement `scripts/render-templates.sh`.**

Create the file:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.yaml"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

mkdir -p "${SITE_DIR}/src"

node -e "
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const plan = yaml.load(fs.readFileSync('${PLAN}', 'utf8'));

const firstId = plan.nav.order[0];

function escapeForYaml(s) {
  // Page titles go into YAML front matter as bare scalars.
  // Quote if there's anything funky; otherwise pass through.
  if (/^[A-Za-z0-9 _\\-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

for (const page of plan.pages) {
  const permalink = (page.id === firstId) ? '/' : '/' + page.id + '/';
  const filename  = (page.id === firstId) ? 'index.njk' : page.id + '.njk';

  let body = '';
  for (const component of (page.components || [])) {
    if (!component.type) {
      console.error('Error: page ' + page.id + ' has a component with no type');
      process.exit(1);
    }
    // Set 'component' to the current component config, then include the
    // corresponding template. The Nunjucks env (configured in .eleventy.js)
    // resolves the path against repo-root components/.
    body += '{% set component = ' + JSON.stringify(component) + ' %}\\n';
    body += '{% include \"' + component.type + '/component.njk\" %}\\n';
  }

  const out =
    '---\\n' +
    'layout: base.njk\\n' +
    'pageTitle: ' + escapeForYaml(page.title) + '\\n' +
    'permalink: ' + permalink + '\\n' +
    '---\\n' +
    body;

  fs.writeFileSync(path.join('${SITE_DIR}', 'src', filename), out);
  console.log('  ✓ ' + filename);
}

console.log('✓ Rendered ' + plan.pages.length + ' page template(s) to ${SITE_DIR}/src/');
"
```

```bash
chmod +x scripts/render-templates.sh
```

- [ ] **Step 5: Run tests — expect green.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A10 '=== render-templates.sh'
```

All 9 assertions pass.

- [ ] **Step 6: End-to-end smoke: render + build the fixture and inspect.**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
TMPSITE=$(mktemp -d)/render-test
mkdir -p "$TMPSITE"
cp scripts/test/fixtures/valid-build-plan-components.yaml "$TMPSITE/build-plan.yaml"
SITE_DIR="$TMPSITE" bash scripts/write-site-json.sh
SITE_DIR="$TMPSITE" bash scripts/apply-theme.sh
SITE_DIR="$TMPSITE" bash scripts/render-templates.sh
SITE_DIR="$TMPSITE" bash scripts/build-site.sh 2>&1 | tail -3
grep -c 'c-gallery' "$TMPSITE/dist/gallery/index.html"
grep -c '<h2>Hello' "$TMPSITE/dist/index.html"
rm -rf "$TMPSITE"
```

Expected: build succeeds; `grep -c 'c-gallery'` is `1` (the `<div class="c-gallery">` wrapper); `grep -c '<h2>Hello'` is `1` (markdown rendered).

- [ ] **Step 7: Commit.**

```bash
git add scripts/render-templates.sh scripts/test/run-tests.sh scripts/test/fixtures/valid-build-plan-components.yaml
git commit -m "feat(build): render-templates.sh emits .njk from build-plan components"
```

---

### Task 9: Update `validate-plan.sh` to validate components and reject `build_notes`

**Files:**
- Modify: `scripts/validate-plan.sh`
- Modify: `scripts/test/fixtures/valid-build-plan.yaml`
- Create: `scripts/test/fixtures/invalid-build-plan-bad-component.yaml`
- Create: `scripts/test/fixtures/invalid-build-plan-missing-field.yaml`
- Create: `scripts/test/fixtures/invalid-build-plan-has-build-notes.yaml`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Migrate the canonical valid fixture to component shape.**

Open `scripts/test/fixtures/valid-build-plan.yaml`. Replace every `content: |` block on each page with a `components:` array containing one prose component. Example transform — if the file looks like:

```yaml
pages:
  - id: home
    title: Home
    content: |
      ## Hello
      Body text.
```

Change to:

```yaml
pages:
  - id: home
    title: Home
    components:
      - type: prose
        markdown: |
          ## Hello
          Body text.
```

Apply the same transform to every page. If the file has a top-level `build_notes:` line, delete it.

- [ ] **Step 2: Create the new invalid fixtures.**

`scripts/test/fixtures/invalid-build-plan-bad-component.yaml` — copy `valid-build-plan-components.yaml` (from Task 8) and change one component's `type:` to `type: nonexistent`.

`scripts/test/fixtures/invalid-build-plan-missing-field.yaml` — copy `valid-build-plan-components.yaml` and remove the `markdown:` key under one of the prose components.

`scripts/test/fixtures/invalid-build-plan-has-build-notes.yaml` — copy `valid-build-plan-components.yaml` and add a top-level `build_notes: "leftover"` line.

- [ ] **Step 3: Add failing assertions to `run-tests.sh`.**

In the existing `=== validate-plan.sh ===` section, append (after the current assertions):

```bash
# Component validation
cp scripts/test/fixtures/invalid-build-plan-bad-component.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "unknown component type exits 1" 1 $?

cp scripts/test/fixtures/invalid-build-plan-missing-field.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "missing required field exits 1" 1 $?

cp scripts/test/fixtures/invalid-build-plan-has-build-notes.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "build_notes is rejected" 1 $?

cp scripts/test/fixtures/valid-build-plan-components.yaml "${SITE_DIR}/build-plan.yaml"
bash scripts/validate-plan.sh > /dev/null 2>&1; assert_exit "valid component plan exits 0" 0 $?
```

- [ ] **Step 4: Run failing tests.**

```bash
bash scripts/test/run-tests.sh 2>&1 | grep -A4 'validate-plan'
```

Expected: the four new assertions all fail (the script still uses the old `content:` requirement and doesn't know about components).

- [ ] **Step 5: Replace `validate-plan.sh`'s node block.**

Overwrite the file contents of `scripts/validate-plan.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE_DIR="${SITE_DIR:?Error: SITE_DIR is not set. Export it before running this script.}"
PLAN="${SITE_DIR}/build-plan.yaml"
COMPONENTS_DIR="${COMPONENTS_DIR:-components}"

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found. Run /plan first."
  exit 1
fi

node -e "
const yaml = require('js-yaml');
const fs   = require('fs');
const path = require('path');

const plan = yaml.load(fs.readFileSync('$PLAN', 'utf8'));
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

if ('build_notes' in plan)
  errors.push('build_notes is no longer supported (removed in component-catalog v1)');

// Load every component schema once.
const catalog = {};
if (fs.existsSync('$COMPONENTS_DIR')) {
  for (const name of fs.readdirSync('$COMPONENTS_DIR')) {
    const schemaPath = path.join('$COMPONENTS_DIR', name, 'schema.json');
    if (fs.existsSync(schemaPath)) {
      catalog[name] = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    }
  }
}

function checkType(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'array')  return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'boolean') return typeof value === 'boolean';
  return true; // unknown type — don't enforce
}

if (!Array.isArray(plan.pages) || plan.pages.length < 1) {
  errors.push('pages must be a non-empty array');
} else {
  plan.pages.forEach(function(p, i) {
    const tag = 'pages[' + i + ']';
    if (!p.id)    errors.push(tag + '.id is required');
    if (!p.title) errors.push(tag + '.title is required');
    if ('content' in p)
      errors.push(tag + '.content is no longer supported — use components: [{ type: prose, markdown: ... }]');
    if (!Array.isArray(p.components) || p.components.length === 0) {
      errors.push(tag + '.components must be a non-empty array');
    } else {
      p.components.forEach(function(c, j) {
        const ctag = tag + '.components[' + j + ']';
        if (!c.type) {
          errors.push(ctag + '.type is required');
          return;
        }
        const schema = catalog[c.type];
        if (!schema) {
          errors.push(ctag + '.type \"' + c.type + '\" is not a known component (see ' + '$COMPONENTS_DIR' + '/CATALOG.md)');
          return;
        }
        const required = schema.required || {};
        for (const [field, type] of Object.entries(required)) {
          if (!(field in c)) {
            errors.push(ctag + ' missing required field \"' + field + '\"');
          } else if (!checkType(c[field], type)) {
            errors.push(ctag + '.' + field + ' must be ' + type);
          }
        }
        const optional = schema.optional || {};
        const allowed = new Set(['type', ...Object.keys(required), ...Object.keys(optional)]);
        for (const key of Object.keys(c)) {
          if (!allowed.has(key)) {
            errors.push(ctag + ' has unknown field \"' + key + '\" for component type \"' + c.type + '\"');
          }
        }
      });
    }
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

- [ ] **Step 6: Run tests — expect green.**

```bash
bash scripts/test/run-tests.sh 2>&1 | tail -3
```

Expected: 0 failures across the whole suite.

- [ ] **Step 7: Commit.**

```bash
git add scripts/validate-plan.sh scripts/test/run-tests.sh scripts/test/fixtures/
git commit -m "feat(validate): plan schema requires components; reject build_notes and content"
```

---

### Task 10: Migrate the five existing sites

**Files:**
- Create: `scripts/migrate-plan-to-components.sh`
- Modify: `sites/clodsite/build-plan.yaml`, `sites/nopolabs/build-plan.yaml`, `sites/medicarion/build-plan.yaml`, `sites/ndig/build-plan.yaml`, `sites/anchovy/build-plan.yaml`

The migration is mostly mechanical: replace each page's `content: |` block with a `components: [{ type: prose, markdown: <same body> }]` and delete the top-level `build_notes:`. Anchovy's gallery page is the one exception — it needs a manual split into `prose` + `gallery` components after the script runs.

- [ ] **Step 1: Write the migration script.**

`scripts/migrate-plan-to-components.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PLAN="${1:?Usage: $0 <path-to-build-plan.yaml>}"
[ -f "$PLAN" ] || { echo "Error: $PLAN not found"; exit 1; }

node -e "
const fs   = require('fs');
const yaml = require('js-yaml');
const plan = yaml.load(fs.readFileSync('$PLAN', 'utf8'));

if ('build_notes' in plan) delete plan.build_notes;

for (const page of (plan.pages || [])) {
  if ('content' in page && !('components' in page)) {
    page.components = [{ type: 'prose', markdown: page.content }];
    delete page.content;
  }
}

fs.writeFileSync('$PLAN', yaml.dump(plan, { lineWidth: -1, noRefs: true }));
console.log('✓ migrated ' + '$PLAN');
"
```

```bash
chmod +x scripts/migrate-plan-to-components.sh
```

- [ ] **Step 2: Migrate, validate, rebuild, and commit each site in turn.**

For each `<site>` in `clodsite`, `nopolabs`, `medicarion`, `ndig`:

```bash
bash scripts/migrate-plan-to-components.sh sites/<site>/build-plan.yaml
SITE_DIR=sites/<site> bash scripts/validate-plan.sh
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
SITE_DIR=sites/<site> bash scripts/write-site-json.sh
SITE_DIR=sites/<site> bash scripts/apply-theme.sh
SITE_DIR=sites/<site> bash scripts/render-templates.sh
SITE_DIR=sites/<site> bash scripts/build-site.sh 2>&1 | tail -3
```

Expected: every step succeeds; build produces the same number of HTML files as before.

After all four prose-only sites build cleanly, commit:

```bash
git add sites/clodsite/build-plan.yaml sites/nopolabs/build-plan.yaml \
        sites/medicarion/build-plan.yaml sites/ndig/build-plan.yaml \
        scripts/migrate-plan-to-components.sh
git commit -m "refactor(sites): migrate prose-only sites to components schema"
```

Note: the four sites' `build-plan.yaml` files live in the parent clodsite repo (they're committed at the project root, not in the `sites/` subrepo). If `git status` shows them as untracked, that's because `sites/` is gitignored — in that case `cd sites && git add <site>/build-plan.yaml && git commit -m "refactor: migrate to components schema" && cd ..`.

- [ ] **Step 3: Migrate anchovy and manually split the gallery page.**

```bash
bash scripts/migrate-plan-to-components.sh sites/anchovy/build-plan.yaml
```

Open `sites/anchovy/build-plan.yaml`. The gallery page now has a single prose component whose markdown contains the `## Gallery` heading and three `![Anchovy](/assets/images/IMG_XXXX.jpeg)` lines. Edit it by hand into two components:

```yaml
  - id: gallery
    title: Gallery
    components:
      - type: prose
        markdown: |
          ## Gallery
      - type: gallery
        images:
          - { src: /assets/images/IMG_1122.jpeg, alt: Anchovy }
          - { src: /assets/images/IMG_1123.jpeg, alt: Anchovy }
          - { src: /assets/images/IMG_1124.jpeg, alt: Anchovy }
```

- [ ] **Step 4: Validate, rebuild, and visually check anchovy.**

```bash
SITE_DIR=sites/anchovy bash scripts/validate-plan.sh
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
SITE_DIR=sites/anchovy bash scripts/write-site-json.sh
SITE_DIR=sites/anchovy bash scripts/apply-theme.sh
SITE_DIR=sites/anchovy bash scripts/render-templates.sh
SITE_DIR=sites/anchovy bash scripts/build-site.sh 2>&1 | tail -3
grep -c 'c-gallery' sites/anchovy/dist/gallery/index.html
grep -c 'IMG_1122.jpeg' sites/anchovy/dist/gallery/index.html
```

Expected: build succeeds; `grep -c 'c-gallery'` is `1`; `grep -c 'IMG_1122.jpeg'` is `1`.

- [ ] **Step 5: Commit anchovy migration.**

```bash
git add sites/anchovy/build-plan.yaml
git commit -m "refactor(anchovy): split gallery page into prose + gallery components"
```

(Same `cd sites && git add … && cd ..` caveat as Step 2 if the file lives in the `sites/` subrepo.)

---

### Task 11: Update slash command files and `CLAUDE.md`

**Files:**
- Modify: `.claude/commands/plan.md`
- Modify: `.claude/commands/build.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `.claude/commands/plan.md`.**

Find the YAML schema block in the `[LLM]` section. Replace the `pages:` and `build_notes:` portion so the schema becomes:

```yaml
slug: <site directory name>
overview: >-
  <one paragraph>
style: <value of site.style>
tone: <value of site.tone>
pages:
  - id: <page id>
    title: <page title>
    components:
      - type: <component name from components/CATALOG.md>
        # ... required and optional fields per the component's schema
nav:
  order:
    - <page ids in nav order>
contact:
  enabled: <true or false>
  email: <email address — omit if contact.enabled is false>
```

Delete the line `build_notes: <any special rendering notes for /build, or empty string>`.

Find the "Content rules" section. Replace the entire section with:

```markdown
**Content rules for `pages[n].components`:**

Read `components/CATALOG.md` first — it lists every available component type
and its required/optional fields. You MUST only use component types listed
there. `validate-plan.sh` will reject unknown types.

The default and most common component is `prose`, which accepts a `markdown`
field containing GFM (headings, paragraphs, lists, links, fenced code blocks,
tables). A page whose body is purely textual is a single `prose` component.

Pages that need richer presentation (image gallery, contact form) compose
multiple components in order. Components stack vertically.

- If `content_status = "provided"`: use `content_outline` as-is inside a
  `prose` component's `markdown` field.
- If `content_status = "draft"`: write complete, publish-ready copy as GFM
  inside a `prose` component's `markdown` field. Match the site tone.
- Component fields use the appropriate YAML type (string, array, object) per
  the component's schema.
```

- [ ] **Step 2: Update `.claude/commands/build.md`.**

Find the `[LLM]` section (the long block starting "Read `sites/<site-name>/build-plan.yaml`. Generate an Eleventy Nunjucks template…"). Replace that entire `[LLM]` section, including the "Template rules", "Template format", and any sub-headings within it, with:

```markdown
**[SCRIPT]** Render templates from the build plan:

```bash
SITE_DIR=sites/<site-name> bash scripts/render-templates.sh
```

This script reads `sites/<site-name>/build-plan.yaml` and emits one `.njk`
file per page into `sites/<site-name>/src/`. Each emitted file `{% include %}`s
the appropriate component templates from `components/`. No content decisions
happen here — the script is purely structural.
```

(The closing `[SCRIPT]` block for `build-site.sh` that follows stays unchanged.)

- [ ] **Step 3: Update `CLAUDE.md`.**

Find the `### /build` section's pipeline listing. Currently it reads:

```
[SCRIPT] bash scripts/validate-plan.sh
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Render build-plan.yaml → sites/<site-name>/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```

Replace the `[LLM]` line with:

```
[SCRIPT] bash scripts/render-templates.sh
```

In the `### /plan` section, append one line to the listing so it reads:

```
[SCRIPT] bash scripts/validate-spec.sh
[SCRIPT] bash scripts/generate-catalog-md.sh
[LLM]    Generate sites/<site-name>/build-plan.yaml (reads components/CATALOG.md for the component vocabulary)
[SCRIPT] SITE_DIR=sites/<site-name> bash scripts/finalize-plan.sh
```

Also update the `### /build` row in the section labeled `## Architecture: [SCRIPT] / [LLM] / [HYBRID]` if it characterizes `/build` as `[HYBRID]`. It should now be `[SCRIPT]`.

Check the "Files Written During a Run" table — the row for `sites/<site-name>/src/*.njk` should now say it's "Written by `/build` (via render-templates.sh)" rather than mentioning the LLM.

- [ ] **Step 4: Commit.**

```bash
git add .claude/commands/plan.md .claude/commands/build.md CLAUDE.md
git commit -m "docs(commands): /build is fully scripted; /plan reads CATALOG.md"
```

---

### Task 12: End-to-end verification, deploy anchovy, mark ROADMAP shipped

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run the full test suite.**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
bash scripts/test/run-tests.sh 2>&1 | tail -3
```

Expected: all assertions pass, 0 failures. If any fail, fix the underlying task before continuing.

- [ ] **Step 2: Rebuild every site through the new pipeline.**

```bash
for site in clodsite nopolabs medicarion ndig anchovy; do
  echo "=== $site ==="
  SITE_DIR=sites/$site bash scripts/validate-plan.sh
  SITE_DIR=sites/$site bash scripts/write-site-json.sh
  SITE_DIR=sites/$site bash scripts/apply-theme.sh
  SITE_DIR=sites/$site bash scripts/render-templates.sh
  SITE_DIR=sites/$site bash scripts/build-site.sh 2>&1 | tail -2
done
```

Expected: each site builds without error.

- [ ] **Step 3: Deploy anchovy as the smoke test.**

```bash
SITE_DIR=sites/anchovy bash scripts/deploy.sh 2>&1 | tail -3
SITE_DIR=sites/anchovy bash scripts/deploy-finalize.sh 2>&1 | grep -E 'live|snapshot' | head
```

Expected: a Cloudflare Pages snapshot URL and the production URL `https://anchovy.pages.dev`. Open it in a browser and confirm the home page and gallery render correctly.

- [ ] **Step 4: Update ROADMAP.md — mark the two entries shipped.**

In `ROADMAP.md`, move the `### Script-generated templates` and `### Page-type / component catalog` entries from `## Pending` to `## Completed` (place them at the end of the Completed section, after the existing slice 1 entry). Replace each entry's body with a "Shipped May 2026" summary.

For `### Script-generated templates`:

```markdown
### Script-generated templates
Shipped May 2026. The `[LLM]` template-render step in `/build` is gone.
`scripts/render-templates.sh` reads `build-plan.yaml` and emits one `.njk`
file per page that `{% include %}`s component templates from `components/`.
`/build` is now fully `[SCRIPT]`. `acceptEdits` mode is no longer needed.
Depended on the component catalog (also shipped May 2026).
```

For `### Page-type / component catalog`:

```markdown
### Page-type / component catalog (v1)
Shipped May 2026. New top-level `components/` directory holds typed,
self-contained components: `component.njk` + `component.css` + `schema.json`
per entry. v1 ships three: `prose` (default GFM body), `gallery` (responsive
image grid, subsumes anchovy's hand-built CSS), `mailto-form` (client-side
contact form, no backend). `build-plan.yaml` pages are now
`components: [{ type, ... }, ...]` — the LLM at `/plan` time picks from
`components/CATALOG.md` (auto-generated from schemas) and cannot invent types
(`validate-plan.sh` rejects them). `build_notes` is removed. All five
existing sites migrated. Spec:
`docs/superpowers/specs/2026-05-31-component-catalog-design.md`.
```

- [ ] **Step 5: Commit.**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): component catalog v1 and script-generated templates shipped"
```

- [ ] **Step 6: Push.**

```bash
git push origin main
```

---

## Verification Summary

After all tasks complete, the following must be true:

- [ ] `bash scripts/test/run-tests.sh` — 0 failures
- [ ] `components/` contains three component directories, each with `component.njk` + `component.css` + `schema.json`, plus a `CATALOG.md` generated from those schemas
- [ ] `scripts/render-templates.sh` exists, is executable, and emits one `.njk` per page
- [ ] `scripts/generate-catalog-md.sh` exists, is executable, and produces `components/CATALOG.md`
- [ ] `.claude/commands/build.md` no longer contains an `[LLM]` step
- [ ] `.claude/commands/plan.md` references `components/CATALOG.md` and uses the `components: [...]` schema
- [ ] All five `sites/*/build-plan.yaml` files use `components:` (none contain `content:` or `build_notes:` keys)
- [ ] All five sites rebuild cleanly through the new pipeline
- [ ] `anchovy.pages.dev` is live and renders identically to the pre-migration deploy (home text + 3-image gallery)
- [ ] `ROADMAP.md` lists "Page-type / component catalog (v1)" and "Script-generated templates" as Completed
