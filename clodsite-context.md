# Clodsite — Planning Context for PRD Generation

> This document captures the planning conversation for **Clodsite**, a hackathon project for the Claude Code Hackathon track (48-hour online format). Use this as input to Claude Code when writing the PRD.

---

## Event Context

- **Hackathon:** [Claude Code Hackathon](https://luma.com/bf9gpp2z?tk=pCuh3t)
- **Track:** 🔵 Claude Code Hackathon — for engineers working with frontier AI models, agent frameworks, tool-use pipelines
- **Format:** Online, 48 hours, build on your schedule
- **Judged by:** Engineers, investors, and media
- **Participant:** Solo, remote, possibly slow internet
- **Goal:** Complete over fancy. Something respectable and fully working.

---

## Project Name

**Clodsite** — `clodsite.com` (registered)

The name is intentionally irreverent: "Claude" + "clod" (unsophisticated lump). The joke inverts: the clod builds a well-engineered site. Memorable, self-aware, and immediately readable by the target audience.

---

## Core Concept

Clodsite is two things simultaneously, and both matter for the submission:

### 1. A governed website-building workflow

An interview-first, spec-gated process for building and deploying structured websites using Claude Code. The AI interviews you, produces a reviewable spec, and only builds after you approve. Modifications follow the same process.

> *"Most AI site builders are autocomplete with a pretty UI. Clodsite is a structured process where the AI interviews you, produces a reviewable spec, and only builds after you approve. The same process governs future changes."*

### 2. A demonstration of hybrid skill architecture

**The deeper idea:** Natural language (English) is an expressive and comfortable programming language for describing workflows — but it is an expensive one to execute repeatedly. Every instruction processed by an LLM costs tokens. Many instructions in a skill or CLAUDE.md file are not reasoning tasks; they are deterministic operations (read a file, check if a directory exists, run a command, parse JSON) that belong in scripts, not inference calls.

> *"English is a comfortable programming language. Clodsite compiles the deterministic parts of its workflow down to scripts, reserving LLM inference for the steps that actually require reasoning."*

Clodsite is built from the start with explicit separation between script-executed steps and LLM-executed steps. This architecture is visible, documented, and is itself part of the submission story.

**The two benefits of script-over-inference:**
- **Determinism** — a script does the same thing every time; an LLM may not
- **Cost** — a bash one-liner costs nothing; the equivalent LLM call costs tokens on every execution

This is not an abstract claim. Clodsite will demonstrate it concretely by annotating each step in its workflow with its execution type.

---

## The Hybrid Architecture Principle

Every step in a Clodsite command falls into one of three categories:

| Type | Label | Examples | Executor |
|------|-------|----------|----------|
| Deterministic | `[SCRIPT]` | Read file, parse JSON, check env vars, run wrangler, create directory | bash / node script |
| Reasoning | `[LLM]` | Generate headline copy, interpret tone from user answers, write page content | Claude inference |
| Hybrid | `[HYBRID]` | Validate spec completeness (structure check = script, semantic check = LLM) | Both |

The CLAUDE.md and skill files for Clodsite will use these labels explicitly, making the architecture readable and the cost tradeoffs visible.

### Example: `/deploy` command

```
[SCRIPT] Read .env and verify CLOUDFLARE_API_TOKEN is set
[SCRIPT] Run `wrangler pages deploy ./dist --project-name $SITE_NAME`
[SCRIPT] Parse wrangler output for the deployment URL
[LLM]   If deployment fails, interpret the error and suggest a fix
[SCRIPT] Write deployment URL to site-spec.md metadata
```

Four of five steps are scripts. The LLM is only invoked for error interpretation — the one step that actually requires reasoning.

---

## Interaction Model

**Model C: Account Setup Wizard (thin onboarding layer)**

The deliverable is a **Claude Code project template** — a repo that a Claude Code user clones and runs. Not a SaaS, not a CLI app, not a web app.

### Customer Experience

```
$ git clone https://github.com/nopolabs/clodsite my-site
$ cd my-site
$ claude                 # opens Claude Code
> /setup                 # [SCRIPT] collects two tokens, writes .env, verifies access
> /interview             # [LLM] 10-question session, writes site-spec.md
> /plan                  # [HYBRID] reads spec, produces build-plan.md for review
> /build                 # [HYBRID] populates the Eleventy scaffold
> /deploy                # [SCRIPT] wrangler pages deploy → live URL in ~30 seconds
```

### Modification workflow (same discipline for changes)

```
$ claude
> /modify                # [HYBRID] delta interview, updates spec, rebuilds changed parts
```

---

## Credential Surface

Minimal and explicit. Collected once via `/setup`, stored in `.env`.

| Account | Purpose | How collected |
|---------|---------|---------------|
| Cloudflare API token | Pages deployment via Wrangler | Single prompt in `/setup` |
| GitHub token | Create output repo, push code | Single prompt in `/setup` |
| Custom domain | Optional — default is `*.pages.dev` | Ask in interview, skip if not needed |

**What is NOT required:** Shopify, Stripe, Printful. Clodsite produces generic content sites.

---

## Pipeline Phases

Each phase is a distinct Claude Code custom command. No monolithic prompts. Each command's steps are annotated with `[SCRIPT]`, `[LLM]`, or `[HYBRID]`.

| Command | Input | Output | Dominant type |
|---------|-------|--------|---------------|
| `/setup` | User prompts for tokens | `.env` with verified credentials | `[SCRIPT]` |
| `/interview` | Interactive Q&A (~10 questions) | `site-spec.md` | `[LLM]` |
| `/plan` | `site-spec.md` | `build-plan.md` for user approval | `[HYBRID]` |
| `/build` | Approved `build-plan.md` | Populated Eleventy scaffold | `[HYBRID]` |
| `/deploy` | Built site | Live `*.pages.dev` URL | `[SCRIPT]` |
| `/modify` | Delta interview + existing `site-spec.md` | Updated spec + selective rebuild | `[HYBRID]` |

---

## Output Stack

**Fixed, opinionated — no choices at build time.**

- **Static site generator:** Eleventy
- **Hosting:** Cloudflare Pages (via Wrangler)
- **Language:** TypeScript strict mode
- **Styling:** CSS with 2–3 pre-defined "personality" options (minimal, professional, bold)
- **Data layer:** `src/_data/site.json` — the file the `/build` command populates from the spec

---

## `site-spec.md` Schema (to be finalized in PRD)

The spec is the contract between `/interview` and `/build`. Zero ambiguity.

Draft fields:
- `site.name` — site/brand name
- `site.purpose` — one-sentence description of what the site does
- `site.audience` — who it's for
- `site.tone` — writing style (professional, casual, technical, friendly)
- `site.style` — visual personality (minimal, professional, bold)
- `pages[]` — list of pages with name, purpose, and content outline
- `nav` — navigation structure
- `contact` — email or form, yes/no
- `domain` — custom domain or leave as `*.pages.dev`
- `content_status` — does the customer have copy, or does Claude draft it?

---

## Reference Projects (Author's Prior Work)

These are the author's real deployed projects using the same stack. Clodsite automates what was done manually in these.

- `https://github.com/nopolabs/mtw4` — Eleventy + Cloudflare Pages + Shopify Starter ecommerce
- `https://github.com/nopolabs/bbpp` — similar stack, second store
- `https://github.com/nopolabs/hmc-cycling` — content site, same infrastructure
- `https://github.com/nopolabs/parchment` — shared Cloudflare Worker infrastructure (Satori + resvg-wasm certificate image generator), used by mtw4 and bbpp

The author has deep familiarity with this stack in production. No learning curve during the hackathon.

---

## Hackathon Schedule (48 hours)

### Pre-Hackathon (Do Before Clock Starts)
- [ ] Build the Eleventy scaffold template (won't change during hackathon)
- [ ] Define the `site-spec.md` schema (the contract — nail this first)
- [ ] Draft the 10 interview questions
- [ ] Stub out CLAUDE.md with command definitions and `[SCRIPT]`/`[LLM]`/`[HYBRID]` annotations
- [ ] Write the helper scripts for all `[SCRIPT]` steps (these are low-risk, do them early)
- [ ] Test `/setup` on a fresh environment
- [ ] Commit base repo structure to `nopolabs/clodsite`

### Day 1 (~24h): End-to-end working pipeline
- Hours 1–2: Finalize interview prompt + spec schema
- Hours 3–8: Build the `/build` phase (reads spec → populates Eleventy scaffold)
- Hours 9–12: `/deploy` working cleanly via Wrangler
- Hours 13–16: Run 3 full cycles with different inputs, fix breaks
- Hours 17–24: Buffer, rough-edge polish, README

### Day 2 (~24h): Polish + submission
- Hours 1–8: `/modify` workflow (delta interview → selective rebuild)
- Hours 9–16: Demo recording, submission writeup
- Hours 17–24: Buffer

---

## Slow Internet Mitigation

- All execution is local via Claude Code — no browser UI dependency
- `[SCRIPT]` steps run entirely offline; only `[LLM]` steps require API access
- `wrangler deploy` is a single small CLI call
- Pre-install all npm dependencies before hackathon starts (`npm ci` on good wifi)
- Eleventy builds locally — can demo without deployment if connectivity fails
- Record demo video once pipeline is working (backup for connectivity loss at submission)

---

## Judging Positioning

**For engineers:** "Every step in the workflow is labeled: script or inference. The LLM only runs where reasoning is actually required. Everything else is a bash script — deterministic, free, and fast."

**For investors:** "Inference costs compound at scale. Clodsite demonstrates a discipline for auditing and minimizing those costs without sacrificing capability."

**For media:** "The counternarrative to vibe coding — and to over-relying on LLMs for things a one-liner could do. AI as a disciplined contractor, not an autocomplete engine."

---

## Open Questions for PRD to Resolve

1. **`site-spec.md` schema** — complete field list, types, required vs optional
2. **Style personalities** — what exactly do minimal / professional / bold mean in CSS terms?
3. **Content drafting** — if `content_status = draft`, what does Claude generate and how is it reviewed?
4. **`/modify` scope** — which parts of the spec are mutable vs fixed after initial build?
5. **Repo output structure** — does `/build` write into the same repo, or create a new one?
6. **Error handling** — what happens if Wrangler deploy fails? If GitHub push fails?
7. **Multi-page support** — how many pages is reasonable for a 48h build to handle cleanly?
8. **Script inventory** — enumerate all `[SCRIPT]` steps across all commands; write these pre-hackathon

---

## Event Context (Updated)

- **Full event name:** State of Oregon | Claude Code Hackathon sponsored by VIBES DIY
- **Organizers:** PDX Hacks × Vibes DIY; hosted by Joanna Gough, Meghan Sinnott, Marcus Etes
- **In-person venue:** Portland State University Business Accelerator, 2130 SW 5th Ave
- **Author's participation:** Online track (48 hours) — author is Portland-based but traveling that weekend
- **API credits:** Anthropic is providing API credits to all participants — inference cost during the hackathon is not a personal concern. The `[SCRIPT]` vs `[LLM]` hybrid architecture argument is a **production/long-term** argument, not a hackathon cost argument.
- **Team size:** Solo or up to 4; author is participating solo
- **Tracks:** 🔵 Claude Code (author's track) + 🟡 Vibes DIY; participants may enter all 4 tracks with 4 separate projects

---

## Submission & Positioning

### The Real Stakes

This hackathon is not just a build exercise — it is a **credential**. The author's primary motivation, informed by a conversation with organizer Joanna Gough, is that participation and delivery in hackathons is a prerequisite for access to serious networking in the SF tech scene. A finished, shipped, documented project is the output that matters. The judges in the room are secondary; the GitHub repo and submission artifact are primary.

### What "Complete over fancy" actually means here

In hackathon culture, people who don't finish are forgotten. People who ship — even something modest — have a result to point to. The credential is the delivery, not the ambition. Scope decisions should always favor a working, deployed, documented result over an impressive-sounding incomplete one.

### The repo is a portfolio artifact

SF engineers will look at the code, not just the demo video. The `nopolabs/clodsite` repo must be:
- **Clean and well-structured** — the directory layout should be self-explanatory
- **Documented** — README tells the story; CLAUDE.md is readable and annotated
- **Opinionated visibly** — the `[SCRIPT]`/`[LLM]`/`[HYBRID]` annotations are not just architecture, they are a signal of how the author thinks about AI-assisted systems

### The author's narrative

The submission writeup should mention, briefly and without overselling:
- 40+ year software career, recently retired
- Building serious AI agent workflows in retirement — not tutorials, not learning exercises, actual production infrastructure
- Prior shipped work: parchment (Cloudflare Worker image generation service), mtw4, bbpp (live ecommerce stores)
- Clodsite as a distillation of hard-won discipline about what belongs in LLM inference vs. deterministic code

This narrative is unusual and memorable in a hackathon context dominated by early-career engineers.

### Joanna Gough

The author has a warm connection to organizer Joanna Gough, who is familiar with the SF tech scene and provided the motivation for participating. Acknowledge her in any "how did you hear about this" field or community-facing writeup. Close the loop.

### Post-Hackathon Artifact

Regardless of outcome, write a short post-mortem after the event:
- What was built
- What the hybrid `[SCRIPT]`/`[LLM]` architecture taught in practice
- What would be done differently
- Link to the live deployed demo site(s)

This post-mortem, as a README section or short blog post, is the artifact shared in SF networking contexts — not the submission form.

---

## Instructions for Claude Code

When generating the PRD from this document:

1. Treat the **Interaction Model**, **Pipeline Phases**, **Output Stack**, and **Hybrid Architecture Principle** as decided — do not reopen them.
2. Treat the **Open Questions** section as the primary work to resolve in the PRD.
3. The `[SCRIPT]`/`[LLM]`/`[HYBRID]` annotation scheme must be present in the PRD for every command and every significant step within each command.
4. The PRD should follow the author's standard format: zero-ambiguity specs, working checkpoints, Cloudflare infrastructure as the deployment target.
5. The audience for the PRD is the author themselves, using Claude Code to execute. Write for a solo engineer who knows the stack cold.
6. Keep scope honest to 48 hours solo. Flag anything that risks overrun.
7. The script inventory (Open Question 8) should be a complete table in the PRD — this is pre-hackathon work that de-risks Day 1.
