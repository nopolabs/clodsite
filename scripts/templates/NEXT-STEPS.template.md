# Next Steps for {{SITE_NAME}}

Your site is live at: **{{DEPLOY_URL}}**

---

## Connect to GitHub for automatic deploys

Right now you deploy by running `/deploy` in Claude Code. To get automatic deploys on every git push:

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

## Set up a custom domain

1. Buy or transfer your domain to Cloudflare (or just point DNS to Cloudflare)
2. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Custom domains**
3. Add your domain and follow the DNS instructions
4. Cloudflare handles SSL automatically — no cert management needed

---

## Enable Web Analytics

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Settings → Web Analytics**
2. Toggle on — no code changes or script tags needed

---

## Make changes to your site

- **Edit page content:** Open Claude Code in this directory and modify the `.njk` files in `scaffold/src/`
- **Change structure or branding:** Re-run `/interview` to update the spec, then `/plan` and `/build`
- **Re-deploy after changes:** Run `/deploy` (or push to GitHub if connected)
