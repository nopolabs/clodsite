# bbpp Certificate Commerce — Design

**Date:** 2026-06-11
**Status:** Draft for review
**Related:** Commerce v1 design (`2026-06-10-commerce-design.md`, Phase 8 of its
validation ladder). Implementation lands in Phase 9 (bbpp port + certificate
commerce). External systems: `nopolabs/parchment` (certificate Worker),
`nopolabs/bbpp` (current static site).

---

## Background

bigbeautifulpeaceprize.com awards a novelty peace-prize certificate. A visitor
(the **awarder**) fills in a recipient's name, an achievement, and the
recipient's email; previews the certificate; passes Turnstile; and awards the
prize. The site is a single static page plus one Pages Function that proxies
to **parchment**, a shared Cloudflare Worker (also serving
mastertimewaster.com) that renders certificate PNGs via Satori, assigns serial
numbers in D1, caches renders in R2, and emails the certificate to the
recipient via Resend. The Worker is reachable only at its `workers.dev` URL;
all public traffic flows through the site's authenticated proxy function
(Turnstile guard + `Authorization: Bearer` + `X-Site-ID: bbpp`).

This design adds two sale points:

- **Flow A — the awarder buys a print.** After awarding the prize, the
  confirmation view offers a physical printed certificate, shipped.
- **Flow B — the recipient buys a print.** The certificate email the recipient
  receives gains a link to a page offering a printed copy of *their*
  certificate.

Both sales reference a *specific* certificate — name, achievement, serial —
which the commerce v1 checkout payload (`{ slug, optionValues, qty }`) cannot
carry. The parent spec settles the boundary this design must implement:
trusted certificate context travels as a **server-issued opaque
`personalization_id`**, resolved server-side at checkout and fulfillment.
Certificate details and recipient PII never travel through the browser or
Stripe metadata. Stripe Checkout custom fields are reserved for information
genuinely supplied by the buyer (none is needed in v1 — Stripe already
collects the buyer's email and shipping address).

Constraints inherited from the systems involved:

- parchment is shared infrastructure: every change must be additive and inert
  for `mtw`.
- The bbpp D1 record (`name`, `achievement`, `email`, `serial`) is created by
  the *queue consumer*, not the `/issue` handler — today nothing
  certificate-identifying exists at the moment the awarder's 202 comes back.
- Commerce v1 builds offline and embeds catalog data into the checkout
  function at render time; personalization is inherently dynamic and cannot
  be embedded.

---

## Design

### 1. `personalization_id`: a capability token minted by parchment

The `personalization_id` is an unguessable random token (128 bits,
base64url — **not** the serial, which is sequential and guessable) identifying
one certificate. parchment is the only system that can mint or resolve it.

**Minting.** `POST /parchment/issue` mints the token and creates the D1
record synchronously in the request handler; the queue keeps render + email.
Today the consumer does the insert — moving it forward is required so the
token exists when the awarder's response returns (Flow A's upsell happens
seconds later). The existing dedup by R2 key is preserved: re-issuing the
same name + achievement finds the existing record and returns its existing
token. The response becomes:

```
202 Accepted
{ "status": "queued", "personalization_id": "tok_..." }
```

**Storage.** D1 migration adds a nullable `token TEXT UNIQUE` column.
Certificates issued before this change have no token and are simply not
purchasable — no backfill (their notification emails carry no purchase link
anyway). `mtw` rows mint tokens too but nothing ever resolves them; inert.

**Resolution.** One new public route, reached through the site's existing
parchment proxy like every other route:

```
GET|HEAD /parchment/cert/<token>           → official PNG (200) or 404
GET      /parchment/cert/<token>?scale=3   → print-resolution PNG (3600×2550)
```

Renders on demand if the official PNG is not yet in R2 (the queue may not
have run yet), using the same find-or-render path as the consumer. Responses
are `Cache-Control: no-store` — the token is the URL, and CDN caches should
not hold capability-addressed content. Possession of the token is the
authorization: it grants exactly (a) viewing the certificate image — which
shows only what the certificate itself shows — and (b) buying a print of it.
Worst case for a leaked token is that someone pays to have that certificate
printed. No other certificate data (recipient email, in particular) is
resolvable from outside parchment.

**Email link.** The certificate email gains a purchase link when the site
config declares one — a new optional `SiteConfig.printOfferUrl` template,
e.g. `https://bigbeautifulpeaceprize.com/print/?cert={token}`. Only
`config/bbpp.json` sets it; mtw emails are unchanged.

### 2. The two flows

```
Flow A (awarder)                          Flow B (recipient)
────────────────                          ──────────────────
award form → POST /parchment/issue        certificate email
           ← 202 + personalization_id       └─ link: /print/?cert=<token>
confirmation view shows upsell:           /print/ page resolves preview via
  "Send a printed copy — $N"                GET /parchment/cert/<token>
        │                                       │
        └────────────► POST /api/checkout ◄─────┘
                { items: [{ slug: "printed-certificate",
                            qty, personalization_id }] }
                       │
            Stripe Checkout (buyer pays, enters shipping address)
                       │
            webhook → manual provider → merchant email with
            print-resolution link → operator prints and mails
```

In both flows the buyer chooses the shipping destination at Stripe Checkout —
an awarder who knows the recipient's postal address can ship directly; one
who doesn't ships to themselves and hands it over. That is buyer-supplied
information, collected by Stripe's own address form, exactly where the parent
spec wants it.

### 3. Clodsite extension: personalized products

The capability is generic — "this catalog product cannot be bought except in
reference to an externally-issued thing" — and bbpp is its first user.

**Catalog shape.** A product in `catalog.json` may declare:

```
{ slug: "printed-certificate", name: "Printed certificate", price_minor: 2500,
  active: true, images: { main: "commerce/assets/print-mockup.png" },
  options: [], variants: [{ optionValues: {}, fulfillment_ref: "bbpp-print" }],
  personalization: {
    required: true,
    url: "/parchment/cert/{id}"        # origin-relative template; {id} ⇒ token
  } }
```

One URL template serves both uses: the browser substitutes the token to show
the preview image; the checkout function substitutes it to validate.

**`personalized-product` component.** A new catalog-anatomy component, not an
extension of `catalog` — the rendering contract is different (one product,
bound to a query parameter, page is meaningless without it):

```yaml
pages:
  - id: print
    components:
      - type: personalized-product
        product: printed-certificate    # must reference a personalization-required slug
        param: cert                     # query parameter carrying the token (default: cert)
```

Renders the certificate preview (the resolved `personalization.url` as the
product image), name, price, quantity selector, and a **Buy** button that
POSTs directly to `/api/checkout` and redirects to the returned Stripe URL.
With the parameter absent or the preview 404ing, the component renders an
explanation instead of a dead store. Theme styling via the standard
15-variable contract.

**Buy-now only — the cart is untouched.** Personalized items never enter the
localStorage cart: the cart's identity tuple, purge set, and chrome remain
exactly as commerce v1 shipped them, and capability tokens don't sit in
localStorage outliving their use. A site selling both (bbpp sells only the
print) keeps the cart for catalog products; the two checkouts compose at the
Stripe layer, not the cart layer.

**Checkout function.** The payload grows one optional field per item:

```
{ items: [{ slug, optionValues, qty, personalization_id? }] }
```

Rules, enforced server-side in `checkout.template.js`'s resolution loop:

- A product with `personalization.required` rejects items without a
  `personalization_id`; a product without it rejects items that carry one.
- The token is syntax-checked (charset + length cap), then **verified live**:
  `HEAD origin + url.replace('{id}', token)` must return 200, else the item
  is a 400. No print of nothing is ever sold. This is the one network call
  the checkout function makes besides Stripe — to the site's own origin,
  through the same authenticated proxy every visitor uses.
- The resolved URL (print-resolution variant, `?scale=3`) is written into the
  Stripe session metadata alongside the fulfillment ref, server-side:

```
metadata[items] = [{ fulfillment_ref, qty, personalization_id,
                     personalization_url }]
```

The token and a URL containing it are the only personalization-related values
that touch Stripe — opaque by construction, consistent with the parent spec's
treatment of `fulfillment_ref`. (Stripe caps a metadata value at 500
characters; with URLs in the items array this bounds a session to roughly
three personalized line items. bbpp needs one. Validation enforces the cap
with a clear error rather than letting Stripe truncate.)

**Provider interface.** `createOrder`'s `lineItems` entries gain the same two
optional fields, pass-through from metadata:

```
lineItems: [{ fulfillment_ref, qty, personalization_id?, personalization_url? }]
```

The **manual provider** prints them in the merchant email:

```
Items:
  1 x bbpp-print
      personalization: tok_...
      print file: https://bigbeautifulpeaceprize.com/parchment/cert/tok_...?scale=3
```

The operator clicks the link, gets the print-resolution PNG, prints it, mails
it. The clodsite pipeline — webhook, state machine, providers — never
interprets the token; parchment remains the sole resolver, end to end.

### 4. Fulfillment split: manual now, Printful print product deferred

**v1 fulfills manually.** The decision the parent spec asked this document to
settle, and the reasoning:

- A Printful print product needs a *publicly fetchable* print file URL at
  order time and a per-order-files capability in the provider interface that
  commerce v1 deliberately did not build (`createOrder` today sends
  `fulfillment_ref` + `qty`; order-time file attachment is a new provider
  surface).
- Print quality is a parchment question either way: the 1200×850 render is
  ~4×3″ at 300 DPI. The `?scale=` parameter (§1) gives both manual and any
  future Printful path a 3600×2550 file (12×8.5″ at 300 DPI) from the same
  Satori tree — Satori output is vector until rasterization, so this is a
  render-time multiplier, not a redesign.
- bbpp volume is a trickle. Manual fulfillment exercises every new mechanism
  this design adds (token, validation, metadata pass-through, print-res
  render) with the provider that has no external dependency — the same
  carry-the-pipeline-first role `manual` played in commerce v1's phasing.

When a Printful print product becomes worth it, the seam is visible: the
provider already receives `personalization_url`; the work is the per-order
print-file capability in `printful/order.mjs` plus a product mapping.

### 5. What stays private, restated

| Value | Browser | Stripe | clodsite functions | parchment D1 |
|---|---|---|---|---|
| recipient name / achievement | only as pixels in the preview PNG | never | never | yes |
| recipient email | never (the awarder typed it once, at award time — pre-commerce) | buyer's own email only | never | yes |
| serial | as pixels in the PNG | never | never | yes |
| `personalization_id` / URL | yes (the capability) | metadata, opaque | pass-through, uninterpreted | yes (`token`) |

### 6. Surface summary

```
parchment (nopolabs/parchment)
  src/index.ts                 /issue mints token + synchronous D1 insert; new /cert/<token> route
  src/db.ts                    token column helpers; migration 0002 (token TEXT UNIQUE)
  src/render.ts                scale multiplier
  src/email.ts                 printOfferUrl link in certificate email
  config/bbpp.json             printOfferUrl

clodsite
  components/personalized-product/        new component (njk, css, schema, client JS)
  scripts/lib/commerce/checkout.template.js   personalization_id validation + metadata
  scripts/lib/commerce/webhook.template.js    pass-through to lineItems
  scripts/lib/commerce/providers/manual/order.mjs   print personalization lines
  scripts/lib/validate-plan.mjs / catalog schema   personalization rules (§7)

bbpp site (clodsite port, Phase 9)
  build-plan.yaml              commerce block (manual provider) + print page
  commerce/catalog.json        one product: printed-certificate
```

### 7. Validation

- `personalization.url` must contain `{id}` exactly once and be
  origin-relative (`/...`) — absolute URLs would let a catalog edit exfiltrate
  tokens to a third party at checkout time.
- `personalization.required` is the only mode; a `personalization` block
  without `required: true` is invalid (reserve optional personalization until
  something needs it).
- A `personalized-product` component's `product` must reference a catalog slug
  whose product declares `personalization`; conversely the `catalog`
  component refuses to render personalization-required products (they have no
  meaning in a grid).
- Token syntax at checkout: `[A-Za-z0-9_-]{16,64}`.
- The metadata 500-character cap (§3) is enforced at checkout with a clear
  400, not discovered as a Stripe truncation.

Provider and template changes carry fixture-based `*.test.mjs` and bash-suite
coverage per the established conventions; parchment changes are tested in its
own repo (typecheck + its conventions).

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | `personalization_id` is a random 128-bit token minted by parchment, stored in a new D1 `token` column | Serials are sequential and guessable; parchment is already the system of record for certificates |
| 2 | D1 insert moves from the queue consumer to the `/issue` handler | The token must exist when the awarder's 202 returns (Flow A); render + email stay async |
| 3 | Possession of the token authorizes viewing the PNG and buying a print — nothing else | Capability semantics; leak downside is someone pays to print that certificate; recipient email is never resolvable from outside parchment |
| 4 | Personalized products are buy-now only; the cart is untouched | Cart identity/purge machinery stays as shipped; capability tokens don't persist in localStorage |
| 5 | Checkout verifies the token live (HEAD → 200) before creating the Stripe session | Never sell a print of nothing; the only non-Stripe network call the function makes, to its own origin |
| 6 | The print-resolution URL is resolved server-side at checkout and travels via Stripe metadata to `createOrder` | Webhook and providers stay personalization-agnostic; parchment remains the sole resolver |
| 7 | Manual fulfillment in v1; Printful print product deferred | Per-order print files are a new provider surface; manual exercises every new mechanism at bbpp's volume (§4) |
| 8 | Print quality via a `?scale=` render multiplier in parchment | One Satori tree serves screen and print; needed regardless of who fulfills |
| 9 | Stripe Checkout custom fields stay unused | Parent-spec rule: reserved for genuinely buyer-supplied data; Stripe already collects the buyer's email and shipping address |
| 10 | `personalization.url` must be origin-relative | A catalog edit must not be able to point token-bearing checkout validation at a third party |

---

## Implementation order (within Phase 9)

1. **parchment changes** — token mint + sync insert, migration, `/cert/<token>`
   route, `?scale=`, email link. Additive, inert for mtw, deployable to the
   *current* bbpp site before any port: the email link can 404 gracefully (or
   simply not be configured) until the store page exists.
2. **clodsite generic capability** — component, checkout/webhook/provider
   extensions, validation; tested against a stub resolve endpoint, no
   parchment dependency in the suite.
3. **bbpp port, non-commerce** — behavioral parity gate per the parent spec's
   Phase 9 (needs the general authenticated-proxy function from the roadmap's
   "General Pages Functions and secrets" item — that port, not this design,
   defines it).
4. **Activation** — commerce block + catalog + print page on the ported site;
   walk the operational gates (test mode → deliberate failure/retry → one
   live purchase) as established in Phase 7.

---

## Deferred

- Printful print product / per-order print files in the provider interface (§4)
- Optional (non-required) personalization on catalog products
- Personalized items in the cart (buy-now only in v1)
- Framing/size options on the print product (plain print, one size, v1)
- Token revocation/expiry (R2 keys are forever; tokens follow suit until a
  reason appears)
