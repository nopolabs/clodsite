# Clodsite Vision

## The vision

Anyone should be able to get a real website — described in plain language, live
on fast infrastructure within minutes, and **easy to change forever after**.
Not a brittle one-shot generation that breaks the moment you ask for an edit,
but a real site whose source is small enough to read, review, and revise with
confidence.

That is the promise Clodsite keeps for the people sites are built for: makers,
small businesses, clubs, and projects. Everything in the architecture exists to
make that promise true and durable.

---

## Positioning

Three layers, in order. The first is what we lead with everywhere
customer-facing; the rest explain why it works.

- **Outcome:** Real sites that stay easy to change.
- **User:** Builders and agents creating sites for people and small
  organizations.
- **Mechanism:** A deliberately small, deterministic web compiler.

The site owner is the **beneficiary** — the value is theirs, and they lead every
example and every page of marketing. The present-day **user** is a technically
capable builder, or an agent acting as one, who is comfortable with Git, an AI
assistant, and a deployment account. We design for that user honestly while
keeping the maker outcome at the front. Agencies, fully autonomous agents, and a
hosted service are a future audience, not a current one.

---

## The thesis: a compiler for a deliberately small web

Clodsite treats websites the way a compiler treats programs. The author works in
a compact, declarative source document — `build-plan.yaml` — and Clodsite
compiles it into HTML, CSS, JavaScript, Cloudflare Pages Functions, and
deployment configuration.

Three principles follow:

1. **Authoring is separated from building.** A human, an agent, or both decide
   what the site says and does, expressed in the plan. After that, the build is
   deterministic machinery — no further creative decisions, no per-edit
   regeneration of implementation code.

2. **Generated code is compiler output.** HTML, CSS, client JavaScript, and edge
   integration code are artifacts to be inspected when debugging, auditing, or
   verifying a release — not the normal editing surface. You change the site by
   changing the plan, not by hand-editing what the compiler produced.

3. **The language is deliberately small, and smallness is the point.** The
   vocabulary is a constrained catalog of typed components. Actions carry a
   label, a safe link, and an optional emphasis — nothing more. The plan does not
   control columns, colors, spacing, or breakpoints; components and themes own
   those decisions. A small language is what makes the output predictable, the
   plan reviewable, and an agent's reasoning cheap and reliable.

The result: changes are confined to a small, reviewable source document instead
of scattered across thousands of lines of generated code. That containment — of
both effort and error — is the core advantage everything else builds on.

---

## What Clodsite is, and is not yet

**Today, Clodsite provides:**

- A human-readable `build-plan.yaml` as the single authoring contract.
- A constrained catalog of typed page components, and built-in visual themes.
- Deterministic rendering into static assets via Eleventy/Nunjucks.
- Cloudflare Pages deployment and custom-domain automation.
- Generated Pages Functions for selected runtime capabilities.
- Contact forms via Resend, with optional Turnstile protection.
- Small-commerce sites: Stripe Checkout, webhook processing, and both `manual`
  and `printful` fulfillment providers.
- Personalized products via capability tokens (for example, certificate print
  files), verified live at checkout.
- Provider-synced commerce catalogs with locally mirrored product assets.
- Validation before every build and deploy.
- An interface that exposes selected operations to agents.

**Clodsite is not yet:**

- A general-purpose web application framework.
- A multi-tenant hosted platform with per-customer isolation.
- A fully schema-driven compiler.
- A package ecosystem or registry for third-party libraries.

We say so plainly. The vision is ambitious; the claims stay honest.

---

## Architecture principles

### The inference boundary

`build-plan.yaml` is the boundary between intelligence and machinery. Everything
before it is collaboration — deciding intent. Everything after it is
deterministic scripts that render and deploy. Concentrating inference at this
boundary, once per change, is what makes builds reproducible, inexpensive to
re-run, and free of the per-edit drift that plagues code-regenerating tools.

### Six kinds of data, each with one owner

Clean compilation depends on never confusing these:

| Layer | Examples | Owner | In the site's source? |
|---|---|---|---|
| Declarative source | `build-plan.yaml` | Human and agent | Yes |
| Library source | schemas, templates, CSS, scripts, capability declarations | Library author | By reference + lock |
| Normalized external data | commerce catalog, provider IDs, mirrored images | Sync adapters | Yes |
| Secrets & environment | API keys, deploy tokens | Operator / deploy env | No |
| Mutable runtime state | orders, submissions, webhook state | Deployed services | No |
| Generated artifacts | `dist/`, rendered Functions, headers | Compiler | Reproducible; not source |

The plan holds deliberate site *intent*: which pages and components exist, final
authored content, which products are shown, commerce and fulfillment *policy*,
metadata and domains, and which optional capabilities are active. The plan never
holds secrets, provider responses, mutable records, generated URLs, presentation
knobs owned by components and themes, or anything derivable deterministically.

### A small core, extended by selected local libraries

The core language stays small. Its vocabulary grows through **explicitly
selected, versioned libraries**, so a given site's effective language is:

```text
core language + selected library contracts
```

An agent building a restaurant site sees the restaurant vocabulary — not the
schemas for certificates, fulfillment, or unrelated domains. This preserves
smallness (lean context, fewer invalid choices) while letting the system grow.

Library categories: **content** (hero, prose and media, feature grids, quotes,
resource cards, calls to action), **domain** (restaurants, professional
services, portfolios, events, documentation), **capability** (contact forms,
commerce, fulfillment, certificates, authenticated proxies), **theme**
(typography, color, surfaces, spacing against a stable theme contract), and
**site-local** (private components for one project).

**We commit only to local declarative libraries.** The first implementation is
deliberately narrow: libraries resolved from the local filesystem, each a
declarative manifest of JSON Schema fragments, Nunjucks templates, CSS, and
static assets — with no arbitrary install-time or build-time code execution.
Today's built-in components become the standard library under that contract,
with no change in behavior. A lockfile makes resolution reproducible.

This is architectural modularization, not ecosystem construction. A hosted
registry, a marketplace, payments for libraries, and code-signing are explicit
**hypotheses for later**, gated on real demand and a trust model — not
commitments. Executable capability libraries that generate or run their own code
come only after the declarative model is proven and a permission, secrets, and
isolation model is designed.

### The standard library is invisible by default

Most builders — and certainly every site owner — should never see an import. The
standard library is selected automatically; explicit library selection appears
only when someone reaches past it. Progressive disclosure keeps "selectable
libraries" from reintroducing the cognitive cost the project exists to remove.

### The escape hatch stays inside the contract

A constrained language meets its limit the first time someone needs what the
catalog can't express. The answer is never raw HTML, CSS, or JavaScript dropped
into the plan — that would end the plan's life as a validated, portable,
agent-legible contract. Instead, the author writes a **site-local, constrained
component** in a site-local library. Its public schema stays validated and
legible; its implementation may contain arbitrary trusted Nunjucks and CSS,
exactly like a standard-library component. The power-user outlet lives inside the
compiler's contract rather than punching a hole in the source.

### Schema: shape from the schema, relationships from code

A machine-readable JSON Schema makes the source language portable and lets
agents and editors constrain and check the plan directly — inline completion and
linting for humans, structured generation for agents. The schema is built from
the core plus the selected libraries' schemas, composed into one effective
schema per site.

Schema validation is necessary but not sufficient. A thin imperative layer
continues to enforce what schemas cannot express: filesystem paths, cross-file
references, catalog product resolution, identifier uniqueness, capability
compatibility, and secret availability. Schema governs *shape and type*; code
governs *relationships*. Final enforcement always happens at the compiler
boundary, because no schema can guarantee an agent emits a valid plan.

The schema is designed *around* the core-and-library boundary, not ahead of it,
so it never has to encode and then unwind today's built-in arrangement.

### Runtime and commerce: minimal, explicit edge runtime

A static informational site compiles to assets with no application runtime. A
form or commerce site intentionally adds Cloudflare Functions, secrets,
webhooks, and durable storage. The compiler stays deterministic even when the
deployed system is stateful, because state lives outside the source:

- Payment runs through Stripe Checkout; `manual` and `printful` handle
  fulfillment.
- Webhooks run in a Pages Function with durable storage (KV) for order state and
  idempotency. A static target never holds mutable state; a Function does.
- Provider catalogs are normalized to a committed snapshot before compilation;
  live provider responses and order records are runtime data, never source.
- Secrets enter only at deployment. Webhook and order handling are idempotent and
  observable.

Where richer commerce arrives later — inventory, for instance — the same rule
holds: presentation and policy may be declarative, but current stock and
reservations are mutable runtime data behind an authoritative store, never the
source plan.

### Tenant isolation is the gate on scale

Compilation scales cheaply; transaction does not. Sites today share underlying
commerce credentials, and the per-site guards that keep their orders from
crossing are operational safeguards, not a security boundary between distrusting
tenants. Per-site credentials and a real multi-tenant model are prerequisites
for any managed multi-customer deployment, agency offering, or marketplace. We
name this honestly rather than implying it is solved, and we sequence it before
the futures that depend on it.

---

## Claims discipline

The economic case — that working through a small plan costs far less inference
and produces far more stable changes than repeatedly editing generated
application code — is the heart of the product. It is also a hypothesis until
measured, so we hold our public claims to what we can demonstrate:

- The pipeline is **deterministic by design**; byte-for-byte reproducibility
  across builds is something we verify, not assert.
- We claim **contained, reviewable inference** — changes confined to a small
  source document — not a specific percentage of token savings, and not "zero
  drift."

To earn stronger claims, we benchmark representative work (create a site, revise
positioning, add a page, add a catalog, enable checkout, change a theme, upgrade
a library, rebuild without changes) and record tokens, time, files touched, diff
size, validation and test failures, human corrections, and output stability —
**measured against a competent build of a small conventional site**, not against
a heavyweight framework that would flatter the result. We publish numbers only
when the evidence supports them.

---

## Direction

The work proceeds in this order, each step earning the next:

1. **One authoring contract.** `build-plan.yaml` is the sole authoring surface;
   guided discovery writes and validates it directly.
2. **A precise compiler boundary.** Document the six data layers and the
   treatment of runtime capabilities; publish a forward-looking site update that
   separates what works today from where we are headed.
3. **Baselines.** Capture benchmark baselines before architectural change makes
   comparison impossible.
4. **The small-core-plus-local-library model.** Define the library contract,
   categories, manifests, namespaces, local resolution, and locking; re-home
   today's built-ins as the standard library with no behavior change.
5. **Composable schema.** Design the core schema, library schema registration,
   effective-schema composition, versioning, migrations, and editor/agent
   integration — around the boundary, not ahead of it.
6. **The escape hatch.** Ship site-local declarative libraries so power users
   have a determinism-preserving outlet before demand forces a raw-code hole.
7. **Validation migration.** Adopt a standard schema validator while keeping the
   imperative relationship checks.
8. **Tenant isolation.** Per-site credentials, then a multi-tenant model, before
   any managed multi-customer deployment.
9. **Measured claims and durable positioning.** Re-run the benchmarks against the
   implemented architecture and rebuild the public message around the evidence.

Executable capability libraries, a hosted registry, and any marketplace remain
hypotheses beyond this sequence — pursued only if and when demand and a credible
trust model justify them.

In one line:

```text
one authoring contract
  -> precise compiler boundary
  -> small core + selected local libraries
  -> composable schema
  -> escape hatch
  -> tenant isolation
  -> measured claims
  -> durable positioning
```

Throughout, the test for every decision is the same: does it keep a real
website easy to change, for the person it was built for?
