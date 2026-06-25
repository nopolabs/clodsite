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
            render-functions build-site render-headers; do
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

## Commerce And Forms

- `contact.enabled: true` with `email` adds a site-wide footer mailto link.
- `mailto-form` uses the visitor's email client and has no backend.
- `resend-form` requires a verified sender and deploy-time Resend secret; optional
  Turnstile protection is provisioned during deploy.
- `catalog` can render display-only products from `commerce/catalog.json`.
- Live checkout requires the top-level commerce configuration and deploy-time
  Stripe/KV provisioning.

Keep secrets out of `build-plan.yaml`. Secrets belong in the deployment
environment, not source.
