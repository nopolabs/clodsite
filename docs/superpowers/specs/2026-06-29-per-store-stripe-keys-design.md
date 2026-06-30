---
type: Spec
title: "Per-Store Stripe Keys Design"
description: "Declarative per-site Stripe secret key binding so each store's checkout and webhook run on its own Stripe account, mirroring per-site Printful keys."
tags: ["secrets", "stripe", "commerce", "multi-tenant"]
status: shipped
timestamp: 2026-06-29T00:00:00Z
---

# Per-Store Stripe Keys Design

**Date:** 2026-06-29
**Status:** Implemented (clodsite #97; all four commerce sites migrated and verified live)
**Builds on:** [Declarative Per-Site Secret Binding](2026-06-26-per-site-env-layers-design.md) (item 12)
**Surfaced by:** investigating the June 2026 hmc-cycling.org incident — a latent defect *distinct* from that incident's root cause (see [Fulfillment Observability](2026-06-29-fulfillment-observability-design.md))

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

Investigating the June incident surfaced two faces of the same gap:

- **Stranded history.** hmc-cycling.org's pre-port orders were taken on HMC's own
  Stripe account. The clodsite registry's live key is a *different* account, so
  those sessions are unreachable from our tooling (`cs_live_…` → "No such
  checkout.session").
- **Wrong-account routing ahead.** The ported `hmc-next-gen` binds the shared
  `STRIPE_SECRET_KEY_LIVE`. Deployed live as-is, **HMC's payments would land in
  the Anchovy account.** The checkout function reads `context.env.STRIPE_SECRET_KEY`
  (`scripts/lib/commerce/checkout.template.js`); whatever single key deploy
  installed is the account every live store transacts on.

**This account gap did not cause the June unfulfillment.** Those orders failed
inside the old `nopolabs/hmc` worker's fulfillment path — correctly on HMC's own
account — and were lost silently (the root cause; see the
[fulfillment-observability spec](2026-06-29-fulfillment-observability-design.md)).
The investigation merely exposed that clodsite's shared key points elsewhere,
which strands that history and would misroute *future* HMC payments.

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

**Account-change guard (incident-driven).** Mechanics:

1. After resolving the key, fetch its account id: `GET /v1/account` → `id`
   (e.g. `acct_…`).
2. Compare to `account_id` stored in the site's `.stripe-webhook-state.json`
   (the same state file `provision-stripe-webhook.sh` already maintains).
3. **First deploy / no recorded `account_id`** (incl. pre-migration state):
   record the id and proceed — there is nothing to change *from*.
4. **`account_id` present and unchanged:** proceed.
5. **`account_id` present and different:** **abort the deploy** unless
   `CLODSITE_ALLOW_STRIPE_ACCOUNT_CHANGE=1` is set, then record the new id.

The check runs before webhook provisioning (so we never create an endpoint on
the wrong account). Silently moving a live store between Stripe accounts is
exactly the footgun this guards (cf. [[deploy-stripe-mode-follows-env]]).

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

**Use restricted keys (`rk_…`).** We are minting/rolling all six keys in this
migration, so the least-privilege posture costs nothing extra, and the deploy
shape-check already accepts the `rk_test_`/`rk_live_` prefixes — no code change.
A restricted key bounds a leaked key to "create checkout sessions + manage this
site's webhook"; a standard `sk_` key can issue refunds, move money, and read all
customer/payment data — a far larger blast radius given the key lives in the
shared registry, each Pages project, and the deploy path, across three
businesses.

Grant exactly these scopes (verified against the code), everything else **None**:

| Scope | Required by |
|---|---|
| **Checkout Sessions — Write** | checkout function `POST /v1/checkout/sessions` (`checkout.template.js`) |
| **Webhook Endpoints — Write** | `provision-stripe-webhook.sh` does GET/list/POST/DELETE on `/v1/webhook_endpoints` at deploy (Stripe "Write" includes the reads); the signing secret it returns is installed as a Pages secret, **not** stored in the registry |
| **Connect → Accounts — Read** | the deploy-time account-change guard reads `GET /v1/account` for the account id. Dashboard location is **Connect → Accounts** (Read); the API id is `accounts_kyc_basic_read` (a.k.a. "Basic Business Contact Information"). It is **not** under "Account" |
| **Checkout Sessions — Read** + **Events — Read** | Stripe⇄KV reconciliation in the [fulfillment-observability spec](2026-06-29-fulfillment-observability-design.md) — grant now so keys minted today don't need re-rolling |

Inline `price_data` checkout uses no Product/Price objects and the code issues no
refunds, so no Products/Prices/Refunds scopes are required. Mint **both** a live
and a test key per account (Stripe modes are separate). Missing scopes fail
*closed* — a `403` at deploy (webhook provisioning) or first checkout — so set the
full set at creation. Standard `sk_` keys still pass the shape-check as a
fallback if ever needed.

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

---

## Appendix — creating a restricted key (Stripe Dashboard)

Per account, and **once per mode** (the Test-mode toggle switches between the
live and test keyspaces):

1. **Developers → API keys → Create restricted key**.
2. Name it for the store + mode, e.g. `clodsite hmc (live)`.
3. Set these permissions; leave **everything else None**:
   - **Checkout Sessions → Write** (Write includes read, which covers
     reconciliation)
   - **Webhook Endpoints → Write**
   - **Connect → Accounts → Read** (the account-change guard's `GET /v1/account`;
     API id `accounts_kyc_basic_read` / "Basic Business Contact Information" — it
     is **not** under "Account")
   - **Events → Read**
4. **Create key**, reveal, and copy the `rk_live_…` / `rk_test_…` value.
5. Put it in `~/.config/clodsite/env` as `<BASE>_STRIPE_SECRET_KEY_<MODE>`
   (e.g. `HMC_STRIPE_SECRET_KEY_LIVE`, `HMC_STRIPE_SECRET_KEY_TEST`). Never commit
   it.

Repeat for **live and test** in each of the three accounts → the six keys in the
target table. For the new **bbpp** account, create the account first; both the
live and test keyspaces exist immediately. To verify a key before storing it:
`curl -s https://api.stripe.com/v1/account -H "Authorization: Bearer rk_…"`
returns the account `id` (also the value the account-change guard records). A
`Permission denied` here means the **Connect → Accounts** (Read) scope above is
missing.
