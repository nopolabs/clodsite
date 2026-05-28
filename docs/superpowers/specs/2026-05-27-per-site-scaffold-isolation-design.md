# Per-Site Scaffold Isolation — Design Spec

**Date:** 2026-05-27
**Status:** Approved for implementation

---

## Problem

`/build` writes two generated artifacts to `scaffold/src/`, which is a shared directory:

- `scaffold/src/_data/site.json`
- `scaffold/src/*.njk` (one template per page)

These are gitignored but live on disk. When a second site is built, the first site's files are silently overwritten. The user has no way to keep two sites' build artifacts alive simultaneously — the last `/build <name>` run always wins.

---

## Goal

Isolate each site's generated files under `sites/<name>/` so that building one site never touches another's files. Parallel builds are not a goal; the fix is about correctness and mental model clarity.

---

## Approach

Move generated files to `sites/<name>/src/` and configure Eleventy to use that directory as its input, while keeping shared resources (`_includes/`, `css/`, `favicon.svg`) in `scaffold/src/`. Eleventy 3.x supports absolute paths for `dir.includes`, making this clean.

---

## Directory Structure

**Before:**
```
scaffold/src/
  _includes/base.njk     ← shared, tracked
  css/themes/            ← shared, tracked
  favicon.svg            ← shared, tracked
  _data/site.json        ← GENERATED, last-build-wins ❌
  *.njk                  ← GENERATED, last-build-wins ❌
```

**After:**
```
scaffold/src/
  _includes/base.njk     ← shared, tracked (unchanged)
  css/themes/            ← shared, tracked (unchanged)
  favicon.svg            ← shared, tracked (unchanged)
  ← nothing generated ever lands here

sites/<name>/
  src/                   ← NEW: per-site Eleventy input (gitignored)
    _data/site.json      ← written by write-site-json.sh
    index.njk            ← written by /build
    about.njk            ← written by /build (one per page)
  images/
  dist/
  site-spec.json
  build-plan.md
```

---

## Files Changed

### `scaffold/.eleventy.js`

This is the most significant change, and it also fixes a latent bug in the current code.

**The bug:** `build-site.sh` runs Eleventy with `(cd scaffold && npx @11ty/eleventy)`. Eleventy resolves config paths relative to the config file's directory (`scaffold/`). So the current `` output: `${siteDir}/dist` `` with `SITE_DIR=sites/ndig` resolves to `scaffold/sites/ndig/dist` — the wrong location. The same issue affects the images passthrough copy. This bug was never caught because the full Eleventy build was never run during the multi-site PR.

**The fix:** Use `path.resolve(__dirname, '..')` to anchor all per-site paths to the repo root, making them unambiguous regardless of where Eleventy is invoked from.

```js
const path = require('path');

module.exports = function(eleventyConfig) {
  const siteDir = process.env.SITE_DIR;
  if (!siteDir) {
    throw new Error('SITE_DIR is not set. Export it before running Eleventy.');
  }

  const repoRoot = path.resolve(__dirname, '..');    // scaffold/../ = repo root
  const sharedSrc = path.join(__dirname, 'src');     // scaffold/src/ — absolute
  const siteSrc   = path.resolve(repoRoot, siteDir, 'src');     // sites/<name>/src/
  const siteDist  = path.resolve(repoRoot, siteDir, 'dist');    // sites/<name>/dist/
  const siteImages = path.resolve(repoRoot, siteDir, 'images'); // sites/<name>/images/

  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'css')]: 'css' });
  eleventyConfig.addPassthroughCopy({ [path.join(sharedSrc, 'favicon.svg')]: 'favicon.svg' });
  eleventyConfig.addPassthroughCopy({ [siteImages]: 'images' });

  return {
    dir: {
      input: siteSrc,                                // per-site templates + data
      output: siteDist,                              // per-site output
      includes: path.join(sharedSrc, '_includes'),   // absolute — shared layout
      data: '_data'                                  // relative to input
    },
    templateFormats: ['njk', 'html'],
    htmlTemplateEngine: 'njk'
  };
};
```

### `scripts/write-site-json.sh`

Output path changes from `scaffold/src/_data/site.json` to `${SITE_DIR}/src/_data/site.json`. Add `mkdir -p "${SITE_DIR}/src/_data"` before the node write.

### `scripts/build-site.sh`

Add `mkdir -p "${SITE_DIR}/src"` before the Eleventy build step to guarantee the input directory exists.

### `.claude/commands/build.md`

Template write paths change in three places:
- `scaffold/src/index.njk` → `sites/<site-name>/src/index.njk`
- `scaffold/src/[page-id].njk` → `sites/<site-name>/src/[page-id].njk`
- `scaffold/src/contact.njk` → `sites/<site-name>/src/contact.njk`

### `scripts/test/run-tests.sh`

The `write-site-json.sh` test asserts `scaffold/src/_data/site.json` was created. Update to assert `${SITE_DIR}/src/_data/site.json` instead.

### `.gitignore`

- Remove stale entries: `scaffold/src/*.njk`, `scaffold/src/_data/site.json`
- Add: `sites/*/src/` (per-site generated templates and data)
- Add: `sites/*/dist/` (per-site build output — was missing)

### `scripts/clean.sh`

No changes needed. `clean.sh` deletes `sites/<slug>/` entirely, which covers `sites/<name>/src/` automatically. The lines `rm -f scaffold/src/*.njk` and `rm -f scaffold/src/_data/site.json` become dead code but are harmless; remove them to keep the script honest.

---

## Testing

Existing test coverage:

- `write-site-json.sh` suite: assert output lands at `${SITE_DIR}/src/_data/site.json`
- `apply-theme.sh` suite: unchanged (reads from `${SITE_DIR}/site-spec.json`)
- `validate-spec.sh` suite: unchanged
- `migrate-site.sh` suite: unchanged

No new test cases needed beyond updating the existing `write-site-json.sh` assertion.

---

## What Does Not Change

- `scaffold/src/_includes/base.njk` — shared, unchanged
- `scaffold/src/css/` — shared, unchanged
- `scaffold/src/favicon.svg` — shared, unchanged
- `scripts/apply-theme.sh` — reads `${SITE_DIR}/site-spec.json`, not affected
- `scripts/validate-spec.sh` — reads `${SITE_DIR}/site-spec.json`, not affected
- `scripts/deploy.sh` / `deploy-finalize.sh` — use `${SITE_DIR}/dist`, not affected
- `scripts/migrate-site.sh` — unaffected
- `ROADMAP.md` entry — remove "Per-site scaffold isolation" once shipped
