Deploy the built Clodsite site to Cloudflare Pages, or preview it locally.

---

**Get site name.** Look at what the user typed after `/deploy`. Examples: `/deploy acme-corp` or `/deploy acme-corp local`. Extract the site name (first word after `/deploy` that isn't `local`). If no site name was provided:

> "Please provide a site name: `/deploy <site-name>` — e.g., `/deploy acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**If the user typed `/deploy <site-name> local`:**

**[SCRIPT]** Build and serve locally:

```bash
SITE_DIR=sites/<site-name> bash scripts/deploy.sh --local
```

This builds the site and starts the Eleventy dev server at `http://localhost:8080`. No Cloudflare token needed. Press Ctrl-C to stop.

Stop here — do not run the Cloudflare deploy steps below.

---

**[SCRIPT]** Run the deploy script:

```bash
SITE_DIR=sites/<site-name> bash scripts/deploy.sh
```

This reads `.env`, runs `wrangler pages deploy`, and captures the output.

---

**If `deploy.sh` exits with a non-zero code:**

**[LLM]** Read `sites/<site-name>/.deploy-error`. Interpret the error and explain clearly:
- What went wrong
- Exactly how to fix it

Common cases:
- **Authentication error:** Token has expired or lacks permissions. Run `/setup` to re-enter the token.
- **Project name conflict:** A Pages project with this slug already exists under a different account. Edit `slug` in `sites/<site-name>/build-plan.yaml` or choose a different site directory, then rebuild and re-run `/deploy <site-name>`.
- **dist/ missing:** Run `/build <site-name>` first.
- **Wrangler not found:** Run `npm install -g wrangler`.

Do not attempt to re-run deploy automatically. Print the fix suggestion and stop.

---

**If `deploy.sh` exits with code 0:**

**[SCRIPT]** Finalize the deployment:

```bash
SITE_DIR=sites/<site-name> bash scripts/deploy-finalize.sh
```

This parses the live URL from the deploy output, generates `sites/<site-name>/NEXT-STEPS.md`, optionally commits the deployed site inside `sites/.git`, and prints the production URL. It does not write back to `site-spec.json`; `build-plan.yaml` remains the build contract.
