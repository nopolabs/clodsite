# Vision Brief: Clodsite as an Agent-Native Web Compiler

## 1. Executive Summary

Clodsite is evolving from an AI-assisted static-site builder into an
agent-native web compiler.

Its central abstraction is `build-plan.yaml`: a compact, declarative source
document describing a site's content, capabilities, and deployment intent.
Agents and humans collaborate on that document. Clodsite validates it and
deterministically compiles it into HTML, CSS, JavaScript, Cloudflare Pages
Functions, and deployment configuration.

The durable product thesis is:

> Agents should reason about intent and constrained domain concepts, not
> repeatedly regenerate presentation and infrastructure code.

Clodsite concentrates inference before the build boundary. Everything after a
valid plan should be deterministic, testable, reproducible, and inexpensive.

This brief deliberately distinguishes:

- what Clodsite does today;
- the architectural direction now being designed;
- hypotheses that require measurement before becoming marketing claims.

---

## 2. What Is True Today

Clodsite currently provides:

- A human-readable `build-plan.yaml` contract.
- A constrained catalog of typed page components.
- Deterministic rendering into Eleventy/Nunjucks templates and static assets.
- Three built-in visual themes.
- Cloudflare Pages deployment and custom-domain automation.
- Generated Pages Functions for selected runtime capabilities.
- Contact forms using Resend and optional Turnstile protection.
- Stripe Checkout, webhook processing, and fulfillment-provider support for
  small commerce sites.
- Provider-synced commerce catalogs and locally mirrored product assets.
- Validation before build and deployment.
- An MCP interface exposing selected Clodsite operations to agents.

The build pipeline already treats `build-plan.yaml` as its authoritative
input. The older `site-spec.json` workflow remains only as legacy scaffolding
and is scheduled for removal.

Clodsite is not yet:

- A general-purpose web application framework.
- A multi-tenant hosted platform.
- A fully schema-driven compiler.
- A package ecosystem for third-party components.
- An enterprise-isolated deployment service.
- Proven to reduce tokens by a specific percentage.

---

## 3. Architectural Thesis

### 3.1 Generated web code is compiler output

For Clodsite's target class of websites, HTML, CSS, client JavaScript, and
Cloudflare integration code should usually be generated artifacts rather than
the primary authoring surface.

Calling these artifacts "machine code" is a useful analogy, not a literal
equivalence. They remain readable and debuggable, but routine changes should
normally occur in the higher-level plan or library source instead.

The practical rule is:

> Review and version the source contract and compiler libraries. Inspect
> generated output when debugging, testing, auditing, or verifying a release,
> but do not make it the normal editing interface.

### 3.2 `build-plan.yaml` is the source language

`build-plan.yaml` is a declarative domain-specific language for assembling
targeted informational and small commerce websites.

It expresses:

- site identity and public metadata;
- pages and navigation;
- ordered component instances and their content;
- selected themes and libraries;
- capability policy such as forms or commerce;
- deployment intent that belongs in version control.

It should remain compact enough for agents to understand in a small context
window. It should not become a serialization of every CSS property, generated
DOM node, provider response, secret, or mutable runtime record.

### 3.3 Clodsite is the compiler and linker

The compiler:

1. Resolves the selected libraries.
2. Constructs the effective schema.
3. Parses and validates the plan.
4. Performs cross-resource and filesystem validation.
5. Resolves normalized catalogs and local assets.
6. Renders templates, styles, scripts, Functions, and deployment files.
7. Produces a reproducible deployment artifact.
8. Provisions declared edge capabilities during deployment.

Library resolution makes Clodsite more than a template renderer: it links
independently versioned vocabularies and implementations into one site.

---

## 4. The Compiler Boundary

The architecture should distinguish five forms of data.

| Layer | Examples | Owner | Versioned with site? |
|---|---|---|---|
| Declarative source | `build-plan.yaml` | Human and agent | Yes |
| Library source | schemas, templates, CSS, scripts, capability declarations | Library author | By reference and lock |
| Normalized external data | commerce catalog, provider identifiers, mirrored images | Sync adapters | Yes |
| Secrets and environment | Stripe keys, Resend key, Cloudflare token | Operator/deployment environment | No |
| Mutable runtime state | orders, inventory, webhook state, submissions | Deployed services | No |
| Generated artifacts | `dist/`, rendered Functions, headers | Compiler | Reproducible; normally not source |

### What belongs in the plan

Include values that represent deliberate site intent:

- which pages and components exist;
- final authored content;
- which libraries and versions are selected;
- which products are displayed;
- commerce and fulfillment policy;
- metadata, domains, and response-header policy;
- activation of optional capabilities.

### What belongs in libraries

Libraries own reusable implementation decisions:

- semantic component contracts;
- HTML structure;
- visual behavior and responsive layout;
- safe client-side behavior;
- generated Function templates;
- resource and secret declarations;
- provider-specific adapters;
- library-specific validation and migration rules.

### What does not belong in the plan

Exclude:

- raw secrets;
- provider API responses;
- mutable order and inventory records;
- arbitrary HTML/CSS/JavaScript escape hatches;
- presentation knobs already owned by components and themes;
- generated deployment URLs;
- values that can be derived deterministically.

---

## 5. Component And Capability Libraries

Clodsite should evolve from one built-in component directory into a compiler
with importable libraries.

### 5.1 Library categories

#### Content libraries

Static communication patterns:

- hero;
- prose and media sections;
- feature grids;
- quotes;
- resource cards;
- calls to action.

#### Domain libraries

Structured vocabularies for particular website goals:

- restaurants;
- professional services;
- portfolios;
- events;
- product documentation;
- seed catalogs.

#### Capability libraries

Features that contribute runtime behavior or deployment resources:

- Resend contact;
- Stripe commerce;
- Printful fulfillment;
- certificates;
- authenticated proxies;
- search or subscriptions.

#### Theme libraries

Typography, color, surfaces, spacing, and component-token implementations
conforming to a stable theme contract.

#### Site-local libraries

Private components and capabilities that belong to one operator or project and
do not warrant publication.

### 5.2 Possible source declaration

The exact syntax requires design, but the source language may eventually
declare imports explicitly:

```yaml
clodsite: 1

libraries:
  - package: "@clodsite/content"
    version: "1.2.0"
  - package: "@clodsite/commerce-stripe"
    version: "1.0.0"
  - path: ./libraries/pdx-seeds

pages:
  - id: home
    title: Home
    components:
      - type: content/hero
        heading: Seeds selected in Portland
```

Namespaces prevent collisions and reveal ownership. A lockfile should pin the
resolved package, integrity hash, compiler compatibility, and transitive
dependencies.

### 5.3 Initial implementation constraint

The first library implementation should be intentionally narrow:

- local filesystem libraries;
- declarative manifest;
- JSON Schema fragments;
- Nunjucks templates;
- CSS;
- static assets;
- no arbitrary install-time or build-time hooks.

Executable provisioning and runtime capability hooks should follow only after
the trust, permission, reproducibility, and isolation models are designed.

### 5.4 Why libraries matter to agents

The effective agent vocabulary becomes:

```text
core schema + schemas from selected libraries
```

An agent working on a restaurant site need not receive schemas for
certificates, Printful, or unrelated business domains. Smaller, relevant
contracts should improve context efficiency and reduce invalid choices.

This is a hypothesis worth measuring rather than assuming.

---

## 6. Canonical Schema Architecture

JSON Schema is required to make the source language portable and
machine-readable, but schema migration should follow the compiler/library
boundary design rather than precede it.

### 6.1 Core schema

The core schema should define stable compiler concepts:

- source-language version;
- site identity;
- pages and navigation;
- metadata;
- library imports;
- themes;
- deployment policy;
- component-instance envelope.

It should not contain every component or provider contract directly.

### 6.2 Library schemas

Each library should publish:

- namespaced component schemas;
- optional plan-level capability schemas;
- compiler compatibility range;
- library schema version;
- examples and agent-facing descriptions.

The compiler should construct an effective schema for the selected library
set. Standard JSON Schema composition should be used where practical, with a
thin imperative layer retained for checks involving:

- filesystem paths;
- cross-file references;
- catalog product resolution;
- unique identifiers across resources;
- capability compatibility;
- secret availability;
- runtime/deployment constraints.

### 6.3 Version dimensions

Keep these versions distinct:

- Clodsite compiler version;
- build-plan language version;
- library package version;
- library contract/schema version;
- normalized catalog version;
- generated artifact format where compatibility requires it.

A lockfile should make a build reproducible without forcing every version
number into the human-authored plan.

### 6.4 Agent and editor integration

The effective schema should support:

- YAML language-server validation and completion;
- MCP schema discovery;
- agent prompt/context generation;
- constrained generation where a model API supports it;
- deterministic validation and repair loops elsewhere.

JSON Schema cannot guarantee that every agent emits valid YAML. It provides an
authoritative contract and precise errors; enforcement still occurs at the
compiler boundary.

---

## 7. Runtime And Commerce Model

Clodsite should promise minimal, explicit edge runtime rather than "zero
runtime dependencies."

A static informational site may compile to assets with no application runtime.
A commerce or form site intentionally includes Cloudflare Functions, secrets,
webhooks, KV/D1/R2, or external APIs.

The compiler remains deterministic even when the deployed system is stateful:

- the plan and locked libraries determine which runtime resources and handlers
  are generated;
- secrets enter only at deployment;
- mutable state remains outside the source plan;
- webhook and order processing must be idempotent and observable;
- provider data is normalized before compilation;
- runtime state is never mistaken for source code.

Inventory illustrates the boundary:

- product presentation and inventory policy may be declarative;
- current stock counts and reservations are mutable runtime data;
- catalog snapshots may be committed for reproducible presentation;
- checkout must query or atomically update the authoritative inventory store.

---

## 8. Economic Thesis And Measurement

Clodsite's economic hypothesis is that agents consume fewer tokens and produce
more stable changes when editing a constrained plan than when repeatedly
editing generated application code.

That is plausible but not yet quantified.

### Benchmark scenarios

Measure representative work:

1. Create a three-page informational site.
2. Revise homepage positioning.
3. Add a page and navigation entry.
4. Add a product catalog.
5. Enable checkout and fulfillment.
6. Change a visual theme.
7. Upgrade a component library.
8. Rebuild twice without source changes.

### Compare

- Clodsite plan and library workflow.
- Direct agent editing of a small conventional static or framework-based site.

### Record

- input and output tokens;
- wall-clock time;
- number of files read and changed;
- generated diff size;
- validation failures;
- human corrections;
- test failures;
- output hashes across repeated builds;
- deployment artifact differences;
- regressions introduced during revisions.

Until this evidence exists, public messaging should say that Clodsite is
designed to reduce repeated inference and structural drift, not claim a fixed
percentage reduction or their complete elimination.

---

## 9. Product Positioning

### Current positioning

Clodsite is a working build-plan-first website compiler for targeted
informational and small commerce sites deployed to Cloudflare.

### Forward-looking positioning

Clodsite is evolving toward an open, agent-native compiler and library system
for assembling deterministic edge websites from compact declarative plans.

### Initial audience

The near-term audience is:

- AI-assisted developers;
- autonomous agency builders;
- engineers experimenting with agent-native workflows;
- small teams wanting reproducible sites without application-framework
  maintenance.

"Enterprise infrastructure framework" should remain an ambition until
Clodsite provides:

- customer-per-site credential isolation;
- a formal trust model;
- library supply-chain security;
- compatibility and deprecation policy;
- deployment observability;
- tenant-aware runtime storage;
- operational support expectations.

### Website messaging

An interim `clodsite.com` update should label the compiler/library system as a
direction and show what works today separately.

Evidence-backed claims and final positioning should follow the architecture and
benchmark work.

Possible interim headline:

> **A build-plan-first web compiler for AI agents.**
>
> Clodsite turns constrained, reviewable site plans into fast Cloudflare
> websites. Today it compiles content, components, forms, and small commerce
> sites. It is evolving toward a versioned library system for agent-native web
> infrastructure.

---

## 10. Open Ecosystem And Commercial Model

An open library format could let third parties create domain-specific
vocabularies while preserving deterministic compilation.

A plausible product model is:

- open compiler;
- open build-plan and library specifications;
- strong free standard library;
- paid, maintained domain and capability libraries;
- hosted registry and compatibility testing;
- managed deployment, secrets, observability, and tenant isolation;
- certification or trust levels for executable capability libraries.

Open questions:

- Are schemas and manifests always open while implementations may be licensed?
- Can a site build offline from a lockfile and local cache?
- Who signs and audits executable libraries?
- How are security updates delivered without silently changing output?
- How do themes declare compatibility with third-party components?
- What is the migration contract when a library changes its schema?

Commercialization should follow a credible library and trust model, not drive
premature complexity into the compiler core.

---

## 11. Prioritized Next Steps

### 1. Retire `site-spec.json`

Make `build-plan.yaml` the sole authoring contract. Preserve `/interview` as an
optional customer experience that writes and validates the plan directly.

### 2. Refine and record the thesis

Classify major claims as:

- true today;
- architectural direction;
- hypothesis requiring measurement.

Update repository architecture guidance to define the compiler boundary and
its treatment of runtime capabilities.

Publish an interim, explicitly forward-looking update to `clodsite.com`.

### 3. Capture benchmark baselines

Define scenarios and record the current Clodsite and direct-code baselines
before architectural changes make comparison difficult.

### 4. Define the compiler and library model

Specify:

- core responsibilities;
- library categories;
- manifests and namespaces;
- local resolution and locking;
- trust and executable-code boundaries;
- theme and component compatibility;
- source, synced data, secrets, runtime state, and generated artifacts.

### 5. Design the canonical JSON Schema architecture

Design the core schema, library schema registration, effective-schema
composition, cross-resource validation, versioning, migrations, editor support,
and MCP exposure.

### 6. Implement local declarative libraries

Extract existing built-in components behind the approved library contract
without changing their public behavior. Prove multiple selected libraries,
namespaces, effective-schema construction, deterministic output, and locked
resolution.

### 7. Migrate validation

Adopt a standards-compliant JSON Schema validator while retaining focused
imperative checks for relationships JSON Schema cannot express.

### 8. Design executable capability libraries

Only after the declarative model works, design permissions, signing, secrets,
provisioning, runtime resources, and tenant isolation for libraries that
generate or execute code.

### 9. Complete measurement and revise positioning

Repeat the benchmarks against the implemented architecture. Publish exact
claims supported by the results and rework `clodsite.com` around the resulting
evidence.

---

## 12. Near-Term Decisions

The next design sessions should answer:

1. What is the smallest stable Clodsite core?
2. Which current top-level plan fields belong to core versus a library?
3. Are components always namespaced in source, including the standard library?
4. What can a declarative library contribute in version one?
5. How is the effective schema generated and exposed to agents?
6. What belongs in the site lockfile?
7. How are themes and third-party components tested for compatibility?
8. Which benchmark scenarios can be captured before implementation begins?

The architectural sequence is:

```text
one authoring contract
  -> precise compiler boundary
  -> constrained library model
  -> composable schemas
  -> reproducible implementation
  -> measured claims
  -> durable product positioning
```
