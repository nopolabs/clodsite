Run Clodsite setup to collect and verify your Cloudflare credentials.

**[SCRIPT]** Run the setup script:

```bash
bash scripts/setup.sh
```

Follow any instructions it prints. If it exits with an error, resolve the issue it describes before continuing.

When setup completes successfully, `.env` will contain a verified `CLOUDFLARE_API_TOKEN`.

**Next:** Run `/interview` to start building your site.
