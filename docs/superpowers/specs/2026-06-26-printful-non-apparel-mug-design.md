# Printful Non-Apparel Product Support — Anchovy Mug Design

**Date:** 2026-06-26
**Status:** Validated
**Roadmap entries:** Commerce v1; Named commerce catalogs deferred

---

## Summary

Clodsite's Printful provider has been proven with apparel-shaped products:
shirts with color and size options, swatch colors, size guides, and one preview
image per color. The next useful commerce pressure test is a simple
non-apparel product: a white glossy mug.

The goal is not to build the full future commerce model. The goal is to prove
that Clodsite can sync, render, checkout, and fulfill a static Printful product
whose shape is not a shirt:

- no meaningful color choice,
- at most one display size such as `11 oz`,
- no apparel size guide,
- ordinary Printful fulfillment using `sync_variant_id`,
- one or more product mockup images.

The dogfood product is an **Anchovy mug**. Anchovy is intentionally lower-risk
than HMC: it is playful, small, and a good place to learn whether the catalog UI
still feels good when a product is not apparel.

## Validation Outcome

The static Anchovy mug path was validated live on 2026-06-26 using the separate
`anchovy-mug` site. The successful path was:

```text
catalog card -> Stripe live checkout -> success page ->
Stripe webhook -> Cloudflare Pages Function -> Printful Anchovy store order
```

The validated product shape was a single 11 oz white glossy mug:

- no selectable options;
- catalog `size: "11 oz"`;
- one variant with `optionValues: {}`;
- `fulfillment_ref` equal to the Printful `sync_variant_id`;
- one mirrored Printful preview image.

The live smoke test created a Printful order, which was then cancelled/refunded
in the Printful UI.

This validates the static mug path only: synced catalog data, no-option catalog
rendering, Stripe checkout, webhook handling, and ordinary Printful fulfillment.
It does not validate personalized mug artwork, per-order Printful files, or
selling manual and Printful products from the same site.

One operational issue surfaced before the successful run: deployment pushed the
wrong `PRINTFUL_API_KEY` Pages secret when a site-specific key was supplied as a
shell override. The webhook reached Printful, but the default/HMC key could not
see the Anchovy mug sync variant and failed with:

```text
HTTP 400: Item 0: Sync variant not found
```

That is now part of the proven operational contract: site-specific provider keys
must survive deploy-time `.env` loading. The immediate fix was merged in PR #72;
longer-term site-scoped secret design remains separate work.

## Important Constraint: Anchovy Currently Uses Manual Fulfillment

The live Anchovy site currently sells a manual "treat" product. Its commerce
block uses:

```yaml
commerce:
  provider: manual
```

Clodsite currently supports one commerce provider and one catalog per site.
Adding a Printful mug beside the manual treat product would require the
future **named/multiple catalogs** work, or at least mixed-provider checkout.
That is deliberately out of scope for this slice.

Therefore the first implementation should use one of these low-risk paths:

1. **Preferred:** create a staging site such as `anchovy-mug` whose only product
   is the Printful mug.
2. **Acceptable for a short product test:** temporarily replace Anchovy's treat
   catalog with the Printful mug and switch the site to `provider: printful`.

The live "treat + mug together" outcome is deferred until the multiple-catalog
and mixed-provider questions are designed.

## Non-Goals

- Multiple named catalogs.
- Mixed manual + Printful fulfillment in one checkout.
- HMC mug launch.
- BBPP personalized mugs.
- Printful per-order artwork files.
- Parchment mug-specific render targets.

Those are real follow-on needs, but they should not be coupled to proving a
static Printful mug.

## Printful Discovery

Before changing provider logic, inspect the real Printful mug sync product via
the API and record:

- sync product id,
- sync variant ids,
- `color` and `size` values, if any,
- `files[]` types and preview URLs,
- whether `/products/{catalog_product_id}/sizes` returns no data, `404`, or a
  non-apparel size table,
- whether a normal order can be created with only `sync_variant_id` and
  quantity.

This discovery should be done against the actual store/product Dan creates in
Printful, because Printful's dashboard product shape is the source of truth.

## Sync Contract

The current sync logic groups variants by color and size and emits options for
any dimension that appears. For non-apparel products, singleton dimensions
should not force awkward one-value controls.

Normalize Printful dimensions this way:

- Build the full variant set from Printful as today.
- A dimension is **selectable** only when it has more than one distinct value.
- A singleton `size` dimension may become product metadata:

  ```json
  "size": "11 oz"
  ```

- A singleton `color` dimension is not rendered as an option in this slice.
  This is fine for the first white mug, but it intentionally defers
  customer-facing single-color metadata for products where the lone color label
  matters.
- `variants[].optionValues` include only selectable dimensions. A one-variant
  mug therefore has:

  ```json
  "options": [],
  "variants": [
    { "optionValues": {}, "fulfillment_ref": "<sync_variant_id>" }
  ]
  ```

- If a product has multiple sizes and no colors, emit a `Size` option.
- If a product has multiple colors and one size, emit a `Color` option and put
  the singleton size in `product.size`.
- If a product has multiple colors and multiple sizes, keep the existing
  apparel behavior.

This preserves checkout's existing `(slug, optionValues) -> fulfillment_ref`
resolution while avoiding useless one-item dropdowns.

## Images

For this slice, continue to mirror Printful preview images into
`commerce/assets/` and emit:

```json
"images": {
  "main": "commerce/assets/anchovy-mug-main.png",
  "gallery": [...]
}
```

Product-level catalog views are available from
`2026-06-26-catalog-views-generalization-design.md`. A mug with multiple useful
mockups may use:

```json
"images": {
  "main": "commerce/assets/anchovy-mug-main.png",
  "views": [
    { "label": "Front", "image": "commerce/assets/anchovy-mug-front.png" },
    { "label": "Side", "image": "commerce/assets/anchovy-mug-side.png" }
  ]
}
```

That is optional. The mug support must not depend on multiple labeled views. A
mug with a single useful mockup should keep `main` (and optional `gallery`) and
omit `views`; do not emit a one-entry `views` list just to exercise the feature.

## Size Guides

Non-apparel products should not get an apparel size-guide dialog by accident.
The sync should only include `size_guide` when the Printful size data produces
meaningful non-empty tables. A `404` from the size endpoint remains normal and
non-fatal.

## Order Fulfillment

Static mugs use the existing Printful order contract:

```json
{
  "sync_variant_id": 123456,
  "quantity": 1
}
```

No per-order files are needed. This is the dividing line between the Anchovy
mug and future BBPP personalized mugs.

## Validation And Tests

Add fixture-driven tests for:

- a one-variant mug with singleton size/color collapsing to no options and
  `size: "11 oz"`,
- a size-only product with multiple sizes keeping a `Size` option,
- a color-only product with multiple colors keeping `Color` as a selectable
  dimension; assert swatches only when every value has a known hex, otherwise
  assert the existing dropdown fallback,
- generated catalog passes `validateCatalog`,
- the rendered catalog card for a no-option mug has no swatches/selects and
  can still add to cart,
- Printful order payload remains the existing `sync_variant_id` + quantity
  shape.

## Follow-Ups

- Add the HMC logo mug once non-apparel Printful sync is proven.
- Design named catalogs / mixed providers before selling Anchovy treats and
  Printful mugs in the same live site.
- Decide whether singleton color should become product metadata for products
  where the lone color label is meaningful.
- Design Parchment mug artwork and Printful per-order files before BBPP
  personalized mugs.
