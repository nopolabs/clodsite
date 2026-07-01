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
- I could not get exact field-level confirmation of the v1 `/webhooks` request
  body (`types` vs `type`, single-webhook-per-store PUT-replace semantics) or
  the exact `shipments[]` field names on a `GET /orders/{id}` response from
  documentation search — these are stated below as strong-but-unverified
  recollections of the long-stable v1 API, called out explicitly as **spike
  items**.

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

The self-minted secret (`PRINTFUL_WEBHOOK_SECRET`, a random 32-byte hex
token generated at provision time — *we* choose it, unlike Stripe's signing
secret, which Stripe generates) is embedded as `?token=` in the URL we
register with Printful. It is not a substitute for verify-on-receipt; it's a
cheap barrier against opportunistic/scanner traffic finding the endpoint and
triggering wasted Printful API calls. Checked with a constant-time compare;
mismatch → `401`, no further processing.

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
session.** The temptation is to map the Printful order id back to the
original Stripe session (the `ORDERS` KV record keyed by session id) — but
nothing in the shipping email needs that record. Printful's own
`GET /orders/{id}` response already carries the recipient's name, email, and
address (we sent them at order-creation time), so the shipment email is
self-contained from that one authoritative fetch. Idempotency bookkeeping
reuses the existing `ORDERS` KV binding (already bound to the Pages project
for every live-commerce site) with a distinct key prefix
(`printful-shipment:...`) rather than a new namespace — same binding, no new
provisioning surface, value is just `{ notified_at }`.

**Decision 6 — Failure mode: `500` on genuine failure, unlike phase 2.**
Phase 2's confirmation email sits on the paid-order webhook's response path,
so it must never delay or fail that response (Decision in the design spec).
This endpoint is *not* in that path — it's Printful's own delivery, entirely
decoupled from Stripe/checkout — so if the authoritative re-fetch or the
Resend send fails, returning `500` (rather than swallowing and returning
`200`) gives Printful a chance to retry, the same way Stripe retries our own
checkout webhook on `500`. Idempotency (Decision 4) makes retries safe. If
Printful's retry behavior turns out to be weaker than Stripe's (unconfirmed —
another spike item), a missed shipping notification is a low-severity gap:
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
  3. `type !== 'package_shipped'` (**spike: confirm exact v1 event name**) →
     `200 { ok: true, ignored: true }`.
  4. Extract `order_id`/`shipment_id` from the payload (**spike: confirm exact
     field path** — recollection is `data.shipment.id` and either
     `data.order.id` or a top-level `data.order_id`; the spike pins this down
     against a real event, likely via Printful's webhook simulator mentioned
     in their docs).
  5. `ORDERS.get('printful-shipment:' + order_id + ':' + shipment_id)` — if
     already notified, `200 { ok: true, duplicate: true }`.
  6. `GET https://api.printful.com/orders/{order_id}?store_id=...` (reuse the
     request/error-handling shape of `printfulOrderRequest`, ported the same
     way `createOrder` already is — inlined at render time, not imported).
     Not found / no matching `shipment_id` in the response's `shipments[]`
     (**spike: confirm this field name**) → `500` with a diagnostic (no KV
     write beyond nothing to record).
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
- Generate a fresh `PRINTFUL_WEBHOOK_SECRET` (random 32-byte hex) every
  deploy — unlike Stripe's signing secret, we own both ends, so there's no
  continuity to preserve; a clean overwrite each deploy is simpler and just as
  safe (**spike: confirm the v1 `/webhooks` resource is a single
  store-scoped config replaced by `PUT`, not a list of named endpoints** — if
  wrong, this step changes shape but Decisions 1–6 above are unaffected).
- `PUT https://api.printful.com/webhooks?store_id=...` with
  `{ url: '<host>/api/printful-webhook?token=<secret>', types: ['package_shipped'] }`
  (**spike: confirm request body field names**).
- Push `PRINTFUL_WEBHOOK_SECRET` as a Pages secret via `wrangler pages secret put`.
- No local state file needed for the secret itself (nothing to preserve across
  deploys); a minimal state file recording the last-registered URL is optional
  polish for a friendlier "reusing/updating" log line, not required for
  correctness.

**4. `deploy.sh`** — gate: a printful store with `commerce.contact.from` set
needs `PRINTFUL_API_KEY` (already required) and `RESEND_API_KEY` (already
required by phase 2's gate for the same condition) — no *new* env
requirement, since this phase piggybacks entirely on phase 2's contact
config and the provider's existing Printful key. Just wire the new
provisioning script into the deploy sequence and its own `NEXT-STEPS.md`
line if useful (parity with the phase-1 receipt checklist).

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
- Resend send failure (non-2xx / throw / timeout) → `500`, no KV write (so a
  Printful retry gets another chance).
- `render-functions`: Function is rendered only when
  `provider: printful && commerce.contact.from` is set; stale-removed when
  either condition stops holding; `{{CONTACT}}`/`{{SITE}}` substituted with no
  leftover markers.
- `deploy.sh`: printful + `commerce.contact.from` still requires
  `PRINTFUL_API_KEY`/`RESEND_API_KEY` (no new requirement); provisioning
  pushes `PRINTFUL_WEBHOOK_SECRET`.

## Spike items to resolve early in implementation (before the production template)

1. Confirm the v1 `/webhooks` resource's exact request/response shape
   (single store-scoped `PUT`-replace vs. a list; field name `types` vs
   `type`; whether `store_id` is a query param like every other v1 call).
2. Confirm the `package_shipped` payload's exact field path for the Printful
   order id and shipment id.
3. Confirm `GET /orders/{id}`'s response carries a `shipments[]` array with
   the fields this plan assumes (`id`, `tracking_number`, `tracking_url`,
   `carrier`/`service`, `ship_date`).
4. If Printful's webhook simulator (surfaced in their docs) is usable without
   a live store, use it to validate 1–3 before touching the real anchovy-mug
   store; otherwise a scratch registration against anchovy-mug's real
   `PRINTFUL_API_KEY` is the fallback.

None of these affect Decisions 1–6 — they only affect exact field/endpoint
names inside an architecture that's already settled.

## Out of scope

- `order_failed`/`order_canceled` shipping-adjacent notifications (item 22's
  operator alert already covers fulfillment failure; a customer-facing
  cancellation email is a different, unbuilt feature).
- Printful API v2 / signed webhooks (future upgrade once v2 is stable; not a
  dependency for this design — see "What I found," above).
- The `manual` provider (no Printful order exists to ship).
