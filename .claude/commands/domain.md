Connect a custom domain to a deployed Clodsite site.

---

**Get site name.** Look at what the user typed after `/domain`. If no site name was provided:

> "Please provide a site name: `/domain <site-name>` — e.g., `/domain acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[LLM]** Read `$SITES_DIR/<site-name>/build-plan.yaml`.

If `custom_domain` is omitted or empty, ask:

> "What domain or subdomain should this site use? (e.g. `ndig.nopolabs.com` or `acme.com`)"

Wait for the reply. Then update `build-plan.yaml` using the Write tool:
- Set `custom_domain` to the hostname only, with no protocol or path
- Leave all other fields unchanged

The deployed `*.pages.dev` URL is read from Cloudflare at script time. Do not write deployment URLs into `site-spec.json` or `build-plan.yaml`.

If the site has not been deployed yet, `domain.sh` will report that no Cloudflare Pages project exists for the plan's `slug`. In that case tell the user:

> "This site hasn't been deployed yet. Run `/deploy <site-name>` first, then re-run `/domain <site-name>`."

And stop.

---

**[SCRIPT]** Wire up the custom domain:

```bash
SITE_NAME=<site-name> bash scripts/domain.sh
```

---

**[LLM]** Interpret the output:

- If output contains `✓ CNAME created`: tell the user their domain will be live within ~1 minute and SSL provisions automatically. No further action needed.
- If output contains `✓ CNAME already exists`: tell the user the domain was already wired up.
- If output contains `Add this record at your DNS provider`: present the CNAME record clearly. If it also contains `To enable full automation`, include that note.
- If the script exits with a non-zero code: explain the error clearly and tell the user how to fix it (see common cases below).

**Common errors:**
- `CLOUDFLARE_API_TOKEN … not set` → run `/setup`
- `custom_domain not set` → add `custom_domain: <hostname>` to `build-plan.yaml`
- `Cloudflare Pages project not found` → run `/deploy <site-name>` first
- `Error adding Pages domain association (HTTP 4xx)` → check that the Pages project name matches `slug` in `build-plan.yaml`; re-run `/deploy <site-name>` if the project was deleted
