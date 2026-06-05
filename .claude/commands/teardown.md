Delete a deployed Clodsite site from Cloudflare Pages.

---

**Get site name and flags.** Look at what the user typed after `/teardown`. Extract:
- Site name: the word that isn't `clean`
- `clean` flag: `true` if the user typed `clean`

If no site name was provided:

> "Please provide a site name: `/teardown <site-name>` — e.g., `/teardown acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[LLM]** Read `sites/<site-name>/build-plan.yaml` and build a destruction summary:

- **Pages project:** `<slug>`
- **Live URL:** read from Cloudflare Pages project state if available; otherwise say "will be checked by script"
- **Custom domain:** `<custom_domain>` — only include this line if set

Show the summary and ask:

> "This will permanently delete the Cloudflare Pages project and all deployment history. Your local files will be unaffected.
>
> Type **<site-name>** to confirm:"

Wait for the user's reply. If the reply does not exactly match `<site-name>`, say "Confirmation didn't match — teardown cancelled." and stop.

---

**[SCRIPT]** Delete the Pages project:

```bash
SITE_DIR=sites/<site-name> bash scripts/teardown.sh
```

---

**[SCRIPT]** Only if `clean` flag was passed:

```bash
bash scripts/clean.sh <site-name>
```

---

**[LLM]** Interpret the output:

- If output contains `✓ Deleted Pages project`: confirm the site is offline. If `clean` was used, confirm local files were also removed. If not, note that local files in `sites/<site-name>/` are still present and the user can run `/teardown <site-name> clean` or delete them manually.
- If the script exits with a non-zero code: explain the error clearly.

**Common errors:**
- `CLOUDFLARE_API_TOKEN … not set` → run `/setup`
- Wrangler error about project not found → the project may have already been deleted; check with `wrangler pages project list`

