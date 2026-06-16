# Authoring a Clodsite `build-plan.yaml`

Read this first. It tells you everything you need to author a site without
reading the engine's source. Pair it with `components/CATALOG.md` (the component
vocabulary). The contract you produce is one file:
`$SITES_DIR/<site-name>/build-plan.yaml`. Everything after it is deterministic
scripts — no further content decisions happen at build time.

## The shape of a plan

```yaml
slug: acme                      # site dir name (matches <site-name>)
name: Acme Co.                  # human-readable display name
overview: >-                    # one paragraph: purpose, audience, tone
  ...
style: minimal                  # minimal | professional | bold  → selects a theme
tone: friendly                  # professional | casual | technical | friendly
custom_domain: ""               # hostname only, or "" for none
head:                           # optional site-wide metadata defaults
  description: ...              # default search/social description
  image:                        # optional social image
    src: /assets/og.png         # site-root path or absolute https:// URL
    alt: ...
pages:
  - id: home                    # lowercase, hyphens only; unique
    title: Home
    head:                       # optional per-page description/image overrides
      description: ...
    components:                 # ORDERED list; renders top to bottom
      - type: hero
        # ...fields per the component's schema in CATALOG.md
nav:
  order: [home, about]          # must list every page id
contact:
  enabled: true
  email: hello@acme.example     # omit this key if enabled is false
headers:                        # optional Cloudflare Pages response headers
  - path: /*
    values: { X-Content-Type-Options: nosniff }
```

## Build and verify (exact commands)

From the Clodsite repo root, build the whole pipeline for a site:

```bash
for s in validate-plan write-site-json apply-theme render-templates \
         render-functions build-site render-headers; do
  SITE_NAME=<site-name> bash scripts/$s.sh || { echo "BUILD FAILED at $s"; break; }
done
```

- `validate-plan` runs first and rejects unknown components / malformed config —
  fix the plan and re-run.
- Verify output by reading the generated HTML in `$SITES_DIR/<site-name>/dist/`.
  Do **not** start a dev server to check — it blocks.
- First-time setup in a fresh checkout/worktree: run `npm install` in the repo
  root once, or `validate-plan` fails with `ERR_MODULE_NOT_FOUND`.

## Components

- Pages are **ordered arrays of typed components**. Use only types listed in
  `components/CATALOG.md`; the validator rejects anything else.
- `prose` is the default for textual content (GFM markdown). The other
  components are constrained — they accept only the fields their schema lists; you
  do not control columns, colors, spacing, or layout.
- **Do not hand-write interactive HTML/JS or inject `<script>` into `prose` as an
  escape hatch.** `prose` is for prose. For behavior the catalog can't express,
  author a component (next section) — not raw code in content.

## Non-obvious behaviors (the things you'd otherwise have to discover)

- **Reskin = change `style`.** `minimal` / `professional` / `bold` select a
  built-in theme applied site-wide. Changing the visual look is a one-line edit;
  you never write CSS in the plan.
- **`catalog` renders display-only when there is no top-level `commerce:` block.**
  You can show products (image, name, price, description) with no checkout simply
  by providing `commerce/catalog.json` and using the `catalog` component. Add a
  `commerce:` block only when you want live Stripe checkout (which also needs
  deploy-time KV provisioning).
- **Prices in `commerce/catalog.json` are integer minor units** (e.g. `1600` =
  $16.00); currency defaults to `usd`.
- **Assets live with the site:** general images under `<site>/assets/`, product
  images under `<site>/commerce/assets/`, favicons auto-detected under
  `<site>/assets/favicons/`. Reference them by site-root path.
- **`contact.enabled: true` + `email`** renders a mailto in the footer site-wide.
- **`nav.order` must list every page id**; nav appears on every page.
- Root-relative social images become absolute when `custom_domain` is set.

## Extending the vocabulary (when the catalog can't express it)

If a request needs a shape no component covers — an interactive widget, a
structured layout the catalog lacks — **author a component**, do not inject raw
code into a page:

1. Create `components/<name>/` with `schema.json` (its fields + validation),
   `component.njk` (template), and `component.css` (styles). Interactive
   components may include their own script via the component's template/assets.
2. Regenerate the catalog reference: `bash scripts/generate-catalog-md.sh`.
3. Reference the new `type` from a page's `components` array and build.

The component stays a typed, validated, reusable contract — the same governance
every built-in component has. (Per-site "site-local" libraries are planned but
not yet available, so today a new component is added to the shared catalog.)
