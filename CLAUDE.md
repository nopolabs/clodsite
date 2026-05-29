# Clodsite

An opinionated website-building workflow. Interview → spec → plan → build → deploy. Five commands. One live site.

## Getting Started

When a user opens this project without a specific request, greet them with this:

---

👋 **Welcome to Clodsite.** Here's how to build your site:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token |
| 2 | `/interview <site-name>` | 10-question session → `sites/<site-name>/site-spec.json` |
| 3 | `/plan <site-name>` | Review and approve copy → `sites/<site-name>/build-plan.md` |
| 4 | `/build <site-name>` | Generate templates + Eleventy build → `sites/<site-name>/dist/` |
| 5 | `/deploy <site-name>` | Ship to Cloudflare Pages → live URL |

Or to preview locally without deploying: `/deploy <site-name> local`

Type `/help` at any time to see this again.

---

## Commands

### `/setup` — `[HYBRID]`
Collect and verify Cloudflare credentials. Write `.env`. Optionally clean previous build artifacts.

```
[SCRIPT] bash scripts/clean.sh               (only if user typed `/setup clean`)
[SCRIPT] bash scripts/check-artifacts.sh     (detect previous build in sites/)
[LLM]    Offer clean-or-keep if artifacts were found
[SCRIPT] bash scripts/setup.sh --check       (wrangler installed?)
[SCRIPT] bash scripts/setup.sh --verify      (skip the rest if .env already works)
[LLM]    Ask for Cloudflare API token + Account ID
[LLM]    Write .env via the Write tool
[SCRIPT] bash scripts/setup.sh --verify      (confirm)
```

### `/interview` — `[LLM]`
10-question session. Produces `sites/<site-name>/site-spec.json`.

```
[LLM]    Conduct interview, synthesize answers into JSON
[SCRIPT] bash scripts/write-spec.sh
```

### `/plan` — `[HYBRID]`
Validate spec. Generate build plan with approved copy. Produces `sites/<site-name>/build-plan.md`.

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate sites/<site-name>/build-plan.md (including copy if content_status=draft)
```

User reviews `sites/<site-name>/build-plan.md` before running `/build`.

### `/build` — `[HYBRID]`
Write site data. Generate page templates. Run Eleventy. Produces `sites/<site-name>/dist/`.

```
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Generate sites/<site-name>/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```

### `/deploy` — `[SCRIPT]`
Deploy to Cloudflare Pages. Produces a live URL and `sites/<site-name>/NEXT-STEPS.md`. Use `/deploy <site-name> local` to preview at localhost:8080 instead of deploying.

```
[SCRIPT] bash scripts/deploy.sh --local      (if `/deploy <site-name> local` — serve, no deploy)
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
| `sites/<site-name>/site-spec.json` | `/interview <site-name>` | The site spec (pretty-printed JSON) |
| `sites/<site-name>/build-plan.md` | `/plan <site-name>` | Approved build plan (review before /build) |
| `sites/<site-name>/src/_data/site.json` | `/build <site-name>` | Structural site data for Eleventy (gitignored) |
| `sites/<site-name>/src/*.njk` | `/build <site-name>` | Page templates with content (gitignored) |
| `sites/<site-name>/dist/` | `/build <site-name>` | Built static site |
| `sites/<site-name>/NEXT-STEPS.md` | `/deploy <site-name>` | Post-deploy ops guide |

---

## Scope (Hackathon v1.0)

In scope: static content sites, 1–5 pages, three visual styles, `mailto:` contact, Cloudflare Pages deploy.

See `ROADMAP.md` for everything deferred to v2 and why.
Full v1 spec: `docs/superpowers/specs/2026-05-13-clodsite-prd.md`.
