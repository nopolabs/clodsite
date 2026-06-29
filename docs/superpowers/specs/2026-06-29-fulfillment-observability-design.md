---
type: Spec
title: "Fulfillment Observability and Alerting Design"
description: "Detect, surface, and alert on paid-but-unfulfilled commerce orders so a fulfillment failure can never sit silent again."
tags: ["commerce", "observability", "alerting", "ops", "reconciliation"]
status: draft
timestamp: 2026-06-29T00:00:00Z
---

# Fulfillment Observability and Alerting Design

**Date:** 2026-06-29
**Status:** Proposed
**Motivated by:** the June 2026 hmc-cycling.org fulfillment incident
**Related:** [Per-Store Stripe Keys](2026-06-29-per-store-stripe-keys-design.md), [[commerce-v1-status]]

---

## Summary

Two hmc-cycling.org orders (2026-06-11, 2026-06-22) were paid in Stripe but never
fulfilled at Printful, and went unnoticed for ~18 days. The **root cause** was the
old standalone worker (`nopolabs/hmc`): it marked the session processed and
returned `200` to Stripe *before* fulfilling, ran the Printful call in an
unawaited `ctx.waitUntil` with no error handling, and used a 30-day idempotency
TTL — so any Printful error produced a paid, unfulfilled order with retries
suppressed and no alert.

The current clodsite webhook (`scripts/lib/commerce/webhook.template.js`) already
fixes the **mechanism**: failures return `500` so Stripe retries, and a durable
(no-TTL) KV state machine records `processing`/`completed`/`failed` with
`last_error`. What is still missing is **visibility**: nothing tells a human when
an order ends up `failed`, when Stripe gives up retrying, or when a paid session
produced *no record at all* (webhook never ran / wrong account — the exact shape
that hid this incident). This spec adds that.

## Gaps (given the current state machine)

1. **No alert on failure.** A `failed` record with `last_error` sits in KV
   unseen; Stripe retries for ~3 days, then stops, and the order is silently lost.
2. **No operator audit.** There is no way to list orders and their fulfillment
   state across sites. `/status` reports *deploy* state, not *order* state.
3. **No detection of missing records.** KV-only visibility can't see a paid
   session that never reached the webhook (endpoint down, or charged on an
   account whose webhook isn't ours). That class leaves **no KV record** — and is
   precisely what happened in June.
4. **Logs evaporate.** Workers/Pages Functions logs retain only days, so
   post-hoc forensics is impossible after ~a week (the June logs were long gone).

## Design (layered, cheapest-first)

### 1. Alert on failure (immediate)
When the webhook writes `state: failed`, emit an operator alert (reuse the
existing Resend integration) to a configured operator address: site, session id,
attempts, `last_error.message`, and `provider_detail`. Also alert when a record
is `processing` past the stale threshold. This turns a silent KV write into a
push.

### 2. Order audit (on-demand)
A `/orders [site]` report (or an extension of `/status`) that reads each site's
`ORDERS` KV and lists orders by state, highlighting `failed` and stale
`processing`. A standing place to answer "is anything stuck?" — reads KV with the
operator token; no new storage.

### 3. Stripe ⇄ KV reconciliation (the real safety net)
A scheduled/on-demand job that, **per Stripe account**, lists recent paid
`checkout.session.completed` sessions and cross-checks them against that site's
KV `completed` set, flagging any **paid-but-not-completed** session. This is the
only layer that catches the *missing-record* class (gap 3) — it would have caught
both June orders the next day. Naturally becomes multi-account once
[per-store Stripe keys](2026-06-29-per-store-stripe-keys-design.md) land (iterate
the accounts the registry knows).

### 4. Durable logs via Logpush → R2 (forensic depth, optional)
Enable Logpush on commerce Pages projects to an R2 bucket so the webhook's
provider-response logging survives beyond the few-day Workers Logs window. Lowest
priority; reconciliation + `last_error` already cover the common cases.

## Ops

- **Operator alert address** configured once (registry env), shared across sites.
- **Reconciliation cadence:** a Cloudflare Cron Trigger or a clodsite scheduled
  routine, daily; on-demand variant for incident response.
- **Runbook for a failed/missing order:** read KV `last_error` → fix the cause
  (key, variant, address) → re-drive via Stripe "Resend" of the event (the state
  machine retries cleanly) or place the order manually, then mark reconciled.

## Decisions

1. **KV records stay durable (no TTL).** They are the audit trail; the old
   worker's 30-day TTL also erased the evidence. Keep the current no-TTL writes.
2. **Reconciliation is primary; alerting is immediate; audit is on-demand.**
   Alerting catches `failed`; reconciliation catches *everything paid*, including
   no-record cases. Build reconciliation even though alerting is cheaper.
3. **Reuse Resend for v1 alert transport.** A queue/webhook can come later;
   email to the operator is enough to break the silence.

## Testing

- Webhook failure path emits an alert (mock transport); no alert on `completed`.
- Reconciliation flags a seeded paid-session-with-no-`completed` record and
  ignores matched ones.
- Audit lists `failed`/stale `processing`/`completed` correctly from seeded KV.
