---
type: Plan
title: "Printful Shipping Notifications — Implementation Plan (Phase 3)"
description: "Implementation plan for Phase 3 of the customer-order-emails design — 'your order shipped' emails driven by Printful shipment webhooks."
tags: ["commerce", "email", "resend", "printful", "webhook", "fulfillment"]
status: draft
timestamp: 2026-06-30T00:00:00Z
---

# Printful Shipping Notifications — Implementation Plan (Phase 3)

**Date:** 2026-06-30
**Status:** Draft — Codex review requested before any coding starts
**Design:** [Customer Order Emails](../specs/2026-06-30-customer-order-emails-design.md) — **Phase 3**
**Builds on:** `commerce.contact` / order-confirmation email (item 2 phase 2), the
Printful order provider (`scripts/lib/commerce/providers/printful/order.mjs`),
item 22 slice 1's reliability pattern
**Owner:** Claude implements; Codex reviews (this plan, then the code).

## Why this is a plan, not code yet

Phase 3 was deliberately left a "sketch, not a final contract" in the design
spec — the auth model for an unsigned third-party webhook is a real decision,
not a formality. This plan proposes a concrete architecture and settles the
open questions the spec listed, but a few wire-format details (exact request/
response shapes on Printful's `/webhooks` resource) are stated with the
confidence level I actually have and are flagged for a **live spike** against
the real API early in implementation, before the production template is
written — the same way `provision-stripe-webhook.sh` was clearly built and
hardened against a real Stripe account rather than written from documentation
alone.

## What I found researching Printful's webhook system

- **Printful v1** (the API our `providers/printful/order.mjs` and `sync.mjs`
  already use exclusively — `/orders`, `/sync/products`, `store_id` query
  param, plain API-key bearer auth) has long supported webhooks
  (`package_shipped`, `order_created`, `order_failed`, `order_canceled`, etc.),
  registered via a `/webhooks` resource scoped to one store. **v1 webhook
  payloads are not signed.** This matches the spec's concern that "Printful
  webhooks don't HMAC-sign like Stripe."
- **Printful v2 (beta)** advertises "new, more secure webhooks: enforcing
  HTTPS, expiration dates, and request signing." This would close the signing
  gap outright, but (a) it's beta, (b) it's a second, structurally different
  API surface (different base path, and the docs weren't clear on whether the
  same store-scoped API key authorizes it or whether it requires OAuth), and
  (c) adopting it would mean this codebase's Printful integration spans two
  API versions for the first time. I'm treating v2 as a **future upgrade**,
  not a v1-phase-3 dependency — see Decision 1 below for why v1 + verify-on-
  receipt is sufficient without it.
- **Update (post-implementation, confirmed against `developers.printful.com/docs/#tag/Webhook-API`
  directly — the original search-based research above missed this page):**
  `/webhooks` is confirmed as a single store-scoped config (`GET`/`POST`/`DELETE`,
  not a list) — but **registration is `POST` ("Set up webhook configuration"),
  not `PUT`** as this plan originally assumed, and store scoping for the
  **Webhook API specifically** is the **`X-PF-Store-Id` header**, not the
  `?store_id=` query param the Orders API uses (the two APIs disagree — the
  Orders API calls in this feature and in the existing provider keep the query
  param; only the new `/webhooks` calls use the header). The `package_shipped`
  payload is also confirmed: `type: "package_shipped"`, `data.order.id`,
  `data.shipment.id`, with carrier/tracking fields on `data.shipment` and
  recipient email on `data.order` — matching this plan's extraction logic
  as originally written.
- **Second update:** the last open item — `GET /orders/{id}`'s exact schema —
  is now confirmed too (the user quoted the live example response from
  `developers.printful.com/docs/#tag/Orders-API/operation/getOrderById`).
  `recipient` matches this plan's assumptions exactly (`name`, `address1`,
  `address2`, `city`, `state_code`, `zip`, `country_code`, `email`, plus
  unused fields like `company`/`phone`/`tax_number`). `shipments[]` matches
  for `id`/`carrier`/`service`/`tracking_number`/`tracking_url`/`ship_date` —
  but **`shipments[].items[]` carries only `{ item_id, quantity, picked,
  printed }`, no product name**, which this plan had wrongly assumed. The
  name lives on the order's own top-level `items[]` (each with an `.id`),
  joined by `item_id` — implemented as `shipmentItemName(order, itemId)` in
  the template, falling back to a generic `item <id>` label if no match
  (defensive; shouldn't happen for an order this code created). No spike
  items remain open.

## Decisions

**Decision 1 — Auth model: verify-on-receipt, not payload trust, with a
self-minted shared secret as a cheap outer gate.**
Because v1 payloads aren't signed, the webhook Function never treats the
POSTed JSON body as authoritative. It extracts only the Printful **order id**
and **shipment id** from the payload, then re-fetches
`GET /orders/{order_id}` from Printful itself — authenticated with our own
`PRINTFUL_API_KEY` and scoped to our own `PRINTFUL_STORE_ID`, exactly like
`printfulOrderRequest` in the existing provider — and acts only on that
authoritative response. A forged or replayed POST can, at worst, trigger one
extra authenticated GET for an order id of the attacker's choosing; it can
never fabricate a shipped status, tracking number, or recipient detail,
because all of those come from Printful's own API, not the request body. This
is strictly better than HMAC verification of an untrusted payload would be
(HMAC proves origin, not that the *content* reflects current reality; here we
never trust the content at all). A signed-but-content-trusted alternative is
not on the table for v1 anyway, so this isn't a compromise — it's the
correct design regardless of whether v1 is ever proven to sign.

The self-minted secret (`PRINTFUL_WEBHOOK_SECRET`) is embedded as `?token=` in
the URL we register with Printful. It is not a substitute for verify-on-
receipt; it's a cheap barrier against opportunistic/scanner traffic finding
the endpoint and triggering wasted Printful API calls. Checked with a
constant-time compare; mismatch → `401`, no further processing.

**Revised per review (was: regenerate every deploy — rejected, see below):**
unlike Stripe's signing secret, *we* choose this value, but that doesn't mean
provisioning should mint a fresh one on every deploy. A deploy pushes it to
Pages and registers it with Printful as two separate network calls; if one
succeeds and the other fails (or the deploy is interrupted between them),
Printful and Pages end up holding different tokens and every real shipping
webhook 401s until the next successful deploy repairs it — a self-inflicted
outage with no operator signal beyond silence. Instead `PRINTFUL_WEBHOOK_SECRET`
is a **stable, explicitly-set credential in `.env`**, exactly like
`RESEND_API_KEY`/`PRINTFUL_API_KEY`: `provision-printful-webhook.sh` requires
it to already be present (mirroring deploy.sh's existing "Error: X is not set
in .env" gates) and errors out — printing a freshly generated candidate value
and the exact line to add — if it's missing, rather than generating and using
one in the same run. Once set, every deploy pushes that *same* value to Pages
(a plain idempotent overwrite, like every other secret push in `deploy.sh`)
and registers that *same* value with Printful (a GET-then-compare-then-POST-if-
different, so an unchanged secret across deploys is a no-op on Printful's
side too — see the implementation map). Both sides always converge on
whatever `.env` currently holds; there is nothing to rotate unless the
operator deliberately changes the `.env` value, at which point the next
deploy naturally re-syncs both sides together. This removes the atomicity
problem entirely rather than trying to make the two-network-call sequence
atomic.

**Decision 2 — Scope: gated on `commerce.contact.from`, not a new plan
field.** Shipping notifications reuse the exact same `commerce.contact`
sender/reply-to as the phase-2 order-confirmation email — same store voice,
same customer relationship. A printful store that has opted into
`commerce.contact` gets shipping notifications automatically; one that hasn't
gets neither. No new build-plan surface. (If a store later wants the
confirmation email but not shipping notifications, that's a real but
currently-hypothetical need — add an opt-out field then, not speculatively
now.)

**Decision 3 — Event scope: `package_shipped` only, v1 first.** Per the
spec's "scope" note, this phase does not attempt `order_failed`/`canceled`
notifications (those overlap with item 22's *operator* alerting, are a
different audience, and are explicitly out of scope for "shipped" emails).
Any other event type delivered to the endpoint is acknowledged `200` and
ignored, mirroring the Stripe webhook's `ignored: true` pattern for
irrelevant event types.

**Decision 4 — De-dupe unit: `(printful_order_id, shipment_id)`, not the
order.** A single order can ship as multiple packages; Printful fires one
`package_shipped` event per package. Each shipment gets its own notification
— "part of your order has shipped" — rather than trying to consolidate into
one email per order (which would require tracking an expected package count
that isn't reliably knowable up front). Idempotency key:
`printful-shipment:<order_id>:<shipment_id>`.

**Decision 5 — No new KV namespace, no reverse index back to the Stripe
session; but recipient email is not guaranteed and must be handled as a
permanent, not transient, gap.** The temptation is to map the Printful order
id back to the original Stripe session (the `ORDERS` KV record keyed by
session id) — but nothing in the shipping email needs that record: Printful's
own `GET /orders/{id}` response carries the recipient's name and address
regardless, and *usually* the email, so the shipment email is otherwise
self-contained from that one authoritative fetch. Idempotency bookkeeping
reuses the existing `ORDERS` KV binding (already bound to the Pages project
for every live-commerce site) with a distinct key prefix
(`printful-shipment:...`) rather than a new namespace — same binding, no new
provisioning surface.

**Revised per review** — the recipient email is *not* always present: the
existing provider only sets `recipient.email` when the Stripe session
supplied one (`providers/printful/order.mjs`, `...(order.email ? { email:
order.email } : {})`), and `order.test.mjs` already covers the omitted case.
So a real Printful order can permanently carry no email — the exact same gap
phase 2 hit (`customer_details.email` absent) and resolved as "skip, don't
fail." Phase 3's shipping notification for such an order can **never**
succeed no matter how many times Printful redelivers, so this must be
distinguished from a *transient* failure (Decision 6's `500`-and-retry): a
missing recipient email on the authoritative order writes
`{ skipped: 'no recipient email on order', at: <iso> }` to the idempotency
key and returns `200` (not `500`) — the KV write itself is what stops future
redeliveries of the same `(order_id, shipment_id)` from re-fetching Printful
and re-discovering the same permanent gap. Returning `500` here would be
wrong twice over: it invites Printful to retry a condition that will never
resolve, and (per Decision 6) `500` is reserved for conditions where a retry
might actually help.

**Decision 6 — Failure mode: `500` on genuine failure, unlike phase 2.**
Phase 2's confirmation email sits on the paid-order webhook's response path,
so it must never delay or fail that response (Decision in the design spec).
This endpoint is *not* in that path — it's Printful's own delivery, entirely
decoupled from Stripe/checkout — so if the authoritative re-fetch or the
Resend send fails, returning `500` (rather than swallowing and returning
`200`) gives Printful a chance to retry, the same way Stripe retries our own
checkout webhook on `500`. Idempotency (Decision 4) makes retries safe. If
Printful's retry behavior turns out to be weaker than Stripe's (a separate,
still-unconfirmed question — not one of the wire-format spike items below),
a missed shipping notification is a low-severity gap:
the customer still has the order-confirmation email and Printful's own
carrier tracking eventually reaches them independently.

## Implementation map

**1. New template + Function** — `scripts/lib/commerce/printful-shipping.template.js`
→ rendered to `functions/api/printful-webhook.js`, gated in
`render-functions.mjs` on `commerce.provider === 'printful' && commerce.contact.from`
set. Self-contained (Workers-compatible `fetch` only), matching the existing
provider-template discipline.

- `onRequestPost(context)`:
  1. Compare `?token=` against `PRINTFUL_WEBHOOK_SECRET` (constant-time). Mismatch
     → `401`.
  2. Parse JSON body. Malformed → `400`.
  3. `type !== 'package_shipped'` (confirmed against Printful's v1 docs) →
     `200 { ok: true, ignored: true }`.
  4. Extract `order_id`/`shipment_id` from the payload — confirmed:
     `data.order.id` and `data.shipment.id`.
  5. `ORDERS.get('printful-shipment:' + order_id + ':' + shipment_id)` — if
     already notified, `200 { ok: true, duplicate: true }`.
  6. `GET https://api.printful.com/orders/{order_id}?store_id=...` (reuse the
     request/error-handling shape of `printfulOrderRequest`, ported the same
     way `createOrder` already is — inlined at render time, not imported; the
     Orders API keeps the `?store_id=` query param — only the newer
     `/webhooks` calls in step 3 of the implementation map use the
     `X-PF-Store-Id` header instead). Not found / no matching `shipment_id` in
     the response's `shipments[]` (field name confirmed, see "What I found")
     → `500` with a diagnostic (no KV write beyond nothing to record — this is
     transient: a race with Printful's own API catching up, worth a retry).
  6a. Product names for each shipped item come from the order's own
      top-level `items[]`, joined by `item_id` (`shipments[].items[]` itself
      carries no name — confirmed, see "What I found").
  6a. Order found but `recipient.email` absent (real, permanent case per
      Decision 5) → write `{ skipped: 'no recipient email on order', at }` to
      the idempotency key, `200 { ok: true, skipped: true }`. No Resend call.
  7. Compose the email (tracking number, carrier/service, ship date, resolved
     from the *authoritative* order response) and send via Resend with
     `CONTACT.from`/`reply_to`, `Idempotency-Key: printful-shipment:<site>:<order_id>:<shipment_id>`,
     bounded 5s timeout (same constants as the phase-2 helper).
  8. Send failure → `500`. Success → write `{ notified_at }` to the KV key,
     `200 { ok: true }`.

**2. `render-functions.mjs`** — extend `renderWebhookSource`'s sibling logic
(or a new `renderPrintfulShippingSource(plan)`) to embed `{{SITE}}`,
`{{CONTACT}}` (reuse the same contact-resolution helper written for phase 2),
and `{{PROVIDER_ENV}}`-equivalent (`PRINTFUL_STORE_ID`). Stale-cleanup when the
gate condition stops holding (provider changes off printful, or
`commerce.contact` is removed), mirroring the existing `removeIfStale` pattern
for `contact.js`.

**3. New provisioning script — `scripts/provision-printful-webhook.sh`**,
invoked from `deploy.sh` alongside `provision-stripe-webhook.sh`/
`provision-kv.sh`, gated on the rendered `functions/api/printful-webhook.js`:
- Resolve the production webhook host (same custom-domain-or-`*.pages.dev`
  logic `provision-stripe-webhook.sh` already has — worth factoring the host
  resolution into a shared helper in `lib/sites.sh` rather than copy-pasting a
  third time; flagging as a small refactor to do in this same PR, not a
  blocker).
- Require `PRINTFUL_WEBHOOK_SECRET` in the environment, exactly like the
  `RESEND_API_KEY`/`PRINTFUL_API_KEY` gates already in `deploy.sh` (Decision 1,
  revised) — **not** generated and used within the same run. If unset: print a
  freshly generated candidate value using the `pfws_` prefix plus 32 random
  lowercase hex characters (`PRINTFUL_WEBHOOK_SECRET=pfws_<32 hex chars>`) and
  the exact `.env` line to add (`Add PRINTFUL_WEBHOOK_SECRET=<value> to .env and
  redeploy.`, matching the phrasing of every other missing-secret error in
  `deploy.sh`), then `exit 1` without touching Printful or Pages.
- Once present, `GET https://api.printful.com/webhooks` (store scoped via the
  `X-PF-Store-Id` header, confirmed — **not** the `?store_id=` query param the
  Orders API uses) and compare the registered `url` to the one we'd register
  now; identical → "Reusing Printful webhook registration..." and skip the
  `POST` entirely (mirrors `provision-stripe-webhook.sh`'s "Reusing Stripe
  webhook endpoint" log line). Different or absent →
  `POST https://api.printful.com/webhooks` (confirmed as `POST`, not `PUT` —
  "Set up webhook configuration" in the v1 docs) with
  `{ url: '<host>/api/printful-webhook?token=<secret>', types: ['package_shipped'] }`.
- Push `PRINTFUL_WEBHOOK_SECRET` as a Pages secret via `wrangler pages secret
  put` every deploy — a plain idempotent overwrite of the same `.env` value,
  identical in spirit to how `RESEND_API_KEY`/`STRIPE_SECRET_KEY` are already
  re-pushed every deploy elsewhere in `deploy.sh`. Never generated by this
  script when already set; rotation is an explicit `.env` edit by the
  operator, which the next deploy naturally propagates to both sides.
- No local state file needed: `.env` already holds the one thing this script
  needs to remember (the secret), and the GET-then-compare above makes the
  registration step itself idempotent without one.

**4. `deploy.sh`** — gate: a printful store with `commerce.contact.from` set
needs `PRINTFUL_API_KEY` (already required) and `RESEND_API_KEY` (already
required by phase 2's gate for the same condition) — both already covered by
existing gates, so no change there. The **one new** requirement is
`PRINTFUL_WEBHOOK_SECRET` (Decision 1, revised) — enforced inside
`provision-printful-webhook.sh` itself (same self-contained-gate style as
`provision-stripe-webhook.sh`, which owns its own `STRIPE_SECRET_KEY` check
rather than `deploy.sh` pre-checking it) rather than added to `deploy.sh`'s
own preflight block. Wire the new provisioning script into the deploy
sequence and its own `NEXT-STEPS.md` line if useful (parity with the phase-1
receipt checklist).

## Guardrails

- Never trust the webhook payload's shipment/tracking content directly —
  every notification's content comes from the authoritative
  `GET /orders/{id}` re-fetch (Decision 1). This is the one guardrail that
  isn't negotiable in review; everything else here is a reasonable default.
- This endpoint is decoupled from the paid-order webhook and Stripe entirely —
  it must not read or write the `ORDERS` KV completed/failed/processing
  records from phase 1/2, only its own `printful-shipment:...` keys.
- Scope to `manual` provider: none — this feature is Printful-only by
  construction (there is no Printful order for the manual provider to ship).
- A permanent condition (no recipient email on the order) must resolve to a
  recorded, non-retried `200`, never an endless `500` — only genuinely
  transient failures (Printful/Resend unreachable) get a retry (Decision 5,
  revised).
- `PRINTFUL_WEBHOOK_SECRET` is never generated and consumed within the same
  provisioning run — it comes from `.env` like every other credential, and a
  missing value is a hard stop with no partial Printful/Pages write (Decision
  1, revised).
- Generated candidates follow `pfws_<32 lowercase hex chars>`: the prefix makes
  the URL token recognizable as a Printful webhook secret, while the 128-bit
  random suffix keeps the value comfortably unguessable.

## Tests

- Token mismatch → `401`, no Printful/Resend calls.
- Non-`package_shipped` event → `200 { ignored: true }`, no calls.
- First delivery for a `(order_id, shipment_id)`: authoritative order fetched,
  email sent with tracking/carrier from the *fetched* response (not the
  payload) even when the payload is deliberately given different/wrong
  tracking data — proves verify-on-receipt, not payload trust.
- Duplicate delivery of the same `(order_id, shipment_id)` → `200 { duplicate: true }`,
  no re-fetch, no re-send.
- A second, different `shipment_id` on the same `order_id` (multi-package
  order) sends its own notification.
- Order lookup 404 / malformed response → `500`, no KV write.
- **Order found but `recipient.email` absent → `200 { skipped: true }`, no
  Resend call, KV records the skip; a repeat delivery for the same
  `(order_id, shipment_id)` short-circuits on the KV check without hitting
  Printful again** (Decision 5, revised — the permanent-vs-transient
  distinction).
- Resend send failure (non-2xx / throw / timeout) → `500`, no KV write (so a
  Printful retry gets another chance).
- `render-functions`: Function is rendered only when
  `provider: printful && commerce.contact.from` is set; stale-removed when
  either condition stops holding; `{{CONTACT}}`/`{{SITE}}` substituted with no
  leftover markers.
- `provision-printful-webhook.sh`: missing `PRINTFUL_WEBHOOK_SECRET` errors
  clearly with no Printful/Pages calls attempted; present and unchanged from
  Printful's current registration → no `POST` (idempotent no-op); present and
  changed/absent → `POST` once, scoped via `X-PF-Store-Id`, not `?store_id=`;
  `PRINTFUL_WEBHOOK_SECRET` pushed to Pages every run regardless (plain
  overwrite, never generated here).
- `deploy.sh`: printful + `commerce.contact.from` still requires
  `PRINTFUL_API_KEY`/`RESEND_API_KEY` (no new requirement there).

## Spike items (all resolved)

Originally three items flagged for a live check before this went to
production; all now resolved from actual Printful documentation rather than
guessed:

1. **`/webhooks` request/response shape** — confirmed against
   `developers.printful.com/docs/#tag/Webhook-API` (after PR #113's review
   flagged that the earlier search-based research had missed this page):
   `POST`, not `PUT`; store-scoped via the `X-PF-Store-Id` header, not
   `?store_id=`.
2. **`package_shipped` payload field path** — confirmed: `data.order.id`,
   `data.shipment.id`.
3. **`GET /orders/{id}` schema** — confirmed from the live example response
   (`developers.printful.com/docs/#tag/Orders-API/operation/getOrderById`,
   quoted directly by the user). `recipient` and `shipments[]`'s own fields
   matched this plan's assumptions, but `shipments[].items[]` carries no
   product name (only `item_id`/`quantity`/fulfillment counts) — the name is
   joined from the order's top-level `items[]` by `item_id`, fixed in
   `printful-shipping.template.js` (`shipmentItemName`) with tests covering
   both the join and its fallback.

None of these affected Decisions 1–6 — only exact field/endpoint names inside
an architecture that was already settled.

## Printful simulator smoke procedure

Printful provides a hosted simulator at
`https://www.printful.com/api/webhook-simulator`. It sends sample payloads to a
listener URL; the simulator explicitly uses fake data and does not contain real
order or customer information. Because this feature uses verify-on-receipt, the
simulator can validate reachability and event parsing, but not the full
successful email path: the Function will re-fetch the fake `data.order.id`
from Printful and should fail that lookup.

Use this procedure before the first real shipped-order test:

1. Deploy a Printful commerce site that has `commerce.contact.from` configured
   and `PRINTFUL_WEBHOOK_SECRET` set in `.env`.
2. Confirm deploy output includes Printful shipping webhook provisioning, or
   confirm in Printful that the registered webhook URL is:
   `https://<site-domain>/api/printful-webhook?token=<PRINTFUL_WEBHOOK_SECRET>`.
3. Open the simulator and enter that exact URL.
4. Choose `package_shipped` and send the sample event.
5. Expected result: the request reaches Clodsite, passes the token check and
   event parsing, then returns `500` because the simulator's fake order id
   cannot be found by `GET /orders/{id}`. This is expected for the simulator
   and is not a failed commerce order.
6. Choose a non-shipping event such as `order_created` and send it.
7. Expected result: `200` with an ignored event response. This confirms
   irrelevant event types are acknowledged without Printful/Resend work.

The simulator does **not** prove the happy path. The happy path still requires
a real Printful order that has actually shipped, so `GET /orders/{id}` returns
a matching `shipments[]` entry and the Function can send the Resend shipping
email.

## Out of scope

- `order_failed`/`order_canceled` shipping-adjacent notifications (item 22's
  operator alert already covers fulfillment failure; a customer-facing
  cancellation email is a different, unbuilt feature).
- Printful API v2 / signed webhooks (future upgrade once v2 is stable; not a
  dependency for this design — see "What I found," above).
- The `manual` provider (no Printful order exists to ship).
