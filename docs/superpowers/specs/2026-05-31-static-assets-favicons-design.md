# Static assets + favicons (page-types slice 1)

**Status:** approved, ready for implementation plan
**Date:** 2026-05-31
**Track:** page-types extension — slice 1 of N

## Context

`build-plan.yaml` today can express text content (GFM in `pages[].content`), nav,
theme, and contact-footer email. It cannot express anything else a real site
needs: custom assets, favicons, headers, forms, server functions, secrets,
external API integrations.

The driving example for the page-types track is `bigbeautifulpeaceprize.com`
(repo at `~/dev/bbpp`, backend Worker at `~/dev/parchment`). bbpp introduces
~11 distinct gaps relative to clodsite's current capabilities. Rather than
design one large extension, the track is sliced into independently shippable
pieces. The chosen order:

1. **Static assets + favicons** (this spec)
2. `<head>` extras + per-path response `_headers`
3. Forms — `mailto:` / form-service tier, no backend
4. Cloudflare Pages Functions + secrets pipeline (deferred until 1–3 ship)

Slice 1 was chosen first because it is the smallest piece that every existing
site benefits from immediately, it requires no hard architectural calls, and it
serves as a warm-up for the mechanics of extending the compiler.

## Current state

- `sites/<name>/images/` is passthrough-copied to `dist/images/` by
  `scaffold/.eleventy.js`. Referenced from page content as `/images/foo.jpg`.
- `scaffold/src/favicon.svg` is passthrough-copied to `dist/favicon.svg` for
  every site. There is no way to override it per-site.
- No build-plan schema entries describe assets or favicons.
- `sites/anchovy` is the only site with content images today.

## Decision

Replace the existing `images/` convention with a single general `assets/`
convention per site, and add a special-cased `assets/favicons/` subfolder
that produces favicon `<link>` tags in `<head>` from filename patterns.

Zero new fields in `build-plan.yaml`. Pure convention. The schema does not
need to grow because the compiler can derive everything it needs by scanning
the site directory at build time.

### Folder layout

```
sites/<name>/
  assets/                         → dist/assets/                  (whole subtree passthrough-copied)
    images/IMG_1122.jpeg          → dist/assets/images/IMG_1122.jpeg
    bbpp-seal.png                 → dist/assets/bbpp-seal.png
    favicons/                     → SPECIAL: copied to dist/ root + auto-linked
      favicon.ico                 → dist/favicon.ico
      favicon-32x32.png           → dist/favicon-32x32.png
      apple-touch-icon.png        → dist/apple-touch-icon.png
```

Subfolders under `assets/` are free-form. Markdown references are plain URLs
(`![](/assets/images/foo.jpg)`) — no compiler magic, just Eleventy passthrough.

### Favicon detection rules

Files in `sites/<name>/assets/favicons/` matching the patterns below are copied
to `dist/` root and produce a corresponding `<link>` tag in `<head>`:

| Filename | Emitted in `<head>` |
|---|---|
| `favicon.ico` | `<link rel="icon" href="/favicon.ico" sizes="any">` |
| `favicon-16x16.png` | `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">` |
| `favicon-32x32.png` | `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">` |
| `favicon-48x48.png` | `<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">` |
| `apple-touch-icon.png` | `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` |
| `favicon.svg` | `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` |

Files in `favicons/` that do not match any pattern are copied to `dist/` root
but produce no `<link>` tag, and the build warns. Conservative scope: no
`manifest.json`, no `theme-color`, no PWA fields. Those are explicitly
deferred.

### Default favicon behavior

`scaffold/src/favicon.svg` remains the global default. If
`sites/<name>/assets/favicons/` exists and contains at least one matching
file, the scaffold default is suppressed — the base layout emits only the
site-specific `<link>` tags. If the folder is absent or empty, the scaffold
default is emitted as today, and the build warns that the site is using the
default favicon.

## Implementation

### `scaffold/.eleventy.js`

- Remove `siteImages` passthrough (`sites/<name>/images/` → `dist/images/`).
- Add `siteAssets` passthrough (`sites/<name>/assets/` → `dist/assets/`).
- Add a second passthrough mapping each matching file in
  `sites/<name>/assets/favicons/` to `dist/` root. Implemented as one
  `addPassthroughCopy` call per file (Eleventy supports this) so that
  non-matching files in `favicons/` are not copied to root.
- The scaffold default favicon passthrough
  (`scaffold/src/favicon.svg` → `dist/favicon.svg`) remains, but is suppressed
  in the layout when `site.has_custom_favicons` is true. The file may still
  be copied to dist; only the `<link>` is conditional.

### `scripts/build-site.sh`

- Change `mkdir -p "${SITE_DIR}/images"` to `mkdir -p "${SITE_DIR}/assets/favicons"`.

### `scripts/write-site-json.sh`

Becomes the policy point for favicon discovery:

- Scan `sites/<name>/assets/favicons/` for matching filenames.
- Populate a new `site.favicons[]` array on `src/_data/site.json`. Each entry is
  an object: `{ rel, href, type?, sizes? }`.
- Set `site.has_custom_favicons: bool` based on whether any matching files
  were found.
- Warn (stderr, non-fatal) when:
  - No matching favicons found → site falls back to scaffold default.
  - Non-matching files exist in `favicons/` → copied but not linked.

### Base layout (`scaffold/src/_includes/<layout>.njk`)

Replace the hardcoded `<link rel="icon" href="/favicon.svg">` with:

```njk
{% if site.has_custom_favicons %}
  {% for f in site.favicons %}
    <link rel="{{ f.rel }}" href="{{ f.href }}"{% if f.type %} type="{{ f.type }}"{% endif %}{% if f.sizes %} sizes="{{ f.sizes }}"{% endif %}>
  {% endfor %}
{% else %}
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
{% endif %}
```

### Anchovy migration

Done as part of this change so the old `images/` passthrough can be deleted in
the same commit:

```
git mv sites/anchovy/images sites/anchovy/assets/images
# In sites/anchovy/build-plan.yaml, replace /images/ with /assets/images/
# (three markdown image lines on the gallery page)
# Rebuild and visually verify.
```

The stale `dist/IMG_*.jpeg` files currently at `sites/anchovy/dist/` root
should be deleted by hand as part of the migration commit; whether the build
pipeline cleans `dist/` between runs is not assumed.

## Validation

`validate-plan.sh` is unchanged — no schema additions to validate.
`write-site-json.sh` is the new policy point. All asset issues are warnings,
never errors: asset problems are visual and obvious in the rendered page,
not structural problems that would corrupt downstream steps.

## Out of scope (deferred)

- Per-page assets — everything is site-wide for now.
- Auto-generated favicon sizes from a single source image.
- `manifest.json`, `theme-color`, OpenGraph / social-share images.
- Content-hash cache busting.
- `_headers` file (slice 2).
- `<head>` extras (slice 2).
- Anything bbpp-specific beyond `assets/` and `assets/favicons/`.

## Risks and mitigations

- **Breaking change for `images/` URL convention.** Mitigated by migrating
  anchovy in the same change and updating its build plan. No other site uses
  the old convention.
- **Favicon `<link>` emission depends on a build-time scan, not the build
  plan.** This means `build-plan.yaml` no longer fully describes the rendered
  HTML — `assets/favicons/` contents also matter. Accepted as the cost of
  zero-schema design; documented here so future readers understand why
  `site.favicons[]` exists in `site.json` without a corresponding source field.
- **Suppression of scaffold default depends on layout logic, not file
  presence.** If the conditional in the layout is wrong, a site could end up
  with double `<link>` tags. Covered by visual check on anchovy after
  migration.

## Files touched

- `scaffold/.eleventy.js`
- `scripts/build-site.sh`
- `scripts/write-site-json.sh`
- `scaffold/src/_includes/` — whichever base layout(s) emit the favicon link
- `sites/anchovy/images/` → `sites/anchovy/assets/images/` (move)
- `sites/anchovy/build-plan.yaml` (URL rewrites)
- `ROADMAP.md` — record slice 1 as shipped under a new "page-types track" section
