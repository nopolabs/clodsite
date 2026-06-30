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

## Phase 1 — Tune the Stripe receipt (operator, no code)

Each store now runs on its **own** Stripe account (item 21), so receipt identity
is per-store. Operator runbook: set, per account, the **business name**, **support
email + phone**, **logo**, and **brand color** (Stripe Dashboard → Settings →
Business / Branding; receipts are enabled under Customer emails). Acceptance: each
store's receipt shows that store's identity and support, not a personal default
(e.g. HMC's receipt currently shows `danrevel@gmail.com`).

This is the cheapest, highest-ratio improvement and unblocks judging how much
phase 2 needs to add.

## Phase 2 — Order-confirmation email (supplement)

**Trigger:** the webhook's **`state: completed`** transition (provider order
created), *not* payment. This is the deliberate payment-vs-fulfillment split:
Stripe's receipt = "paid" (instant); ours = "order placed & being made" (after
fulfillment), so we never confirm an order whose fulfillment failed.

**Transport & addressing:** reuse Resend. Recipient is
`session.customer_details.email`. From/reply-to is a per-store customer-facing
sender — reuse `commerce.fulfillment.from` (generalizing it) or add a
`commerce.contact`; **decide in implementation.**

**Content:** store voice; **our order id** (session id); items + variants;
subtotal/shipping/total; **ship-to address**; a fulfillment expectation
(made-to-order, ships in ~X, tracking to follow); support contact. Including the
customer's address is appropriate here — it's their own data sent to them (unlike
the operator alert in item 22, which omits PII).

**Reliability (mirror item 22 slice 1):**
- Resend **Idempotency-Key** per session; **non-blocking** — a send failure never
  fails or delays the order or the `200`/`500` response.
- Record send state on the `ORDERS` record (`confirmation_sent_at`) and **don't
  resend** on Stripe webhook retries; record diagnostics on failure.

Works for both providers (manual and printful both reach `completed`).

**Config:** opt-in per store (gated on a configured customer-facing sender),
deploy-time validation + Pages-secret push like the alert vars.

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

## Testing (per phase)

- **P2:** `completed` sends one confirmation (mock Resend); idempotent under
  retry (no second send once `confirmation_sent_at` is set); send failure leaves
  the order outcome unchanged; content includes ship-to + order id; no send on
  `failed`/`processing`.
- **P3:** a `package_shipped` event maps to the right order and sends one email;
  duplicate/multi-package events de-dupe; unknown/foreign orders are ignored;
  bad/unauthenticated webhook calls rejected.

## Slicing (handoff)

Three independently-shippable slices matching the phases: **P1** operator runbook
(could be a short ops doc + checklist), **P2** the confirmation email (one PR,
sits beside the slice-1 alert in `webhook.template.js`), **P3** Printful shipping
notifications (its own design pass first, then build). Same handoff/cross-review
model as item 22.
