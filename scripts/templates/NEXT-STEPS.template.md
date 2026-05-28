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

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Custom domains**
2. Click **Set up a custom domain** and enter your domain or subdomain
3. **Important — Cloudflare does not auto-create the DNS record**, even if your domain is already managed in Cloudflare. After adding the custom domain in Pages, go to **DNS → Records** for your zone and add:
   - **Type:** `CNAME`
   - **Name:** your subdomain (e.g. `ndig`) or `@` for the root
   - **Target:** `{{SITE_NAME}}.pages.dev`
   - **Proxy status:** Proxied (orange cloud)
4. Without the CNAME, visitors will see a **522 error**. Once the record is in place, the SSL certificate provisions automatically within a minute or two.

---

## Enable Web Analytics

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}} → Settings → Web Analytics**
2. Toggle on — no code changes or script tags needed

---

## Make changes to your site

- **Edit page content:** Open Claude Code in this directory and modify the `.njk` files in `scaffold/src/`
- **Change structure or branding:** Re-run `/interview` to update the spec, then `/plan` and `/build`
- **Re-deploy after changes:** Run `/deploy` (or push to GitHub if connected)

---

## Remove this site

To take this site down, delete its Cloudflare Pages project:

1. In **Cloudflare Dashboard → Pages → {{SITE_NAME}}**
2. **Settings → Delete project**

This removes the deployment and frees the `{{SITE_NAME}}.pages.dev` name. It cannot be undone — the live site and its deployment history are gone. Your local files in this repo are unaffected.
