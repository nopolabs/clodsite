# Vision Brief (Claude): Clodsite as a Compiler for a Deliberately Small Web

> One of two parallel briefs. This is the Claude perspective; see
> `clodsite_vision_brief-codex.md` for the Codex perspective and
> `clodsite_vision_brief.md` for the original draft that prompted both.

## 1. Core Thesis

Clodsite's bet is not that AI should write websites. It's that **the act of
authoring should be separated from the act of building**, and that the seam
between them should be a small, declarative, human- and agent-readable
contract: `build-plan.yaml`.

- **`build-plan.yaml` is the inference boundary.** Everything before it is
  collaboration — a human, an agent, or both, deciding what the site says and
  does. Everything after it is deterministic bash that renders templates, runs
  Eleventy, and ships to Cloudflare Pages. This is not aspirational; it is
  exactly how the pipeline works today.
- **The compiler is the product.** Given a valid plan, the same bytes come out
  every time, at near-zero cost, with no runtime dependencies. The plan is
  reviewable, version-controlled, and re-compilable.
- **The language is deliberately small.** The component catalog is fixed.
  Actions are `label` + `href` + `style`. There is no control over columns,
  colors, spacing, or breakpoints. This is the feature, not a limitation to
  apologize for — a small language is what makes the output predictable and the
  inference cheap.

The honest one-liner: **Clodsite is a compiler for a deliberately small web
language.** Smallness is the source of every advantage that follows.

---

## 2. The Real Moat: Contained Inference, Not "Zero Drift"

The strongest argument in the original brief is the economic one, and it
survives scrutiny — with one correction.

Tools like v0 and Bolt regenerate brittle code on every edit. The LLM
re-reasons through thousands of lines of UI boilerplate each time, burning
tokens and compounding structural errors. That is real and worth attacking
directly.

Clodsite's counter is to **shift inference upstream and contain it**. The LLM
spends tokens once to produce or amend a ~30-line plan. The compiler does the
rest for free, deterministically.

The correction: drift is not *eliminated*, it is *relocated and bounded*. The
compiler is deterministic, but the agent authoring the YAML is not — a
wrong-but-valid plan compiles perfectly into a wrong site. So the accurate
claim is not "zero drift" or "100% predictable." It is:

> **Mistakes are confined to a 30-line reviewable artifact instead of scattered
> across thousands of lines of generated code.**

That is a *better* claim than the original, because it's true and it's what a
skeptical engineer would actually verify. We should make claims we can defend
in a demo. We do not have a measured "95% token reduction," so we should not
print one; "an order of magnitude less inference per edit, contained to a
diffable file" is both honest and compelling.

---

## 3. Positioning: Compiler is the *How*, Makers are the *Who*

The original brief proposes pivoting the audience from "small business owners /
hobbyists" to "AI developers, autonomous agencies, platform engineers." I think
this is the one strategic mistake to avoid.

Every live Clodsite site is evidence for the *opposite* audience: a $1 treat
store (anchovy), peace-prize certificates (bigbeautifulpeaceprize.com), a
cycling club. The demonstrated, shipping value is "I described a site and it was
live in minutes, and it won't break when I change it." That is a maker /
small-business story, and it works **today**. The enterprise-infrastructure
buyer needs far more than 1–5 static pages and hits the catalog ceiling on day
one.

These are not competing framings; they are different layers of the same pitch:

| Layer | Role | Who it convinces |
| :--- | :--- | :--- |
| **Outcome** | "A real site, live in minutes, that won't break when you change it" | The buyer / maker |
| **Mechanism** | "Because it compiles a small declarative plan, not brittle code" | The technical evaluator |

Lead with the outcome. Let the compiler / amortized-inference story be the
*reason it's better*, underneath. The hero line "Stop letting AI hallucinate
raw code" speaks to a developer's anxiety, not to someone who wants a website —
wrong person at the top of the funnel. (Keep "you wouldn't code-review your
compiler's output" — it's on-thesis and excellent further down the page.)

**Proposed hero:**
> # Describe your site. Compile it. Keep it.
> Clodsite turns a short, plain plan into a fast Cloudflare site — and because
> the plan is the source of truth, changing your site means changing a few
> lines, not regenerating brittle code. No drift. No runtime. Near-zero cost.

The agent-native angle is real and should be *present* — agents are
first-class authors of `build-plan.yaml` — but it's the second paragraph, not
the marquee.

---

## 4. The First Structural Milestone: JSON Schema (Hybrid, Not Replacement)

This is roadmap item #5 and it's the right next step, with one clarification
the original brief glosses: **JSON Schema cannot replace `validate-plan.mjs`; it
augments it.**

Cross-file and cross-system invariants — nav↔page reference integrity, catalog
slug resolution, filesystem existence of referenced assets, personalization
URL resolution — are not expressible in JSON Schema and must remain a thin
imperative layer. The target architecture is:

- **`schema.json`** validates *shape and types* (and feeds agents and the YAML
  language server directly via `# yaml-language-server: $schema=`).
- **A thin imperative layer** enforces the *cross-references* the schema can't.

The payoff is real and concrete: agents constrain their output against the
schema natively (no hallucinated keys or wrong types), and humans get inline
autocomplete and linting while hand-editing plans. Use a standard fast
validator (`ajv`). Frame it as "shape from the schema, relationships from the
checks," not "schema replaces code."

---

## 5. E-commerce: Reconcile the Vision With What Shipped

The original brief sketches a toy `ecommerce:` block (`provider`, `currency`,
`products`, `inventory_tracking`). The shipped commerce v1 design is more
sophisticated than that sketch, and the vision should be built on it rather than
around it. What already exists:

- A `commerce` block plus a `commerce/catalog.json` of products.
- Pluggable providers (manual and Stripe), manual fulfillment in v1.
- Personalized products via capability tokens (e.g. certificate print files),
  with live HEAD-verification at checkout.
- **KV-backed webhook idempotency and order state** — the answer to "how does a
  static target handle Stripe webhooks without mutable runtime state": it
  doesn't; a Pages Function does, with KV as the durable store.
- **Per-site `metadata.site` stamping** so one shared Stripe account's fan-out
  webhooks fulfill only their own site's orders.

Two implications for the vision:

1. The open question in the original brief ("how does the compiled Worker handle
   Stripe webhooks cleanly?") is **already answered for v1**. State the answer
   and ask the real follow-up: does the Pages-Function-plus-KV pattern
   generalize to richer commerce without leaking mutable state into the static
   layer?
2. The harder, *unsolved* problem is **tenant isolation**, and it gates the
   most ambitious scaling claims (see §6).

---

## 6. The Honest Constraint on "Infinite Scaling": Tenant Isolation

The original brief claims a verified plan can be "stamped across an arbitrary
number of zero-cost edge environments." Compilation, yes — that part is genuinely
cheap and repeatable. But the moment those environments transact, the shared-
account reality bites:

- All commerce sites currently share **one Stripe account**.
- The `metadata.site` stamp is a **within-boundary guard, not a security
  boundary**. It prevents accidental cross-fulfillment; it is not isolation
  between distrusting tenants.
- Per-site credentials and a real multi-tenant model are roadmap #12 and #16 —
  **open**.

So the truthful scaling story today is: **"stamp out as many sites as you like;
transacting tenants still need an isolation model we're building."** If the
long-term pitch is "autonomous agencies spinning up client sites," tenant
isolation is *the* gating problem, and naming it honestly is more credible than
claiming it's already solved.

---

## 7. Discussion Prompts (Refined)

1. **DSL surface area.** What primitives belong in `build-plan.yaml` vs. what the
   compiler should infer? The tension is real: small enough for tight context
   windows, expressive enough for the sites people actually want. My bias:
   resist growing the language; grow the *catalog* of constrained components
   instead, since each component is itself a small, validated contract.
2. **Where does state live?** v1's answer is Pages Functions + KV at the edge,
   outside the static target. Does that pattern hold for the next tier of
   dynamic features (carts, accounts, inventory) without reintroducing the
   runtime complexity the whole project exists to avoid?
3. **Tenant isolation before marketplace.** The "agent marketplace / premium
   standard-library modules" idea is a fine north star, but it presumes a
   multi-tenant substrate that doesn't exist yet. Sequence: isolation model →
   per-site credentials → *then* anything resembling a marketplace.

---

## 8. Summary

What I'd keep from the original: the inference-boundary thesis, the
amortized-inference argument, the JSON Schema milestone, and the
"don't review your compiler's output" line.

What I'd change:

- **Stop inventing metrics** ("95%", "100% predictable"). Claim what a demo can
  prove: contained, diffable inference.
- **Keep your proven audience.** Compiler is the *how*; makers and small
  businesses are the *who*. Don't trade demonstrated demand for an aspirational
  buyer.
- **Build the e-commerce vision on the shipped design**, not a toy schema, and
  note that the webhook question is already answered.
- **Name tenant isolation as the real gating problem** for the scaling and
  agency narratives, instead of implying it's solved.
- **Frame JSON Schema as hybrid** (shape from schema, relationships from
  imperative checks), not a full replacement.

The thesis is right, and — unusually — the architecture already backs it. The
work is to make the *claims* as disciplined as the *compiler*.
