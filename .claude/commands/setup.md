Set up Clodsite with your Cloudflare credentials.

---

**If the user typed `/setup clean`:**

**[SCRIPT]** Check what sites exist:

```bash
bash scripts/check-artifacts.sh
```

If it prints `NO_ARTIFACTS`, tell the user there's nothing to clean and stop.

If it prints `ARTIFACTS_FOUND` (followed by a list of site slugs), ask:

> "Which site would you like to clean? (This deletes all build artifacts for that site.)"
> `<list of site slugs>`

Wait for the user's answer. Then:

```bash
bash scripts/clean.sh <chosen-site-slug>
```

Then continue with the normal setup steps below.

---

**If the user typed `/setup clean <site-name>`:**

**[SCRIPT]** Clean directly:

```bash
bash scripts/clean.sh <site-name>
```

Then continue with the normal setup steps below.

---

**[SCRIPT]** Check for artifacts from previous builds in `SITES_DIR`:

```bash
bash scripts/check-artifacts.sh
```

If it prints `NO_ARTIFACTS`, skip ahead to the wrangler check below.

If it prints `ARTIFACTS_FOUND` (followed by a listing of site slugs), tell the user what was found and ask:

> "Found sites from previous builds in `SITES_DIR`: `<slugs>`. Would you like to **keep** them and continue, or **clean** a specific site?"
>
> (You can also run `/setup clean <site-name>` to skip this prompt.)

- If they say **clean**: ask which site, run `bash scripts/clean.sh <site-name>`, then continue below.
- If they say **keep**: continue below.

---

**[SCRIPT]** Check wrangler is installed (offers to install if missing):

```bash
bash scripts/setup.sh --check
```

If this exits with an error, resolve it before continuing.

---

**[SCRIPT]** Check whether a working token already exists:

```bash
bash scripts/setup.sh --verify
```

- If this **exits 0**, a valid token is already in `.env`. Tell the user setup is already complete and they can run `/interview <site-name>`. **Stop here — do not ask for a token.**
- If this **exits non-zero** (no `.env`, or the token is invalid/expired), continue to the next step.

---

**[LLM]** Ask the user:

> "Please paste your Cloudflare API token. You can create one at https://dash.cloudflare.com/profile/api-tokens — it needs these permissions:
> - **Cloudflare Pages: Edit** — required for deploy
> - **Zone > DNS: Edit** — required for `/domain` to create CNAME records automatically (optional: without it, `/domain` prints the record for you to add manually)"

Wait for their reply.

---

**[LLM]** Ask the user:

> "Please paste your Cloudflare Account ID. You can find it in the Cloudflare dashboard — it's the 32-character hex string in the URL after you log in: `dash.cloudflare.com/<account-id>`."

Wait for their reply.

---

**Shortcut:** If the user points you to a credentials file, import it directly via script — **do not use the Write tool**:

```bash
bash scripts/setup.sh --import <path-to-file>
```

Replace `<path-to-file>` with the path the user gave (e.g. `~/clodsite-demo.env`). The script validates and copies the file to `.env` without exposing credentials in the chat or tool preview.

If the user typed credentials directly into chat instead, write them to `.env` using the Write tool. Preserve any existing `SITES_DIR=...` line if present. If the user asks where sites should live, add a `SITES_DIR` line pointing at that directory; otherwise omit it and Clodsite defaults to `sites/`.

```
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ACCOUNT_ID=<account-id>
# Optional:
# SITES_DIR=/absolute/path/to/clodsite-sites
```

Replace `<token>` and `<account-id>` with what the user provided. No extra lines, no quotes around values.

**Never display the full token or account ID in the chat.** When confirming, show the first 6 characters, then `…`, then the last 3 characters — e.g. `cfut_p1…b66` and `a35fd4…593`.

---

**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission (and optionally **Zone > DNS: Edit** for `/domain` automation).

**[SCRIPT]** Initialize the sites repository:

```bash
bash scripts/setup.sh --init-sites
```

When both succeed, tell the user setup is complete and they can create `$SITES_DIR/<site-name>/build-plan.yaml`, then run `/build <site-name>`.
