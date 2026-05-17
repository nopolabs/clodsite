Deploy the built Clodsite site to Cloudflare Pages, or preview it locally.

---

**If the user typed `/deploy local`:**

**[SCRIPT]** Build and serve locally:

```bash
bash scripts/build-site.sh
```

Then start the dev server (Eleventy serves from `site/dist/`):

```bash
cd scaffold && npm run serve
```

This starts Eleventy at `http://localhost:8080`. No Cloudflare token needed. Press Ctrl-C to stop.

Stop here — do not run the Cloudflare deploy steps below.

---

**[SCRIPT]** Run the deploy script:

```bash
bash scripts/deploy.sh
```

This reads `.env`, runs `wrangler pages deploy dist`, and captures the output.

---

**If `deploy.sh` exits with a non-zero code:**

**[LLM]** Read `scripts/.deploy-error`. Interpret the error and explain clearly:
- What went wrong
- Exactly how to fix it

Common cases:
- **Authentication error:** Token has expired or lacks permissions. Run `/setup` to re-enter the token.
- **Project name conflict:** A Pages project with this slug already exists under a different account. Edit `site.name` in `site-spec.json` (changing the name changes the slug) and re-run `/deploy`.
- **dist/ missing:** Run `/build` first.
- **Wrangler not found:** Run `npm install -g wrangler`.

Do not attempt to re-run deploy automatically. Print the fix suggestion and stop.

---

**If `deploy.sh` exits with code 0:**

**[SCRIPT]** Finalize the deployment:

```bash
bash scripts/deploy-finalize.sh
```

This parses the live URL, writes it to `site-spec.json`, generates `NEXT-STEPS.md`, and prints the URL.
