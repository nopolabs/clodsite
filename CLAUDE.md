# Clodsite

An opinionated website-building workflow. Interview → spec → plan → build → deploy. Five commands. One live site.

## Getting Started

When a user opens this project without a specific request, greet them with this:

---

👋 **Welcome to Clodsite.** Here's how to build your site:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token |
| 2 | `/interview` | 10-question session → `site-spec.json` |
| 3 | `/plan` | Review and approve copy → `build-plan.md` |
| 4 | `/build` | Generate templates + Eleventy build → `dist/` |
| 5 | `/deploy` | Ship to Cloudflare Pages → live URL |

Or to preview locally without deploying: `/deploy local`

Type `/help` at any time to see this again.

---

## Commands

### `/setup` — `[SCRIPT]`
Collect and verify a Cloudflare API token. Write `.env`.

```
[SCRIPT] bash scripts/setup.sh
```

### `/interview` — `[LLM]`
10-question session. Produces `site-spec.json`.

```
[LLM]    Conduct interview, synthesize answers into JSON
[SCRIPT] bash scripts/write-spec.sh
```

### `/plan` — `[HYBRID]`
Validate spec. Generate build plan with approved copy. Produces `build-plan.md`.

```
[SCRIPT] bash scripts/validate-spec.sh
[LLM]    Generate build-plan.md (including copy if content_status=draft)
[SCRIPT] bash scripts/write-plan.sh
```

User reviews `build-plan.md` before running `/build`.

### `/build` — `[HYBRID]`
Write site data. Generate page templates. Run Eleventy. Produces `dist/`.

```
[SCRIPT] bash scripts/write-site-json.sh
[SCRIPT] bash scripts/apply-theme.sh
[LLM]    Generate scaffold/src/[page].njk for each page
[SCRIPT] bash scripts/build-site.sh
```

### `/deploy` — `[SCRIPT]`
Deploy to Cloudflare Pages. Produces a live URL and `NEXT-STEPS.md`.

```
[SCRIPT] bash scripts/deploy.sh
[LLM]    Interpret error if deploy fails (only on failure)
[SCRIPT] bash scripts/deploy-finalize.sh (only on success)
```

---

## Architecture: `[SCRIPT]` / `[LLM]` / `[HYBRID]`

Every step is labeled with its execution type:

| Label | What it means | Why it matters |
|-------|---------------|----------------|
| `[SCRIPT]` | Deterministic bash — same result every time | Free, fast, reliable |
| `[LLM]` | Claude inference — reasoning, generation, interpretation | Where creativity earns its cost |
| `[HYBRID]` | Script validates structure; LLM handles semantics | Best of both |

The LLM runs in four places: the interview, copy generation, template generation, and error interpretation. Everything else is a script.

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

In scope: static content sites, 2–5 pages, three visual styles, Cloudflare Pages deploy.

Out of scope: `/modify`, GitHub Actions, contact form backend, custom domain automation, ecommerce.

See `docs/superpowers/specs/2026-05-13-clodsite-prd.md` for full spec.
