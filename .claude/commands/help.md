Show Clodsite quick-start help.

**[LLM]** Display the following:

---

👋 **Clodsite — Quick Start**

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token (run once) |
| 2 | `/interview` | 10-question session → `site-spec.json` |
| 3 | `/plan` | Review and approve copy → `build-plan.md` |
| 4 | `/build` | Generate templates + Eleventy build → `dist/` |
| 5 | `/deploy` | Ship to Cloudflare Pages → live URL |

**Preview locally** (no token needed): `/deploy local`

**Files written during a run:**

| File | Written by |
|------|-----------|
| `.env` | `/setup` |
| `site-spec.json` + `site-spec.md` | `/interview` |
| `build-plan.md` | `/plan` |
| `scaffold/src/*.njk` + `dist/` | `/build` |
| `NEXT-STEPS.md` | `/deploy` |

**Requirements:** Node.js 18+, Wrangler (`npm install -g wrangler`), Cloudflare account (free tier OK).
