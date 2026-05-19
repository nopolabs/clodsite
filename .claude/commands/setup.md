Set up Clodsite with your Cloudflare credentials.

---

**If the user typed `/setup clean`:**

**[SCRIPT]** Clean previous build artifacts and start fresh:

```bash
bash scripts/setup.sh --clean
```

Then continue with the normal setup steps below.

---

**[SCRIPT]** Check for artifacts from a previous build:

```bash
bash scripts/check-artifacts.sh
```

If it prints `NO_ARTIFACTS`, skip ahead to the wrangler check below.

If it prints `ARTIFACTS_FOUND` (followed by a file listing), tell the user what was found and ask:

> "Found artifacts from a previous build in `site/`. Would you like to **clean** them and start fresh, or **keep** them and continue with the existing spec?"
>
> (You can also run `/setup clean` next time to skip this prompt.)

- If they say **clean**: run `bash scripts/setup.sh --clean`, then continue below.
- If they say **keep**: skip to the wrangler check below.

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

- If this **exits 0**, a valid token is already in `.env`. Tell the user setup is already complete and they can run `/interview`. **Stop here — do not ask for a token.**
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

**[LLM]** Write both values to `.env` using the Write tool. The file should contain exactly:

```
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ACCOUNT_ID=<account-id>
```

Replace `<token>` and `<account-id>` with what the user provided. No extra lines, no quotes around values.

---

**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission.

When it succeeds, tell the user setup is complete and they can run `/interview`.
