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

**[SCRIPT]** Check for artifacts from previous builds:

```bash
bash scripts/check-artifacts.sh
```

If it prints `NO_ARTIFACTS`, skip ahead to the wrangler check below.

If it prints `ARTIFACTS_FOUND` (followed by a listing of site slugs), tell the user what was found and ask:

> "Found sites from previous builds in `sites/`: `<slugs>`. Would you like to **keep** them and continue, or **clean** a specific site?"
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

> "Please paste your Cloudflare API token. You can create one at https://dash.cloudflare.com/profile/api-tokens — it needs **Cloudflare Pages: Edit** permission."

Wait for their reply.

---

**[LLM]** Ask the user:

> "Please paste your Cloudflare Account ID. You can find it in the Cloudflare dashboard — it's the 32-character hex string in the URL after you log in: `dash.cloudflare.com/<account-id>`."

Wait for their reply.

---

**Shortcut:** If the user points you to a credentials file, read the token and account ID from it directly — skip the two prompts above.

**[LLM]** Write both values to `.env` using the Write tool. The file should contain exactly:

```
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ACCOUNT_ID=<account-id>
```

Replace `<token>` and `<account-id>` with what the user provided. No extra lines, no quotes around values.

**Never display the full token or account ID in the chat.** When confirming what was written, show only the first 6 characters followed by `…` — e.g. `cfut_p1…` and `a35fd4…`.

---

**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission.

When it succeeds, tell the user setup is complete and they can run `/interview <site-name>`.
