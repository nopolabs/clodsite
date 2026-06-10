# Commerce (v1) — Design

**Date:** 2026-06-10
**Status:** Approved, ready for implementation plan
**Related:** Component Catalog v1 spec (deferred "ecommerce" — this is that work).
Dogfood target: hmc-cycling.org.

---

## Background

Ecommerce is the next clodsite capability. The dogfood site is
hmc-cycling.org — a working Eleventy + Worker store selling a small Printful
print-on-demand catalog via Stripe Checkout. The port is functionality-driven:
clodsite must **provide a way to sell a small catalog of products**. It does
not need to match hmc's current look and feel.

Selling has four moving parts, each addressed in this design:

1. Catalog display
2. Shopping cart
3. Checkout (Stripe)
4. Fulfillment (Printful for hmc, behind an abstraction that admits other
   fulfillment paths)

What hmc proves works at small scale: two-dimension variants (color × size),
flat per-product pricing, localStorage cart with build-time stale-item
purging, Stripe Checkout for payment + address collection, a webhook that
creates the fulfillment order, KV for webhook idempotency, and **size guides**
— a feature actual customers asked for, which is therefore a v1 requirement,
not a nice-to-have.

Clodsite precedents this design builds on:

- **`resend-form`** — components that ship a Pages Function
  (`function.template.js`), need secrets pushed at deploy, and provision cloud
  resources during deployment (Turnstile).
- **`theme_selector`** — site-level opt-in features in `build-plan.yaml` that
  change the rendered chrome, not just one page.
- **Builds are offline** — all network work happens at sync or deploy time,
  never at build time.

---

## Design

### 1. Data model: three tiers

Commerce introduces data that is neither human-curated nor build-generated:
provider-synced catalog data (variant IDs, mockup images, size charts). The
design keeps the inference boundary intact by giving it its own tier:

| Tier | File | Written by | Contains |
|---|---|---|---|
| Curated | `build-plan.yaml` | human/LLM | which products, display order, prices, provider choice |
| Synced | `$SITE/commerce/catalog.json` | `commerce-sync.sh` | normalized products: variants, fulfillment refs, size guides |
| Mirrored | `$SITE/commerce/assets/` | `commerce-sync.sh` | product images and size-guide diagrams, downloaded from the provider |
| Built | `$SITE/dist/` | `/build` | plan ⋈ catalog, joined deterministically offline |

`catalog.json` and `commerce/assets/` are **committed** to the sites repo.
Builds are reproducible from a checkout, product changes show up as reviewable
diffs, and the site never hotlinks provider CDNs (Printful image URLs churn).

### 2. `commerce:` block (site-level)

```yaml
commerce:
  enabled: true
  provider: printful        # selects the fulfillment provider module
  currency: usd
  checkout: stripe          # the only v1 value
  preview: true             # optional: cart works, checkout button disabled
  shipping:
    flat_rate_minor: 500    # integer minor units ($5.00); passed to Stripe Checkout
```

Like `theme_selector`, this is plan-level configuration that affects the
layout chrome (cart badge + drawer) and the deploy pipeline (secrets,
provisioning). When `commerce:` is absent, nothing commerce-related renders or
deploys — zero cost to non-store sites.

Three activation states, each a shippable milestone:

| State | Plan | Renders |
|---|---|---|
| Lookbook | no `checkout:` (or no `commerce:` at all) | products only — no cart, no buy buttons |
| Preview | `checkout: stripe` + `preview: true` | full cart chrome; checkout button disabled with "Coming soon" (hmc's `preview` flag, promoted into the plan) |
| Live | `checkout: stripe` | everything |

Cart chrome is injected whenever `checkout:` is present, independent of
`preview` — preview only disables the final button.

### 3. `catalog` component (page-level)

A standard catalog-anatomy component (`component.njk`, `component.css`,
`schema.json`):

```yaml
pages:
  - id: shop
    components:
      - type: hero
        ...
      - type: catalog
        products: [hmc-crow-tee, hmc-logo-tee]   # optional filter; default: all active
```

Renders per product: main image, front/back thumbnails, name, price,
description, variant pickers, size-guide trigger, Add to Cart (when checkout
is enabled). All styling via the 15-variable theme contract — any theme works.

**Variant UI is capped at two dimensions** in v1. Dimension 1 renders as
swatches when its values carry hex colors, otherwise as a dropdown; dimension
2 is a dropdown. The data model (ordered option dimensions, §6) is more
general than the UI; generalizing the UI is deferred.

### 4. Size guides

Customer-requested on hmc; v1 requirement, shipped with the display-only
catalog component (Phase 2). Normalized shape — N labeled tables instead of
Printful's two hardcoded ones:

```yaml
size_guide:
  unit: inches
  tables:
    - label: "Product measurements"
      note: "May vary by up to 2\" (5 cm)."
      diagram:
        image: commerce/assets/sg-tee-diagram.png
        steps:
          - { label: "A Length", text: "Place the end of the tape beside the collar..." }
          - { label: "B Width",  text: "Place the end of the tape at the seam..." }
      rows:
        - { label: "Length", values: { S: "25.5", M: "26", L: "27", XL: "28", 2XL: "28.5" } }
    - label: "Measure yourself"
      rows: [ ... ]
```

The component renders this as hmc does today: modal with one tab per table,
diagram + step descriptions, measurements table, variance note, values in the
stored unit (no in/cm toggle in v1).

Two rules fall out of normalization:

- **Providers normalize their own HTML at sync time.** Printful ships
  `<h6>`/`<p>` blobs with editor artifacts; the Printful sync module parses
  them into the structured `steps` shape. The component never renders raw
  provider HTML — the constrained-communication principle applied to the sync
  boundary.
- **Diagram images are mirrored** into `commerce/assets/` at sync time, like
  all provider images.

The shape is deliberately hand-authorable: a manual-provider merchant (or the
LLM, from a pasted chart) writes one table with a few rows. `schema.json`
validates hand-written and synced guides identically.

### 5. Shopping cart

Cart chrome (header badge, slide-out drawer, ~150 lines of client JS) is
**site-level layout injection**, not a component — it must appear on every
page. `render-templates.sh` injects it into the base layout when
`commerce.checkout` is set, the same way hmc's `layout.liquid` carries it.

Mechanics port from hmc unchanged:

- State in `localStorage`; item identity is the (slug, option-values) tuple.
- A build-time catalog set (every valid `slug:opt1:opt2` string) is embedded
  in the layout; on page load, cart items not in the set are silently purged.
  This prevents stale carts from breaking checkout after product changes.
- No server-side cart. The checkout payload is
  `{ items: [{ slug, optionValues, qty }] }` — **nothing else**. Prices and
  fulfillment refs never come from the client (§6); cached display prices in
  localStorage are cosmetic.

### 6. Checkout: Pages Function, Stripe-only

Two routes, rendered by `render-functions.sh` from function templates (the
`resend-form` pattern):

- `POST /api/checkout` — receives `{ items: [{ slug, optionValues, qty }] }`
  and resolves everything else **server-side** against catalog data embedded
  in the function at render time: each (slug, optionValues) → canonical
  variant, `fulfillment_ref`, and `price_minor`. Unknown combinations → 400.
  Creates the Stripe Checkout session (flat shipping, address collection on)
  with the resolved line items in session metadata, returns `{ url }`. The
  client can name products and quantities — never prices or provider
  identifiers.
- `POST /api/webhook` — verifies the Stripe signature, then runs an order
  **state machine** in KV keyed by the Stripe session ID:

  ```
  ORDERS[session_id] ∈ { pending, completed, failed }

  completed        → 200, done (true duplicate)
  absent | failed  → write pending, call createOrder
  pending          → a prior attempt died mid-flight; call createOrder again
  createOrder ok   → write completed, 200
  createOrder err  → write failed, return 5xx so Stripe retries
  ```

  A paid order is marked `completed` only after fulfillment succeeds —
  Stripe's retry schedule is the recovery mechanism for transient provider
  failures, never silenced by an eagerly-set flag. Because KV reads are
  eventually consistent, this state machine is best-effort dedup only; the
  **authoritative** duplicate guard is the provider idempotency key (§7):
  `createOrder` always receives the session ID and providers must dedupe on
  it. Orders stuck in `failed` after Stripe exhausts retries surface in the
  Stripe dashboard as webhook failures — v1's operational backstop.

Deploy pipeline additions, all following the Turnstile provision-or-reuse
pattern:

| Step | Pattern precedent |
|---|---|
| `provision-kv.sh` — ensure `ORDERS` KV namespace, bind to the Pages project | `provision-turnstile.sh` |
| `provision-stripe-webhook.sh` — create/reuse the webhook endpoint via Stripe API, capture the signing secret | `provision-turnstile.sh` |
| Push `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, provider secrets (e.g. `PRINTFUL_API_KEY`) | `RESEND_API_KEY` push in `deploy.sh` |

**Payment is not abstracted in v1.** Stripe only. The seam where a payment
abstraction would go is the checkout function; it stays visible and
recoverable. One abstraction at a time — fulfillment is the one this spec
commits to.

### 7. Fulfillment provider abstraction

A provider touches the system at exactly two moments, which defines the
interface:

```js
// sync time (local machine) — scripts/lib/commerce/providers/<name>/sync.mjs
export async function syncCatalog(config, env)
// → writes normalized catalog.json + mirrors images to commerce/assets/

// order time (deployed Pages Function) — scripts/lib/commerce/providers/<name>/order.mjs
export async function createOrder(order, env)
// order = { idempotency_key,            // Stripe session ID — providers MUST dedupe on it
//           lineItems: [{ fulfillment_ref, qty }], shipping, email }
// → { provider_order_id }
```

`idempotency_key` is the authoritative duplicate guard (the KV state machine
in §6 is best-effort): Printful sets it as the order `external_id` and treats
an existing order with that ID as success; manual passes it as the Resend
`Idempotency-Key` header.

Everything between those moments — display, cart, Stripe session, signature
verification, idempotency — is provider-agnostic.

Key properties:

- **`fulfillment_ref` is opaque and never leaves the server.** For Printful
  it's the variant ID. Nothing outside the provider's two modules interprets
  it, and it is never client-controlled: the browser sends only
  (slug, optionValues, qty); the checkout function resolves the ref from its
  embedded catalog data and writes it into Stripe session metadata
  server-side; the webhook reads it back from Stripe. The full path —
  catalog.json → checkout function → Stripe → webhook → `createOrder` — is
  server-to-server end to end.
- **A provider is two files** because its halves run in different worlds:
  `sync.mjs` runs locally under Node; `order.mjs` is bundled into the webhook
  function template at render time and runs on Cloudflare. This bundling step
  is the one genuinely new mechanism in the design.
- **Normalized product shape** (the `catalog.json` contract):

```
{ products: [{
    slug, name, description, price_minor, active,
    images: { main, gallery: [...] },          // local commerce/assets/ paths
    options: [{ name: "Color", values: [{ value: "White", hex: "#FFFFFF" }] },
              { name: "Size",  values: [{ value: "M" }] }],
    variants: [{ optionValues: { Color: "White", Size: "M" },
                 fulfillment_ref: "4938291" }],
    size_guide: { ... }                        // §4 shape, optional
} ] }
```

**v1 ships two providers** to prove the abstraction is real:

1. **`printful`** — the dogfood. `sync.mjs` ports `sync-products.js`
   (catalog + size-guide fetch + image mirroring); `order.mjs` ports the
   Printful half of hmc's worker.
2. **`manual`** — the degenerate case and likely the most common small-site
   need ("sell 3 things, fulfill them yourself"). No sync: `catalog.json` is
   hand- or LLM-authored and validated by schema. `createOrder` emails the
   order to the merchant via the existing Resend machinery.

If the interface survives both without leaking provider details, a third
provider (Shopify fulfillment, digital downloads) slots in later.

### 8. Validation

`validate-plan.mjs` grows commerce rules: `commerce.provider` must name a
known provider, `checkout: stripe` is the only accepted value, a `catalog`
component requires `commerce/catalog.json` to exist and validate, plan
product filters must reference catalog slugs, and all money fields
(`price_minor`, `flat_rate_minor`) must be non-negative integers. The catalog
component's `schema.json` validates the normalized product shape including
size guides.

**Money is integer minor currency units everywhere** — plan, catalog,
checkout function, provider interface (`price_minor: 2000` is $20.00 USD).
hmc's three coexisting representations (`20`, `"20.00"`, `2000`) are exactly
the bug class this kills: a decimal string reaching Stripe's
integer-cents API silently sells a $20 shirt for 20 cents. Conversion to
display strings happens once, at template render time, using the currency's
exponent; no other layer formats or parses money.

Provider sync modules are pure `.mjs` with fixture-based `*.test.mjs` beside
them (the established convention — `run-tests.sh` picks the glob up
automatically). Pipeline behavior (lookbook mode, cart injection, function
rendering, provisioning) is covered by the bash suite with stubbed CLIs, the
same way deploy/turnstile are tested today.

### 9. Surface summary

```
components/catalog/                          new component (njk, css, schema, client JS)
scripts/commerce-sync.sh                     [SCRIPT] sync entry point
scripts/lib/commerce/providers/printful/     sync.mjs, order.mjs, *.test.mjs
scripts/lib/commerce/providers/manual/       order.mjs, *.test.mjs
scripts/provision-kv.sh                      new, turnstile pattern
scripts/provision-stripe-webhook.sh          new, turnstile pattern
scripts/render-templates.sh                  cart chrome injection when commerce.checkout set
scripts/render-functions.sh                  checkout/webhook templates + provider order.mjs bundling
scripts/deploy.sh                            commerce secrets + provision calls
scripts/lib/validate-plan.mjs                commerce block + catalog component rules
```

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Flat-rate shipping via Stripe Checkout, configured in the plan | Matches hmc today; live provider rates deferred. No `getShippingRates()` in the v1 provider interface |
| 2 | `catalog.json` + mirrored assets committed to the sites repo | Reproducible offline builds, reviewable product diffs, no provider-CDN hotlinks |
| 3 | Flat per-product pricing (one price across all variants) | hmc's deliberate simplification; per-variant pricing deferred |
| 4 | No inventory/stock tracking | Print-on-demand doesn't need it; manual merchants manage their own |
| 5 | Size guides ship in Phase 2 with the display component | Customer-requested on hmc; display-only feature with no checkout dependency |
| 6 | Stripe-only payments, no payment abstraction | One abstraction at a time; the seam stays visible |
| 7 | Variant UI capped at two dimensions | Data model is N-dimensional; UI generality deferred until a site needs it |
| 8 | All money is integer minor currency units (`price_minor`) | One representation everywhere; kills the decimal-string-to-Stripe unit bug (§8) |
| 9 | Client sends only (slug, optionValues, qty); server resolves prices and refs | Prices and provider identifiers are never client-controlled (§6) |
| 10 | Order completion recorded only after fulfillment succeeds; provider idempotency key is authoritative | Eagerly-set flags + async fulfillment permanently lose paid orders on provider failure — a live hmc bug this design fixes (§6, §7) |

---

## Phasing

Each phase is an independently PR-able block; phases 2–4 need no Printful
account (the `manual` provider carries the pipeline end-to-end first).

1. **Spec** — this document.
2. **`catalog` component, display-only** — lookbook mode, hand-written
   `catalog.json`, size guides included. No `commerce:` block needed.
3. **`commerce:` block + cart chrome** — localStorage cart, purge set,
   deployed with `preview: true` (checkout button disabled; §2 activation
   table) since the checkout function doesn't exist until Phase 4.
4. **Checkout + provisioning** — Stripe end-to-end with the `manual`
   provider; `provision-kv.sh`, `provision-stripe-webhook.sh`, secret pushes.
5. **`printful` provider + `commerce-sync.sh`** — sync, normalization, image
   mirroring; the abstraction's second data point.
6. **Dogfood cutover** — hmc `build-plan.yaml`, content port, soak behind a
   preview flag, disconnect the Pages git-integration build, repoint
   hmc-cycling.org via `/domain`, update the Stripe webhook endpoint.

Cutover cautions (Phase 6): the Stripe webhook moves from the standalone
Worker URL to a Pages Function path — update the endpoint and re-capture the
signing secret with the preview flag on; hmc loses push-to-deploy (deploys
become `/build` + `/deploy`), an accepted workflow change.

---

## Deferred

- Payment-processor abstraction (Stripe seam noted in §6)
- Per-variant pricing; inventory/stock
- Live provider shipping rates (`getShippingRates()`)
- Variant UI beyond two dimensions; in/cm unit toggle
- Digital goods / non-shipped fulfillment
- Multi-page product detail routes (catalog is single-page in v1, as on hmc)
