# Clodsite v2.0

**Describe your site. Deploy it.**

Imagine you've hired a website designer. You tell them what you want — what the site is for, who it's for, what pages it needs, what tone it should have. They build it. You review it, ask for changes, iterate. You never touch the code.

Clodsite works the same way. Claude interviews you, produces a reviewable spec, and only builds after you approve. The scripts take over from there: deterministic, fast, and free.

---

## The Spec

Everything flows through `sites/<name>/site-spec.json`. It's a structured description of your site — name, pages, tone, contact info, visual style, domain. Everything before it is inference. Everything after it is deterministic.

```
Describe ──[LLM]──▶ site-spec.json ──[SCRIPT]──▶ Built site ──[SCRIPT]──▶ Deployed
```

A given spec always produces the same site. You can fill it however you want: let Claude interview you, edit the JSON directly, or produce it from another tool. The build and deploy pipeline doesn't care how it was produced.

---

## Getting Started

```bash
git clone https://github.com/nopolabs/clodsite my-sites && cd my-sites && claude
```

Then inside Claude Code:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token; initialize `sites/` |
| 2 | `/interview <site-name>` | Guided session → `sites/<name>/site-spec.json` |
| 3 | `/plan <site-name>` | Review and approve copy → `sites/<name>/build-plan.md` |
| 4 | `/build <site-name>` | Generate templates + Eleventy build → `sites/<name>/dist/` |
| 5 | `/deploy <site-name>` | Ship to Cloudflare Pages → live URL |

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
/interview   [LLM]     — guided session → site-spec.json
/plan        [HYBRID]  — script validates, LLM writes all content → build-plan.json
/build       [HYBRID]  — script validates plan, LLM renders content → templates
/deploy      [SCRIPT]  — wrangler pages deploy + LLM error interpretation
/domain      [HYBRID]  — script wires up DNS, LLM interprets result
/teardown    [HYBRID]  — script deletes Pages project, LLM confirms
```

The inference boundary is `build-plan.json`. Before it, Claude decides. After it, scripts (and LLM-as-renderer) execute.

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

The longer arc: the spec is a portable document format. A schema that deterministically compiles to a deployed website is a build pipeline, and build pipelines can become services. The inference layer — Claude today, anything tomorrow — stays decoupled from the compilation and deployment back-end.

---

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the full picture. Coming next: a `/status` command, configurable `sites/` location, structured `build-plan.json`, `/modify` for iterating on live sites, installable skill packaging, and new page types (blog, gallery, events, ecommerce).

---

## Origin

Started at the [State of Oregon Claude Code Hackathon](https://luma.com/bf9gpp2z) — 2026 — by [@nopolabs](https://github.com/nopolabs).

Built after a few weeks of using Claude Code on small real sites — [mastertimewaster.com](https://github.com/nopolabs/mtw4), [bigbeautifulpeaceprize.com](https://github.com/nopolabs/bbpp), [hmc-cycling.org](https://github.com/nopolabs/hmc) — where the same lesson kept recurring: most of the work was deterministic and belonged in scripts; only a few steps actually needed inference.
