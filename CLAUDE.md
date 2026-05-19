# Clodsite

An opinionated website-building workflow. Interview → spec → plan → build → deploy. Five commands. One live site.

## Getting Started

When a user opens this project without a specific request, greet them with this:

---

👋 **Welcome to Clodsite.** Here's how to build your site:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token |
| 2 | `/interview` | 10-question session → `site/site-spec.json` |
| 3 | `/plan` | Review and approve copy → `site/build-plan.md` |
| 4 | `/build` | Generate templates + Eleventy build → `site/dist/` |
| 5 | `/deploy` | Ship to Cloudflare Pages → live URL |

Or to preview locally without deploying: `/deploy local`

Type `/help` at any time to see this again.

---

## Commands

### `/setup` — `[HYBRID]`
Collect and verify Cloudflare credentials. Write `.env`. Optionally clean previous build artifacts.

```
[SCRIPT] bash scripts/clean.sh               (only if user typed `/setup clean`)
[SCRIPT] bash scripts/check-artifacts.sh     (detect previous build in site/)
[LLM]    Offer clean-or-keep if artifacts were found
[SCRIPT] bash scripts/setup.sh --check       (wrangler installed?)
[SCRIPT] bash scripts/setup.sh --verify      (skip the rest if .env already works)
[LLM]    Ask for Cloudflare API token + Account ID
[LLM]    Write .env via the Write tool
[SCRIPT] bash scripts/setup.sh --verify      (confirm)
```

### `/interview` — `[LLM]`
10-question session. Produces `site/site-spec.json`.

```
[LLM]    Conduct interview, synthesize answers into JSON
[SCRIPT] bash scripts/write-spec.sh
```

### `/plan` — `[HYBRID]`
Validate spec. Generate build plan with approved copy. Produces `site/build-plan.md`.

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate site/build-plan.md (including copy if content_status=draft)
[SCRIPT] bash scripts/write-plan.sh
```

User reviews `site/build-plan.md` before running `/build`.

### `/build` — `[HYBRID]`
Write site data. Generate page templates. Run Eleventy. Produces `site/dist/`.

```
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Generate scaffold/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```

### `/deploy` — `[SCRIPT]`
Deploy to Cloudflare Pages. Produces a live URL and `site/NEXT-STEPS.md`. Use `/deploy local` to preview at localhost:8080 instead of deploying.

```
[SCRIPT] bash scripts/deploy.sh --local      (if `/deploy local` — serve, no deploy)
[SCRIPT] bash scripts/deploy.sh              (ensure Pages project exists; deploy)
[LLM]    Interpret error if deploy fails
[SCRIPT] bash scripts/deploy-finalize.sh     (on success — production URL, NEXT-STEPS.md)
```

---

## Architecture: `[SCRIPT]` / `[LLM]` / `[HYBRID]`

Every step is labeled with its execution type:

| Label | What it means | Why it matters |
|-------|---------------|----------------|
| `[SCRIPT]` | Deterministic bash — same result every time | Free, fast, reliable |
| `[LLM]` | Claude inference — reasoning, generation, interpretation | Where creativity earns its cost |
| `[HYBRID]` | Script validates structure; LLM handles semantics | Best of both |

The LLM handles: collecting user input through the chat (interview answers, credentials, clean/keep choices), synthesizing structured data from natural language (the spec JSON), generating content (page copy, Nunjucks templates), and interpreting errors. Everything else is a script.

---

## Files Written During a Run

| File | Written by | Purpose |
|------|-----------|---------|
| `.env` | `/setup` | Cloudflare credentials |
| `site/site-spec.json` | `/interview` | The site spec (pretty-printed JSON) |
| `site/build-plan.md` | `/plan` | Approved build plan (review before /build) |
| `scaffold/src/_data/site.json` | `/build` | Structural site data for Eleventy |
| `scaffold/src/*.njk` | `/build` | Page templates with content |
| `site/dist/` | `/build` | Built static site |
| `site/NEXT-STEPS.md` | `/deploy` | Post-deploy ops guide |

---

## Scope (Hackathon v1.0)

In scope: static content sites, 2–5 pages, three visual styles, `mailto:` contact, Cloudflare Pages deploy.

See `ROADMAP.md` for everything deferred to v2 and why.
Full v1 spec: `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.
