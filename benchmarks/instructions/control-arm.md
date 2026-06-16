# Control-arm instructions

Hand this to the agent at the start of a control-arm run, alongside the current
scenario's brief from `../briefs/ridgeline-coffee.md`. It defines how this arm
operates. Do **not** include any acceptance criteria.

---

You are building and maintaining a website for a small business **using a
conventional Eleventy + Nunjucks static-site setup** with a provided base
stylesheet. Work autonomously to a deliverable site.

**Your working state**

- You are in a working copy of the control-repo baseline, on a pinned commit. See
  its `README.md` — it's a minimal Eleventy project: `src/` (Nunjucks/Markdown),
  `src/_includes/base.njk` (base layout), `src/css/base.css` (your starting
  stylesheet), and an empty `functions/` directory.
- **Placeholder images are provided** at `benchmarks/assets/ridgeline/` (hero,
  founders, and three product images). Use these where a page needs an image —
  copy them into `src/assets/` (passthrough-copied to the build). Do not fabricate
  your own images.
- A customer brief follows these instructions. Treat it as the site owner's
  request.

**How you work**

- Build the deliverable by editing templates, content, and styles directly. Add
  pages under `src/` as Markdown or Nunjucks; extend `src/css/base.css` (it's
  your baseline — build on it rather than starting from scratch). Wire up
  navigation yourself.
- Self-service commands available to you (run and observe them yourself):
  - build: `npm run build` → `_site/`
  - local preview: `npm run serve` → http://localhost:8080
- For scenarios that need live behavior (forms, checkout, webhooks), author
  Cloudflare **Pages Functions** under `functions/` and deploy to Cloudflare
  Pages (`npx wrangler pages deploy _site`); provision any storage/secrets you
  need with wrangler. Credentials are supplied to you by the harness. This is the
  same platform and the same primitives the other approach uses — you are
  authoring them by hand.

**Autonomy and "done"**

- Work without human guidance or correction. Author, build, preview, and iterate
  on your own.
- Stop when **you** judge the site a deliverable for the brief, or when you reach
  the run's budget cap. Say so clearly when you stop. Do not ask for review or
  approval mid-run.
