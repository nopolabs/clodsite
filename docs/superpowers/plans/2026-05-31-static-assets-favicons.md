# Static Assets + Favicons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `sites/<name>/images/` convention with a single `assets/` convention per site, add an `assets/favicons/` subfolder that produces favicon `<link>` tags in `<head>` from filename patterns, and migrate `sites/anchovy` to the new layout.

**Architecture:** Zero new fields in `build-plan.yaml`. The compiler derives everything from the filesystem at build time. `write-site-json.sh` scans `sites/<name>/assets/favicons/`, emits a `site.favicons[]` array plus a `site.has_custom_favicons` flag onto `src/_data/site.json`. `scaffold/.eleventy.js` passthrough-copies the whole `assets/` subtree to `dist/assets/`, and additionally maps each recognized favicon file to `dist/` root. `scaffold/src/_includes/base.njk` iterates `site.favicons` when custom favicons are present, else falls back to the scaffold default `favicon.svg`.

**Tech Stack:** Bash, Node.js (via `js-yaml` already in root `package.json`), Eleventy, Nunjucks.

**Spec:** `docs/superpowers/specs/2026-05-31-static-assets-favicons-design.md`

---

## File Structure

**Modified:**
- `scripts/write-site-json.sh` — adds favicon scan + `site.favicons[]` + `site.has_custom_favicons` to emitted JSON
- `scripts/build-site.sh` — `mkdir` line changes from `images/` to `assets/favicons/`
- `scaffold/.eleventy.js` — replaces `siteImages` passthrough with `siteAssets`; adds per-file passthrough for recognized favicons
- `scaffold/src/_includes/base.njk` — replaces hardcoded `<link rel="icon" …>` with conditional iteration over `site.favicons`
- `scripts/test/run-tests.sh` — adds a new `favicon discovery` block under the `write-site-json.sh` section
- `sites/anchovy/build-plan.yaml` — URL rewrites `/images/` → `/assets/images/`
- `ROADMAP.md` — adds a "page-types extension track" section with slice 1 marked shipped

**Moved:**
- `sites/anchovy/images/` → `sites/anchovy/assets/images/`

**Deleted:**
- `sites/anchovy/dist/IMG_1122.jpeg`, `IMG_1123.jpeg`, `IMG_1124.jpeg` (stale build artifacts at dist root)

**Created (test fixtures):**
- `scripts/test/fixtures/favicons-full/` — directory with all six recognized favicon filenames (zero-byte stubs)
- `scripts/test/fixtures/favicons-partial/` — directory with only `favicon.ico` and a non-matching `unknown.png`

No source files are created. No new scripts are added — favicon discovery lives in the existing `write-site-json.sh`.

---

### Task 1: Add favicon discovery to `write-site-json.sh`

**Files:**
- Modify: `scripts/write-site-json.sh`

The script currently emits `name`, `style`, `nav`, `contact` onto `site.json`. We add `favicons` (array) and `has_custom_favicons` (bool), derived by scanning `${SITE_DIR}/assets/favicons/`.

- [ ] **Step 1: Read the current `write-site-json.sh` end-to-end** so the diff is clear.

Run: `cat scripts/write-site-json.sh`

- [ ] **Step 2: Replace the node script body with the version that discovers favicons.**

Replace the entire `node -e "…"` invocation (and only that — leave the bash header, the `SITE_DIR` check, and the `build-plan.yaml` existence check alone) with:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const plan = yaml.load(fs.readFileSync('${SITE_DIR}/build-plan.yaml', 'utf8'));

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

// Favicon discovery: scan \${SITE_DIR}/assets/favicons/ for recognized filenames.
const FAVICON_RULES = [
  { file: 'favicon.ico',        rel: 'icon',             sizes: 'any'                                  },
  { file: 'favicon.svg',        rel: 'icon',             type: 'image/svg+xml'                         },
  { file: 'favicon-16x16.png',  rel: 'icon',             type: 'image/png',         sizes: '16x16'     },
  { file: 'favicon-32x32.png',  rel: 'icon',             type: 'image/png',         sizes: '32x32'     },
  { file: 'favicon-48x48.png',  rel: 'icon',             type: 'image/png',         sizes: '48x48'     },
  { file: 'apple-touch-icon.png', rel: 'apple-touch-icon'                                              },
];

const favDir = '${SITE_DIR}/assets/favicons';
let favicons = [];
let unknownFavFiles = [];
if (fs.existsSync(favDir) && fs.statSync(favDir).isDirectory()) {
  const present = new Set(fs.readdirSync(favDir).filter(f => fs.statSync(path.join(favDir, f)).isFile()));
  for (const rule of FAVICON_RULES) {
    if (present.has(rule.file)) {
      const entry = { rel: rule.rel, href: '/' + rule.file };
      if (rule.type)  entry.type  = rule.type;
      if (rule.sizes) entry.sizes = rule.sizes;
      favicons.push(entry);
      present.delete(rule.file);
    }
  }
  unknownFavFiles = [...present];
}
const hasCustomFavicons = favicons.length > 0;

const siteData = {
  name: plan.name,
  style: plan.style,
  nav: {
    order: plan.nav.order,
    pages: navPages
  },
  contact: contact.enabled
    ? { enabled: true, email: contact.email }
    : { enabled: false },
  favicons,
  has_custom_favicons: hasCustomFavicons
};

fs.mkdirSync('${SITE_DIR}/src/_data', { recursive: true });
fs.writeFileSync(
  '${SITE_DIR}/src/_data/site.json',
  JSON.stringify(siteData, null, 2)
);
console.log('✓ ${SITE_DIR}/src/_data/site.json written');
console.log('  Site: ' + siteData.name + ' | Style: ' + siteData.style + ' | Pages: ' + siteData.nav.pages.length);
if (!hasCustomFavicons) {
  console.warn('  ⚠ no site favicons found in assets/favicons/ — using scaffold default');
}
if (unknownFavFiles.length > 0) {
  console.warn('  ⚠ unrecognized files in assets/favicons/ (copied but not linked): ' + unknownFavFiles.join(', '));
}
"
```

- [ ] **Step 3: Smoke-run against an existing site to verify no regression.**

Run: `SITE_DIR=sites/clodsite bash scripts/write-site-json.sh`

Expected stdout includes:
- `✓ sites/clodsite/src/_data/site.json written`
- A `⚠ no site favicons found …` warning (clodsite has no `assets/favicons/` directory).

Then: `node -e "const s=JSON.parse(require('fs').readFileSync('sites/clodsite/src/_data/site.json','utf8')); console.log(JSON.stringify({favicons: s.favicons, has_custom_favicons: s.has_custom_favicons}))"`

Expected: `{"favicons":[],"has_custom_favicons":false}`

- [ ] **Step 4: Commit.**

```bash
git add scripts/write-site-json.sh
git commit -m "feat(assets): scan assets/favicons/ in write-site-json"
```

---

### Task 2: Add favicon-discovery test fixtures and assertions

**Files:**
- Create: `scripts/test/fixtures/favicons-full/favicon.ico`
- Create: `scripts/test/fixtures/favicons-full/favicon.svg`
- Create: `scripts/test/fixtures/favicons-full/favicon-16x16.png`
- Create: `scripts/test/fixtures/favicons-full/favicon-32x32.png`
- Create: `scripts/test/fixtures/favicons-full/favicon-48x48.png`
- Create: `scripts/test/fixtures/favicons-full/apple-touch-icon.png`
- Create: `scripts/test/fixtures/favicons-partial/favicon.ico`
- Create: `scripts/test/fixtures/favicons-partial/unknown.png`
- Modify: `scripts/test/run-tests.sh`

- [ ] **Step 1: Create the two fixture directories with zero-byte stub files.**

```bash
mkdir -p scripts/test/fixtures/favicons-full scripts/test/fixtures/favicons-partial
touch scripts/test/fixtures/favicons-full/favicon.ico \
      scripts/test/fixtures/favicons-full/favicon.svg \
      scripts/test/fixtures/favicons-full/favicon-16x16.png \
      scripts/test/fixtures/favicons-full/favicon-32x32.png \
      scripts/test/fixtures/favicons-full/favicon-48x48.png \
      scripts/test/fixtures/favicons-full/apple-touch-icon.png
touch scripts/test/fixtures/favicons-partial/favicon.ico \
      scripts/test/fixtures/favicons-partial/unknown.png
```

- [ ] **Step 2: Read `scripts/test/run-tests.sh` to understand the test harness.**

Run: `cat scripts/test/run-tests.sh`

Note: there is already a `=== write-site-json.sh ===` block (around line 94). Append the new assertions immediately after the existing block, before the `=== apply-theme.sh ===` block.

- [ ] **Step 3: Add favicon-discovery assertions to `run-tests.sh`.**

Locate the line that reads `# ── apply-theme.sh ──` (separator before the apply-theme block). Immediately *above* the blank `echo ""` that precedes that comment, insert the following block. The `SITE_DIR` variable is already set by the harness; the `cp` of `valid-build-plan.yaml` from the previous block is already in place, so `build-plan.yaml` exists.

```bash
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
```

- [ ] **Step 4: Run the test suite to confirm all favicon assertions pass.**

Run: `bash scripts/test/run-tests.sh`

Expected: the new `=== write-site-json.sh: favicon discovery ===` section appears, all assertions (`✓`) pass, and the overall summary line at the bottom shows 0 failures.

If any assertion fails, inspect the actual `site.json` (or stderr) and fix Task 1's logic before continuing — do not move on with a red test suite.

- [ ] **Step 5: Commit.**

```bash
git add scripts/test/fixtures/favicons-full scripts/test/fixtures/favicons-partial scripts/test/run-tests.sh
git commit -m "test(assets): cover favicon discovery in write-site-json"
```

---

### Task 3: Update Eleventy passthrough — swap `images/` for `assets/`, add favicon-to-root copies

**Files:**
- Modify: `scaffold/.eleventy.js`

- [ ] **Step 1: Read the current `.eleventy.js`.**

Run: `cat scaffold/.eleventy.js`

- [ ] **Step 2: Replace the file contents with the new version.**

Overwrite `scaffold/.eleventy.js` with exactly:

```js
const path = require('path');
const fs   = require('fs');

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

  // Shared scaffold passthroughs
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'css')]: 'css' });
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'favicon.svg')]: 'favicon.svg' });

  // Per-site assets subtree (entire assets/ → dist/assets/, including assets/favicons/)
  if (fs.existsSync(siteAssets)) {
    eleventyConfig.addPassthroughCopy({ [siteAssets]: 'assets' });
  }

  // Per-site favicon files: each recognized file in assets/favicons/ also copied to dist/ root
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

Note the deliberate choices:
- `siteImages` / `images/` passthrough is removed entirely.
- `addPassthroughCopy` for `siteAssets` is guarded by `existsSync` so sites without an `assets/` folder still build.
- Each recognized favicon is added as its own passthrough mapping so non-matching files in `assets/favicons/` are not copied to `dist/` root (they still end up at `dist/assets/favicons/<name>` via the `assets/` subtree passthrough).

- [ ] **Step 3: Commit.**

```bash
git add scaffold/.eleventy.js
git commit -m "feat(assets): passthrough assets/ subtree and favicons to dist root"
```

---

### Task 4: Update `build-site.sh` — `mkdir` line

**Files:**
- Modify: `scripts/build-site.sh`

- [ ] **Step 1: Inspect the current `mkdir` line.**

Run: `grep -n 'mkdir' scripts/build-site.sh`

Expected: one match at line 16: `mkdir -p "${SITE_DIR}/images"`.

- [ ] **Step 2: Change that line to create `assets/favicons/`.**

Replace exactly the line `mkdir -p "${SITE_DIR}/images"` with `mkdir -p "${SITE_DIR}/assets/favicons"`.

- [ ] **Step 3: Verify there are no other `images/` references in the build pipeline scripts.**

Run: `grep -rn 'images/' scripts/`

Expected: no matches in any `scripts/*.sh` files. (Matches inside `scripts/test/` fixtures or test assertions, if any exist, can be ignored — there are none today.)

If a match appears, fix it to use `assets/` before continuing.

- [ ] **Step 4: Commit.**

```bash
git add scripts/build-site.sh
git commit -m "feat(assets): build-site mkdir uses assets/favicons/"
```

---

### Task 5: Update `base.njk` — conditional favicon links

**Files:**
- Modify: `scaffold/src/_includes/base.njk`

- [ ] **Step 1: Read the current `base.njk` to locate the favicon line.**

Run: `grep -n 'favicon' scaffold/src/_includes/base.njk`

Expected: one match — the hardcoded `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` line.

- [ ] **Step 2: Replace that single line with the conditional block.**

Replace exactly:

```html
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
```

with:

```html
  {% if site.has_custom_favicons %}
    {% for f in site.favicons %}
  <link rel="{{ f.rel }}" href="{{ f.href }}"{% if f.type %} type="{{ f.type }}"{% endif %}{% if f.sizes %} sizes="{{ f.sizes }}"{% endif %}>
    {% endfor %}
  {% else %}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  {% endif %}
```

- [ ] **Step 3: Build the clodsite site (which has no custom favicons) and confirm the default branch still emits the scaffold default.**

Run: `SITE_DIR=sites/clodsite bash scripts/write-site-json.sh && SITE_DIR=sites/clodsite bash scripts/build-site.sh`

Then: `grep -n 'favicon' sites/clodsite/dist/index.html`

Expected: a single line containing `rel="icon" href="/favicon.svg" type="image/svg+xml"` — the scaffold default fallback.

- [ ] **Step 4: Commit.**

```bash
git add scaffold/src/_includes/base.njk
git commit -m "feat(assets): conditional favicon links in base layout"
```

---

### Task 6: Migrate `sites/anchovy` — folder rename + URL rewrites + dist cleanup

**Files:**
- Move: `sites/anchovy/images/` → `sites/anchovy/assets/images/`
- Modify: `sites/anchovy/build-plan.yaml`
- Delete: `sites/anchovy/dist/IMG_1122.jpeg`, `sites/anchovy/dist/IMG_1123.jpeg`, `sites/anchovy/dist/IMG_1124.jpeg`

- [ ] **Step 1: Move the images folder under `assets/`.**

```bash
mkdir -p sites/anchovy/assets
git mv sites/anchovy/images sites/anchovy/assets/images
```

- [ ] **Step 2: Rewrite the three markdown image references in `build-plan.yaml`.**

Run: `grep -n '/images/' sites/anchovy/build-plan.yaml`

Expected: three matches on lines 24–26 (`![Anchovy](/images/IMG_112*.jpeg)`).

Apply the rewrites (one Edit per line, or a single sed):

```bash
sed -i.bak 's|](/images/|](/assets/images/|g' sites/anchovy/build-plan.yaml && rm sites/anchovy/build-plan.yaml.bak
```

Verify: `grep -n '/images/\|/assets/images/' sites/anchovy/build-plan.yaml`

Expected: three matches, all on `/assets/images/`; zero matches for the old `/images/` path.

- [ ] **Step 3: Delete the stale dist-root duplicate images.**

`build-site.sh` does `rm -rf "${SITE_DIR}/dist"` at the top of every run, so the next build in Task 7 will clean these automatically. Doing it now keeps the working tree clean for review of this commit:

```bash
rm -f sites/anchovy/dist/IMG_1122.jpeg sites/anchovy/dist/IMG_1123.jpeg sites/anchovy/dist/IMG_1124.jpeg
```

Confirm with `git status` — these files should not appear under git history (`dist/` is typically ignored). If `git status` shows them as tracked, investigate before continuing.

- [ ] **Step 4: Commit the migration as a single commit.**

```bash
git add sites/anchovy
git commit -m "refactor(anchovy): migrate images/ → assets/images/"
```

---

### Task 7: End-to-end verification — rebuild anchovy and visually check

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite to make sure nothing regressed.**

Run: `bash scripts/test/run-tests.sh`

Expected: all assertions pass, summary shows 0 failures.

- [ ] **Step 2: Run the `/build` pipeline against anchovy.**

Run: `SITE_DIR=sites/anchovy bash scripts/write-site-json.sh && SITE_DIR=sites/anchovy bash scripts/apply-theme.sh && SITE_DIR=sites/anchovy bash scripts/build-site.sh`

Expected: build completes without errors; warns that anchovy has no site favicons.

- [ ] **Step 3: Confirm the gallery images are at the new path in `dist/`.**

```bash
ls sites/anchovy/dist/assets/images/
grep -n 'assets/images' sites/anchovy/dist/gallery/index.html
```

Expected: the three `IMG_*.jpeg` files are present at `dist/assets/images/`, and the gallery page's HTML references them via `/assets/images/IMG_*.jpeg`.

- [ ] **Step 4: Confirm scaffold favicon fallback works for anchovy.**

Run: `grep -n 'favicon' sites/anchovy/dist/index.html`

Expected: one match — `rel="icon" href="/favicon.svg" type="image/svg+xml"` (the scaffold default).

- [ ] **Step 5: Confirm the stale root-level images are gone.**

Run: `ls sites/anchovy/dist/`

Expected: no `IMG_*.jpeg` at dist root. Only `css/`, `favicon.svg`, `gallery/`, `index.html`, `assets/`.

- [ ] **Step 6: (Manual) browse the rebuilt site locally to eyeball the gallery.**

Run: `SITE_DIR=sites/anchovy bash scripts/deploy.sh --local` *(equivalent to invoking `/deploy anchovy local` via Claude Code)*

Open `http://localhost:8080/gallery/` in a browser. Confirm all three anchovy images render. Stop the local server when done.

If any verification step fails, fix the underlying task (1–6) and re-run from Step 1.

---

### Task 8: Update `ROADMAP.md` — record slice 1 as shipped

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Read the `## Completed` section to see the current format.**

Run: `sed -n '1,30p' ROADMAP.md && echo '---' && grep -n '^### ' ROADMAP.md`

- [ ] **Step 2: Add a new "Per-site assets + favicons (page-types slice 1)" entry under `## Completed`, after the most recent shipped item (`The /status command`).**

The new entry should explicitly call out that this is the first slice of a new "page-types extension track," reference the spec, and summarize the change. Suggested text (place after the `The /status command` block, before the `---` separator that introduces `## Pending`):

```markdown
### Per-site assets + favicons (page-types slice 1)
Shipped May 2026. First slice of the **page-types extension track** —
extending `build-plan.yaml`'s expressive range so that sites like
`bigbeautifulpeaceprize.com` (forms, server functions, secrets) can
eventually be expressed. Replaced the `sites/<name>/images/` convention
with a single general `sites/<name>/assets/` folder; added a special
`assets/favicons/` subfolder that is filename-pattern-detected at build
time and produces `<link>` tags in `<head>`. Zero new build-plan schema —
the compiler scans the filesystem and populates `site.favicons[]` /
`site.has_custom_favicons` on `site.json`. `sites/anchovy` migrated as
part of the change. The scaffold `favicon.svg` remains the default when
a site has no custom favicons. Spec:
`docs/superpowers/specs/2026-05-31-static-assets-favicons-design.md`.
```

- [ ] **Step 3: Add a "Page-types extension track (remaining slices)" note under `## Pending`.**

Place this anywhere logical in the `## Pending` section — suggested: just before the existing `### Contact form + form backend` entry, since slice 3 (forms) supersedes that item.

```markdown
### Page-types extension track (remaining slices)
Slice 1 (per-site assets + favicons) shipped May 2026. Remaining slices,
ordered:

- **Slice 2:** `<head>` extras + per-path response `_headers`. Schema
  grows a `head:` block and a `headers:` block. Multi-component header
  additivity is the open design question.
- **Slice 3:** Forms — `mailto:` / form-service tier, no backend.
  Closes the `### Contact form + form backend` roadmap item and gets
  bbpp's form *shape* expressible (backend deferred to slice 4).
- **Slice 4:** Cloudflare Pages Functions + secrets pipeline. The big
  unlock — Turnstile, proxying, dynamic capabilities. Deliberately
  deferred until slices 1–3 ship so the schema can be designed against
  two real form examples (mailto + bbpp) rather than one.

Each slice gets its own spec → plan → ship cycle. bbpp is the driving
example for the track; the spec for slice 1
(`docs/superpowers/specs/2026-05-31-static-assets-favicons-design.md`)
documents the full bbpp gap analysis.
```

- [ ] **Step 4: Commit.**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): record slice 1 shipped, page-types track planned"
```

---

## Verification Summary

After all tasks complete:

- [ ] `bash scripts/test/run-tests.sh` → all green
- [ ] `sites/anchovy/dist/assets/images/IMG_*.jpeg` exist (3 files)
- [ ] `sites/anchovy/dist/gallery/index.html` references `/assets/images/…`
- [ ] `sites/anchovy/dist/` root contains no `IMG_*.jpeg`
- [ ] `sites/clodsite/dist/index.html` contains the scaffold default favicon link
- [ ] `ROADMAP.md` lists slice 1 as shipped and slices 2–4 as pending

If you want to additionally exercise the custom-favicon code path against a real site, you can drop bbpp's favicons into `sites/anchovy/assets/favicons/` (e.g. `cp ~/dev/bbpp/src/favicon* ~/dev/bbpp/src/apple-touch-icon.png sites/anchovy/assets/favicons/`), rebuild, and confirm `sites/anchovy/dist/index.html` now contains the multiple custom `<link>` tags and not the scaffold default. This is optional — not part of the plan.
