# Declarative Per-Site Secret Binding Design

**Date:** 2026-06-26
**Status:** Proposed
**Roadmap entry:** Per-site environments and credential layers (pending item 12)

---

## Summary

The repo `.env` is shared by every site in `SITES_DIR`, so a site cannot carry
its own provider credentials or its own Stripe mode without editing the file
every other site's deploy reads. That shared mutation is the root cause of two
real failures:

- **The Stripe-mode footgun** — switching one site between test and live means
  swapping `STRIPE_SECRET_KEY` in the shared file, which silently changed
  hmc-cycling.org's mode during an unrelated deploy (`[[deploy-stripe-mode-follows-env]]`).
- **Multi-store Printful** — one `PRINTFUL_API_KEY` can't serve two stores; the
  interim workaround (PR #72) is exporting a prefixed value by hand.

Instead of an out-of-band per-site `.env` overlay (the earlier draft of this
design), make site-scoped secrets **first-class and declarative in
`build-plan.yaml`**: the plan names *which* environment variable supplies each
provider credential, and (for Stripe) *which mode* to bind. The committed plan
becomes the source of truth for the binding; the secret **values** stay in the
environment and never enter the plan. Deploy/sync resolve through the
declaration, **validate the resolved key exists and has the right shape before
any live action**, and report the secret **name** (never the value) in
`NEXT-STEPS.md`.

This removes the failure class rather than catching it after the fact: with both
keys present in the environment and the plan selecting one, there is nothing to
swap and nothing to mismatch.

## Current state (after PR #72)

PR #72 made **caller-exported variables win over the repo `.env`**
(`clodsite_load_env` snapshots already-set keys, sources `.env`, restores them),
and routed `deploy.sh` through that loader. The interim per-site workflow is to
export a prefixed value (`PRINTFUL_API_KEY="$ANCHOVY_PRINTFUL_API_KEY"`) before
running a command. This design keeps that contract for the **source** variables
and replaces the manual choreography with a declared binding.

## The model

One idea — declarative secret binding in `build-plan.yaml` — in two shapes.

### 1. General alias (multi-credential providers)

The plan names the env var that supplies a provider credential; the tooling
binds it to the canonical name the deploy and generated Functions consume.

```yaml
commerce:
  provider: printful
  printful:
    api_key_env: ANCHOVY_PRINTFUL_API_KEY   # → resolved into PRINTFUL_API_KEY
    store_id: 17828143
    products: [ ... ]
```

`resend-form` gains the same optional `api_key_env` for `RESEND_API_KEY`. When
no alias is declared, the canonical bare name (`PRINTFUL_API_KEY`,
`RESEND_API_KEY`) is read straight from the environment — single-site setups are
unchanged.

### 2. Stripe mode binding (test/live duality)

Keep **both** Stripe keys in the environment permanently and let the plan pick:

```yaml
commerce:
  checkout:
    provider: stripe
    mode: live          # selects STRIPE_SECRET_KEY_LIVE → STRIPE_SECRET_KEY
    success_url: /success/?session_id={CHECKOUT_SESSION_ID}
    cancel_url: /
```

`mode: live` binds `STRIPE_SECRET_KEY_LIVE`; `mode: test` binds
`STRIPE_SECRET_KEY_TEST`; both into the canonical `STRIPE_SECRET_KEY` that
deploy, webhook provisioning, and the checkout Function read. Switching a site
test↔live is a **one-line plan edit visible in a diff/PR**, never a shared-file
mutation. When `mode` is omitted, the canonical `STRIPE_SECRET_KEY` is read
straight from the environment (back-compat).

### The inversion this introduces

Today `clodsite_stripe_mode` *derives* mode from whichever single key is in
`.env`. With both keys present that is impossible — so **mode becomes declared
and selects the key**, and `clodsite_stripe_mode`'s role flips from "report what
the key is" to "**verify** the selected key matches the declared mode." Intent
leads; the binding follows.

## Resolution & precedence

A binding step (a small helper invoked at the start of the site-scoped
pipeline, before deploy/build/sync consume secrets) resolves each declared
binding and assigns the canonical consumed variable:

- The **source** variable (`STRIPE_SECRET_KEY_LIVE`, `ANCHOVY_PRINTFUL_API_KEY`)
  is read through normal env loading, so #72's exported-wins and item 11a's
  global sources still apply to it.
- The **canonical** variable is then *set from* the resolved source. When a
  binding is declared, the binding is authoritative for the canonical name (it
  is a deliberate, committed selection); when none is declared, the canonical
  name is read straight from the environment — preserving #72's behavior and the
  legacy single-site path exactly (the #72 regression test, which declares no
  binding, is unaffected).

This is the one precedence decision reviewers should confirm: **a declared
binding overrides an ambient value of the canonical name, while the source it
reads from still honors #72.**

## Validation (before any live action)

`validate-plan` (or a pre-deploy check it feeds) enforces, with no secret values
printed:

- **Existence** — every referenced source variable (`api_key_env` target, or the
  mode-selected `STRIPE_SECRET_KEY_<MODE>`) is set and non-empty. A missing one
  is a hard error naming the expected variable: *"commerce.checkout.mode is
  `live` but STRIPE_SECRET_KEY_LIVE is not set."*
- **Shape (belt and suspenders)** — even though `mode` selects the key, still
  assert the resolved Stripe key carries the matching prefix:
  `live` ⇒ `sk_live_` / `rk_live_`, `test` ⇒ `sk_test_` / `rk_test_`. A
  `mode: live` bound to an `sk_test_…` value is rejected before deploy. This
  catches a mis-populated registry (someone pasted the test key into
  `STRIPE_SECRET_KEY_LIVE`) that the convention alone would trust.
- **Field validity** — `mode ∈ {test, live}`; `api_key_env` is a syntactically
  valid env-var name (`^[A-Za-z_][A-Za-z0-9_]*$`).

Because this runs at validate time, `/deploy` cannot reach Cloudflare/Stripe
with a missing or wrong-shaped key.

## Build-plan fields (grounded in the current schema)

- `commerce.checkout.mode` — optional, `test`|`live`. Added to the existing
  `commerce.checkout` allow-set (`provider`, `success_url`, `cancel_url`).
- `commerce.printful.api_key_env` — optional env-var name. Added to the
  `commerce.printful` block.
- `resend-form` component (or its plan config) — optional `api_key_env` for
  `RESEND_API_KEY`.
- All optional; omitting them preserves today's bare-name behavior.

## Reporting (`NEXT-STEPS.md` + resolve-env.sh)

- `NEXT-STEPS.md` and deploy output show, per secret, the **resolved source
  name** and (for Stripe) the mode — e.g. *"Stripe: live (from
  STRIPE_SECRET_KEY_LIVE)"*, *"Printful: from ANCHOVY_PRINTFUL_API_KEY"* — never
  the value.
- A sourceable `scripts/resolve-env.sh <site>` resolves a site's bindings into
  the current shell for manual/agent use and prints the same name/mode report.
  It must be `source`d (it mutates env); run in a subshell it prints a hint.

## Security

- Secrets live only in the environment (repo `.env` as a flat registry of named
  credentials, exported vars, or item 11a's global file) — the build-plan holds
  **names only**, honoring "no secrets in build-plan.yaml."
- No new gitignore rules: the registry is the repo `.env`, already ignored. (If
  the optional per-site value file is ever reintroduced, both repos already
  ignore `.env` at any depth — asserted by a test, not assumed.)
- Test isolation: `install_controlled_test_env` already unsets the real provider
  keys; binding tests set a controlled registry in the temp env.

## `/setup`

Collect both `STRIPE_SECRET_KEY_TEST` and `STRIPE_SECRET_KEY_LIVE` (and prompt
for provider keys), so the registry is complete and a site can be flipped by
plan edit alone. Keep accepting a single `STRIPE_SECRET_KEY` for the
no-mode/back-compat path.

## Migration

The interim prefixed-export workflow keeps working (no binding declared → bare
name → #72 exported-wins). Migration is per multi-key site:

- **hmc-next-gen** — put `STRIPE_SECRET_KEY_TEST` and `STRIPE_SECRET_KEY_LIVE`
  in the registry, set `commerce.checkout.mode: live` in its plan. Its deploys
  are pinned to live by the committed plan; the footgun is gone for that site.
- **anchovy-mug** — set `commerce.printful.api_key_env: ANCHOVY_PRINTFUL_API_KEY`
  and put that key in the registry, retiring the manual export.

## Testing

- Binding/resolution: `mode: live` selects `STRIPE_SECRET_KEY_LIVE`;
  `api_key_env` selects the named Printful key into `PRINTFUL_API_KEY`; no
  binding → bare name (the #72 path) is unchanged.
- Validation: missing selected var rejected with its name; `mode: live` + an
  `sk_test_` value rejected (shape check); bad `mode`; malformed `api_key_env`.
- Reporting: NEXT-STEPS/resolve-env show the source name + mode and **not** the
  value (assert the secret string is absent from output).

## Follow-ups / relationship to item 11a

Item 11a generalizes where the **registry** comes from (exported vars →
`CLODSITE_ENV` → repo `.env` → `~/.config/clodsite/env`). This design sits on
top: the plan declares bindings, 11a resolves the named values from wherever the
operator keeps them. Building #12 first is fine; 11a later swaps the value
source without touching the declaration model. The earlier per-site `.env`
overlay idea is dropped in favor of this declarative model — one secrets
convention, committed and validated, instead of two files and shell choreography.
