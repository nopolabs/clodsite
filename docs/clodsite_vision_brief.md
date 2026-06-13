# Vision Brief: Clodsite as an Agent-Native Infrastructure Compiler

## 1. Executive Summary & Core Thesis
The traditional web development paradigm assumes that software tools are built primarily for human manipulation, using visual interfaces or complex code abstractions (React, Next.js, Astro) to ease human friction. 

`clodsite` rejects this assumption in favor of a new architectural thesis:
* **HTML/CSS/JS is the new machine code (or assembly layer).** It is a highly optimized, low-level deployment target that machines—not humans—should write.
* **`build-plan.yaml` is a high-level, declarative Abstract Syntax Tree (AST).** It is a strict, domain-specific configuration contract that both humans and autonomous AI agents can reason about with perfect clarity.
* **Clodsite is the deterministic compiler.** It maps the high-level AST directly to edge-native primitives on Cloudflare Pages and Workers with zero structural drift, zero runtime dependencies, and near-zero infrastructure costs.

By anchoring the web lifecycle in a strict, declarative specification, Clodsite decouples the cognitive cost of design from the physical cost of execution.

---

## 2. The Economic Paradigm: Amortized Inference
Current market solutions (e.g., v0, Bolt.new) suffer from severe economic and structural scaling limitations due to **Inference Drift**:

```
Traditional AI Gen: Business Logic ──▶ LLM (Massive Tokens) ──▶ Brittle React Component
                                                                     │
                                         LLM (More Tokens) ◄─── Prompt for Update
                                         │
                                         ▼
                                  Broken Styles / Broken Hydration (Code Drift)
```

Every time a human requests a change on a traditional platform, the LLM must reason through thousands of lines of UI boilerplate, resulting in immense token burn and compounding structural errors.

**The Clodsite Arbitrage:**
Clodsite shifts AI inference upstream. The LLM burns tokens **exactly once** to update a 30-line deterministic YAML spec. The compiler handles the rest at compile time.

```
Clodsite Pipeline:  Business Logic ──▶ LLM (Minimal Tokens) ──▶ build-plan.yaml (Strict AST)
                                                                     │
                                                      Deterministic Compiler (0 Tokens)
                                                                     │
                                                                     ▼
                                                      Cloudflare Pages & Workers (Edge)
```

**Economic Wins:**
1. **95% Token Reduction:** AI agents manipulate data schemas, not presentation code.
2. **Infinite Scaling:** A single verified `build-plan.yaml` can be re-compiled and stamped across an arbitrary number of zero-cost edge environments without runtime or regression risks.

---

## 3. Product Positioning Shift
To capture this architectural value, Clodsite's marketing and positioning must pivot away from a simple "no-code/low-code design helper" toward an enterprise infrastructure framework.

| Dimension | Old Framing (Visual Assistant) | New Framing (Agent-Native Infrastructure) |
| :--- | :--- | :--- |
| **Target Audience** | Small business owners / Hobbyists | AI Developers, Autonomous Agencies, Platform Engineers |
| **Core Value** | "Describe your site and let Claude build it" | "Compile deterministic web targets with zero code drift" |
| **Core Abstraction** | Interactive interview session | Declarative YAML Domain-Specific Language (DSL) |
| **Competitive Edge** | Simplicity | Token economy, execution speed, strict determinism |

---

## 4. Homepage Copy Re-Architecture (`clodsite.com`)

### The Hero Banner
* **Old:** "Describe your site. Deploy it."
* **New:** > # The Agent-Native Web Compiler.
    > Stop letting AI hallucinate raw code. Clodsite compiles a declarative `build-plan.yaml` directly into hyper-fast Cloudflare Pages and Workers—with zero code drift, zero runtime dependencies, and near-zero infrastructure costs.
* Note: this message may need workshopping. Here are some bits: "You wouldn't write your own compiler", "You wouldn't do a code review on your compiler output."

### Core Narrative (Section 2)
> ### Amortize Inference. Eliminate Code Drift.
> When you ask a Large Language Model to generate raw HTML, CSS, and JavaScript components, it burns massive amounts of tokens generating boilerplate. Worse, the moment you ask for an update, the code drifts, styles break, and dependencies conflict.
> 
> **HTML/CSS/JS is the new machine code.** Humans (and AI agents) shouldn't be writing it directly.
> 
> Clodsite introduces a deterministic, schema-validated Domain Specific Language (`build-plan.yaml`). The LLM spends token inference exactly once to generate or modify the high-level plan. From there, the Clodsite compiler takes over, guaranteeing a 100% predictable, edge-optimized deployment on Cloudflare every single time.

---

## 5. First Structural Milestone: JSON Schema Migration
To solidify `build-plan.yaml` as an airtight compilation target, we must shift from imperative JavaScript validation (`validate-plan.mjs`) to a declarative JSON Schema standard (`schema.json`).

### Why AI Agents Require JSON Schema
AI tools (Claude Code, Cursor, Ollama) ingest JSON Schema natively to constrain their outputs via structured JSON/YAML generation APIs. Giving an agent a schema ensures it **cannot** hallucinate an invalid parameter key or emit incorrect data types.

### Architectural Roadmap Entry
* **Objective:** Define and enforce `schema.json` using a fast, standard parsing block (e.g., `ajv` in Node.js).
* **Developer Experience (DX):** Expose the schema to the global YAML Language Server (`# yaml-language-server: $schema=./schema.json`), unlocking instant IDE autocomplete, formatting validation, and error detection for humans and agents alike.
* **E-commerce Integration:** Explicitly define the primitives for edge-native e-commerce directly in the schema contract:
    ```yaml
    ecommerce:
      provider: stripe
      currency: USD
      products:
        - id: compiler-license-agency
          name: "Clodsite Agency Seat"
          price: 49.00
          inventory_tracking: true
    ```

---

## 6. Design Session Discussion Prompts
Use these questions to guide the upcoming engineering and design loop:
1. **The Compiler Boundary:** What primitives belong in `build-plan.yaml` vs. what should be inferred by the compiler templates? How do we keep the DSL small enough for tight LLM context windows but rich enough to build complex 5-page e-commerce layouts?
2. **The E-commerce Handshake:** How does the compiled Worker handle Stripe webhooks cleanly without injecting mutable runtime state into our otherwise static compilation target?
3. **The Agent Marketplace:** If `build-plan.yaml` is an open standard, how can we commercialize premium "Standard Library" modules (e.g., highly complex layout schemas or stateful e-commerce bindings) that third-party developer agents can buy and assemble?