# Vision Brief (Merged): Clodsite as a Compiler for a Deliberately Small Web

> **Status:** Proposed synthesis — pending operator approval. Intended to
> supersede the three source briefs and become the reference for the upcoming
> design sessions once approved.
>
> **Provenance.** Synthesized from three parallel briefs, all retained for the
> reasoning trail:
> - `clodsite_vision_brief.md` — the original draft that started the discussion.
> - `clodsite_vision_brief-claude.md` — claims and positioning discipline.
> - `clodsite_vision_brief-codex.md` — architecture roadmap and sequencing.
>
> Where the briefs disagreed, the resolutions are recorded here. Two genuine
> decisions remain open and are called out explicitly in §10.

---

## 1. Thesis

Clodsite is a **compiler for a deliberately small web language.** Humans and
agents collaborate on a compact, reviewable `build-plan.yaml`; Clodsite
validates it and deterministically compiles it into static assets and
explicitly declared edge capabilities on Cloudflare.

Three claims, all backed by the code as it exists today:

- **`build-plan.yaml` is the inference boundary.** Everything before it is
  collaboration — deciding what the site says and does. Everything after it is
  deterministic scripts: render templates, run Eleventy, ship to Pages. This is
  how the pipeline works now, not an aspiration.
- **The compiler is the product.** Given a valid plan, the pipeline is
  deterministic by design, adds no application runtime for static sites, and is
  cheap to re-run; the plan is reviewable and version-controlled. (Byte-for-byte
  reproducibility across builds and the inference savings claimed below are
  benchmark *hypotheses*, not yet measured — see §8.)
- **Smallness is the source of every advantage.** The component catalog is
  constrained; actions are `label` + `href` + `style`; there is no control over
  columns, colors, spacing, or breakpoints. A small language is what makes the
  output predictable and the inference cheap. It is the feature.

The durable one-liner that combines both perspectives:

> A deliberately small **core** language, extended only by **explicitly
> selected, constrained libraries**, so an agent reasons about exactly the
> vocabulary a given site needs — and inference is contained within a reviewable
> source document instead of scattered across generated implementation code.

---

## 2. What Is True Today

Clodsite currently provides:

- A human-readable `build-plan.yaml` contract as the authoritative build input.
- A constrained catalog of typed page components.
- Deterministic rendering into Eleventy/Nunjucks templates and static assets.
- Three built-in visual themes (with an opt-in theme selector).
- Cloudflare Pages deployment and custom-domain automation.
- Generated Pages Functions for selected runtime capabilities.
- Contact forms via Resend, with optional Turnstile protection.
- **Stripe Checkout**, webhook processing, and both the **`manual` and
  `printful` fulfillment providers** for small commerce sites. (What is deferred
  is Printful fulfillment of *personalized certificate print files* — not the
  Printful provider itself, which shipped in commerce Phase 5.)
- Personalized products via capability tokens (e.g. certificate print files),
  HEAD-verified at checkout.
- Provider-synced commerce catalogs and locally mirrored product assets.
- Validation before build and deployment.
- An MCP interface exposing selected operations to agents.
- `site-spec.json` retired (PR #51); `build-plan.yaml` is the sole authoring
  contract, and `/interview` writes and validates it directly.

Clodsite is **not yet**:

- A general-purpose web application framework.
- A multi-tenant hosted platform with per-customer isolation.
- A fully schema-driven compiler.
- A package ecosystem or registry for third-party libraries.
- Proven to reduce tokens by any specific percentage.

---

## 3. Audience & Positioning

The original brief proposed swapping the maker/hobbyist audience for AI
developers and agencies. That swap is wrong as stated, but so is the claim that
makers are the *direct users*. The accurate model has three tiers:

| Tier | Who | Status |
|---|---|---|
| **Beneficiary** | The maker / small-business owner the site is *for* | Value proven by live sites (anchovy, bbpp, hmc-cycling) |
| **Current operator** | A technically capable builder using Git, an agent, Cloudflare, and deploy credentials | The actual present-day user |
| **Future operator** | An agency, an autonomous agent, or a hosted Clodsite service | Aspirational; gated on tenant isolation and a trust model |

The live sites prove value *for makers*; they do not yet prove makers are direct
users. Today the operator is a technical builder building on a maker's behalf.
So developer/agency positioning is **less speculative than a pure maker pitch
would suggest** — but maker *outcomes* should still lead every customer-facing
example, because that is what the product visibly delivers.

**Positioning structure (use this on `clodsite.com`):**

> **Outcome:** Real sites that stay easy to change.
> **User:** Builders and agents creating sites for people and small organizations.
> **Mechanism:** A deliberately small, deterministic web compiler.

Lead with the outcome; name the real user honestly; let the compiler and
contained-inference story be the *reason it's better*, underneath. Keep "you
wouldn't code-review your compiler's output" as a supporting line, not the
headline — it speaks to the mechanism, not the outcome.

---

## 4. The Compiler Boundary

The architecture distinguishes six forms of data by owner and lifecycle. This
table is the contract for "what goes where."

| Layer | Examples | Owner | Versioned with site? |
|---|---|---|---|
| Declarative source | `build-plan.yaml` | Human and agent | Yes |
| Library source | schemas, templates, CSS, scripts, capability declarations | Library author | By reference + lock |
| Normalized external data | commerce catalog, provider IDs, mirrored images | Sync adapters | Yes |
| Secrets & environment | Stripe keys, Resend key, Cloudflare token | Operator / deploy env | No |
| Mutable runtime state | orders, inventory, webhook state, submissions | Deployed services | No |
| Generated artifacts | `dist/`, rendered Functions, `_headers` | Compiler | Reproducible; not source |

**Belongs in the plan:** which pages/components exist; final authored content;
which libraries and versions are selected; which products are displayed;
commerce and fulfillment *policy*; metadata, domains, response-header policy;
activation of optional capabilities.

**Belongs in libraries:** component contracts; HTML structure; visual and
responsive behavior; safe client JS; Function templates; resource and secret
*declarations*; provider adapters; library-specific validation and migration.

**Does not belong in the plan:** raw secrets; provider API responses; mutable
order/inventory records; arbitrary HTML/CSS/JS escape hatches (see §5.4);
presentation knobs already owned by components and themes; generated deployment
URLs; anything derivable deterministically.

---

## 5. Small Core + Selected, Constrained Libraries

The most consequential architectural decision: keep the **core language small**
while making its **vocabulary extensible through explicitly selected, versioned
libraries.** A site's effective language is:

```text
core language + selected library contracts
```

An agent building a restaurant site receives the restaurant vocabulary, not the
schemas for certificates, Printful, or unrelated domains. This preserves
smallness (lean agent context, fewer invalid choices) while enabling growth.

### 5.1 Library categories

- **Content** — hero, prose/media sections, feature grids, quotes, resource
  cards, calls to action.
- **Domain** — restaurants, professional services, portfolios, events, product
  docs, seed catalogs.
- **Capability** — Resend contact, Stripe commerce, Printful fulfillment,
  certificates, authenticated proxies, search/subscriptions.
- **Theme** — typography, color, surfaces, spacing, component tokens against a
  stable theme contract.
- **Site-local** — private components/capabilities for one operator or project,
  not worth publishing. (Central to the escape hatch — see §5.4.)

### 5.2 Scope discipline: modularization, not an ecosystem

"Libraries" must not silently become "build npm." The committed near-term work
is **architectural modularization**, in this order:

1. Define a library contract.
2. Treat today's built-in components as the **standard library** under that
   contract — no behavior change.
3. Prove local library selection and effective-schema composition.
4. **Defer** registries, payments, signing, and marketplaces entirely.

A hosted registry, executable capability libraries, and managed multi-customer
deployment are *hypotheses*, not roadmap commitments (§10, decision 2).

### 5.3 The standard library is invisible by default

Most operators — and certainly every maker beneficiary — should never see an
`import`. The standard library is auto-selected; explicit library selection
appears only when someone reaches past it. Progressive disclosure is the
discipline that keeps "selectable libraries" from reintroducing the cognitive
cost the project exists to remove.

### 5.4 The escape hatch: site-local declarative libraries

A constrained language with no escape hatch hits a wall the first time a
customer wants something the catalog can't express — and they will, quickly.
The resolution is **not** raw HTML/CSS/JS in the plan — that breaks schema
governance, portability, and constrained authoring (the source stops being a
validated, agent-legible contract). It is:

> When the catalog can't express something, author a **site-local, constrained
> component** in a site-local library. Its *public schema* stays validated and
> agent-legible; its *implementation* may contain arbitrary trusted Nunjucks and
> CSS, exactly like a standard-library component. The escape hatch stays inside
> the compiler's contract instead of punching a hole in the plan.

This turns "the language is too small" from a dead end into a documented path
while keeping the source contract governed. It is a first-class roadmap step,
not an afterthought (§11).

### 5.5 First implementation constraint

The first library implementation is intentionally narrow: local filesystem
libraries, a declarative manifest, JSON Schema fragments, Nunjucks templates,
CSS, static assets — **no arbitrary install-time or build-time hooks.**
Executable provisioning and runtime hooks come only after the trust,
permission, reproducibility, and isolation models are designed.

---

## 6. Canonical Schema Architecture

JSON Schema makes the source language portable and machine-readable, but it is
**hybrid, not a replacement**, and its *sequencing matters*: define the
core/library boundary first, then design the schema around composition.
Shipping a monolithic schema now would ossify today's built-in arrangement and
require restructuring once libraries land.

### 6.1 Core vs. library schemas

- **Core schema** defines stable compiler concepts: source-language version,
  site identity, pages/navigation, metadata, library imports, themes,
  deployment policy, and the component-instance envelope. It does **not** embed
  every component or provider contract.
- **Library schemas** publish namespaced component schemas, optional plan-level
  capability schemas, a compiler-compatibility range, a schema version, and
  agent-facing examples.
- The compiler constructs an **effective schema** for the selected library set
  using standard JSON Schema composition.

### 6.2 The imperative layer stays

JSON Schema cannot express, and a thin imperative layer must continue to
enforce: filesystem paths, cross-file references (nav ↔ pages), catalog product
resolution, identifier uniqueness across resources, capability compatibility,
secret availability, and runtime/deployment constraints. "Shape from the
schema, relationships from the checks." Use a standard validator (`ajv`).

### 6.3 Version dimensions

Keep distinct: compiler version, build-plan language version, library package
version, library schema version, normalized catalog version, and generated
artifact format where compatibility requires it. A **lockfile** makes builds
reproducible without forcing every version number into the human-authored plan.

### 6.4 Agent & editor integration

The effective schema feeds the YAML language server (autocomplete, inline
linting), MCP schema discovery, agent prompt/context generation, and
constrained generation where a model API supports it. Schema provides an
authoritative contract and precise errors; **enforcement still happens at the
compiler boundary** — JSON Schema cannot guarantee every agent emits valid YAML.

---

## 7. Runtime & Commerce Model

Promise **minimal, explicit edge runtime**, not "zero runtime dependencies."
A static informational site compiles to assets with no application runtime; a
form or commerce site intentionally includes Functions, secrets, webhooks, and
KV/D1/R2. The compiler stays deterministic even when the deployed system is
stateful.

Grounded in the shipped commerce v1 (not a toy schema):

- **Stripe Checkout** handles payment; `manual` / `printful` are *fulfillment*
  providers (Stripe is not a fulfillment provider).
- **Webhooks run in a Pages Function; KV is the durable store** for order state
  and idempotency — the answer to "how does a static target handle webhooks
  without mutable runtime state": it doesn't, a Function does.
- **Per-site `metadata.site` stamping** ensures one shared Stripe account's
  fan-out webhooks fulfill only their own site's orders. This is a
  **within-boundary guard, not a security boundary.**
- **Personalization capability tokens** (e.g. certificate print files) are
  minted upstream and HEAD-verified live at checkout.
- Provider data is normalized to a committed catalog snapshot before
  compilation.

*Architectural direction (not yet shipped — Clodsite has no inventory tracking
today):* if inventory is added, current stock and reservations are mutable
runtime data, never source; presentation and inventory *policy* may be
declarative, but checkout must then query or atomically update an authoritative
inventory store.

### Tenant isolation is the gating constraint

Compilation scales cheaply; transaction does not. All commerce sites currently
share **one Stripe account**, and the `metadata.site` stamp is not isolation
between distrusting tenants. Per-site credentials (roadmap #12) and a real
multi-tenant model (roadmap #16) are **open**. The truthful scaling story:

> Stamp out as many sites as you like; transacting tenants still need an
> isolation model we are building.

Managed multi-customer deployment and any agency/marketplace narrative are
gated on this. Name it honestly rather than implying it's solved.

---

## 8. Claims Discipline & Measurement

The economic hypothesis: agents consume fewer tokens and produce more stable
changes editing a constrained plan than repeatedly editing generated
application code. **Plausible, not yet quantified.**

Until benchmarks exist, the only public claim is qualitative:

> Mistakes are confined to a small, reviewable source document instead of
> scattered across generated implementation code.

No percentages, no "order of magnitude," no "zero drift," no "same bytes every
time" asserted universally (determinism is the design intent, to be verified).
The "~30-line plan" figure is illustrative — real commerce sites are larger.

### Benchmark protocol

Measure representative work: (1) create a 3-page site; (2) revise homepage
positioning; (3) add a page + nav entry; (4) add a product catalog; (5) enable
checkout + fulfillment; (6) change a theme; (7) upgrade a component library;
(8) rebuild twice with no source change.

Record: input/output tokens, wall-clock time, files read/changed, diff size,
validation failures, human corrections, test failures, output hashes across
repeated builds, deployment-artifact differences, and regressions during
revision.

**The baseline is the trap.** Compare against a competent developer editing a
*small static site*, not someone fighting a React app — otherwise the number
flatters Clodsite and won't survive a skeptic. The scenarios are sound; the
baseline choice is where the claim lives or dies.

---

## 9. Open Ecosystem & Commercial Model (Hypotheses Only)

An open library format *could* let third parties build domain vocabularies
while preserving deterministic compilation. A plausible long-term model: open
compiler + open specs; a strong free standard library; paid maintained domain
and capability libraries; a hosted registry; managed deployment with secrets,
observability, and tenant isolation; trust levels for executable libraries.

These are **hypotheses, not commitments.** Open questions to answer before any
of it: Are schemas/manifests always open while implementations may be licensed?
Can a site build offline from a lockfile and local cache? Who signs and audits
executable libraries? How are security updates delivered without silently
changing output? How do themes declare compatibility with third-party
components? What is the migration contract when a library changes its schema?

Commercialization follows a credible library and trust model; it must not drive
premature complexity into the compiler core.

---

## 10. Open Decisions (for the design session)

Two genuine forks remain. The briefs substantially agree above; these are the
forks that still need an explicit operator decision.

1. **Who leads the homepage — maker outcome or technical operator?**
   Recommendation: lead with the maker *outcome*, name builders/agents as the
   real present-day *user*. But this is a deliberate call to make, not a default.

2. **How far beyond local standard-library modularity should the roadmap
   commit now?** Recommendation: commit only to *local declarative libraries*;
   treat registry, marketplace, payments, and signing as hypotheses. The
   counter-argument (commit further now to attract library authors early) is the
   exact "chase the aspirational user" mistake one layer down — but it is a call
   worth making consciously.

---

## 11. Prioritized Direction

1. **Retire `site-spec.json`.** *(Done — PR #51.)*
2. **Record the precise compiler thesis** and classify every major claim as
   *true today*, *architectural direction*, or *hypothesis requiring
   measurement*. Update repo architecture guidance to define the compiler
   boundary (§4). Publish an explicitly forward-looking interim `clodsite.com`
   update that shows what works today separately from the direction.
3. **Keep makers as the customer-facing audience; target builders and agents as
   the present-day users** (§3).
4. **Capture benchmark baselines** (§8) before architectural changes make
   comparison impossible. Mind the baseline trap.
5. **Define the small-core + selected-library model** (§5): contract, library
   categories, manifests, namespaces, local resolution, locking, and the
   trust/executable boundary.
6. **Design the composable JSON Schema architecture** around that model (§6).
7. **Implement local declarative libraries** — extract today's built-ins as the
   standard library behind the contract, no behavior change; prove multiple
   selected libraries, namespaces, effective-schema construction, deterministic
   output, locked resolution. Standard library stays invisible by default (§5.3).
8. **Ship the site-local-library escape hatch** (§5.4) so power users have a
   determinism-preserving outlet before demand forces a raw-HTML hole.
9. **Migrate validation** to a standards-compliant JSON Schema validator,
   retaining the imperative relationship checks (§6.2).
10. **Address tenant isolation** (per-site credentials, then a multi-tenant
    model) before any managed multi-customer deployment.
11. **Design executable capability libraries** (permissions, signing, secrets,
    provisioning, runtime resources, tenant isolation) — only after the
    declarative model works.
12. **Complete measurement and revise positioning** — re-run the benchmarks
    against the implemented architecture; publish only claims the results
    support; rework `clodsite.com` around the evidence.

The architectural sequence in one line:

```text
one authoring contract
  -> precise compiler boundary
  -> small core + selected libraries (local first)
  -> composable schemas
  -> escape hatch
  -> reproducible implementation
  -> tenant isolation
  -> measured claims
  -> durable positioning
```
