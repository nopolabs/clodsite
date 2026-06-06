Show Clodsite quick-start help.

**[LLM]** Display the following:

---

👋 **Clodsite — Quick Start**

| Step | Command | What it does |
|------|---------|--------------|
| 1 | `/setup` | Verify your Cloudflare token (run once) |
| 2 | Create `$SITES_DIR/<site-name>/build-plan.yaml` | Work with the AI agent however you like until the plan is complete |
| 3 | `/build <site-name>` | Generate templates + Eleventy build → `$SITES_DIR/<site-name>/dist/` |
| 4 | `/deploy <site-name>` | Ship to Cloudflare Pages → live URL |

**Preview locally** (no token needed): `/deploy <site-name> local`

`SITES_DIR` defaults to `sites/`. Set it in `.env` to keep site state in a separate private repo.

**Files written during a run:**

| File | Written by |
|------|-----------|
| `.env` | `/setup` |
| `$SITES_DIR/<site-name>/build-plan.yaml` | AI agent or `/plan <site-name>` |
| `$SITES_DIR/<site-name>/src/*.njk` + `$SITES_DIR/<site-name>/dist/` | `/build <site-name>` |
| `$SITES_DIR/<site-name>/NEXT-STEPS.md` | `/deploy <site-name>` |

**Requirements:** Node.js 18+, Wrangler (`npm install -g wrangler`), Cloudflare account (free tier OK).
