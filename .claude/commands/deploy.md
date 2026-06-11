Build and deploy the Clodsite site to Cloudflare Pages, or preview it locally. `/deploy` always rebuilds first — builds are fast, and deploying a stale `dist/` is never what anyone wants. Use `/build` when you want to inspect the artifact *without* publishing it.

---

**Get site name.** Look at what the user typed after `/deploy`. Examples: `/deploy acme-corp`, `/deploy acme-corp local`, or `/deploy acme-corp "switch to live keys"`. Extract the site name (first word after `/deploy` that isn't `local`) and an optional deploy message (any remaining quoted or trailing text). If no site name was provided:

> "Please provide a site name: `/deploy <site-name>` — e.g., `/deploy acme-corp`"

And stop.

---

**If the user typed `/deploy <site-name> local`:**

**[SCRIPT]** Build and serve locally:

```bash
SITE_NAME=<site-name> bash scripts/deploy.sh --local
```

This builds the site and starts the Eleventy dev server at `http://localhost:8080`. No Cloudflare token needed. Press Ctrl-C to stop.

Stop here — do not run the Cloudflare deploy steps below.

---

**Determine the deploy message.** It becomes the sites-repo commit subject: `deploy: <site-name> — <message>` (URLs and Stripe mode are recorded in the commit body). If the user supplied a message, use it verbatim. Otherwise **write one yourself**: a short phrase saying why this deploy is happening — e.g. `"first deploy"`, `"new gallery page"`, `"switch to Stripe live keys"`. You usually know the reason; a history of bare `deploy: <site-name>` lines helps no one.

**[SCRIPT]** Run the full pipeline (validate → build → deploy → finalize):

```bash
bash scripts/build-deploy.sh <site-name> "<message>"
```

This validates the plan, renders templates and Functions, builds `dist/`, deploys to Cloudflare Pages, generates `$SITES_DIR/<site-name>/NEXT-STEPS.md`, commits the deployed site inside the `SITES_DIR` git repo, and prints the production URL. It does not write back to `site-spec.json`; `build-plan.yaml` remains the build contract.

---

**If `build-deploy.sh` exits with a non-zero code:**

**[LLM]** The failing stage is visible in the output (each stage is announced with `==>`). If the deploy stage failed, also read `$SITES_DIR/<site-name>/.deploy-error`. Interpret the error and explain clearly:
- What went wrong
- Exactly how to fix it

Common cases:
- **Plan validation failed:** The error names the offending field. Fix `$SITES_DIR/<site-name>/build-plan.yaml` and re-run `/deploy <site-name>`.
- **Authentication error:** Token has expired or lacks permissions. Run `/setup` to re-enter the token, or add the named permission to the existing token (commerce needs `Workers KV Storage: Edit`; protected forms need `Turnstile: Edit`).
- **Project name conflict:** A Pages project with this slug already exists under a different account. Edit `slug` in `$SITES_DIR/<site-name>/build-plan.yaml`, then re-run `/deploy <site-name>`.
- **Wrangler not found:** Run `npm install -g wrangler`.

Do not attempt to re-run deploy automatically. Print the fix suggestion and stop.

---

**If `build-deploy.sh` exits with code 0:**

Finalize already ran inside the pipeline. Report the production URL and point the user at `$SITES_DIR/<site-name>/NEXT-STEPS.md`.
