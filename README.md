# Clodsite

**A governed website-building workflow for Claude Code.**

Interview → spec → plan → build → deploy. Five commands. One live site on Cloudflare Pages.

```bash
git clone https://github.com/nopolabs/clodsite my-site && cd my-site && claude
```

Then inside Claude Code:

```
/setup       collect and verify your Cloudflare API token
/interview   10-question session → site-spec.json
/plan        review and approve the build plan
/build       generate and build the site
/deploy      ship to Cloudflare Pages → live URL
```

---

## The Idea

Most AI site builders are autocomplete with a pretty UI. Clodsite is a structured process: the AI interviews you, produces a reviewable spec, and only builds after you approve. Every step is labeled `[SCRIPT]`, `[LLM]`, or `[HYBRID]`.

This isn't a rejection of vibe coding — it's a lane assignment for it. `[LLM]` steps handle what LLMs are actually good at: writing copy, interpreting tone, synthesizing interview answers, explaining errors. `[SCRIPT]` steps handle everything else: reading files, validating schemas, running CLI tools. Each approach does what it's actually good at.

```
/setup     [SCRIPT]  — bash all the way down
/interview [LLM]     — 10 questions, one JSON spec
/plan      [HYBRID]  — script validates, LLM generates copy
/build     [HYBRID]  — script writes data, LLM writes templates
/deploy    [SCRIPT]  — wrangler pages deploy + LLM error interpretation on failure
```

---

## Requirements

- [Claude Code](https://claude.ai/code)
- [Node.js](https://nodejs.org/) 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- A [Cloudflare account](https://dash.cloudflare.com/) (free tier works)
- A Cloudflare API token with **Cloudflare Pages: Edit** permission

---

## Output

A static site built with [Eleventy](https://www.11ty.dev/) and deployed to Cloudflare Pages. Three visual personalities: minimal, professional, bold. 2–5 pages. Your copy, or Claude drafts it.

---

## Why it works this way

Claude Code's `CLAUDE.md` loads when you open Claude Code in a directory. That means you need to be inside the cloned repo for the commands to work — hence the `&& claude` at the end of the clone command. This is a current Claude Code constraint; the natural evolution is dynamic command loading from a remote URL.

---

## Built for

[State of Oregon Claude Code Hackathon](https://luma.com/bf9gpp2z) — 2026 — by [@nopolabs](https://github.com/nopolabs)
