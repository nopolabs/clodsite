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
style: minimal                  # minimal | professional | bold | warm  → selects a theme
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

From the Clodsite repo root, build the local verification pipeline for a site:

```bash
for s in validate-plan write-site-json apply-theme render-templates \
         render-functions build-site render-headers render-redirects; do
  SITE_NAME=<site-name> bash scripts/$s.sh || { echo "BUILD FAILED at $s"; break; }
done
```

- `validate-plan` runs first and rejects unknown components / malformed config —
  fix the plan and re-run.
- Verify output by reading the generated HTML in `$SITES_DIR/<site-name>/dist/`.
  Do **not** start a dev server to check — it blocks.
- First-time setup in a fresh checkout/worktree: run `npm install` in the repo
  root once, or `validate-plan` fails with `ERR_MODULE_NOT_FOUND`.

For a real deploy, use the wrapper instead of reconstructing the pipeline:

```bash
SITES_DIR=/path/to/clodsite-sites bash scripts/build-deploy.sh <site-name> "reason for deploy"
```

`build-deploy.sh` runs validation, all render/build steps, deployment, and
finalization. Finalization writes `NEXT-STEPS.md` and commits the deployed site
snapshot to the sites repo when `SITES_DIR` is a git repo. Use the lower-level
`deploy.sh` and `deploy-finalize.sh` scripts directly only when debugging a
deploy failure or intentionally running a partial pipeline.

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

- **Reskin = change `style`.** `minimal` / `professional` / `bold` / `warm`
  select a built-in theme applied site-wide. Changing the visual look is a
  one-line edit; you never write CSS in the plan.
- **`catalog` renders display-only when there is no top-level `commerce:` block.**
  Provide `commerce/catalog.json` and use the `catalog` component to show products
  with no checkout (see "The commerce catalog" below). Add a `commerce:` block only
  for live Stripe checkout (which also needs deploy-time KV provisioning).
- **Live commerce supports two shipping price shapes.** Use either a single
  `shipping.flat_rate_minor`, or item-count shipping with
  `shipping.base_rate_minor` plus `shipping.per_additional_item_minor`. Do not
  mix both shapes in one plan.
- **Secrets stay out of plans.** Clodsite v1 assumes one trusted operator
  `.env` for Cloudflare, Stripe, Resend, and provider API keys. A site may select
  provider resources through plan fields such as `commerce.printful.store_id`,
  but must not contain secret values. Per-site secret overlays are not part of
  v1.
- **Assets live with the site:** general images under `<site>/assets/`, product
  images under `<site>/commerce/assets/`, favicons auto-detected under
  `<site>/assets/favicons/`. Reference them by site-root path.
- **`contact.enabled: true` + `email`** renders a mailto in the footer site-wide.
- **`nav.order` must list every page id**; nav appears on every page.
- Root-relative social images become absolute when `custom_domain` is set.

## The commerce catalog (`commerce/catalog.json`)

Products are defined in `<site>/commerce/catalog.json`. The top-level shape is
`{ "products": [ ... ] }`. Each product:

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | `[A-Za-z0-9][A-Za-z0-9_-]*`, unique |
| `name` | yes | non-empty string |
| `description` | yes | non-empty string |
| `price_minor` | yes | non-negative **integer minor units** (`1600` = $16.00; currency defaults to `usd`) |
| `active` | yes | boolean |
| `size` | no | short fixed spec label shown as catalog metadata, e.g. `"12 oz"`, `"500 ml"`, `"Set of 4"` (not a selectable option) |
| `images.main` | no | local path — `commerce/assets/…` or a site-root `/…` (no URLs). Omit `images` entirely for an image-less display listing |
| `images.gallery` | no | array of local paths |
| `options`, `variants` | no | **omit for display-only**; needed only for live checkout with variant choices |
| `size_guide`, `personalization` | no | advanced; see the commerce design spec |

Minimal display-only catalog:

```json
{
  "products": [
    {
      "slug": "ridgeline-blend",
      "name": "Ridgeline Blend",
      "description": "Everyday cup: balanced, smooth, a little chocolatey. 12 oz whole-bean bag.",
      "price_minor": 1600,
      "active": true,
      "images": { "main": "commerce/assets/ridgeline-blend.svg" }
    }
  ]
}
```

Minimal live-commerce shipping examples:

```yaml
commerce:
  enabled: true
  provider: manual
  currency: usd
  checkout:
    provider: stripe
    success_url: /success/?session_id={CHECKOUT_SESSION_ID}
    cancel_url: /
  shipping:
    flat_rate_minor: 500
    countries: [US]
```

```yaml
commerce:
  enabled: true
  provider: printful
  currency: usd
  checkout:
    provider: stripe
    success_url: /success/?session_id={CHECKOUT_SESSION_ID}
    cancel_url: /
  shipping:
    base_rate_minor: 475
    per_additional_item_minor: 220
    display_name: Standard Shipping
    countries: [US]
    delivery_estimate:
      minimum: { unit: business_day, value: 5 }
      maximum: { unit: business_day, value: 10 }
```

`checkout.success_url` and `checkout.cancel_url` are site-root-relative paths.
`success_url` must include `{CHECKOUT_SESSION_ID}` so Stripe returns a session
marker and Clodsite can clear the cart on the success page. Use a page such as
`/success/` for a clear post-purchase acknowledgement. Pages omitted from
`nav.order` are still built, which is the right shape for utility pages like
checkout success pages.

Personalized products are buy-now products that require an opaque token from an
external system. The `personalization.url` is an origin-relative artwork URL
template; checkout verifies `HEAD <url>` before creating a Stripe session and
passes the resolved URL to the fulfillment provider. For Printful, that URL is
attached as the order item artwork file:

```json
{
  "slug": "custom-peace-prize-mug",
  "name": "Custom Peace Prize Mug",
  "description": "An 11 oz mug printed with your issued Big Beautiful Peace Prize artwork.",
  "price_minor": 2500,
  "active": true,
  "size": "11 oz",
  "images": { "main": "commerce/assets/bbpp-seal.png" },
  "variants": [{ "optionValues": {}, "fulfillment_ref": "variant:1320" }],
  "personalization": {
    "required": true,
    "url": "/parchment/mug/{id}"
  }
}
```

For ordinary synced Printful products, `fulfillment_ref` is the
`sync_variant_id`. For made-to-order Printful products that supply their own
artwork at order time, use `variant:<catalog-variant-id>` so the provider sends
`variant_id` plus the personalization artwork file.

## Extending the vocabulary (when the catalog can't express it)

If a request needs a shape no component covers — an interactive widget, a
structured layout the catalog lacks — **author a component**, do not inject raw
code into a page.

**1. Create `components/<name>/` with three files:**

- `schema.json` — declares the component's fields. Top-level keys:
  `description` (string), `required` (object of field → descriptor), `optional`
  (object of field → descriptor), and `example` (a YAML string shown in the
  catalog). A **descriptor** is either a type-name string
  (`"string" | "array" | "object" | "number" | "boolean"`) or an object
  `{ "type": <name>, ...rules }`. Available rules:

  | Rule | Applies to | Meaning |
  |---|---|---|
  | `non_empty: true` | string | reject empty/whitespace |
  | `enum: [...]` | string | value must be one of |
  | `format: "href"` | string | safe link (site-root `/…`, `https://`, `#frag`, or `mailto:`) |
  | `items: <descriptor>` | array | shape of each element |
  | `min_items` / `max_items` | array | element-count bounds |
  | `required` / `optional` | object | nested field descriptors |

  (`number`/`boolean` take no extra rules.) Example:

  ```json
  {
    "description": "Live brew-ratio calculator.",
    "required": {},
    "optional": {
      "heading": { "type": "string", "non_empty": true },
      "default_cups": "number",
      "ratio": "number"
    },
    "example": "type: brew-calculator\nheading: Brew calculator\ndefault_cups: 2\nratio: 16\n"
  }
  ```

- `component.njk` — the template. Read plan fields from `component.<field>`.
  **Interactive components carry their own inline `<script>`** using the
  `document.currentScript` convention (see `components/mailto-form/component.njk`):

  ```njk
  <div class="c-brew-calculator" data-ratio="{{ component.ratio or 16 }}">
    ...inputs and output nodes...
    <script>
      (function () {
        var root = document.currentScript.closest('.c-brew-calculator');
        // read data-* config, bind input listeners, recompute on change
      })();
    </script>
  </div>
  ```

  This keeps the JS scoped to the component instance — not raw script in `prose`.

- `component.css` — styles, ideally themed via the same CSS variables the
  built-in components use so it adapts to `style`.

**2. Regenerate the catalog reference:** `bash scripts/generate-catalog-md.sh`
(it writes `components/CATALOG.md`).

**3. Reference the new `type`** from a page's `components` array and build.

The component stays a typed, validated, reusable contract — the same governance
every built-in component has. (Per-site "site-local" libraries are planned but
not yet available, so today a new component is added to the shared catalog.)
