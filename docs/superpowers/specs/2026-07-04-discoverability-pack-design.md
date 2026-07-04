---
type: Spec
title: "Discoverability Pack Design"
description: "Design for sitemap.xml, robots.txt, a site-level business block compiled to LocalBusiness JSON-LD, and an hours-location component. Not yet implemented."
tags: ["seo", "discoverability", "local-business", "structured-data", "sitemap"]
status: draft
timestamp: 2026-07-04T00:00:00Z
---

# Discoverability Pack Design

**Date:** 2026-07-04
**Status:** Draft (proposed for review)
**Roadmap entry:** Discoverability pack (pending item 23); first vertical
component for item 4
**Builds on:** metadata/sharing/headers (canonical URLs + `WebSite`/`WebPage`
JSON-LD, `docs/superpowers/specs/2026-06-09-metadata-sharing-headers-design.md`),
explicit redirects (item 9, the `render-*.sh` → `dist/` pattern), deterministic
builds

---

## Summary

Clodsite already emits per-page descriptions, canonical URLs, Open
Graph/Twitter tags, and generic `WebSite`/`WebPage` JSON-LD. What it does *not*
emit is anything that helps a small business be **found**: no `sitemap.xml`, no
`robots.txt`, no structured local-business data, and no component for
hours/location. For a local business, discoverability is most of the point of
having a site — a competent developer sets this up on day one.

This design adds a **discoverability pack** in four pieces, all **deterministic
compiler output from declarative intent** — no new inference, no new runtime,
no secrets:

1. **`dist/sitemap.xml`** — generated from the site's indexable page routes,
   gated on `custom_domain` (absolute URLs required).
2. **`dist/robots.txt`** — boring allow-all by default, pointing at the sitemap.
3. **An optional top-level `business` block** — name, address, phone, opening
   hours, geo, and a bounded `LocalBusiness` category — compiled into
   `LocalBusiness` JSON-LD on the site's root page, joined into the existing
   `@graph`.
4. **An `hours-location` component** — renders the *same* `business` block as
   human-visible content, so the machine-readable and human-visible hours can
   never disagree.

The design deliberately reuses two mechanisms already in the codebase: the
`custom_domain` → `canonicalOrigin` derivation and the `@graph` structured-data
assembly in `render-templates.mjs` (pieces 3), and the `render-redirects.sh`
one-script-per-`dist/`-artifact pattern (pieces 1–2). It introduces one small
shared helper (page-route enumeration) so the sitemap and the template renderer
cannot disagree about what routes exist.

## Motivation

A local business's website earns its keep by being discoverable: showing up in
search, in Google's local pack, with correct hours and location. Three of the
four pieces here are table stakes a hand-coding developer would never skip —
a sitemap, a robots file, and `LocalBusiness` structured data — and the fourth
(an hours/location component) is the single most-requested piece of content for
a local business. None exists today. All four are pure functions of the plan,
which makes them the most Clodsite-shaped features imaginable: declare intent,
compile deterministically.

The **operator payoff** is concrete: the `business` block is the same data the
owner maintains in their Google Business Profile, so the site and the profile
reinforce each other, and a single edit keeps the site's visible hours, its
structured data, and (by operator discipline) the profile aligned.

## Piece 1 — `dist/sitemap.xml`

**Generator.** A new `scripts/render-sitemap.sh`, mirroring
`render-redirects.sh`: sources `lib/sites.sh`, reads the plan and the built
`dist/`, and writes (or removes a stale) `dist/sitemap.xml`. Wired into
`build-deploy.sh` right after `render-redirects`.

**Gating.** A sitemap needs absolute URLs, so it is gated on `custom_domain` —
the same rule the canonical-URL and social-image logic already use
(`canonicalOrigin = 'https://' + custom_domain`). With no `custom_domain`, the
script emits nothing and prints a one-line notice (mirroring the existing
"root-relative … custom_domain is empty" warning), and removes any stale file.

**Contents.** One `<url>` per **indexable page route**:

- Routes come from the shared route helper (below): the root page → `/`, every
  other page → `/<id>/`.
- `<loc>` is `canonicalOrigin + route` — identical to each page's
  `canonical_url`, so the sitemap and the `<link rel="canonical">` always agree.
- The generated **404 is excluded** (it is `noindex`), and any future
  `noindex` page is excluded on the same rule — the sitemap lists only what the
  canonical/index story already treats as indexable.
- `<lastmod>` is **omitted in v1** (see Deferred). Emitting a truthful
  `lastmod` requires per-route source-change tracking the build does not have;
  a fabricated or build-time timestamp would be worse than absent and would
  break the determinism check.

**Determinism.** Routes are emitted in `nav.order`, so the file is byte-stable
across rebuilds of an unchanged plan (a property the item-7 revise report and
the reproducibility claim both depend on).

## Piece 2 — `dist/robots.txt`

**Generator.** A new `scripts/render-robots.sh`, same pattern, wired alongside
piece 1.

**Default (always written).** Boring and explicit:

```
User-agent: *
Allow: /
```

When `custom_domain` is set, a `Sitemap: https://<custom_domain>/sitemap.xml`
line is appended. Writing an allow-all `robots.txt` for every site is a no-op
behaviorally (allow-all is already the implicit default) but makes the policy
explicit and gives crawlers the sitemap pointer — the same "explicit and
boring" principle as generated `_headers`/`_redirects`.

**Optional disallow rules.** An optional top-level `robots` block:

```yaml
robots:
  disallow:
    - /admin/
    - /drafts/
```

Each entry is a literal origin-relative path (leading `/`, no `..`, no
protocol), validated the way `redirects` sources are. They render as
`Disallow:` lines under `User-agent: *`. This is a thin, structural add — no
per-agent groups, no `Allow` overrides in v1 (see Deferred).

## Piece 3 — the `business` block → `LocalBusiness` JSON-LD

**Plan schema.** A new optional top-level key, sibling of `head` and `email`:

```yaml
business:
  category: Restaurant          # bounded enum → schema.org @type
  name: Joe's Pizza             # optional; defaults to plan.name
  phone: "+1-503-555-0100"      # optional
  address:                      # optional, but all-or-nothing on its subfields
    street: 123 Main St
    city: Portland
    region: OR
    postal_code: "97201"
    country: US                 # ISO 3166-1 alpha-2
  hours:                        # optional
    - days: [monday, tuesday, wednesday, thursday, friday]
      opens: "09:00"            # 24h HH:MM
      closes: "21:00"
    - days: [saturday, sunday]
      opens: "10:00"
      closes: "22:00"
  geo:                          # optional
    lat: 45.5231
    lng: -122.6765
```

- **`category`** is a **bounded, curated enum** of common schema.org
  `LocalBusiness` subtypes — v1 starter set: `LocalBusiness` (generic),
  `Restaurant`, `CafeOrCoffeeShop`, `Store`, `ProfessionalService`,
  `HealthAndBeautyBusiness`, `HomeAndConstructionBusiness`. The enum grows by
  curated addition (each value must be a real schema.org type), exactly as the
  theme/style vocabulary grows — not a free-text field.
- **All fields optional except `category`.** A `business` block with only a
  category still produces a valid (if minimal) `LocalBusiness`. `name` defaults
  to `plan.name`; `url` is `canonicalOrigin + '/'`.
- **Single location in v1.** One `business` block ⇒ one `LocalBusiness`.
  Multi-location is deferred.

**JSON-LD assembly — extend the existing `@graph`, don't add a new script.**
The `WebSite`/`WebPage` graph is built in `render-templates.mjs`, per page,
inside the `if (canonicalUrl)` block. The `LocalBusiness` node is added there,
**only on the root page** (the page whose permalink is `/`), and joined into
that page's existing `@graph` with an `@id` so the `WebPage` can reference it
via `about`/`publisher`. Mapping:

| Plan | schema.org |
|---|---|
| `category` | `@type` |
| `name` / `plan.name` | `name` |
| `phone` | `telephone` |
| `address.*` | `PostalAddress` (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`) |
| `hours[]` | `openingHoursSpecification[]` (`OpeningHoursSpecification` with `dayOfWeek: [schema.org/Monday…]`, `opens`, `closes`) |
| `geo.lat`/`lng` | `GeoCoordinates` (`latitude`, `longitude`) |
| — | `url` = `canonicalOrigin + '/'`, `@id` = `canonicalOrigin + '/#localbusiness'` |

**Gating.** Because the whole structured-data block is already gated on
`canonicalUrl` (no absolute origin ⇒ no JSON-LD), `LocalBusiness` emits only
when `custom_domain` is set — correct for structured data, and a local business
site has a domain. The *component* (piece 4) does **not** share this gate: it
renders human-visible hours regardless of domain.

## Piece 4 — the `hours-location` component

**The design point (from the roadmap): no duplicated data.** The component
renders the **site-level `business` block**, not its own props — so the
human-visible hours/address and the machine-readable `LocalBusiness` JSON-LD are
the *same source*, and cannot drift. This mirrors how the `catalog` component
already consumes site-level `site.commerce` config rather than re-declaring it;
`business` is injected onto `site.json` (like `site.commerce`, `site.favicons`)
so the component template can read `site.business`.

**Schema.** The component carries only presentation-level, optional props — e.g.
an optional `heading` and a `show` selector to render a subset
(`[hours, address, phone, map_link]`) — never the business data itself:

```yaml
- type: hours-location
  heading: Visit us            # optional
  show: [hours, address, phone]  # optional; default: all present fields
```

**Rendering.** Theme-styled, semantic markup: address as a `<address>` block,
hours as a `<table>` or definition list (human-formatted, e.g. "Mon–Fri
9:00 AM – 9:00 PM" — day-range collapsing is a rendering nicety, not required
for v1), phone as a `tel:` link, and an optional map link built from `geo` or
the address. No raw HTML, no styling knobs — same contract as every component.

**Cross-check (validation).** An `hours-location` component with **no
site-level `business` block** is a plan error (the component has nothing to
render) — caught in `validate-plan` as a cross-reference check, the way
nav/page references already are.

## Shared machinery — page-route enumeration

`render-templates.mjs` computes routes inline (`firstId = nav.order[0]`;
permalink `/` for the first, `/<id>/` otherwise). The sitemap needs the *same*
routes. To keep them from disagreeing, extract one helper —
`getPageRoutes(plan)` in `scripts/lib/build-plan.mjs` — returning the ordered
`{ id, route }` list, and have both the template renderer and the sitemap
generator use it. (Item 20's collection routes and item 7's route-mapping are
natural future consumers, but this design only commits to de-duplicating the
existing two call sites.)

## Validation (`validate-plan`)

Structural and credential-free, consistent with how `head`/`email`/`redirects`
validate:

- **`business`** (if present): `category` ∈ the curated enum; `name`/`phone`
  strings; `address` an object whose present subfields are strings and whose
  `country` is a 2-letter code; `hours[]` entries have a non-empty `days`
  subset of the weekday enum, and `opens`/`closes` matching `^\d{2}:\d{2}$`
  with `opens < closes`; `geo.lat` ∈ [-90, 90], `geo.lng` ∈ [-180, 180].
  Unknown fields rejected (like the `email` block).
- **`robots`** (if present): `disallow[]` are literal origin-relative paths
  (leading `/`, no `..`, no scheme), reusing the `redirects`-source path check.
- **Cross-reference:** an `hours-location` component requires a `business`
  block; a component `show` value must be one of the known facets.

No credentials, no network — CI-safe, same class as the rest of `validate-plan`.

## Wiring & files

| File | Kind | Role |
|---|---|---|
| `scripts/render-sitemap.sh` | new `[SCRIPT]` | plan → `dist/sitemap.xml` (gated on `custom_domain`); self-heals stale |
| `scripts/render-robots.sh` | new `[SCRIPT]` | plan → `dist/robots.txt` (+ Sitemap line, + disallow) |
| `scripts/lib/build-plan.mjs` | `getPageRoutes(plan)` | shared route enumeration |
| `scripts/lib/render-templates.mjs` | extended | `LocalBusiness` node on the root page's `@graph` |
| `scripts/lib/validate-plan.mjs` | extended | `business` + `robots` shape, `hours-location` cross-ref |
| `components/hours-location/` | new component | `component.njk` + `.css` + `schema.json`, reads `site.business` |
| `scripts/write-site-json.*` | extended | inject `site.business` for the component |
| `build-deploy.sh` | wiring | run the two new render steps after `render-redirects` |
| docs + `NEXT-STEPS.md` | guidance | keep `business` aligned with the Google Business Profile |

## Testing

- **Sitemap:** with `custom_domain`, lists exactly the indexable routes
  (`/` + each `/<id>/`) as absolute `<loc>`s equal to the pages' canonicals,
  excludes 404, and is byte-stable across rebuilds; with no `custom_domain`,
  no file is written and a stale one is removed.
- **Robots:** default allow-all always written; `Sitemap:` line appears only
  with `custom_domain`; `robots.disallow` entries render as `Disallow:` lines;
  malformed disallow paths rejected by `validate-plan`.
- **`LocalBusiness` JSON-LD:** with a `business` block + `custom_domain`, the
  root page's `@graph` gains a `LocalBusiness` node with the mapped fields
  (address, `openingHoursSpecification`, geo), cross-linked by `@id`; non-root
  pages do not; no `custom_domain` ⇒ no `LocalBusiness` (consistent with the
  existing structured-data gate); minimal block (category only) still valid.
- **`hours-location` component:** renders `site.business` (hours/address/phone),
  honors `show`, and its rendered hours match the JSON-LD hours (same source);
  component without a `business` block → validation error.
- **Validation:** category enum, hours time-format/order, country-code shape,
  geo ranges, unknown `business` field, and the component cross-reference all
  covered with no credentials.

## Deferred (explicit non-goals for v1)

- **`<lastmod>` in the sitemap** — needs per-route source-change tracking the
  build lacks; adding it later (e.g. from git history of authored inputs) is a
  clean follow-on and pairs with item 7's authored-input surface.
- **Multiple business locations** — one `business` block ⇒ one `LocalBusiness`;
  multi-location (and `Organization` + `department`) is a later shape.
- **Sitemap index / >50k URLs, image/video/news sitemaps** — irrelevant at the
  1–5 page (plus collections) scale.
- **Rich robots** — per-agent groups, `Allow` overrides, crawl-delay.
- **Collection routes** — added to the sitemap when item 20 lands (via the same
  route helper); out of scope until collections exist.
- **Breadcrumb / FAQ / Menu structured data** — other schema.org types are
  their own additions (Menu pairs naturally with item 4's restaurant-menu
  component).

## Operator guidance

Docs (and a `NEXT-STEPS.md` line for sites with a `business` block): keep the
`business` block consistent with the owner's **Google Business Profile** —
name, address, phone, hours, and category should match, since the two listings
reinforce each other in local search. The block is the single source the site
renders from; the profile is maintained by the operator/owner alongside it.

## Relationships

- **Item 4 (business-category components)** — `hours-location` is the first
  vertical component and the template for the rest (menus, service lists,
  staff): site-declared structured data, component-owned layout, no raw HTML.
- **Item 9 (explicit redirects)** — the `render-*.sh` → `dist/` pattern and the
  origin-relative path validator are reused directly for robots/sitemap.
- **Item 20 (content collections)** — collection index/entry routes join the
  sitemap through the shared route helper when they exist.
- **Item 7 (governed revise)** — sitemap/robots/JSON-LD are deterministic
  outputs, so they appear cleanly in the revise report's blast radius; a future
  `<lastmod>` would draw on the same authored-input history.
- **Item 24 (analytics/reporting)** — discoverability and measurement are the
  two halves of "is this site working"; a `/report` could later surface
  indexing/sitemap status.
- **Metadata/sharing/headers (shipped)** — this extends that design's canonical
  + `@graph` model rather than introducing a parallel one.
