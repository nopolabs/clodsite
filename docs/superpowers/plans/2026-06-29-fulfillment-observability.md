---
type: Plan
title: "Fulfillment Observability — Implementation Plan"
description: "Sliced implementation plan + handoff for fulfillment alerting, order audit, and Stripe⇄KV reconciliation (item 22)."
tags: ["commerce", "observability", "alerting", "reconciliation", "handoff"]
status: shipped
timestamp: 2026-06-29T00:00:00Z
---

# Fulfillment Observability — Implementation Plan

**Date:** 2026-06-29
**Status:** Shipped — all three slices merged (PRs #100, #101, #103)
**Design:** [Fulfillment Observability and Alerting](../specs/2026-06-29-fulfillment-observability-design.md) (ROADMAP item 22)
**Builds on:** per-store Stripe keys (item 21, shipped) — each commerce site now
runs on its own Stripe account with restricted keys.

> **Handoff note.** This is offered to **Codex** to implement. Codex reviewed the
> design spec (clodsite PR #96), so the shape is familiar. Follow the
> coordination checklist in [`AGENTS.md`](../../../AGENTS.md): pull `origin/main`
> first, add an `In Flight` entry, work on a topic branch, keep durable rules in
> docs, land tests in the same PR. Claude will adversarially review each PR
> (especially the webhook change and the reconciliation enumeration).

## Handoff context

- **Context:** Two hmc-cycling.org orders were paid but never fulfilled and went
  unnoticed for ~18 days. The webhook state machine already *fixed the mechanism*
  (failures `500` → Stripe retries; durable `processing/completed/failed` KV with
  `last_error`). The missing piece is **visibility** — nothing surfaces a stuck
  or never-recorded order. This plan adds that.
- **Decision:** Build it in **three independently-shippable slices, in order**
  (alerting → audit → reconciliation), smallest/safest first. One PR per slice.
- **Branch:** suggest `codex/fulfillment-alerting`, then `codex/fulfillment-audit`,
  then `codex/fulfillment-reconciliation`.
- **Deployment impact:** Slice 1 changes the live webhook (real money path) —
  treat as highest risk. Slices 2–3 are read-only operator tooling.
- **Open questions:** operator alert address (new registry var vs reuse an
  existing one); audit as a new `/orders` command vs an extension of `/status`.
  Decide in the respective PR; flag in the PR description.

## Why sliced

The three pieces have very different risk and dependencies. Slicing keeps the
risky webhook edit isolated, lets each ship and get reviewed on its own, and
avoids one large hard-to-review PR. **Do them in order**; later slices assume the
earlier ones exist but don't block on perfection.

---

## Slice 1 — Failure alerting (highest risk, smallest change)

**Goal:** when the webhook records `state: failed`, push an operator alert (email
via the existing Resend integration) so a silent KV write becomes a notification.

**Approach**
- In `scripts/lib/commerce/webhook.template.js`, on the failure path only, send an
  alert with site, session id, attempts, `last_error.message`, `provider_detail`.
- **Throttle** (required — Stripe retries the same failure repeatedly): store
  `alerted_at` / `alert_count` on the same `ORDERS` record; send only on the first
  failure or after a backoff window (≥ 6h). A `completed` write clears it. Apply
  the same once-per-window rule to stale-`processing`.
- Reuse the Resend send path the `resend-form` function already uses as the
  reference. Operator address from a registry env var.

**Guardrails**
- The alert is **additive** — it must never change or block the existing
  `processing/completed/failed` transitions or the `500`-retry response. If the
  alert send fails, the order outcome is unaffected.
- Don't regress the existing `webhook.test.mjs` state-machine assertions.

**Tests** (`scripts/lib/commerce/webhook.test.mjs`): failure emits one alert
(mock transport); no alert on `completed`; repeated failures within the window
send once and bump `alert_count`; a failure after the window re-alerts.

---

## Slice 2 — Order audit (read-only, low risk)

**Goal:** a standing way to answer "is anything stuck?" — list orders by state
across sites, highlighting `failed` and stale `processing`.

**Approach**
- A read-only report — either a new `/orders [site]` command or an extension of
  `/status` (decide in the PR; `/status` already cross-references site state, so
  extending it may be the smaller footprint).
- Enumerate sites under `SITES_DIR`; for each commerce site, read its `ORDERS` KV
  namespace (operator Cloudflare token) and print a state table.
- No new storage; the KV records are the source of truth (durable, no TTL).

**Tests:** seed KV-shaped fixtures and assert the report groups/highlights
`failed` + stale `processing` correctly; mock the KV list/get calls.

---

## Slice 3 — Stripe ⇄ KV reconciliation (the safety net; most subtle)

**Goal:** catch the *missing-record* class — a paid session that produced **no**
`completed` KV record (webhook never ran / wrong account). This is the only layer
that would catch a silent loss regardless of cause.

**Approach (enumeration model — implement exactly this)**
1. Scan every site `build-plan.yaml` under `SITES_DIR`. For each commerce site,
   resolve its Stripe key the way deploy does — `commerce.checkout.secret_key_env`
   + `mode`, shared-key fallback when unset (reuse `build-plan.mjs`
   `stripe-secret-key-env` / `secret-bindings`).
2. **Group sites by resolved account** and query each distinct account **once**
   (anchovy + anchovy-mug share one; pre-migration sites may share the default).
3. Per account, list recent paid `checkout.session.completed` sessions and
   **filter by `metadata.site`**, checking each only against *its own* site's
   `ORDERS` KV — shared-account sites must not flag each other's orders.
4. Flag any paid session whose `metadata.site` names a site but has no `completed`
   record for that site.

**Guardrails**
- **No silent caps.** If anything bounds coverage (top-N sessions, an account
  skipped for a missing key, pagination cut short), `log()` it. A reconciliation
  that says "all clear" while silently skipping an account is worse than none —
  this is the failure mode to avoid above all.
- Restricted keys already carry the needed scopes from item 21: **Checkout
  Sessions** (Write ⊇ Read) and **Events: Read**. No new key permissions.

**Tests:** a seeded paid-session-with-no-`completed` is flagged; a matched one is
ignored; two sites sharing an account don't cross-flag (metadata.site); account
de-duplication groups correctly; a site whose key is missing is reported, not
skipped silently.

---

## Out of scope (optional follow-up)

Slice 4 — **Logpush → R2** for durable webhook logs (forensic depth beyond the
few-day Workers Logs window). Lowest priority; `last_error` + reconciliation cover
the common cases. Defer unless the others land and there's appetite.

## Review

Claude will review each PR; expect the closest scrutiny on **Slice 1** (the live
webhook state machine) and **Slice 3** (enumeration correctness + the no-silent-caps
rule). Adversarial review of "does reconciliation ever report all-clear while
missing a paid session?" is the key question for Slice 3.
