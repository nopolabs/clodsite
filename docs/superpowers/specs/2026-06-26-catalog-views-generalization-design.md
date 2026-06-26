# Product-Level Catalog Views Design

**Date:** 2026-06-26
**Status:** Proposed
**Roadmap entry:** Product-level catalog views — decouple views from color (pending item 19)

---

## Summary

The `catalog` component models per-color product imagery with a "views"
concept, but "views" is not a general multi-image model — it is a hardcoded
binary **front/back** toggle, wired into four layers:

1. **Normalized data shape** — `resolve-catalog.mjs` emits
   `images.by_color[color] = { front, back? }`, and defines
   `images.has_views` as *"some color carries a `back`"*. The feature only
   exists as "is there a second image."
2. **Template chrome** — `component.njk` renders exactly two literal buttons
   labeled `Front` / `Back` with `data-view="front"` / `data-view="back"`.
3. **Swatch attributes** — each swatch carries two fixed slots,
   `data-view-front` / `data-view-back`.
4. **Client JS** — `viewImage()` hardcodes the front→back fallback chain and
   the `selectedView = 'front'` default.

This fit the launch t-shirt use case (the hmc-next-gen "HMC Crow Front and
Back" tees) but does not generalize: a product may have a side view, a detail
shot, a flat-lay, or any ordered set of images. There is no "view" abstraction
to extend — there are two named slots pretending to be a set.

The deeper problem is not just "front/back is binary" — it is that **views are
trapped under `by_color`**. Multi-view imagery is currently expressed *only* as
`by_color[color].{front, back}`, so a product must have a color option to have
more than one image. A seed packet with `Packet` / `Plant` / `Fruit` shots, a
poster with `Front` / `Detail` / `In room`, a book with `Cover` / `Spine` /
`Back` — none have a color dimension, and `gallery` is a different UI contract
(a strip of thumbnails, not a labeled view toggle). Generalizing `front/back`
into a `views` list but leaving it under `by_color` would just trade one
accidental shape for another.

The fix separates the two dimensions that the current code conflates:

- **`views`** = the ordered media choices the customer can inspect (a product
  property, present with or without options).
- **`options`** = purchasable variation dimensions (color, size) — unchanged.
- **option-value image overrides** = an optional mapping from a selected option
  value to an alternate view set, for products (like the HMC tees) where the
  imagery genuinely changes per color.

Concretely: a product-level `images.views` list is the base contract, and an
optional `images.by_option` layer overrides it for specific option values. A
product with no color (or no options at all) still gets a full labeled view
toggle. `by_color` disappears entirely.

Clodsite is pre-1.0 and we are its only customers, so this is a **clean
cutover** with no backward-compatibility layer: the `by_color.{front, back}`
shape is removed outright and the one affected site in `nopolabs/clodsite-sites`
(hmc-next-gen) is migrated in the same change. No dual-read normalizer, no
deprecation window.

## Blast radius (why this is contained)

- **Commerce / cart / fulfillment is untouched.** Views are display-only; the
  component comment already states variants and fulfillment refs never reach
  the page. The cart keys off option selections, not images.
- **The Printful sync path never emits view data.** `sync.mjs` produces only
  `main` + `gallery` (one front mockup per color; it names files `-front` but
  mirrors a single preview). The `by_color` front/back data in hmc-next-gen was
  **hand-added on top of the sync** (the `deploy: hmc-next-gen — front/back
  product mockups` commit), so the shape is populated only by hand-authored
  edits. No provider-sync code needs to change for the data contract (though
  sync *could* later grow real placement mockups that map onto `images.views`
  directly).
- **Exactly one site migrates: hmc-next-gen.** A survey of every catalog in
  `nopolabs/clodsite-sites` (2026-06-26) found `by_color` data in only
  `hmc-next-gen/commerce/catalog.json` — three "...HMC Crow Front and Back"
  tee products, each with 7–10 colors, every color carrying both `front` and
  `back`. The other catalogs use plain `main`(+`gallery`): anchovy
  (`treat-for-anchovy`), clodsite-demo (`retired-cap`, `build-plan-poster`),
  bbpp (`printed-certificate`, certificate commerce). hmc-next-gen is the only
  product that needs the `by_option` override layer; everything else is served
  by product-level `images.views` (or stays single-image). Migrating
  hmc-next-gen's catalog JSON is part of this work, not a follow-up. No
  compatibility shim is retained.

## Contract (authored catalog source)

Two levels. **`images.views`** is the product-level ordered media set — present
whether or not the product has options. **`images.by_option`** is an optional
override layer keyed by option name then option value; a selected value with an
entry replaces the active view set. Each view is `{ label, image }`; `label` is
the button text, `image` is an asset reference resolved as today (`assetUrl`).

A product with no color dimension — the common case the old shape couldn't
express:

```yaml
# Seed packet: three labeled views, no options at all.
images:
  views:
    - { label: Packet, image: products/tomato/packet.png }   # default (index 0)
    - { label: Plant,  image: products/tomato/plant.png }
    - { label: Fruit,  image: products/tomato/fruit.png }
```

A product whose imagery changes per color — the HMC case — adds `by_option`:

```yaml
images:
  views:                                    # shown for the default selection
    - { label: Front, image: products/crow-tee/white-front.png }
    - { label: Back,  image: products/crow-tee/white-back.png }
  by_option:
    Color:                                  # an option NAME from product.options
      Black:                                # an option VALUE
        views:
          - { label: Front, image: products/crow-tee/black-front.png }
          - { label: Back,  image: products/crow-tee/black-back.png }
      White:
        views:
          - { label: Front, image: products/crow-tee/white-front.png }
          - { label: Back,  image: products/crow-tee/white-back.png }
```

Rules:

- `images.views` is an optional, non-empty ordered list; entry order is display
  order; index 0 is the default shown. A single-image product may omit `views`
  and keep just `main` (no toggle), exactly as today.
- Each view: `label` required and non-empty, `image` required.
- `images.by_option` is optional, and when present requires a non-empty
  product-level `images.views` base (it is an override layer, not a standalone
  source). Keys are option **names** that must match a declared
  `product.options[].name`; sub-keys are option **values** that must match that
  option's declared values. Each entry is a `{ views: [...] }` with the same
  per-view rules.
- An option-value override **replaces** the active view set for that selection
  (it is not merged view-by-view). Override view lists need not match the
  product-level list in length or labels.
- `main` stays the product's canonical thumbnail (catalog card default, cart
  line image, no-media detection). When `views` is present, the initially shown
  image is `views[0].image`; authors keep `main` consistent with the default
  view. `gallery` is unchanged.

The image dimension is orthogonal to color: `by_option` can key off *any*
option (e.g. a `Material` or `Finish` option), and a product can have a color
option with no image override at all. Nothing in the contract requires color.

### No compatibility layer

`resolve-catalog.mjs` reads exactly this shape. The `by_color` key and the
`{front, back}` view shape are removed — a catalog still using either is a
validation error, not a silently-normalized legacy input. `images.has_views`
becomes "the effective view set for some reachable selection has length > 1."
The one affected catalog (hmc-next-gen) is rewritten as part of this change
(see Migration).

## Rendering

The active view set is a **product property derived from the current option
selection**, not something a swatch owns. The renderer computes it as: start
from `images.views`; then for each currently selected option value that has an
`images.by_option[name][value]` entry, replace the set with that override
(applied in option declaration order, so a later option wins if two override).
This naturally serves products with no swatches, no options, or non-color image
dimensions — the swatch is just one input to the selection, not the home of the
view data.

`component.njk`:

- Emit the product-level views and the override map as JSON data attributes on
  the product card (not on swatches):
  `data-views='[{"label":"Front","image":"…"},…]'` and, when present,
  `data-view-overrides='{"Color":{"Black":[…],"White":[…]}}'`. Each is produced
  with `JSON.stringify` and then HTML-attribute-escaped, so arbitrary author
  `label` text (quotes, apostrophes, ampersands) survives intact and cannot
  break the attribute boundary or inject markup. One card-level source of truth;
  swatches stay pure selection inputs and lose their `data-view-*` attributes.
- The `.c-catalog__view-toggle` container is rendered whenever the product's
  `has_views` is true — i.e. when *any* reachable selection yields more than one
  view — **not** merely when the initial set does. This guarantees a stable node
  for the JS to populate even if the initial selection has 0–1 views but a later
  color does. The container starts hidden (and empty, or filled from the initial
  set) and the JS shows/hides it per selection. A product where no reachable
  selection has >1 view renders no container at all.
- The button row is populated from the *initial* effective set (product-level
  `views`, or the override for the initially-selected values); the JS rebuilds
  it on selection change.

Client JS, per card:

- Maintain the current option selection (already tracked for the cart) and a
  `selectedViewIndex` (default `0`).
- `effectiveViews()` computes the active set from `data-views` +
  `data-view-overrides` and the current selection (both parsed once and cached).
- On any option change (swatch click *or* dropdown change), recompute
  `effectiveViews()`, rebuild the button row, show the toggle container when the
  set has >1 view and hide it otherwise, clamp `selectedViewIndex` into range
  (falling back to `0` when the new set is shorter — preserving today's "view
  unavailable for this selection → show the default" behavior), and update the
  main image to `effectiveViews()[selectedViewIndex].image`.
- A view button click sets `selectedViewIndex` and swaps the main image within
  the current set.

No new component and no new CSS class is required — the existing
`c-catalog__view-toggle` / `c-catalog__view-button` markup is reused, generated
N times from the effective set instead of two hardcoded buttons.

## Validation

Catalog JSON validation (wherever the `by_color` shape is currently asserted):

- `images.views` optional; when present, a non-empty list of
  `{ label: non-empty string, image: non-empty string }`.
- `images.by_option` optional object; each key must match a declared
  `product.options[].name`, each sub-key must match one of that option's
  declared values, and each entry is `{ views: [...] }` with the same per-view
  rules. Unknown option names or values are rejected (catches typos and stale
  overrides).
- `images.by_option` requires a non-empty product-level `images.views` base:
  overrides without a base set are rejected. The base is the default render and
  the fallback for any selection without a matching override, so a catalog that
  defines only overrides has undefined initial/no-match behavior — reject it at
  build time rather than render something muddy.
- The `by_color` key and the `{front, back}` view shape are rejected outright,
  so a stale catalog fails loudly rather than building with the old behavior.

## Testing

- Unit-test the `resolve-catalog` reader: product-level `views` passthrough with
  `assetUrl` applied to each image; `by_option` override resolution; `has_views`
  true only when some reachable selection yields >1 view; a single-image product
  (`main` only, no `views`) renders no toggle.
- `run-tests.sh`:
  - Build a catalog with a **no-option** product carrying a 3-entry
    `images.views`; assert the card renders three view buttons in order and a
    `data-views` attribute, with no swatches.
  - Build a catalog with a color product using `by_option`; assert selecting a
    color swaps the effective view set (a `data-view-overrides` attribute is
    present and the default buttons come from product-level `views`).
  - **Data-attribute safety:** build a catalog whose view `label`s contain
    quotes, apostrophes, and ampersands (e.g. `Detail "close-up"`,
    `Men's & Women's`). Assert the rendered card's `data-views` /
    `data-view-overrides` attributes are produced via `JSON.stringify` plus HTML
    attribute escaping, and that the values round-trip — i.e. parsing
    `dataset.views` back yields the original labels intact, with no broken
    attribute boundaries or HTML injection.
- Negative: empty `views`, a view missing `label`/`image`, a `by_option` key
  naming an unknown option or value, `by_option` present without a product-level
  `images.views` base, and the legacy `by_color`/`{front, back}` shape are all
  rejected by validation.

## Migration

Part of this change, not a follow-up. One catalog is affected:
`hmc-next-gen/commerce/catalog.json` in `nopolabs/clodsite-sites`. For each of
its three "...HMC Crow Front and Back" tees, transform the
`images.by_color[color] = {front, back}` map into:

- `images.views` = the default color's two views, e.g.
  `[{label: 'Front', image: <white-front>}, {label: 'Back', image: <white-back>}]`
  (use whichever color the card shows first, matching today's initial render),
  and
- `images.by_option.Color.<color>.views =
  [{label: 'Front', image: <front>}, {label: 'Back', image: <back>}]` for every
  color (a mechanical per-color transform; every color has both today).

`main` and `gallery` are untouched, as are the mirrored assets and all
non-image fields. Rebuild and confirm the rendered cards are unchanged: same
swatches, two view buttons (Front/Back) per color, same images and default.
Because there is no compatibility shim, the engine change and the catalog
migration land together — a stale catalog would otherwise fail validation.

## Follow-ups

Promote these to ROADMAP items when this spec is implemented.

- **hmc-next-gen back views are hand-maintained and a re-sync will clobber
  them.** The Printful sync (`sync.mjs`) only writes `main` + `gallery`;
  hmc-next-gen's `by_color` front/back was hand-added afterward (the `deploy:
  hmc-next-gen — front/back product mockups` commit). Re-running the Printful
  sync on that site today would overwrite the catalog and silently drop every
  back view — a latent data-loss bug independent of this generalization. After
  this change it gets *worse*: a re-sync would emit the old `main`/`gallery`
  shape with no `views`, so the hand-curated multi-view data is lost with no
  warning. Decide a durable fix: either (a) teach the sync to fetch and emit
  real placement mockups as `views` (the next follow-up), or (b) make the sync
  preserve/merge existing hand-authored `images.views` / `images.by_option`
  data instead of replacing the whole catalog. Until then, do not re-sync
  hmc-next-gen without re-applying the multi-view data.
- **Optional:** teach the Printful sync to emit multiple placement mockups
  (front/back/sleeve) as `views` when the provider exposes them, replacing the
  current single-front-per-color behavior. This subsumes fix (a) above.
