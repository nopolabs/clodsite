---
type: Spec
title: "Generated Not-Found Page Design"
description: "Design for the generated 404 not-found page."
tags: ["404", "pages"]
status: shipped
timestamp: 2026-06-25T00:00:00Z
---

# Generated Not-Found Page Design

**Date:** 2026-06-25
**Status:** Implemented
**Roadmap entry:** Generated not-found page (pending item 8)

---

## Summary

Every Clodsite site currently lets unknown URLs resolve to a real page with an
HTTP `200`. A request for `/does-not-exist` is served the home (or another)
page's HTML with a success status — a "soft 404". This is dishonest to clients
and harmful for SEO: search engines index phantom URLs as duplicates of existing
pages.

Generate a top-level `dist/404.html` for every site. Shipping this file is the
Cloudflare Pages mechanism that turns unmatched routes into an honest `404`
response instead of the soft-`200` fallback. The page carries the site's chrome
and links back to known content so a lost visitor can recover.

Two levels:

1. **Default (automatic, every site).** The engine synthesizes a not-found page
   — site header/nav/footer via `base.njk`, a "Page not found" message, and a
   link to every nav page. Zero authoring.
2. **Override (opt-in, per site).** An author may declare a top-level
   `not_found` block in `build-plan.yaml` using the normal component vocabulary.
   The engine renders that instead of the default.

This keeps faith with the inference boundary: a custom 404 is expressed through
typed components, not raw HTML.

## Contract

```yaml
not_found:            # optional, top-level
  title: <string>     # optional; defaults to "Page not found"
  components:         # required when not_found is present; non-empty
    - type: hero
      ...
```

- `not_found` is a standalone slot: never listed in `pages`, never in
  `nav.order`. It renders to `/404.html`.
- `components` are validated exactly like a page's components (known types,
  hero-first / at-most-one-hero, required/optional/unknown fields).
- Disallowed component types on the 404 slot: `catalog`,
  `personalized-product`, `certificate-award`. They depend on commerce/proxy
  wiring (catalog join, cart chrome, Turnstile-guarded proxy) that a not-found
  page does not provide, and allowing them would require extending every
  commerce/proxy cross-check to a non-page slot. A 404 page that sells products
  is also nonsensical.

## Rendering

`render-templates.mjs` writes `src/404.njk` after the per-page loop:

- `layout: base.njk`, `permalink: /404.html`.
- `pageTitle` = `not_found.title` or `"Page not found"`.
- `noindex: true` front-matter flag; `base.njk` emits
  `<meta name="robots" content="noindex">` and (because `pageHead` is omitted)
  no description / canonical / Open Graph / Twitter / JSON-LD. The 404 is not
  real content and must not be canonicalized or indexed.
- `pageComponents` = the override components, or a single synthesized `prose`
  component whose Markdown carries the heading, message, and nav links.

The default page is "just a `prose` component" rendered through the exact same
include path as every other component — no new component type, no new CSS.

## Validation

`validate-plan.mjs` gains a reusable `validateComponents(components, tag)` (the
existing per-page component checks, extracted) used for both `pages[i].components`
and `not_found.components`, plus a `not_found` block check (object shape,
allowed fields, optional non-empty `title`, and the disallowed-type guard).

## Testing

- `not-found.mjs` pure helpers unit-tested in `not-found.test.mjs`.
- `run-tests.sh` builds a site and asserts `dist/404.html` exists, is
  `noindex`, carries no canonical/OG metadata, links to nav pages, that a custom
  `not_found` block overrides the default, and that malformed blocks are
  rejected.

## Follow-ups

This unblocks roadmap item 9 (explicit redirects via a generated `_redirects`),
which depends on a generated 404 existing to handle genuinely unknown paths.
