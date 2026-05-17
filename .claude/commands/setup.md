Set up Clodsite with your Cloudflare credentials.

---

**[SCRIPT]** Check wrangler is installed (offers to install if missing):

```bash
bash scripts/setup.sh --check
```

If this exits with an error, resolve it before continuing.

---

**[LLM]** Ask the user:

> "Please paste your Cloudflare API token. You can create one at https://dash.cloudflare.com/profile/api-tokens — it needs **Cloudflare Pages: Edit** permission."

Wait for their reply.

---

**[LLM]** Write the token to `.env` using the Write tool. The file should contain exactly:

```
CLOUDFLARE_API_TOKEN=<token>
```

Replace `<token>` with what the user provided. No extra lines, no quotes around the value.

---

**[SCRIPT]** Verify the token works:

```bash
bash scripts/setup.sh --verify
```

If this exits with an error, tell the user their token failed verification and ask them to check it has **Cloudflare Pages: Edit** permission.

When it succeeds, tell the user setup is complete and they can run `/interview`.
