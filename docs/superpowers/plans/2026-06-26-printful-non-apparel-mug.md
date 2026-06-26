# Printful Non-Apparel Product Support — Implementation Plan

> Execute task by task. Do not create a real Printful order without explicit
> user approval at the relevant gate.

**Goal:** Prove Clodsite can sell a simple non-apparel Printful product by
launching an Anchovy mug test. Keep the slice small: one static Printful product,
one provider, no personalized artwork, no multiple catalogs.

**Related design:**
`docs/superpowers/specs/2026-06-26-printful-non-apparel-mug-design.md`

---

## Current Truth

- Printful sync has been exercised with apparel-shaped products.
- The sync code assumes useful color/size dimensions and emits options whenever
  Printful reports those fields.
- The live Anchovy site currently uses the manual provider for a treat product.
- Clodsite supports one commerce provider and one catalog per site today.

Because of that last point, the first mug test should not try to sell Anchovy's
manual treat and a Printful mug in the same live catalog.

## File Map

| File / Repo | Action | Responsibility |
|---|---|---|
| `scripts/lib/commerce/providers/printful/sync.mjs` | Modify | Collapse singleton Printful dimensions; avoid apparel assumptions for simple products |
| `scripts/lib/commerce/providers/printful/sync.test.mjs` | Modify | Fixture coverage for one-variant mug and non-apparel option shapes |
| `scripts/test/fixtures/*` | Add/modify | Printful fixture for a white glossy mug |
| `scripts/lib/resolve-catalog.test.mjs` or bash suite | Modify if needed | Ensure no-option catalog cards still render/add to cart cleanly |
| `$SITES_DIR/anchovy-mug/` or `$SITES_DIR/anchovy/` | Create/modify | Dogfood site/product after engine support lands |
| `$SITES_DIR/.../commerce/catalog.json` | Generate | Synced Printful mug catalog |
| `$SITES_DIR/.../commerce/assets/` | Generate | Mirrored mug mockups |

`$SITES_DIR` is expected to be `/Users/danrevel/lab/projects/clodsite-sites`.

## Task 1: Printful Mug Discovery

### Implementation

After Dan creates the mug product in Printful, inspect it with the actual
`PRINTFUL_API_KEY` and store id.

Record:

- sync product id,
- sync variant ids,
- reported `color` / `size`,
- preview file types and URLs,
- size endpoint behavior,
- whether one normal order item can be built with `sync_variant_id`.

Do not create an order in this task.

### Gate

Write the discovered product shape into the PR description or an implementation
note before changing sync behavior.

## Task 2: Add Non-Apparel Sync Normalization

### Implementation

Update Printful sync so singleton dimensions do not become useless controls:

- Distinct value count > 1: keep dimension as selectable.
- Singleton `size`: emit `product.size`.
- Singleton `color`: omit as a selectable option for now; single-color metadata
  is deferred unless the discovery step proves it is needed for the mug.
- Variant `optionValues` contain only selectable dimensions.
- If no dimensions are selectable, emit a single variant with
  `optionValues: {}`.
- Preserve existing multi-color/multi-size apparel behavior.

Keep the existing `color_order` behavior for products where `Color` remains a
selectable dimension. If `color_order` filters a product down to one color, that
color may now become a singleton and disappear from the UI.

### Tests

Add fixture tests for:

- one-variant white 11 oz mug -> no options, `size: "11 oz"`, one empty
  `optionValues` variant,
- size-only multi-size product -> `Size` option,
- color-only multi-color product -> `Color` option; swatches when all values
  have known hexes, dropdown fallback when they do not,
- existing shirt fixture remains unchanged.

### Gate

Run:

```bash
node --test scripts/lib/commerce/providers/printful/sync.test.mjs
bash scripts/test/run-tests.sh
```

## Task 3: Prove No-Option Catalog Rendering

### Implementation

Make sure a no-option product renders cleanly in the catalog component:

- no swatches,
- no one-value dropdown,
- visible image/name/price/description/size,
- add-to-cart still sends `{ optionValues: {} }`,
- checkout still resolves the single variant.

This may already work; add regression coverage so it stays true.

### Gate

Run the focused catalog/render tests plus the full suite.

## Task 4: Dogfood With An Anchovy Mug Site

### Implementation

Use one of these paths:

1. Preferred: create `$SITES_DIR/anchovy-mug` as a temporary/staging site using
   `provider: printful` and one mug product.
2. Alternative: temporarily switch `$SITES_DIR/anchovy` from the manual treat
   product to the Printful mug for the product test.

Do not attempt to keep the manual treat and Printful mug together in this slice.

The product should use Anchovy branding/artwork and a friendly product
description. The exact Printful product id comes from Task 1.

### Gate

Run:

```bash
SITES_DIR=/Users/danrevel/lab/projects/clodsite-sites SITE_NAME=<site> bash scripts/commerce-sync.sh
SITES_DIR=/Users/danrevel/lab/projects/clodsite-sites SITE_NAME=<site> bash scripts/validate-plan.sh
```

Then build locally and visually inspect before deploying.

## Task 5: Controlled Checkout Test

### Implementation

Use Stripe test mode first. Remember: Printful fulfillment is live even when
Stripe is test mode, so a completed checkout may create a real Printful order.

Follow the established cancellation protocol:

1. Announce: "This may create a real Printful order."
2. Run one checkout.
3. Capture the Printful order id.
4. Stop and let Dan cancel the order in Printful.
5. Continue only after cancellation is confirmed.

### Gate

Do not run live Stripe checkout until test-mode checkout and Printful
cancellation have succeeded.

## Deferred Tasks

- HMC logo mug.
- Live Anchovy treat + mug in one storefront.
- Multiple named catalogs.
- Mixed manual + Printful provider checkout.
- Singleton color metadata for products where the lone color label matters.
- BBPP personalized mug artwork in Parchment.
- Printful per-order files for personalized products.
