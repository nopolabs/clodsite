# General Proxy Functions & bbpp Port — Design

**Date:** 2026-06-12
**Status:** Draft for review
**Related:** Commerce v1 design (`2026-06-10-commerce-design.md`, Phase 9 of
its validation ladder); bbpp certificate commerce design
(`2026-06-11-bbpp-certificate-commerce-design.md`, implementation step 3 —
"the port, not this design, defines" the general proxy function). Advances
the roadmap's "General Pages Functions and secrets" item. External systems:
`nopolabs/parchment` (certificate Worker, live), `nopolabs/bbpp` (current
static site, the porting target).

---

## Background

bigbeautifulpeaceprize.com is one static page plus one hand-written Pages
Function, `functions/parchment/[[path]].ts`, which proxies `/parchment/*` to
the parchment Worker. The Worker is reachable only at its `workers.dev` URL;
the proxy is what makes it a same-origin API for the site. The proxy does
three things:

1. **Pass-through** — forwards `/parchment/<path>?<search>` to the Worker
   with `X-Site-ID: bbpp` attached (used by `render`, and by `cert/<token>`
   once the print page exists).
2. **Turnstile guard** — on `POST /parchment/issue`, verifies the
   `cf-turnstile-response` form field against Cloudflare siteverify before
   forwarding.
3. **Authentication** — on that same route, attaches
   `Authorization: Bearer ${PARCHMENT_API_KEY}` so only the site (never the
   browser) holds the issue credential.

Clodsite cannot express any of this today. Generated Functions exist only for
two hardcoded cases (resend-form → `api/contact.js`, live commerce →
`api/checkout.js` + `api/webhook.js`), and secrets are pushed by name-specific
deploy.sh blocks. The parent spec's Phase 9 gate is: deploy a non-commerce
port of bbpp and verify **behavioral** parity (visual parity is explicitly
not the bar — the port adopts the closest built-in theme), then activate
certificate commerce (Phase 9.4, already designed).

This design defines two new clodsite capabilities — a declarative
**`proxies`** plan block and a **`certificate-award`** component — plus the
bbpp site plan that exercises them.

---

## Design

### 1. The `proxies` plan block

A new optional top-level field in `build-plan.yaml`:

```yaml
proxies:
  - mount: parchment
    upstream: https://parchment-worker.danrevel.workers.dev/parchment
    headers:
      X-Site-ID: bbpp
    secret: PARCHMENT_API_KEY
    authenticated:
      - POST issue
    turnstile:
      - POST issue
```

Each entry renders one Pages Function at `functions/<mount>/[[path]].js`. A
request to `/<mount>/<subpath>?<search>` forwards to
`<upstream>/<subpath>?<search>`.

**Fields.**

| Field | Required | Meaning |
|---|---|---|
| `mount` | yes | URL prefix on the site; also the function directory name. `^[a-z][a-z0-9-]{0,31}$`. Reserved: `api` (clodsite-generated functions), `assets`, `commerce` (passthrough asset trees). Must be unique across proxies and must not collide with any page id (a page would render `/<id>/index.html` that the function shadows). |
| `upstream` | yes | Absolute `https://` URL prefix, no query, no fragment; trailing slash stripped at render. Not client-controlled, baked into the rendered function. |
| `headers` | no | Map of header name → string value set on every forwarded request (e.g. `X-Site-ID`). Header-name charset `^[A-Za-z][A-Za-z0-9-]*$`. `authorization`, `host`, `cookie` (any case) are rejected — credentials go through `secret`, never the plan. |
| `secret` | iff `authenticated` present | Name of the env var holding the bearer credential. `^[A-Z][A-Z0-9_]{2,63}$`. Reserved names rejected: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRINTFUL_API_KEY`, anything starting `CLOUDFLARE_`. The *value* lives in clodsite `.env` and is pushed as a Pages secret at deploy; it never appears in the plan, the rendered function, or the sites repo. |
| `authenticated` | no | Routes that get `Authorization: Bearer ${env[secret]}` attached. |
| `turnstile` | no | Routes guarded by server-side Turnstile verification before forwarding. |

**Route syntax.** `authenticated` and `turnstile` entries are
`"<METHOD> <subpath>"` — method ∈ {GET, POST}, subpath matched exactly
(no leading slash, no wildcards in v1). bbpp needs exactly one:
`POST issue`.

**Runtime behavior** (rendered from `scripts/lib/proxy.template.js` with a
`{{CONFIG}}` literal, mirroring the checkout/webhook templates):

- Methods other than GET, HEAD, POST → 405. (HEAD is always pass-through —
  the commerce checkout function verifies personalization tokens with
  `HEAD /<mount>/cert/<token>` through this same proxy.)
- Target URL is constructed with `new URL(...)`, then guarded:
  `target.href` must still start with `upstream + '/'` (or equal `upstream`)
  after dot-segment resolution. A path like `../admin` that escapes the
  prefix → 404. This is the SSRF/path-traversal guard; `upstream` itself is
  fixed at build time.
- Forwarded request headers are built fresh — only `content-type` and
  `accept` are copied from the client, then the configured `headers` map is
  applied, then `Authorization` on authenticated routes. Client cookies and
  any client-supplied `Authorization`/`X-Site-ID` never reach the upstream
  (the current bbpp function forwards all client headers; this design
  tightens that).
- Turnstile routes: read the body as text, extract `cf-turnstile-response`
  (form-encoded), verify against siteverify with the same checks as
  resend-form — `success === true`, `action === 'clodsite-proxy-<mount>'`,
  and `hostname` in the `__CLODSITE_TURNSTILE_HOSTNAMES__` allowlist
  (marker replaced at deploy, same as contact.js). Failure → 403
  `{ error: 'verification failed' }`. Success → forward the original body
  text. A turnstile route with a missing `TURNSTILE_SECRET_KEY` env → 500
  `Not configured` (never fail open).
- Authenticated routes with the secret env missing → 500 `Not configured`.
- Upstream responses stream back verbatim (status, headers, body) —
  parchment's `Cache-Control: no-store` on `/cert/<token>` must survive the
  proxy untouched.

**Rendering & stale cleanup.** `render-functions.mjs` renders each proxy and
stamps the file with a `// clodsite:proxy` header comment. Cleanup removes
any `functions/<dir>/[[path]].js` carrying that marker whose mount is no
longer in the plan (the existing `removeIfStale` only knows `api/`).
Proxies render in both preview and live commerce modes — they are
independent of commerce.

**Deploy.** A new deploy.sh block collects the distinct `secret` names from
the plan's proxies (via a new `build-plan.mjs` query), errors if any is
missing from `.env`, and pushes each with
`wrangler pages secret put <NAME>`. Same shape as the existing
RESEND/STRIPE/PRINTFUL blocks.

### 2. Turnstile provisioning generalization

`provision-turnstile.sh` is currently keyed to resend-form: it triggers on
the `resend-turnstile` plan query and patches the hostname marker only in
`functions/api/contact.js`. Generalized:

- **Trigger**: a new `turnstile-consumers` query returns true when a
  resend-form has `turnstile: true` **or** any proxy declares `turnstile`
  routes.
- **One widget per site**, shared by all consumers; per-consumer `action`
  strings (`clodsite-contact`, `clodsite-proxy-<mount>`) keep tokens bound
  to the form that rendered them. One `TURNSTILE_SECRET_KEY` Pages secret,
  one `__CLODSITE_TURNSTILE_SITEKEY__` marker in HTML — all unchanged.
- **Widget naming**: new widgets are named `clodsite:<site>`. Lookup order:
  state-file sitekey → list by `clodsite:<site>` → list by the legacy
  `clodsite:<site>:resend-form`. A found widget keeps its existing name
  (the update payload preserves it); no rename churn for deployed sites.
- **Hostname marker patching** walks all of `functions/` (not just
  `api/contact.js`) and requires every found marker to resolve.

### 3. The `certificate-award` component

The award flow from bbpp's `index.html`, as a clodsite component pairing
with a proxy mount. It is parchment-shaped by design (the proxy is generic;
the component speaks parchment's `render`/`issue` protocol — the same split
the design ladder already settled for `personalized-product`).

```yaml
type: certificate-award
proxy: parchment            # required: a proxies[].mount on this site
heading: Present the Prize  # optional, default shown
markdown: |                 # optional intro under the heading
  Fill in the details below, preview the certificate, then send it.
```

**Behavior** (component.njk + inline script, mirroring bbpp exactly):

- Fields: recipient name (required, ≤100), achievement (optional, ≤200,
  hint: blank uses the default citation), recipient email (required, format
  checked). Inline field errors.
- **Preview** → `GET /<mount>/render?name=…[&achievement=…]`, response blob
  shown as an image; error → inline "Preview unavailable … You can still
  award the prize."
- Turnstile widget (`data-sitekey="__CLODSITE_TURNSTILE_SITEKEY__"`,
  `data-action="clodsite-proxy-<mount>"`) gates the **Award** button via
  its success callback.
- **Award** → `POST /<mount>/issue` (form-encoded name/email/achievement +
  `cf-turnstile-response`) → confirmation view ("<name> will receive their
  certificate at <email>", HTML-escaped) with an **Award Another** reset
  that clears fields, resets Turnstile, and restores the form.
- Styling from theme variables like every other component; no bespoke fonts
  or palette (visual parity is out of scope per the Phase 9 decision).

**Validation** (validate-plan cross-checks):

- `proxy` must reference an existing `proxies[].mount`.
- That proxy must list `POST issue` in **both** `turnstile` and
  `authenticated` — a loud error otherwise. An unguarded issue route is
  bot-spammable; an unauthenticated one can't reach the Worker at all.
- At most one `certificate-award` per page (one Turnstile widget id, same
  constraint resend-form has).

### 4. The bbpp site plan (sites repo, not clodsite)

`$SITES_DIR/bbpp/build-plan.yaml`, single page:

- `slug: bbpp`, closest built-in theme (pick at port time; likely
  `professional`), `custom_domain: bigbeautifulpeaceprize.com` (recorded in
  the plan; `/domain` is run only at cutover).
- `pages: [home]` — `hero` (seal image from the bbpp repo copied to
  `$SITES_DIR/bbpp/assets/`, heading "The Big Beautiful Peace Prize",
  CTA → `#award` …or the component's own anchor) + `certificate-award`.
- `proxies` block exactly as in §1.
- `headers` rule for `/assets/*` caching (parity with bbpp's `_headers`).
- Favicons through the existing static-assets pipeline.

**Secrets/infra at deploy:** `PARCHMENT_API_KEY` added to clodsite `.env`
(value = the existing bbpp site key the Worker already accepts — `X-Site-ID:
bbpp` is already provisioned in parchment). Turnstile provisioning creates a
fresh `clodsite:bbpp` widget; the manually-created widget
(`0x4AAAAAADCnY8bWziMBe6XP`) stays with the old site until cutover and is
deleted manually afterwards.

**Behavioral parity gate** (against the live site, on bbpp.pages.dev):

1. Preview renders a certificate PNG for name ± achievement.
2. Award without Turnstile is impossible (button gated); a forged POST
   without a valid token → 403.
3. A real award issues: 202, recipient email arrives with the certificate.
4. Field validation parity (required name/email, length caps, inline
   errors); confirmation + Award Another reset flow.
5. `GET /parchment/cert/<token>` from a fresh award's email resolves through
   the proxy (this is what 9.4's print page consumes).
6. `/assets/*` served with the cache header.

**Cutover** (end of 9.3, after the gate passes, operator-confirmed): run
`/domain bbpp` to move bigbeautifulpeaceprize.com to the new project. The
known rough edge stands until 9.4: cert emails link to `/print/?cert=…`,
which 404s on the ported site too — unchanged behavior from today.

---

## Implementation order

1. **PR A — proxy capability**: `proxies` validation, `proxy.template.js`,
   render-functions rendering + marker-based stale cleanup, deploy.sh
   secret push, provision-turnstile generalization, `build-plan.mjs`
   queries. Node tests for the rendered proxy (tmp-module + stubbed fetch:
   pass-through, header policy, traversal guard, turnstile 403/forward,
   auth attach, 405, missing-env 500s) + bash suite sections
   (validation errors, render/cleanup, fixture build).
2. **PR B — certificate-award component**: schema.json, component
   (njk/css/inline script), validate-plan cross-checks, CATALOG.md
   regeneration, bash suite coverage (cross-check errors, rendered page
   assertions, full fixture build).
3. **bbpp port** (sites repo): plan + assets, local build review, deploy to
   bbpp.pages.dev, walk the parity gate, then cutover on operator
   go-ahead.

## Deferred

- Wildcard/prefix route matchers and non-bearer auth schemes in `proxies`.
- Arbitrary (non-proxy) generated Functions; per-site `.env` overlays
  (roadmap "Per-site environments and credentials").
- Any visual-parity theming for bbpp.
- The print page and commerce activation — Phase 9.4, already designed.
