# Clodsite v2.0

**Describe your site. Deploy it.**

Imagine you've hired a website designer. You tell them what you want — what the site is for, who it's for, what pages it needs, what tone it should have. They build it. You review it, ask for changes, iterate. You never touch the code.

Clodsite works the same way. An AI agent collaborates with you however you prefer — interview, notes, existing copy, screenshots, a rough brief — and turns that intent into a reviewable `build-plan.yaml`. Once you approve that plan, the scripts take over: deterministic, fast, and free.

---

## The Build Plan

Everything flows through `sites/<name>/build-plan.yaml`. It is the contract: site name, slug, pages, navigation, tone, visual style, contact settings, optional custom domain, and typed page components with their final content.

Everything before `build-plan.yaml` is collaboration and inference. The customer and AI agent can get there through a guided interview, a pasted brief, direct YAML editing, or any other workflow that produces a valid plan. Everything after `build-plan.yaml` is deterministic compilation and deployment.

```
Describe ──[AI + customer]──▶ build-plan.yaml ──[SCRIPT]──▶ Built site ──[SCRIPT]──▶ Deployed
```

A given `build-plan.yaml` always produces the same site. The build and deploy pipeline does not care how the plan was produced.

---

## Getting Started

```bash
git clone git@github.com:nopolabs/clodsite.git my-sites && cd my-sites && claude
```

Then inside Claude Code:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token; initialize `sites/` |
| 2 | Produce `sites/<name>/build-plan.yaml` | Work with the AI agent however you like until the plan is complete and approved |
| 3 | `/build <site-name>` | Generate templates + Eleventy build → `sites/<name>/dist/` |
| 4 | `/deploy <site-name>` | Ship to Cloudflare Pages → live URL |

After deploying:

| Command | What it does |
|---------|--------------|
| `/domain <site-name>` | Connect a custom domain (auto-creates CNAME if DNS is in your Cloudflare account) |
| `/teardown <site-name>` | Delete the Pages project and all deployment history |

`/deploy <site-name> local` previews at `http://localhost:8080` without deploying.

---

## Architecture

Every step is labeled with its execution type:

| Label | What it means | Why it matters |
|-------|---------------|----------------|
| `[SCRIPT]` | Deterministic bash — same result every time | Free, fast, reliable |
| `[LLM]` | Claude inference — reasoning, generation, interpretation | Where creativity earns its cost |
| `[HYBRID]` | Script validates structure; LLM handles semantics | Best of both |

```
/setup       [HYBRID]  — credential prompts + bash verification
/interview   [LLM]     — legacy guided session → site-spec.json
/plan        [HYBRID]  — legacy bridge from site-spec.json → build-plan.yaml
/build       [SCRIPT]  — validate build-plan.yaml, render templates, run Eleventy
/deploy      [SCRIPT]  — wrangler pages deploy + LLM error interpretation
/domain      [HYBRID]  — script wires up DNS, LLM interprets result
/teardown    [HYBRID]  — script deletes Pages project, LLM confirms
```

The inference boundary is `build-plan.yaml`. Before it, the customer and AI agent decide. After it, scripts execute.

---

## Requirements

- [Claude Code](https://claude.ai/code)
- [Node.js](https://nodejs.org/) 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A [Cloudflare account](https://dash.cloudflare.com/) (free tier works)
- A Cloudflare API token with:
  - **Cloudflare Pages: Edit** — required
  - **Zone > DNS: Edit** — optional; enables `/domain` to create CNAME records automatically
- Your Cloudflare Account ID (the 32-character hex ID in `dash.cloudflare.com/<account-id>`)

---

## Output

A static site built with [Eleventy](https://www.11ty.dev/) and deployed to Cloudflare Pages. Three visual personalities: minimal, professional, bold. 1–5 pages. Your copy, or Claude drafts it.

---

## Why it works this way

Claude Code's `CLAUDE.md` loads when you open Claude Code in a directory — that's how the commands work and why you need to be inside the cloned repo. This is a current Claude Code constraint; the natural next step is installable skill packaging that removes the clone-and-cd bootstrap entirely.

The longer arc: the build plan is a portable document format. A schema that deterministically compiles to a deployed website is a build pipeline, and build pipelines can become services. The inference layer — Claude today, anything tomorrow — stays decoupled from the compilation and deployment back-end.

---

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the full picture. Coming next: configurable `sites/` location, installable skill packaging, a more flexible change workflow, and new page types (blog, gallery, events, ecommerce).

---

## Origin

Started at the [State of Oregon Claude Code Hackathon](https://luma.com/bf9gpp2z) — 2026 — by [@nopolabs](https://github.com/nopolabs).

Built after a few weeks of using Claude Code on small real sites — [mastertimewaster.com](https://github.com/nopolabs/mtw4), [bigbeautifulpeaceprize.com](https://github.com/nopolabs/bbpp), [hmc-cycling.org](https://github.com/nopolabs/hmc) — where the same lesson kept recurring: most of the work was deterministic and belonged in scripts; only a few steps actually needed inference.
