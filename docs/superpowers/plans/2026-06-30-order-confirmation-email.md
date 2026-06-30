---
type: Plan
title: "Order-Confirmation Email — Implementation Plan (Phase 2)"
description: "Implementation plan for Phase 2 of the customer-order-emails design — a store-branded order confirmation sent on fulfillment success, supplementing Stripe's receipt."
tags: ["commerce", "email", "resend", "fulfillment", "handoff"]
status: accepted
timestamp: 2026-06-30T00:00:00Z
---

# Order-Confirmation Email — Implementation Plan (Phase 2)

**Date:** 2026-06-30
**Status:** Accepted — ready to implement
**Design:** [Customer Order Emails](../specs/2026-06-30-customer-order-emails-design.md) — **Phase 2**
**Builds on:** item 22 slice 1 (the webhook Resend-alert pattern), per-store Stripe keys (item 21)

> **Claude implements; Codex reviews.** Phase 1 (Stripe receipt tuning + the
> `NEXT-STEPS` checklist) shipped; Phase 3 (Printful shipping notifications) is a
> separate greenfield pass. This plan is **Phase 2 only**. Follow the `AGENTS.md`
> coordination checklist: pull `origin/main`, add an `In Flight` entry, work on a
> topic branch, land tests in the same PR. Codex will review — closest scrutiny
> on the webhook change (live order path) and the non-blocking/idempotency
> behavior.

## Handoff context

- **Context.** Stripe already emails the buyer a payment receipt. This adds a
  store-branded **order confirmation** that the receipt can't: ship-to address,
  our order id, and "in production / ships in ~X / tracking to follow." All the
  pivotal decisions are settled in the design spec (don't re-litigate them).
- **Decision.** Supplement, not replace. Send on the webhook's **`state: completed`**
  transition (fulfillment success), not on payment. One PR.
- **Branch.** `claude/order-confirmation-email`.
- **Deployment impact.** Touches the live webhook (real order path) — additive and
  non-blocking, exactly like the slice-1 alert. A send failure must never change
  the order outcome or the `200`/`500` response.
- **Open questions (decide in the PR; all minor).** Plain-text vs. minimal HTML
  body (recommend plain text, matching the slice-1 alert); whether to include a
  link back to the site; `reply_to` wiring.

## Implementation map

**1. `commerce.contact` build-plan block** (the settled sender config).
```yaml
commerce:
  contact:
    from: orders@hmc-cycling.org       # required to enable the email
    reply_to: support@hmc-cycling.org  # optional
```
- `validate-plan.mjs`: allow `commerce.contact`, shape-check `from` (and
  `reply_to`) as email syntax — structural only, no credentials (mirror how
  `commerce.checkout.secret_key_env` is validated). It is **not**
  `fulfillment.from` (manual-provider/merchant config, absent on the Printful
  stores this serves).

**2. Render the contact into the webhook function.**
- `render-functions.mjs` `renderWebhook(...)` already substitutes `{{SITE}}` /
  `{{PROVIDER_ENV}}` / `{{CREATE_ORDER}}`. Add a `{{CONTACT}}` substitution
  carrying `{ from, reply_to }` from `plan.commerce.contact` (or `null` when
  unset). `commerce.contact.from` is a plan value, not a secret.

**3. Send on `completed`** — `scripts/lib/commerce/webhook.template.js`, in the
success branch right after the `completed` record is written (beside where
slice 1's alert hooks the failure branch):
- **Gate:** only when `CONTACT?.from` is set and `RESEND_API_KEY` is present, and
  the order isn't already `confirmation_sent_at`.
- **Recipient:** `session.customer_details.email`. **Absent → skip with a
  diagnostic on the record; never fail the order.**
- **Line items (source of truth = Stripe):** the webhook event's session has no
  line items, and `metadata`/KV hold none either. `fetch`
  `GET https://api.stripe.com/v1/checkout/sessions/{id}?expand[]=line_items` with
  `Authorization: Bearer ${STRIPE_SECRET_KEY}` (already bound to the Pages
  project; a restricted key's Checkout Sessions scope covers the read). Each
  line item's `description` already includes the variant ("… (Pink / L)").
  Totals/currency/`shipping_details`/email come from the session.
- **Body:** store voice; our order id (session id); items + variants;
  subtotal/shipping/total; ship-to address; fulfillment expectation; support
  contact. (Customer PII is fine — it's their own data.)
- **Reliability (mirror slice 1):** Resend with an `Idempotency-Key`
  (`commerce-confirmation:<site>:<session id>`); wrap the send in a 5s
  `AbortController` + try/catch; on any failure return the order outcome
  unchanged. On success, write `confirmation_sent_at` to the `ORDERS` record so
  Stripe webhook retries don't re-send.

**4. Deploy gate** — `scripts/deploy.sh`: extend the `NEEDS_RESEND` logic so a
commerce site with `commerce.contact.from` set requires `RESEND_API_KEY` (push
it, error clearly if missing) — same shape as the existing manual-provider and
alert-vars checks.

## Guardrails
- Do **not** change the `processing`/`completed`/`failed` transitions or the
  `500`-retry. The confirmation is purely additive on the success path.
- Non-blocking: the Stripe line-items fetch and the Resend send are both bounded
  and failure-swallowing; the order's `200` is never delayed or failed by them.
- Reuse the slice-1 alert send and the `resend-form` function as references; if a
  tiny shared Resend helper falls out naturally, fine, but not required.

## Tests (`webhook.test.mjs` + `run-tests.sh`)
- `completed` sends exactly one confirmation (mock Resend + a mocked
  `line_items` retrieval); body renders items + variants, ship-to, and order id.
- Idempotent: a retry after `confirmation_sent_at` is set sends nothing more.
- Send failure (non-2xx / throw / timeout) leaves the order `completed` and the
  response unchanged.
- **Absent `customer_details.email` → skip with diagnostic, order unaffected.**
- No send on `failed`/`processing`; no send when `commerce.contact.from` is unset.
- `validate-plan`: valid `commerce.contact` passes; bad email rejected.
- deploy: a `commerce.contact` site missing `RESEND_API_KEY` errors clearly;
  present → `RESEND_API_KEY` pushed.

## Out of scope
Phase 3 (Printful shipping notifications) — its own design pass, especially the
Printful webhook auth model. Don't start it here.
