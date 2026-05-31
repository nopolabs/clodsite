Show the status of all Clodsite-managed sites, cross-referenced against live Cloudflare Pages state.

---

**[SCRIPT]** Cross-references local sites with live Cloudflare Pages state and renders a status table.

```bash
bash scripts/status.sh
```

For each site shows the production URL, custom domain (if any), and last deploy timestamp. Flags local sites with no live Cloudflare Pages project as "not deployed". Lists any Cloudflare Pages projects that exist outside Clodsite's `sites/` as a footer line.
