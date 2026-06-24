# HMC Commerce Port — Implementation Plan

> Execute task by task. Do not perform any live checkout, Printful order
> creation, domain cutover, or destructive HMC cleanup without explicit user
> approval at that task gate.

**Goal:** Port hmc-cycling.org to Clodsite commerce using the existing
`catalog`, cart, Stripe Checkout, webhook state machine, and Printful provider.
The port should run first as `next-gen.hmc-cycling.org`, prove the real
Printful integration under controlled conditions, then cut over the production
domain with a rollback window.

**Architecture:** Clodsite already has most Commerce v1 infrastructure:
catalog rendering, cart chrome, Stripe checkout/webhook Pages Functions,
ORDERS KV provisioning, Stripe webhook provisioning, Printful sync/order
providers, and deploy-time secret installation. The remaining work is a
validation ladder: close HMC-specific product gaps, validate the Printful
provider against the real HMC store, protect the legacy HMC webhook from
next-gen Stripe events, build/deploy the Clodsite site, run controlled
test/live purchases, and only then cut over the domain.

**Related design:** `docs/superpowers/specs/2026-06-10-commerce-design.md`

---

## Current Truth

The original commerce design is partly stale. Phases 1-5 in the design have
shipped, and later commerce work has also landed:

- `catalog` component and cart chrome exist.
- Stripe checkout and webhook templates exist.
- Printful `sync.mjs` and `order.mjs` exist.
- Manual fulfillment provider exists.
- KV and Stripe webhook provisioning scripts exist.
- `personalized-product` and `certificate-award` exist.
- `clodsite-demo`, `anchovy`, and `bbpp` already exercise commerce in the
  sites repo.

However, the Printful provider has only been adapted from inspection of the
existing HMC implementation and fixture tests. It has not yet been proven
against Printful's real API. Treat Printful validation as part of the HMC port,
not as already complete infrastructure.

---

## Manual Printful Cancellation Gates

Stripe test mode does **not** mean Printful test mode. Any successful Printful
order creation may create a real Printful order that Dan must cancel manually
unless the test is intentionally left active.

Every task that can create a Printful order must follow this protocol:

1. Announce before running the step: "This may create a real Printful order."
2. Use a clearly identifiable idempotency/session marker, e.g.
   `clodsite-hmc-test-YYYYMMDD-HHMM`.
3. Run exactly one order-creation attempt at a time.
4. Capture the Printful order ID from logs, provider result, Stripe webhook
   state, or KV diagnostics.
5. Stop and report the Printful order ID.
6. Wait for Dan to confirm the order has been cancelled or intentionally left
   active before continuing.

Manual gates in this plan:

- Gate A: direct Printful provider order smoke test.
- Gate B: Stripe test checkout fulfillment.
- Gate C: webhook retry/idempotency test.
- Gate D: controlled live purchase.

---

## File Map

| File / Repo | Action | Responsibility |
|---|---|---|
| `ROADMAP.md` | Modify | Mark Commerce v1 engine as mostly shipped; narrow item #1 to HMC port/cutover if appropriate |
| `docs/superpowers/specs/2026-06-10-commerce-design.md` | Modify | Refresh phase status and record Printful validation/cancellation gates |
| `scripts/lib/validate-plan.mjs` | Modify if needed | Validate any HMC-required shipping extension |
| `scripts/lib/commerce/checkout.template.js` | Modify if needed | Support HMC's item-count shipping policy |
| `scripts/lib/commerce/checkout.test.mjs` | Modify if needed | Cover item-count shipping session params |
| `scripts/test/run-tests.sh` | Modify if needed | Cover build/deploy behavior for the shipping extension |
| `/Users/danrevel/lab/projects/hmc/worker/src/index.js` | Modify | Legacy webhook ignores sessions stamped for the Clodsite next-gen instance |
| `/Users/danrevel/lab/projects/hmc/worker/test/index.spec.js` | Modify | Regression tests for legacy webhook ownership guard |
| `$SITES_DIR/hmc-next-gen/build-plan.yaml` | Create | Clodsite plan for next-gen HMC |
| `$SITES_DIR/hmc-next-gen/commerce/catalog.json` | Generate | Normalized Printful catalog from real HMC store |
| `$SITES_DIR/hmc-next-gen/commerce/assets/` | Generate | Mirrored Printful product and size-guide assets |
| `$SITES_DIR/hmc-next-gen/*` | Create/modify | HMC copy, assets, metadata, and deploy state |

`$SITES_DIR` is expected to be `/Users/danrevel/lab/projects/clodsite-sites`.

---

## Task 1: Refresh Commerce Roadmap And Design Status

### Implementation

Update the design and roadmap to match current reality:

- Commerce engine phases 1-5 have shipped.
- `bbpp`/personalized commerce has landed.
- Remaining item #1 work is the HMC Printful validation, port, soak, and cutover.
- Printful provider is not production-proven until tested against the real API.
- Printful order-creating tests require manual cancellation gates.
- HMC has an item-count shipping policy that the current Clodsite flat-rate
  model does not represent.

### Gate

Run:

```bash
git diff --check
```

---

## Task 2: Implement Backward-Compatible Item-Count Shipping

HMC currently computes shipping as:

```json
{
  "base_rate": 475,
  "per_additional_item": 220,
  "display_name": "Standard Shipping",
  "delivery_estimate": {
    "minimum": { "unit": "business_day", "value": 5 },
    "maximum": { "unit": "business_day", "value": 10 }
  }
}
```

Clodsite currently supports a single `flat_rate_minor`. Add a
backward-compatible item-count shipping shape and keep `flat_rate_minor`
working for existing sites:

```yaml
shipping:
  base_rate_minor: 475
  per_additional_item_minor: 220
  display_name: Standard Shipping
  countries: [US]
  delivery_estimate:
    minimum: { unit: business_day, value: 5 }
    maximum: { unit: business_day, value: 10 }
```

Exactly one shipping price shape is allowed:

- `flat_rate_minor`
- `base_rate_minor` + `per_additional_item_minor`

### Tests First

Add tests proving:

- `flat_rate_minor` remains valid and backward compatible.
- `base_rate_minor` + `per_additional_item_minor` computes Stripe shipping from
  total checkout quantity.
- plans cannot provide both `flat_rate_minor` and item-count shipping fields.
- `base_rate_minor` and `per_additional_item_minor` must appear together.
- money fields must be non-negative integers.
- `display_name` is optional and defaults to `Flat rate shipping`.
- `countries` still validates as uppercase ISO country codes.
- delivery estimate is either omitted or serialized into Stripe's expected
  nested params.

### Implementation

Update validation and checkout rendering. Keep the shipping computation
server-side in `checkout.template.js`; the browser must not supply shipping
amounts.

### Gate

Run:

```bash
node --test scripts/lib/commerce/checkout.test.mjs
bash scripts/test/run-tests.sh
```

---

## Task 3: Build The Next-Gen HMC Plan

### Implementation

Create `$SITES_DIR/hmc-next-gen/build-plan.yaml`.

Plan requirements:

- `slug: hmc-next-gen`
- `custom_domain: next-gen.hmc-cycling.org`
- `commerce.enabled: true`
- `commerce.provider: printful`
- `commerce.checkout: stripe`
- start with `commerce.preview: true` until checkout testing begins
- `commerce.printful.store_id: 17828143`
- six Printful products from existing HMC `products-config.json`
- use integer `price_minor: 2000`
- use HMC's current shipping policy from Task 2
- use `catalog` component on the shop/home page
- include HMC's basic informational content: home/shop, about, contact,
  success/cancel messaging as supported by current Clodsite components
- do not attempt visual pixel parity with the current HMC site

### Gate

Run:

```bash
SITE_NAME=hmc-next-gen bash scripts/validate-plan.sh
```

---

## Task 4: Validate Printful Sync Against The Real HMC Store

This task is read/sync only. It should not create Printful orders.

### Implementation

Run:

```bash
SITE_NAME=hmc-next-gen bash scripts/commerce-sync.sh
```

Inspect generated:

- `$SITES_DIR/hmc-next-gen/commerce/catalog.json`
- `$SITES_DIR/hmc-next-gen/commerce/assets/`

Validate:

- all intended products are present and active;
- product names/descriptions are acceptable;
- each product has expected color and size options;
- each active variant has a `fulfillment_ref`;
- size guides parse into readable tables;
- mirrored images are local and acceptable;
- no Printful CDN URLs remain in `catalog.json`;
- product order and color order are acceptable.

### Gate

Run:

```bash
SITE_NAME=hmc-next-gen bash scripts/validate-plan.sh
node scripts/lib/validate-catalog.mjs "$SITES_DIR/hmc-next-gen/commerce/catalog.json"
```

Stop for user review of the generated catalog and images before moving to
order-creating tests.

---

## Task 5: Patch Legacy HMC Webhook Ownership Guard

Before next-gen checkout testing, the existing HMC Worker must ignore Stripe
sessions that belong to the Clodsite next-gen site.

### Tests First

In `/Users/danrevel/lab/projects/hmc/worker/test/index.spec.js`, add tests
proving:

- legacy sessions with no next-gen marker continue down the current HMC path;
- sessions stamped for Clodsite next-gen are acknowledged with 200 and do not
  create a Printful order;
- sessions stamped for current legacy HMC continue to work.

### Implementation

Patch `/Users/danrevel/lab/projects/hmc/worker/src/index.js` so the webhook
ignores sessions with a Clodsite next-gen ownership marker. The current
Clodsite checkout stamps `metadata.site`; if the HMC port needs a stronger
`commerce_instance_id`, implement it in Clodsite checkout before using it here.

### Gate

Run the HMC Worker tests:

```bash
cd /Users/danrevel/lab/projects/hmc
npm test
```

Deploy the patched legacy Worker only after tests pass and the diff is reviewed.

---

## Task 6: Build And Deploy Next-Gen Preview

### Implementation

With `commerce.preview: true`, build and deploy the site:

```bash
SITE_NAME=hmc-next-gen bash scripts/validate-plan.sh
SITE_NAME=hmc-next-gen bash scripts/write-site-json.sh
SITE_NAME=hmc-next-gen bash scripts/apply-theme.sh
SITE_NAME=hmc-next-gen bash scripts/render-templates.sh
SITE_NAME=hmc-next-gen bash scripts/render-functions.sh
SITE_NAME=hmc-next-gen bash scripts/build-site.sh
SITE_NAME=hmc-next-gen bash scripts/render-headers.sh
SITE_NAME=hmc-next-gen bash scripts/deploy.sh
SITE_NAME=hmc-next-gen bash scripts/deploy-finalize.sh
```

Connect `next-gen.hmc-cycling.org` with `/domain` if needed.

### Gate

Verify:

- site loads at the Pages URL;
- site loads at `next-gen.hmc-cycling.org`;
- product catalog renders;
- cart opens and updates;
- checkout button is disabled with preview messaging;
- no checkout/webhook Functions are active in preview mode;
- `NEXT-STEPS.md` accurately reflects preview/test status.

---

## Task 7: Gate A — Direct Printful Provider Smoke Test

This task may create a real Printful order.

### Preflight

Stop and ask for approval before running this task.

Confirm:

- Dan is available to cancel a test Printful order.
- The selected product/variant is low risk.
- The shipping address and customer email are deliberate test values.
- The idempotency key is unique and recognizable.

### Implementation

Use `scripts/lib/commerce/providers/printful/order.mjs` with one product line
from the synced catalog and a controlled order object. Capture:

- idempotency key;
- Printful API calls made;
- returned `provider_order_id`;
- any provider error detail.

### Gate

Stop after the order result. Report the Printful order ID and wait for Dan to
confirm cancellation or intentional retention.

---

## Task 8: Gate B — Stripe Test Checkout Through Next-Gen

This task may create a real Printful order even though Stripe is in test mode.

### Implementation

Remove `commerce.preview: true` or set it false for a test-mode deployment.
Deploy using `sk_test_...` in the shared Clodsite env.

Run one Stripe test checkout from `next-gen.hmc-cycling.org`:

- one product;
- one quantity;
- Stripe test card `4242 4242 4242 4242`;
- deliberate shipping address;
- deliberate test email.

### Gate

Verify:

- Stripe checkout completes;
- webhook returns success or stores actionable diagnostics;
- ORDERS KV reaches `completed`;
- Printful order is created once;
- order details match product, variant, quantity, recipient, and email;
- no legacy HMC fulfillment path creates a duplicate order.

Stop after capturing the Printful order ID. Wait for Dan to confirm
cancellation or intentional retention.

---

## Task 9: Gate C — Webhook Retry And Idempotency

This task must not create a second Printful order for the same Stripe session.

### Implementation

Replay the same Stripe test webhook event or use Stripe dashboard retry tooling
against the completed test session.

Verify:

- duplicate delivery returns 200;
- ORDERS KV remains `completed`;
- Printful provider treats the same session-derived compact external ID as
  idempotent;
- no duplicate Printful order is created.

If a failure-path test requires a fresh session, stop first and re-enter the
manual cancellation protocol.

### Gate

Report whether any additional Printful order was created. If yes, wait for Dan
to confirm cancellation before continuing.

---

## Task 10: Gate D — Controlled Live Purchase

This task charges a real card and creates a real Printful order.

### Preflight

Stop and ask for approval before running this task.

Confirm:

- live Stripe key is active in env;
- test-mode key is no longer active;
- `NEXT-STEPS.md`/deploy output clearly says LIVE;
- Dan is available to cancel or retain the Printful order;
- one deliberate product/variant/quantity is selected.

### Implementation

Deploy next-gen in live mode and run one deliberate live purchase.

### Gate

Verify:

- real Stripe payment succeeds;
- webhook succeeds;
- ORDERS KV reaches `completed`;
- exactly one Printful order exists;
- product, variant, quantity, recipient, and email are correct;
- legacy HMC does not fulfill the same session.

Stop after capturing the Printful order ID. Wait for Dan to confirm
cancellation or intentional retention.

---

## Task 11: Soak And Product Review

### Implementation

Leave next-gen running on `next-gen.hmc-cycling.org` for review.

Review:

- product copy;
- product images;
- color/size selector usability;
- size-guide readability;
- cart behavior on desktop and mobile;
- checkout messaging;
- success/cancel behavior;
- metadata and social previews;
- accessibility basics.

### Gate

Only proceed to cutover after Dan explicitly approves the next-gen site.

---

## Task 12: Cut Over hmc-cycling.org

### Preflight

Confirm:

- next-gen has passed test and live purchase gates;
- legacy HMC Worker ownership guard is deployed;
- old Pages project, Worker, and Stripe webhook endpoint remain intact for
  rollback;
- no old-system sessions remain unfulfilled or retrying;
- rollback instructions are written down.

### Implementation

Use `/domain` or the equivalent Cloudflare Pages domain flow to point
`hmc-cycling.org` at the Clodsite Pages project.

Do not delete the old HMC Pages project, Worker, KV namespace, or Stripe webhook
endpoint during cutover.

### Gate

Verify:

- `https://hmc-cycling.org` serves the Clodsite site;
- product catalog and cart work on the production domain;
- checkout success/cancel URLs use the production domain;
- one post-cutover smoke checkout is either preview-only or explicitly approved
  as an order-creating test.

---

## Task 13: Rollback Window And Decommission Plan

### Implementation

Keep the old HMC stack dormant for at least the Stripe webhook retry horizon.

During the window:

- monitor Stripe webhook deliveries;
- monitor ORDERS KV diagnostics;
- reconcile any Printful orders;
- keep rollback available by repointing the domain and restoring the old
  checkout route.

After the window:

- remove the old Stripe webhook endpoint;
- remove or archive the old Worker route;
- remove or archive the old Pages project;
- record the final cutover notes.

### Gate

Do not decommission old infrastructure until Dan explicitly approves cleanup.

---

## Validation Summary

Minimum automated checks before cutover:

```bash
# Clodsite
node --test scripts/lib/*.test.mjs scripts/lib/commerce/*.test.mjs \
  scripts/lib/commerce/providers/*/*.test.mjs mcp/*.test.js
bash scripts/test/run-tests.sh

# HMC legacy guard
cd /Users/danrevel/lab/projects/hmc
npm test

# HMC next-gen plan/catalog
cd /Users/danrevel/lab/codex/projects/codex-clodsite
SITE_NAME=hmc-next-gen bash scripts/validate-plan.sh
node scripts/lib/validate-catalog.mjs \
  /Users/danrevel/lab/projects/clodsite-sites/hmc-next-gen/commerce/catalog.json
```

Minimum manual checks:

- generated catalog/images reviewed;
- Printful sync validated against real API;
- every Printful order-creating test paused for cancellation confirmation;
- Stripe test checkout verified;
- controlled live purchase verified;
- next-gen site approved before domain cutover;
- rollback window completed before old-stack cleanup.
