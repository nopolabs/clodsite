---
type: Spec
title: "Customer Order Emails Design"
description: "Transactional customer emails in three phases — tune Stripe receipts, add an order-confirmation email on fulfillment, and shipping notifications from Printful events."
tags: ["commerce", "email", "resend", "printful", "fulfillment"]
status: accepted
timestamp: 2026-06-30T00:00:00Z
---

# Customer Order Emails Design

**Date:** 2026-06-30
**Status:** Accepted — phased
**Roadmap entry:** Customer order confirmation emails (item 2)
**Builds on:** commerce v1 (KV order state machine), per-store Stripe keys (item
21), fulfillment observability (item 22, esp. the slice-1 Resend alert pattern)

---

## Summary

Stripe already emails the buyer a **payment receipt** (amount, line items with
variants, shipping cost, total, store support contact). It's reliable and free,
so the goal is not to replace it but to **layer customer-facing transactional
email** that Stripe can't, in three phases of increasing effort:

1. **Tune the Stripe receipt** — per-store account settings (no code).
2. **Order-confirmation email** — sent on fulfillment success, supplementing the
   receipt with ship-to address, our order id, and fulfillment expectations.
3. **Shipping notifications** — "your order shipped" with tracking, driven by
   Printful shipment events (greenfield).

## Background — receipt gap analysis

Stripe's receipt covers payment + line items + shipping cost + support contact,
branded from the store's Stripe account. It does **not** carry: the shipping
**destination** address, any **payment-vs-fulfillment** distinction (for
made-to-order Printful, "in production / ships in ~X / tracking to follow"), our
**order id** (it shows Stripe's receipt #, not the KV/session key support uses),
or store-specific voice/next-steps. Those gaps define phases 2–3.

## Phase 1 — Tune the Stripe receipt (operator settings, surfaced at deploy)

Each store now runs on its **own** Stripe account (item 21), so receipt identity
is per-store. The settings are operator dashboard work (no per-request code), but
they shouldn't live only in the operator's head — so the small **code** part of
this phase is to **surface the checklist in `NEXT-STEPS.md` for every commerce
deploy**. `deploy-finalize` appends a "Stripe receipt settings" section whenever
the site has a checkout Function, listing the per-account settings to confirm:

- **Public business name** (Settings → Business → Public details) — the receipt
  sender ("Receipt from <name>").
- **Support email & phone** (same page) — the receipt's contact line.
- **Branding: logo, icon, brand color** (Settings → Branding) — receipts +
  Checkout.
- **Statement descriptor** (Settings → Payments) — how the charge reads on the
  card statement.
- **Email receipts enabled** (Settings → Customer emails → "Successful
  payments", and refunds) — live-mode receipts auto-send; test-mode sends only
  from the Dashboard.

Settings apply per account (each store is a separate account) and are shared
across test/live (verify live). Acceptance: each store's receipt shows that
store's identity and support, not a personal default (e.g. HMC's receipt
currently shows `danrevel@gmail.com`), and the checklist appears in a commerce
site's `NEXT-STEPS.md`.

This is the cheapest, highest-ratio improvement and unblocks judging how much
phase 2 needs to add.

## Phase 2 — Order-confirmation email (supplement)

**Implementation plan:** [Order-Confirmation Email — Implementation Plan (Phase 2)](../plans/2026-06-30-order-confirmation-email.md) (Codex handoff).

**Trigger:** the webhook's **`state: completed`** transition (provider order
created), *not* payment. This is the deliberate payment-vs-fulfillment split:
Stripe's receipt = "paid" (instant); ours = "order placed & being made" (after
fulfillment), so we never confirm an order whose fulfillment failed.

**Transport & addressing:** reuse Resend (shared `RESEND_API_KEY`). Recipient is
the session's `customer_details.email`. **If that is absent, skip the send** —
record a diagnostic on the `ORDERS` record and do nothing else; the order stands
and Stripe's receipt + the item-22 operator alert still cover it. Never fail the
order for a missing recipient.

**Sender — settled (not `fulfillment.from`).** Add a provider-agnostic
`commerce.contact` block to `build-plan.yaml`:

```yaml
commerce:
  contact:
    from: orders@hmc-cycling.org       # required to enable customer emails
    reply_to: support@hmc-cycling.org  # optional
```

`commerce.fulfillment.from` is *manual-provider merchant* config and is **absent
on the Printful stores this feature primarily serves** (hmc-next-gen, anchovy-mug,
bbpp), so it is not reused. `commerce.contact.from` is the store's customer-facing
sender (its domain must be verified in Resend); `validate-plan` checks the shape
(email syntax) with no credentials, and deploy gates the feature on its presence.
It is also the natural home for the support email/phone referenced across phases.

**Order data source (P1) — Stripe is the source of truth.** Checkout `metadata`
intentionally carries only `{ fulfillment_ref, qty, personalization_* }`, and the
`completed` `ORDERS` record stores only state/attempts/`provider_order_id` — so
**neither holds renderable line items.** At send time the webhook **retrieves the
session's line items from Stripe** (`GET /v1/checkout/sessions/{id}?expand[]=line_items`)
using the per-store `STRIPE_SECRET_KEY` (already bound to the Pages project; a
restricted key's Checkout Sessions scope covers the read). Each line item's
`description` already includes the variant (e.g. "… (Pink / L)") because checkout
set it — the same data Stripe's own receipt renders. Totals (`amount_total`,
`amount_subtotal`, shipping), currency, customer email, and `shipping_details`
come from the session the webhook already holds (or the same retrieve). No new
order snapshot or storage is introduced.

**Content:** store voice; **our order id** (session id); the retrieved items +
variants; subtotal/shipping/total; **ship-to address**; a fulfillment expectation
(made-to-order, ships in ~X, tracking to follow); support contact. Including the
customer's address is appropriate here — it's their own data sent to them (unlike
the operator alert in item 22, which omits PII).

**Reliability (mirror item 22 slice 1):**
- Resend **Idempotency-Key** per session; **non-blocking** — a send failure never
  fails or delays the order or the `200`/`500` response.
- Record send state on the `ORDERS` record (`confirmation_sent_at`) and **don't
  resend** on Stripe webhook retries; record diagnostics on failure.

Works for both providers (manual and printful both reach `completed`).

**Config:** opt-in per store — the email sends only when `commerce.contact.from`
is set (and `RESEND_API_KEY` is available / its sender domain verified in Resend).
`validate-plan` checks the `commerce.contact` shape; deploy ensures
`RESEND_API_KEY` is pushed when the feature is enabled (as it already does for the
manual provider and `resend-form`).

## Phase 3 — Shipping notifications from Printful events (greenfield)

Goal: email the buyer "your order shipped" with carrier + tracking number/URL when
the item actually ships.

Sketch: register a **Printful webhook** per printful store
(`package_shipped`, likely `order_failed`/`canceled` too); a new Pages Function
(e.g. `functions/api/printful-webhook.js`) receives it, **maps the Printful order
back to our order** (the order's `external_id` is the Stripe session id;
`provider_order_id` is also recorded in KV), reads the tracking fields, and sends
a Resend email to the customer. Same reliability discipline (idempotent per
shipment, non-blocking, KV send-state).

**Open design questions (settle in a phase-3 pass before building):**
- **Auth/verification.** Printful webhooks don't HMAC-sign like Stripe; design
  the trust model (secret-token path, allowlist, or verify-on-receipt via the
  Printful API). This is the crux.
- **Provisioning.** A `provision-printful-webhook.sh` analogous to the Stripe one
  (register/update the endpoint per store at deploy).
- **Events & idempotency.** Which events; de-dupe repeated `package_shipped`
  (multi-package orders send several).
- **Scope.** Printful-only — the `manual` provider has no shipment event (a
  manual "mark shipped" is out of scope, or a later add).

Phase 3 is the largest and most uncertain; treat this section as direction, not a
final contract.

## Decisions

1. **Supplement, don't replace.** Stripe keeps the payment record; if our email
   fails the customer still has it. We never duplicate payment-detail rendering or
   take on its deliverability burden as the sole confirmation.
2. **Confirm on fulfillment, not payment** (phase 2) — accuracy + the
   payment-vs-fulfillment distinction fall out of it.
3. **Reliability mirrors item 22 slice 1** — idempotent, non-blocking, KV
   send-state + diagnostics — so a flaky email provider never harms an order.
4. **Customer PII is in-scope** for these emails (recipient's own data), unlike
   operator alerts.
5. **Sender is `commerce.contact.from`; line items come from Stripe.** Settled
   from review: customer-facing email is configured by a provider-agnostic
   `commerce.contact` block (not the manual-only `fulfillment.from`, absent on the
   Printful stores), and renderable line items are **retrieved from Stripe at send
   time** rather than stored — Stripe is the source of truth, matching its receipt.
   A missing recipient email skips the send (with a diagnostic), never failing the
   order.

## Testing (per phase)

- **P2:** `completed` sends one confirmation (mock Resend); line items + variants
  render from a mocked Stripe `line_items` retrieval; idempotent under retry (no
  second send once `confirmation_sent_at` is set); send failure leaves the order
  outcome unchanged; **absent customer email → skip with a diagnostic, order
  unaffected**; content includes ship-to + order id; no send on
  `failed`/`processing`; no send when `commerce.contact.from` is unset.
- **P3:** a `package_shipped` event maps to the right order and sends one email;
  duplicate/multi-package events de-dupe; unknown/foreign orders are ignored;
  bad/unauthenticated webhook calls rejected.

## Slicing (handoff)

Three independently-shippable slices matching the phases: **P1** operator runbook
(could be a short ops doc + checklist), **P2** the confirmation email (one PR,
sits beside the slice-1 alert in `webhook.template.js`), **P3** Printful shipping
notifications (its own design pass first, then build). Same handoff/cross-review
model as item 22.
