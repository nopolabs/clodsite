---
type: Spec
title: "Per-Store Stripe Keys Design"
description: "Declarative per-site Stripe secret key binding so each store's checkout and webhook run on its own Stripe account, mirroring per-site Printful keys."
tags: ["secrets", "stripe", "commerce", "multi-tenant"]
status: draft
timestamp: 2026-06-29T00:00:00Z
---

# Per-Store Stripe Keys Design

**Date:** 2026-06-29
**Status:** Proposed
**Builds on:** [Declarative Per-Site Secret Binding](2026-06-26-per-site-env-layers-design.md) (item 12)
**Motivated by:** the June 2026 hmc-cycling.org fulfillment incident

---

## Summary

Per-site secret binding made the **Printful** key and the Stripe **mode**
per-site, but the Stripe **secret key** and **webhook secret** still resolve to a
single shared pair — `STRIPE_SECRET_KEY_{LIVE,TEST}` → `STRIPE_SECRET_KEY`. That
shared live key currently belongs to one Stripe account (`acct_…`, "Anchovy").
So **every live store shares one Stripe account**, which is wrong for operating
distinct businesses.

This proposes an optional declarative per-site Stripe key binding in
`build-plan.yaml`, exactly analogous to `commerce.printful.api_key_env`: the plan
names *which* env var supplies the store's Stripe key; the value stays in the
environment. When unset, behavior is unchanged (the shared key), so existing
single-account sites are unaffected.

## Problem

The June incident surfaced two faces of the same gap:

- **Stranded history.** hmc-cycling.org's pre-port orders were taken on HMC's own
  Stripe account. The clodsite registry's live key is a *different* account, so
  those sessions are unreachable from our tooling (`cs_live_…` → "No such
  checkout.session").
- **Wrong-account routing ahead.** The ported `hmc-next-gen` binds the shared
  `STRIPE_SECRET_KEY_LIVE`. Deployed live as-is, **HMC's payments would land in
  the Anchovy account.** The checkout function reads `context.env.STRIPE_SECRET_KEY`
  (`scripts/lib/commerce/checkout.template.js`); whatever single key deploy
  installed is the account every live store transacts on.

Printful already solved the multi-store version of this with `api_key_env`
(e.g. `HMC_PRINTFUL_API_KEY`). Stripe needs the same treatment.

## Design

Extend the existing declarative binding mechanism (resolved in the
`clodsite_resolve_bindings` chokepoint) to the Stripe key.

**Plan surface** — add one optional field under `commerce.checkout`:

```yaml
commerce:
  checkout:
    provider: stripe
    mode: live                      # unchanged: selects _LIVE vs _TEST
    secret_key_env: HMC_STRIPE_SECRET_KEY   # NEW, optional, per-site base name
```

**Resolution** — mirror the mode suffixing already used for the shared key:

- `secret_key_env` set → resolve `<secret_key_env>_<MODE>` (e.g.
  `HMC_STRIPE_SECRET_KEY_LIVE`) → install as the site's `STRIPE_SECRET_KEY`.
- `secret_key_env` unset → resolve the shared `STRIPE_SECRET_KEY_<MODE>` as today.

This keeps the test↔live switch declarative and per-site, and makes the *account*
per-site too. The webhook secret (`STRIPE_WEBHOOK_SECRET`) is provisioned per
site by `provision-stripe-webhook.sh`; once the secret key is per-site, that
provisioning **creates the endpoint on the correct account automatically** — no
new field needed, but provisioning must use the resolved per-site key.

**Validation** (split, as in the env-layers design):

- `validate-plan` checks `secret_key_env` *shape* only (env-var-name syntax) and
  stays runnable with no credentials.
- Deploy resolves the key and verifies **existence + mode shape**
  (`sk_live_…`/`sk_test_…` matches `mode`) before any live action — reuse the
  existing key-shape verifier.

**Account-change guard (incident-driven).** Record the resolved Stripe account
id in the site's deploy state. On deploy, if the account would change from the
last deploy, **refuse without an explicit confirm flag** — silently moving a
live store between Stripe accounts is exactly the footgun this incident is made
of (cf. [[deploy-stripe-mode-follows-env]]).

## Decisions

1. **Shared-key fallback stays for test/preview only.** A site without
   `secret_key_env` resolves the shared `STRIPE_SECRET_KEY_<MODE>` as today — kept
   for test-only sites like `clodsite-demo`. For **live** sites, `secret_key_env`
   becomes required once migration completes: deploy refuses a live store with no
   per-store key, so nothing can silently fall back to a shared live account.
   (Pre-1.0, internal only — see [[clodsite-no-backcompat]] — so the live sites
   are migrated deliberately in one pass, not broken incrementally.)
2. **Keep `metadata.site` fan-out filtering.** The webhook already ignores
   sessions not stamped for its own `SITE` (`webhook.template.js`). With separate
   accounts the cross-tenant risk drops, but sites that still share an account
   depend on it — keep it as defense in depth.
3. **Webhook account follows the key.** No separate account field; the resolved
   secret key is the single source of which account a store uses.

## Migration

### Target key set in the clodsite registry

Each commerce **business** gets its own Stripe account, named with a per-store
base (`<BASE>_STRIPE_SECRET_KEY`) resolved as `<BASE>_STRIPE_SECRET_KEY_<MODE>`.
End state in `~/.config/clodsite/env` — six keys across three accounts:

| Registry var (× `_LIVE` and `_TEST`) | Stripe account | Used by (`secret_key_env`) |
|---|---|---|
| `ANCHOVY_STRIPE_SECRET_KEY_{LIVE,TEST}` | Anchovy (existing, `acct_1ThEUGQ…`) | `anchovy`, `anchovy-mug` |
| `BBPP_STRIPE_SECRET_KEY_{LIVE,TEST}` | Big Beautiful Peace Prize (**new account**) | `bbpp` |
| `HMC_STRIPE_SECRET_KEY_{LIVE,TEST}` | HMC (its own account) | `hmc-next-gen` |

`anchovy-mug` shares the Anchovy account (same business). `clodsite-demo` is
test-mode + preview only and keeps the shared `STRIPE_SECRET_KEY_TEST` default
(no dedicated account). The shared `STRIPE_SECRET_KEY_LIVE` is **retired** — after
migration no live store falls back to a shared account.

### Account actions
- **bbpp** — create a new Stripe account; capture its live **and** test keys.
- **hmc, anchovy** — roll fresh per-store keys in each existing account and
  retire the old shared live value (it has been broadly used and currently backs
  every live store).

### Per-site plan changes
Set `commerce.checkout.secret_key_env`: `anchovy` / `anchovy-mug` →
`ANCHOVY_STRIPE_SECRET_KEY`; `bbpp` → `BBPP_STRIPE_SECRET_KEY`; `hmc-next-gen` →
`HMC_STRIPE_SECRET_KEY`. Then re-provision each site's webhook (it lands on the
correct account automatically) and redeploy.

### Key type & permissions
The deploy shape-check accepts both **standard** (`sk_test_`/`sk_live_`) and
**restricted** (`rk_test_`/`rk_live_`) keys for the declared mode. Mint **both** a
live and a test key per account (Stripe modes are separate).

- **Standard secret keys** — simplest (full access); match what the functions
  assume today.
- **Restricted keys** (recommended, least privilege) — grant exactly the
  resources the pipeline touches, everything else **None**:
  - **Checkout Sessions — Write** — the checkout function creates sessions.
  - **Webhook Endpoints — Write** — deploy provisions the per-site endpoint; the
    webhook **signing secret** is created here and installed as a Pages secret
    (it is *not* stored in the registry).
  - **Checkout Sessions — Read** + **Events — Read** — for the Stripe⇄KV
    reconciliation in the
    [fulfillment-observability spec](2026-06-29-fulfillment-observability-design.md);
    grant now so keys minted today don't need re-rolling later.

  (Inline `price_data` checkout uses no Product/Price objects and the code issues
  no refunds, so no Products/Prices/Refunds permissions are required.)

### History
Pre-migration orders stay on whichever account originally captured them
(hmc-cycling.org's are on HMC's prior account) and are reconciled by hand — out
of scope here.

## Testing

- `validate-plan` unit tests: `secret_key_env` syntax accepted/rejected; no creds
  required.
- Resolution tests: `<base>_<MODE>` selection; fallback to shared when unset.
- Deploy guard: mode/shape mismatch errors; account-change refusal without the
  confirm flag.
