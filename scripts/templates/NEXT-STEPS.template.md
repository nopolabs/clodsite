# Next Steps for {{SITE_NAME}}

Your site is live at: **{{DEPLOY_URL}}**

---

## Connect to GitHub for automatic deploys

Right now you deploy by running `/deploy {{SITE_NAME}}` in Claude Code. To get automatic deploys on every git push:

1. Create a GitHub repo: `gh repo create {{SITE_NAME}} --public` (or via github.com)
2. Push this repo:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/{{SITE_NAME}}.git
   git push -u origin main
   ```
3. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Settings → Build & Deploy → Connect to Git**
4. Select your repo. Set:
   - **Build command:** `cd scaffold && npm run build`
   - **Build output directory:** `dist`
5. Save. Every push to `main` now triggers an automatic deploy.

---

## Connect a custom domain

Run `/domain {{SITE_NAME}}` to connect a custom domain to this site.
Clodsite will add the Pages domain association and — if your DNS is managed
in Cloudflare — create the CNAME automatically. For external DNS providers
it prints the exact record to add at your registrar.

---

## Enable Web Analytics

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Settings → Web Analytics**
2. Toggle on — no code changes or script tags needed

---

## Make changes to your site

- **Edit page content:** Open Claude Code in this directory and edit `build-plan.yaml`, then re-run `/build`
- **Change structure or branding:** Edit `build-plan.yaml` directly (or re-run `/interview`), then `/build`
- **Re-deploy after changes:** Run `/deploy {{SITE_NAME}}` (or push to GitHub if connected)

---

## Remove this site

Run `/teardown {{SITE_NAME}}` to delete the Cloudflare Pages project and take
the site offline. This is permanent — the live site and all deployment history
are gone. Your local files in this site's `SITES_DIR` folder are unaffected.

To also delete local files: `/teardown {{SITE_NAME}} clean`
