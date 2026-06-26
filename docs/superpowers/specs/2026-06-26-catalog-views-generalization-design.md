# Generalized Catalog Product Views Design

**Date:** 2026-06-26
**Status:** Proposed
**Roadmap entry:** Generalize catalog product views (pending item 19)

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

The fix is to make views a genuine **ordered list of `{ label, image }`**,
with the first entry as the default. This is a contained refactor: only
hand-authored catalogs populate `by_color`, so the blast radius is the
normalize step, the component (template + JS), authoring docs, and tests.

Clodsite is pre-1.0 and we are its only customers, so this is a **clean
cutover** with no backward-compatibility layer: the `{front, back}` shape is
removed outright and the existing sites in `nopolabs/clodsite-sites` are
migrated to the new `views` list in the same change. No dual-read normalizer,
no deprecation window.

## Blast radius (why this is contained)

- **Commerce / cart / fulfillment is untouched.** Views are display-only; the
  component comment already states variants and fulfillment refs never reach
  the page. The cart keys off option selections, not images.
- **The Printful sync path never emits `by_color` views.** `sync.mjs` produces
  only `main` + `gallery` (one front mockup per color; it names files `-front`
  but mirrors a single preview). The `by_color` front/back data in hmc-next-gen
  was **hand-added on top of the sync** (the `deploy: hmc-next-gen — front/back
  product mockups` commit), so the shape is populated only by hand-authored
  edits. No provider-sync code needs to change for the data contract (though
  sync *could* later grow real placement mockups that map cleanly onto the new
  list).
- **Exactly one site migrates: hmc-next-gen.** A survey of every catalog in
  `nopolabs/clodsite-sites` (2026-06-26) found `by_color` data in only
  `hmc-next-gen/commerce/catalog.json` — three "...HMC Crow Front and Back"
  tee products, each with 7–10 colors, every color carrying both `front` and
  `back`. The other catalogs use plain `main`(+`gallery`): anchovy
  (`treat-for-anchovy`), clodsite-demo (`retired-cap`, `build-plan-poster`),
  bbpp (`printed-certificate`, certificate commerce). Rewriting hmc-next-gen's
  catalog JSON to the `views` list is part of this work, not a follow-up. No
  compatibility shim is retained.

## Contract (authored catalog source)

Per color, an ordered `views` list. First entry is the default shown; `label`
is the human button text; `image` is an asset reference resolved the same way
as today.

```yaml
images:
  main: products/crow-tee/main.png
  gallery: [...]
  by_color:
    Black:
      views:
        - { label: Front, image: products/crow-tee/black-front.png }   # default
        - { label: Back,  image: products/crow-tee/black-back.png }
        - { label: Detail, image: products/crow-tee/black-detail.png }
    White:
      views:
        - { label: Front, image: products/crow-tee/white-front.png }
```

Rules:

- `views` is a non-empty ordered list; entry order is display order; index 0 is
  the default.
- `label` is required and non-empty; `image` is required.
- A color may carry a single-entry `views` list (one image, no toggle) —
  equivalent to today's "front only."
- Labels need not match across colors (a color could lack a detail shot); the
  toggle for a given swatch reflects only that swatch's own views.

### No compatibility layer

`resolve-catalog.mjs` reads exactly one shape: `by_color[color].views`. The
`{front, back}` keys are removed — a catalog still using them is a validation
error, not a silently-normalized legacy input. `images.has_views` becomes
`views.length > 1` for any color. The one affected catalog (hmc-next-gen) is
rewritten to the `views` list as part of this change (see Migration).

## Rendering

`component.njk`:

- Generate one view button per entry in the active swatch's `views`, labeled by
  `label`, in list order; the toggle group renders only when the active swatch
  has more than one view.
- Replace the two `data-view-front` / `data-view-back` attributes with a single
  `data-views` JSON attribute on each swatch:
  `data-views='[{"label":"Front","image":"…"},…]'` (HTML-attribute-escaped).
  One attribute carries an arbitrary-length ordered set cleanly.
- The default product image and the swatch's first view stay consistent with
  today (index 0 = front-equivalent).

Client JS:

- `selectedView` becomes an **index** (default `0`) rather than the string
  `'front'`.
- On swatch change, rebuild the button row from that swatch's `views`; clamp
  the selected index into range (a swatch with fewer views falls back to 0),
  preserving today's "if the selected view is unavailable for this color, show
  the default" behavior.
- `viewImage(swatch, index)` reads `data-views` (parsed once and cached on the
  element) and returns `views[index].image`, falling back to `views[0]` then
  `data-src`.

No new component, no new CSS class is strictly required — the existing
`c-catalog__view-toggle` / `c-catalog__view-button` markup is reused, just
generated N times instead of twice.

## Validation

Catalog JSON validation (wherever `by_color` shape is currently asserted)
requires the `views` shape: optional `by_color`, each color a
`{ views: [...] }` with a non-empty list of `{ label: non-empty string, image:
non-empty string }`. The legacy `{front, back}` keys are rejected, so a stale
catalog fails loudly rather than building with the old behavior.

## Testing

- Unit-test the `resolve-catalog` reader: `views` passthrough with `assetUrl`
  applied to each image; `has_views` true only when a color has >1 view; a
  single-view color renders no toggle.
- `run-tests.sh`: build a site whose catalog uses a 3-view color and assert the
  rendered card emits three view buttons in order plus a `data-views`
  attribute.
- Negative: empty `views`, a view missing `label` or `image`, and the legacy
  `{front, back}` keys are all rejected by validation.

## Migration

Part of this change, not a follow-up. One catalog is affected:
`hmc-next-gen/commerce/catalog.json` in `nopolabs/clodsite-sites`. Rewrite the
`by_color` blocks on its three "...HMC Crow Front and Back" tees — each color's
`{front, back}` becomes `views: [{label: 'Front', image: <front>}, {label:
'Back', image: <back>}]` (a mechanical transform, every color has both today).
Rebuild the site and confirm the rendered cards are unchanged: same swatches,
two view buttons (Front/Back), same images and default. Because there is no
compatibility shim, the engine change and the catalog migration land together —
a stale `{front, back}` catalog would otherwise fail validation. The mirrored
assets and all other fields are untouched.

## Follow-ups

- Optional: teach the Printful sync to emit multiple placement mockups
  (front/back/sleeve) as `views` when the provider exposes them, replacing the
  current single-front-per-color behavior.
