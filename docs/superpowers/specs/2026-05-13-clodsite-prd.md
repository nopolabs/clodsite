# Clodsite — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-13  
**Author:** Solo engineer (danrevel)  
**Audience:** Author using Claude Code to execute. Written for someone who knows the stack cold.  
**Scope:** Hackathon build — 48 hours, solo, online track  

---

## 1. What We Are Building

Clodsite is a opinionated website-building workflow delivered as a Claude Code project template. A user clones the repo, runs five commands in order, and has a live static site on Cloudflare Pages. Every command step is annotated `[SCRIPT]`, `[LLM]`, or `[HYBRID]` to make the execution model explicit and auditable.

The central idea is not that vibing is bad — it's that vibing belongs in specific lanes. Generating copy, synthesizing interview answers, interpreting a deployment error: these are `[LLM]` steps, and creative, generative behavior is exactly right there. Parsing YAML, running wrangler, checking an exit code: these are `[SCRIPT]` steps, and deterministic behavior is exactly right there. The annotation scheme draws the lane markers. Each approach does what it's actually good at.

The deliverable is a GitHub repo (`nopolabs/clodsite`) that is:
- A working tool (clone it, run it, get a site)
- A portfolio artifact (clean structure, readable CLAUDE.md, annotated architecture)
- A demonstration of hybrid skill architecture (vibes in the LLM steps, engineering in the script steps)

**What Clodsite is not:** a SaaS, a CLI app, a web UI, or a no-code builder.

---

## 2. Hybrid Architecture Principle

Every step in every command is one of three types:

| Label | Description | Executor |
|-------|-------------|----------|
| `[SCRIPT]` | Deterministic operation — same result every time | bash / node script |
| `[LLM]` | Requires reasoning, interpretation, or generation | Claude inference |
| `[HYBRID]` | Structural validation by script, semantic work by LLM | Both |

These labels appear in CLAUDE.md, in skill files, and in this document. They are architecture, documentation, and submission narrative simultaneously.

**The framing:** This is not a rejection of vibe coding — it's a lane assignment. `[LLM]` steps are where generative, creative, non-deterministic behavior belongs: writing copy, interpreting tone, synthesizing answers into a spec. `[SCRIPT]` steps are where that same behavior would be wasteful or unreliable: reading files, validating schemas, running CLI tools. Clodsite channels vibes into the steps where they create value, and uses scripts for everything else.

**The production argument (not a hackathon cost argument):** Script-executed steps are deterministic and free. LLM-executed steps are non-deterministic and cost tokens on every run. API credits are provided for the hackathon; the architecture argument is about production systems at scale — where the cost of inference compounds and the value of determinism compounds alongside it.

**Orchestration model — hackathon vs. production:**

*Hackathon (Model A):* Claude is the orchestrator. The `.claude/commands/` files are markdown instructions; Claude follows them, uses its Bash tool to invoke `[SCRIPT]` steps, and handles `[LLM]` steps itself. The `[SCRIPT]`/`[LLM]` annotations are advisory — they instruct Claude what to do and document intent, but enforcement is by convention, not architecture. This is the right model for rapid prototyping.

*Production evolution (Model B):* A bash script drives each command. `[SCRIPT]` steps run as plain shell. `[LLM]` steps call `claude -p "..."` to get inference output, capture it, and continue. Flow control is explicit: exit codes, conditionals, pipes. The `[SCRIPT]`/`[LLM]` separation becomes structurally enforced — Claude cannot wander into a deterministic step. This is the natural next step after the hackathon and is worth documenting in the post-mortem.

---

## 3. Interaction Model

The repo is the tool and the site. A user clones `nopolabs/clodsite` as their site repo — there is no separate output repo.

```
$ git clone https://github.com/nopolabs/clodsite my-site
$ cd my-site
$ claude                  # opens Claude Code
> /setup                  # collect and verify Cloudflare token, write .env
> /interview              # 10-question session, write site-spec.md
> /plan                   # read spec, generate build plan (with copy if drafting), write build-plan.md
> /build                  # read approved plan, populate Eleventy scaffold, build dist/
> /deploy                 # wrangler pages deploy ./dist → live URL + NEXT-STEPS.md
```

**Deploy model:** `wrangler pages deploy` runs locally from the cloned repo. No GitHub Actions, no CI pipeline. Setting up GitHub-connected deployments is documented in the generated `NEXT-STEPS.md`.

**Modification:** `/modify` is out of hackathon scope. The spec schema and `spec_version` field are designed as extension points for a future `/modify` command. See Section 9.

---

## 4. Credential Surface

Minimal. Collected once in `/setup`, stored in `.env` (gitignored).

| Variable | Purpose | Collected by |
|----------|---------|--------------|
| `CLOUDFLARE_API_TOKEN` | Wrangler Pages deployment | `/setup` — single prompt, verified via `wrangler whoami` |

No GitHub token. No Stripe, Shopify, or any other third-party credential.

**Custom domain:** collected during `/interview` as an optional spec field. If `domain.custom = true`, the user sets it up manually in the Cloudflare dashboard post-deploy. `NEXT-STEPS.md` covers this.

---

## 5. `site-spec.md` Schema

The spec is the contract between `/interview` and `/build`. Zero ambiguity. Every field has a type, a required/optional flag, and a validation rule.

```yaml
# site-spec.md
# Generated by /interview. Read by /plan and /build.
# Do not edit manually — use /interview to regenerate or (future) /modify to update.

site:
  name: string           # required — brand/site name
  purpose: string        # required — one sentence: what this site does
  audience: string       # required — who it's for
  tone: enum             # required — professional | casual | technical | friendly
  style: enum            # required — minimal | professional | bold

pages:                   # required — 2 to 5 entries
  - id: string           # required — URL slug, e.g. "home", "about", "services"
    title: string        # required — display name, e.g. "About Us"
    purpose: string      # required — one sentence: what this page does
    content_outline: string  # required — user copy or Claude directive for drafting

nav:
  order: [string]        # required — ordered list of page ids
  show_contact_link: boolean  # required

contact:
  enabled: boolean       # required
  type: enum             # required if contact.enabled = true — email | form
  email: string          # required if contact.type = email

domain:
  custom: boolean        # required
  hostname: string       # required if domain.custom = true; omit otherwise

content_status: enum     # required — provided | draft
                         # provided: user supplied copy in content_outline fields
                         # draft: Claude generates copy in /plan phase

meta:
  generated_at: timestamp    # written by /interview
  deployed_url: string       # written by /deploy on success
  spec_version: "1.0"        # extension hook for future /modify compatibility
```

**Validation rules (enforced by `[SCRIPT]` in `/plan` before any LLM work):**
- `pages` array: 2–5 entries
- `site.tone`: must be one of `professional | casual | technical | friendly`
- `site.style`: must be one of `minimal | professional | bold`
- `contact.type`: required and valid if `contact.enabled = true`
- `domain.hostname`: required if `domain.custom = true`
- All `pages[].id` values: unique, lowercase, no spaces

**`content_outline` dual role:**
- When `content_status = provided`: contains the actual copy the user supplied during the interview
- When `content_status = draft`: contains a directive Claude uses to generate full copy (e.g., "services page for a freelance UX designer, emphasizing research-led process")

---

## 6. Pipeline Commands — Full Step Annotations

### How command files work (hackathon model)

Each command is a markdown file in `.claude/commands/`. Claude reads it and orchestrates execution: for `[SCRIPT]` steps it invokes the named script via its Bash tool; for `[LLM]` steps it performs the inference itself. The annotations tell Claude which mode to use — they are instructions, not machine-enforced routing.

Scripts communicate results to subsequent `[LLM]` steps via stdout or well-defined temp files (e.g., `validate-spec.sh` writes failing field names to stdout and exits non-zero; Claude reads that output and decides what to say to the user).

---

### `/setup` — `[SCRIPT]` dominant

```
[SCRIPT] bash scripts/setup.sh
```

`setup.sh` internally: checks wrangler is installed, prompts for `CLOUDFLARE_API_TOKEN` (masked), verifies via `wrangler whoami`, writes to `.env` on success, exits with error message on failure.

---

### `/interview` — `[LLM]` dominant

```
[LLM]   Run the 10-question interview session (see Section 7).
        Collect all answers, then synthesize into the site-spec.md schema (see Section 5).
        Output the completed spec as YAML, exactly matching the schema — no extra fields, no omissions.
[SCRIPT] bash scripts/write-spec.sh
```

`write-spec.sh` receives the YAML on stdin (piped from the LLM output) and writes it to `site-spec.md`. Prints confirmation and next step.

---

### `/plan` — `[HYBRID]`

```
[SCRIPT] bash scripts/validate-spec.sh
         (exits non-zero with failing field names on stdout if validation fails — no partial plan written)
[LLM]   Read site-spec.md.
        If content_status = draft: generate full page copy for each page using content_outline as directive.
        Generate build-plan.md: page-by-page breakdown of what /build will produce,
        including all generated copy so the user can review before building.
        Output the complete build plan as markdown.
[SCRIPT] bash scripts/write-plan.sh
```

`validate-spec.sh` reads `site-spec.md`, checks all required fields and enum values (see Section 5), and exits 0 on success or 1 with a list of failing fields on stdout. If it exits 1, the command stops before any LLM work runs.

`write-plan.sh` receives the plan markdown on stdin and writes it to `build-plan.md`. Prints: "Review build-plan.md and run /build when ready."

**Gate:** The user reviews `build-plan.md` before running `/build`. To make changes, they edit `site-spec.md` and re-run `/plan`.

---

### `/build` — `[HYBRID]`

```
[SCRIPT] bash scripts/write-site-json.sh
         (reads site-spec.md + build-plan.md, writes src/_data/site.json)
[SCRIPT] bash scripts/apply-theme.sh
         (copies scaffold/css/themes/[site.style].css into place)
[LLM]   Read site-spec.md and build-plan.md.
        Generate an Eleventy page template (.njk) for each page in pages[].
        Templates reference site.json data via Eleventy data cascade — do not inline content.
        Write each template to scaffold/src/[page.id].njk.
[SCRIPT] bash scripts/build-site.sh
         (runs eleventy --build, verifies dist/ is non-empty, exits with error if empty)
```

---

### `/deploy` — `[SCRIPT]` dominant

```
[SCRIPT] bash scripts/deploy.sh
         (reads .env, runs wrangler deploy, captures output)
[LLM]   Only if deploy.sh exits non-zero: read the captured stderr from scripts/.deploy-error,
        interpret the error, and print a plain-English fix suggestion.
        Common cases: auth token invalid, project name conflict, dist/ missing or empty.
[SCRIPT] bash scripts/deploy-finalize.sh
         (only runs on exit 0: parses URL from scripts/.deploy-output,
          writes URL to site-spec.md meta.deployed_url,
          writes NEXT-STEPS.md with URL substituted — see Section 9,
          prints the live URL)
```

`deploy.sh` writes stdout to `scripts/.deploy-output` and stderr to `scripts/.deploy-error` (both gitignored). `$SITE_NAME` is derived inside the script by slugifying `site.name`: lowercase, spaces→hyphens, non-alphanumeric stripped.

---

## 7. Interview Questions (`/interview`)

Ten questions. Each maps to one or more spec fields. Order is deliberate: identity first, structure second, content last.

| # | Question | Maps to |
|---|----------|---------|
| 1 | What is the name of your site or brand? | `site.name` |
| 2 | In one sentence, what does this site do or offer? | `site.purpose` |
| 3 | Who is this site for? | `site.audience` |
| 4 | What tone should the writing have? (professional / casual / technical / friendly) | `site.tone` |
| 5 | What visual personality fits best? (minimal / professional / bold) | `site.style` |
| 6 | What pages do you need? List them. (2–5, e.g. Home, About, Services, Contact) | `pages[].id`, `pages[].title` |
| 7 | For each page: what is the purpose of this page in one sentence? | `pages[].purpose` |
| 8 | Do you have copy ready, or should Claude draft it? (provided / draft) | `content_status` |
| 9 | If provided: paste or describe the content for each page. If draft: describe what each page should say. | `pages[].content_outline` |
| 10 | Do you want a contact method? If yes: email address or contact form? | `contact.*`, `nav.show_contact_link` |
| +  | Do you have a custom domain, or is pages.dev fine for now? | `domain.*` |

The domain question is optional and asked last — most users will skip it.

---

## 8. Output Stack

Fixed. No choices at build time.

| Layer | Choice | Notes |
|-------|--------|-------|
| Static site generator | Eleventy | Author has production experience |
| Hosting | Cloudflare Pages | Via Wrangler CLI, local deploy |
| Language | TypeScript strict mode | Eleventy config only; templates are Nunjucks |
| Styling | CSS custom properties | Three personality themes (see Section 8a) |
| Data layer | `src/_data/site.json` | Written by `/build` from spec + plan |

### 8a. Style Personalities

Three CSS themes. Selected in `/interview`, applied by copying the appropriate file in `/build`. No runtime switching.

**minimal**
```css
--color-bg: #ffffff;       --color-text: #1a1a1a;
--color-accent: #0066cc;   --color-surface: #f5f5f5;
--font-heading: 'Inter', sans-serif;
--font-body: 'Inter', sans-serif;
--border-radius: 2px;      --spacing-section: 4rem;
```

**professional**
```css
--color-bg: #fafafa;       --color-text: #212121;
--color-accent: #1a3a5c;   --color-surface: #e8edf2;
--font-heading: 'Merriweather', serif;
--font-body: 'Source Sans 3', sans-serif;
--border-radius: 4px;      --spacing-section: 5rem;
```

**bold**
```css
--color-bg: #0f0f0f;       --color-text: #f0f0f0;
--color-accent: #ff4500;   --color-surface: #1e1e1e;
--font-heading: 'Space Grotesk', sans-serif;
--font-body: 'DM Sans', sans-serif;
--border-radius: 0px;      --spacing-section: 6rem;
```

All fonts loaded from Google Fonts CDN. No build-time font processing.

### 8b. Repo Structure

```
clodsite/
├── .claude/
│   └── commands/           # /setup, /interview, /plan, /build, /deploy
├── scripts/                # All [SCRIPT] steps (see Section 10)
├── scaffold/               # Eleventy base template (pre-built before hackathon)
│   ├── src/
│   │   ├── _data/
│   │   │   └── site.json   # Written by /build
│   │   ├── _includes/
│   │   │   └── base.njk
│   │   └── css/
│   │       └── themes/
│   │           ├── minimal.css
│   │           ├── professional.css
│   │           └── bold.css
│   ├── .eleventy.js
│   └── package.json
├── docs/
├── .env                    # gitignored
├── site-spec.md            # written by /interview
├── build-plan.md           # written by /plan
├── NEXT-STEPS.md           # written by /deploy on success
├── CLAUDE.md               # command definitions + [SCRIPT]/[LLM]/[HYBRID] annotations
└── README.md
```

---

## 9. `NEXT-STEPS.md` — Generated Post-Deploy

Written by a `[SCRIPT]` step at the end of a successful `/deploy`. The live URL and project name are substituted from wrangler output captured earlier in the same command.

Contents:
1. **Your site is live** — `https://[project-name].pages.dev`
2. **Connect to GitHub for automatic deploys** — step-by-step: create repo, push, connect in Cloudflare Pages dashboard
3. **Set up a custom domain** — Cloudflare Pages > Custom domains, point your DNS
4. **Enable Web Analytics** — one checkbox in the Cloudflare Pages project settings
5. **Make changes** — edit `src/_data/site.json` directly, re-run `eleventy --build` and `/deploy`

---

## 10. Future Extension: `/modify`

Out of hackathon scope. The following design points are intentional hooks:

- `meta.spec_version = "1.0"` in `site-spec.md` — a future `/modify` can check this before touching the spec
- `pages[].id` as stable slugs — a delta interview can reference pages by id without re-describing them
- `build-plan.md` as a reviewable artifact — a `/modify` flow would produce a delta plan for the same review gate

A complete `/modify` design would resolve: which fields are structural (require page rebuild) vs. content-only (update `site.json` only), how the delta interview scopes its questions, and how selective rebuild avoids regenerating unchanged pages.

---

## 11. Script Inventory

Complete table. These are pre-hackathon deliverables — write and test all of these before the clock starts.

| # | Script file | Steps covered | Command |
|---|-------------|---------------|---------|
| 1 | `scripts/setup.sh` | Check wrangler installed, prompt for token, verify via whoami, write .env | `/setup` |
| 2 | `scripts/write-spec.sh` | Receive spec JSON from LLM, format as YAML, write site-spec.md | `/interview` |
| 3 | `scripts/read-spec.sh` | Parse site-spec.md YAML, export fields | `/plan`, `/build` |
| 4 | `scripts/validate-spec.sh` | Check required fields, enum values, page count (2–5), unique ids | `/plan` |
| 5 | `scripts/write-plan.sh` | Receive plan content from LLM, write build-plan.md | `/plan` |
| 6 | `scripts/read-plan.sh` | Parse build-plan.md sections | `/build` |
| 7 | `scripts/write-site-json.sh` | Merge spec fields + approved copy into src/_data/site.json | `/build` |
| 8 | `scripts/apply-theme.sh` | Copy css/themes/[style].css into scaffold | `/build` |
| 9 | `scripts/build-site.sh` | Run eleventy --build, verify dist/ non-empty | `/build` |
| 10 | `scripts/deploy.sh` | Read .env, run wrangler deploy, write stdout→`.deploy-output`, stderr→`.deploy-error` | `/deploy` |
| 11 | `scripts/deploy-finalize.sh` | Parse URL from `.deploy-output`, write meta.deployed_url, write NEXT-STEPS.md, print URL | `/deploy` |

**Script count: 11.** All are simple bash. Write them all before the hackathon starts. Add `.deploy-output` and `.deploy-error` to `.gitignore`.

---

## 12. Error Handling

**Principle:** fail loud, fail early, never silently continue. Every `[SCRIPT]` step checks its exit code before the next step runs.

| Failure | Detection | Response |
|---------|-----------|----------|
| `wrangler` not installed | `/setup` step 1 | Print install instructions, exit |
| Invalid Cloudflare token | `wrangler whoami` non-zero | Print error, exit — do not write .env |
| Spec validation failure | `validate-spec.sh` | Print specific failing fields, exit — no partial plan written |
| Empty `dist/` after build | `build-site.sh` check | Print error, exit — do not proceed to deploy |
| Wrangler deploy failure | non-zero exit code | `[LLM]` interprets stderr, prints plain-English fix suggestion, then exits |
| `.env` missing at deploy | `deploy.sh` check | Print "run /setup first", exit |

---

## 13. Scope Guardrails

Items explicitly out of hackathon scope. Attempting these risks overrun.

- `/modify` command
- GitHub Actions / CI deployment
- GitHub token / repo creation
- Contact form backend (email-only contact; form UI with no backend handler)
- Custom domain setup (documented in NEXT-STEPS.md, not automated)
- More than 5 pages
- More than 3 style personalities
- Any ecommerce, authentication, or dynamic functionality

---

## 14. Pre-Hackathon Checklist

Complete all of this before the hackathon clock starts.

- [ ] Build the Eleventy scaffold (`scaffold/`) with base layout, theme CSS files, and data binding
- [ ] Write and test all 10 scripts in `scripts/` (see Section 11)
- [ ] Define CLAUDE.md with all five command definitions and full `[SCRIPT]`/`[LLM]`/`[HYBRID]` annotations
- [ ] Draft the 10 interview questions and test them against 2–3 imaginary sites
- [ ] Finalize `site-spec.md` schema (this document is the source of truth)
- [ ] Test `/setup` on a clean environment (fresh `.env`, real Cloudflare token)
- [ ] Verify `wrangler pages deploy` works against a real Cloudflare Pages project
- [ ] Commit base repo structure to `nopolabs/clodsite`

---

## 15. Hackathon Schedule

**Reality:** 2 hours/day of focused work across the 48-hour window = ~3 sessions. The pre-hackathon checklist (Section 14) is load-bearing — if the scripts, scaffold, and CLAUDE.md are solid before the clock starts, these sessions are integration and polish, not construction.

### Session 1 (~2h): End-to-end smoke test

| Task | Notes |
|------|-------|
| Finalize interview questions | Test against 2 imaginary sites, adjust wording |
| `/interview` → `/plan` working | Produces valid `build-plan.md`; fix whatever breaks |

### Session 2 (~2h): Build and deploy working

| Task | Notes |
|------|-------|
| `/build` produces clean `dist/` | Eleventy build passes, pages render |
| `/deploy` pushes live | Real Cloudflare URL confirmed, `NEXT-STEPS.md` generated |
| One full cycle start-to-finish | Pick a real site concept, run all five commands |

### Session 3 (~2h): Polish and submission

| Task | Notes |
|------|-------|
| Second full cycle | Different style + content_status than Session 2 |
| README | Tell the architecture story clearly |
| Demo recording | Record once pipeline is clean — backup for connectivity loss |
| Submit | Writeup, repo link, done |

**Hard constraint:** If Session 2 isn't clean, drop the second full-cycle test in Session 3 and submit what works. A shipped, documented repo is the credential — not a perfect one.

---

## 16. Submission Narrative Notes

These inform the submission writeup and README framing — not code, but worth capturing here.

**For engineers:** Every step in the workflow is labeled: script or inference. The LLM runs where reasoning is required; scripts handle everything deterministic. Both approaches, each doing what it's actually good at.

**For investors:** Inference costs compound at scale. Clodsite demonstrates a discipline for auditing where inference earns its cost — and substituting scripts everywhere it doesn't.

**For media:** Not a rejection of vibe coding — a lane assignment for it. Clodsite gives vibes a lane (`[LLM]` steps: copy, synthesis, interpretation) and gives engineering a lane (`[SCRIPT]` steps: file I/O, CLI tools, validation). The result is a workflow that's creative where creativity helps and reliable where reliability matters.

**Author's context (brief, not oversold):** 40+ year software career, recently retired, building serious AI agent workflows. Prior shipped work: Cloudflare Worker image generation service, two live ecommerce stores. Clodsite as a distillation of hard-won discipline about what belongs in inference vs. deterministic code.

**Acknowledge:** Joanna Gough in any community-facing writeup or "how did you hear about this" field.

**Post-hackathon artifact:** Write a short post-mortem (README section or blog post) covering: what was built, what the hybrid architecture taught in practice, what the path from Model A (Claude orchestrates) to Model B (script orchestrates, Claude as inference endpoint) would look like, links to live demo sites. This is the artifact for SF networking contexts.
