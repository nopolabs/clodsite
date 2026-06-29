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

1. **Fallback to the shared key is allowed.** Sites without `secret_key_env`
   behave exactly as today; per-store accounts are opt-in per site. (Pre-1.0,
   internal only — see [[clodsite-no-backcompat]] — but several live sites use
   the shared key, so a clean cutover means migrating them deliberately, not
   breaking them in this change.)
2. **Keep `metadata.site` fan-out filtering.** The webhook already ignores
   sessions not stamped for its own `SITE` (`webhook.template.js`). With separate
   accounts the cross-tenant risk drops, but sites that still share an account
   depend on it — keep it as defense in depth.
3. **Webhook account follows the key.** No separate account field; the resolved
   secret key is the single source of which account a store uses.

## Migration (hmc-next-gen)

1. Add `HMC_STRIPE_SECRET_KEY_{LIVE,TEST}` to the shared registry.
2. Set `commerce.checkout.secret_key_env: HMC_STRIPE_SECRET_KEY` in
   `hmc-next-gen/build-plan.yaml`.
3. Re-provision the webhook on HMC's account; redeploy.
4. Historical orders remain on HMC's prior account and are reconciled by hand —
   out of scope here (see the fulfillment-observability spec).

## Testing

- `validate-plan` unit tests: `secret_key_env` syntax accepted/rejected; no creds
  required.
- Resolution tests: `<base>_<MODE>` selection; fallback to shared when unset.
- Deploy guard: mode/shape mismatch errors; account-change refusal without the
  confirm flag.
