---
type: Guide
title: Authoring Sites With Clodsite
description: How to use Clodsite to build or modify a site — collect intent, write build-plan.yaml, validate, build, deploy.
tags: [agents, authoring]
timestamp: 2026-06-26T00:00:00Z
---

# Agent Guide: Authoring Sites With Clodsite

Use this guide when you are asked to create or modify a website with Clodsite.
Your primary artifact is the site's `build-plan.yaml`, not generated HTML,
Nunjucks, CSS, or JavaScript.

## Core Model

Everything flows through:

```text
$SITES_DIR/<site-name>/build-plan.yaml
```

Before that file exists or changes, you and the site owner are deciding intent:
audience, message, pages, content, theme, metadata, assets, forms, and optional
commerce. After that file is valid, Clodsite's scripts deterministically compile
and deploy the site.

Do not edit generated artifacts as the normal way to change a site. Generated
files under `src/`, `dist/`, rendered Functions, and headers are compiler
output.

## Reading Order

1. Read [`authoring-build-plan.md`](authoring-build-plan.md) for the full plan
   contract, build commands, asset rules, commerce catalog shape, and component
   extension rules.
2. Read [`../components/CATALOG.md`](../components/CATALOG.md) immediately before
   authoring page components. It is generated from the current component schemas
   and is the source of truth for component fields.
3. Use [`THEMES.md`](THEMES.md) only when choosing or changing a theme.

## Create A New Site

1. Resolve the site name and site directory. The site name should be a slug:
   lowercase letters, numbers, and hyphens.
2. Gather or infer the site owner's intent. Accept briefs, notes, pasted copy,
   screenshots, existing sites, or an interview-style conversation.
3. Write a complete `$SITES_DIR/<site-name>/build-plan.yaml`.
4. Validate it:

   ```bash
   SITE_NAME=<site-name> bash scripts/validate-plan.sh
   ```

5. Fix validation errors in the plan and re-run validation until clean.
6. Build the site:

   ```bash
   for s in validate-plan write-site-json apply-theme render-templates \
            render-functions build-site render-headers render-redirects; do
     SITE_NAME=<site-name> bash scripts/$s.sh || { echo "BUILD FAILED at $s"; break; }
   done
   ```

7. Inspect generated output in `$SITES_DIR/<site-name>/dist/`. Do not start a
   blocking dev server just to check static output.
8. Deploy only when the user has approved the plan or explicitly asks to deploy.

## Modify An Existing Site

1. Read the existing `$SITES_DIR/<site-name>/build-plan.yaml`.
2. Preserve stable page IDs and navigation unless the requested change requires
   a route change.
3. Make the smallest plan change that satisfies the request.
4. Prefer structured components over prose workarounds when the catalog provides
   the right shape.
5. Present meaningful plan diffs when the change affects content, navigation,
   metadata, commerce, forms, or routing.
6. Validate, build, and inspect generated output.
7. Deploy only when asked.

The review surface is the plan. If a change causes broad generated diffs but a
small plan diff, that is usually good: the compiler is doing its job.

## Component Rules

- Use only component types listed in `components/CATALOG.md`.
- Do not invent layout fields such as columns, colors, spacing, alignment, or
  breakpoints. Components and themes own those decisions.
- Do not inject raw `<script>` tags or interactive HTML into `prose` as an
  escape hatch.
- If the catalog cannot express a needed interaction or structured pattern,
  propose or author a typed component instead.

## Assets And Metadata

- General assets live under `$SITES_DIR/<site-name>/assets/`.
- Commerce assets live under `$SITES_DIR/<site-name>/commerce/assets/`.
- Favicons are auto-detected under `$SITES_DIR/<site-name>/assets/favicons/`.
- Reference local assets by site-root paths such as `/assets/hero.jpg`.
- Root-relative social images become absolute when `custom_domain` is set.

## Not-Found (404) Page

- Every site automatically gets a generated `404.html` with the site's chrome, a
  "page not found" message, and links back to every nav page. Unknown URLs then
  return an honest `404` instead of silently serving the home page. No authoring
  is required for this default.
- To customize it, add a top-level `not_found` block to `build-plan.yaml` with an
  optional `title` and a `components` array drawn from the normal catalog:

  ```yaml
  not_found:
    title: This page wandered off
    components:
      - type: hero
        heading: Nothing here
        markdown: |
          The page you wanted could not be found.
      - type: call-to-action
        heading: Back on track
        markdown: |
          Head back to a page that exists.
        actions:
          - label: Go home
            href: /
            style: primary
  ```

- The not-found page is always `noindex` and is never listed in `pages` or
  `nav`. The `catalog`, `personalized-product`, and `certificate-award`
  components are not allowed on it (they need commerce/proxy wiring the 404 slot
  has no use for).

## Redirects

- When a page is renamed or retired, send its old URL somewhere with a real HTTP
  redirect instead of letting it fall through to the 404. Add a top-level
  `redirects` block to `build-plan.yaml`:

  ```yaml
  redirects:
    - from: /old-pricing      # the path visitors still request
      to: /pricing            # origin-relative path, or an https:// URL
    - from: /promo
      to: https://example.org/landing
      status: 302             # optional; default 301
  ```

- `from` is a literal origin-relative path (no `*`/`:` patterns in v1). `to` is
  an origin-relative path or an `https://` URL. `status` defaults to `301`
  (permanent); `302`/`303`/`307`/`308` are also allowed.
- A `from` that matches a real page route (e.g. `/` or `/pricing/`) is rejected —
  the page would shadow the redirect. Use redirects only for paths the site does
  *not* serve as pages; genuinely unknown paths still hit the generated 404.

## Commerce And Forms

- `contact.enabled: true` with `email` adds a site-wide footer mailto link.
- `mailto-form` uses the visitor's email client and has no backend.
- `resend-form` requires a verified sender and deploy-time Resend secret; optional
  Turnstile protection is provisioned during deploy.
- `catalog` can render display-only products from `commerce/catalog.json`.
- Live checkout requires the top-level commerce configuration and deploy-time
  Stripe/KV provisioning.
- `commerce.contact: { from, reply_to? }` opts a live store into a store-branded
  order-confirmation email (sent to the customer once fulfillment succeeds,
  supplementing Stripe's payment receipt). `from` must be a Resend-verified
  sender; deploy requires `RESEND_API_KEY` when set. This is separate from
  `commerce.fulfillment` (the manual provider's merchant-facing order email).

### Resend sender addresses

Resend's free tier verifies **one domain**; today that's `mastertimewaster.com`.
Every `from` address across sites — `resend-form`, `commerce.fulfillment.from`,
`commerce.contact.from` — must live on that domain (or whichever verified
domain is current) until a site earns its own.

Convention: **`<site-slug>[-<qualifier>]@mastertimewaster.com`** — the site's
slug, optionally suffixed with what the address is for. Examples:
`anchovy-mug-orders@mastertimewaster.com`, `bbpp-contact@mastertimewaster.com`.
This keeps every sender visibly tied to its site without requiring a new
verified domain per site.

`reply_to` and any human-facing `to` address (e.g. `commerce.fulfillment.to`)
are not sender addresses and are not bound by this — they can be wherever a
human actually reads mail.

### Per-site credentials and Stripe mode

By default the canonical env vars (`STRIPE_SECRET_KEY`, `PRINTFUL_API_KEY`,
`RESEND_API_KEY`) are read by their bare names. When two sites need different
keys or modes, declare *which* env var supplies each — names only, never values:

```yaml
commerce:
  checkout:
    provider: stripe
    mode: live            # selects STRIPE_SECRET_KEY_LIVE (test → _TEST)
    success_url: /success/?session_id={CHECKOUT_SESSION_ID}
    cancel_url: /
  printful:
    api_key_env: ANCHOVY_PRINTFUL_API_KEY   # → PRINTFUL_API_KEY for this store
    store_id: 17828143
    products: [ ... ]
```

- `commerce.checkout.mode` makes test↔live a one-line plan edit visible in a
  diff, instead of swapping a key in the shared `.env`. Keep both
  `STRIPE_SECRET_KEY_TEST` and `STRIPE_SECRET_KEY_LIVE` in the environment.
- `resend-form` takes an optional `api_key_env` (site-scoped: all forms must
  agree) binding a source → `RESEND_API_KEY`.
- The deploy verifies the selected source exists and (for Stripe) that the key's
  prefix matches the declared mode before any live action. To preview what a
  site resolves to: `source scripts/resolve-env.sh <site>` (prints source names
  and mode, never values).

Keep secrets out of `build-plan.yaml`. Secrets belong in the deployment
environment, not source — the plan holds only the env-var **names**.
