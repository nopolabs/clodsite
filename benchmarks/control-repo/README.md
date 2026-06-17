# Control-repo baseline (Ridgeline)

The starting point for the **control arm**: a minimal, conventional static-site
setup a competent builder would actually reach for — **Eleventy + Nunjucks** with
a fair **base stylesheet**. It is deliberately *not* a strawman (no blank CSS) and
*not* a head start (no pre-built pages, products, FAQ, or commerce). The control
agent builds those itself — that authoring cost is exactly what the benchmark
compares against Clodsite's constrained-plan approach.

This shares Eleventy with Clodsite on purpose: it isolates the variable under
test to "author via plan + component catalog + compiler" vs. "author templates,
content, and features directly" — not "which static-site generator."

## What's in the baseline

```
control-repo/
  package.json            # eleventy dep + build/serve scripts
  .eleventy.js            # src/ -> _site/, Nunjucks for .njk and .md
  src/
    _includes/base.njk    # base layout: <head>, header+nav (empty), <main>, footer
    index.md              # one stub home page so it builds out of the box
    css/base.css          # the fair base stylesheet (extend as needed)
  functions/              # empty — Cloudflare Pages Functions land here when needed
  .gitignore
```

Nothing site-specific beyond the brand name placeholder and one stub page. No
About/Coffee/Contact pages, no product list, no FAQ, no checkout — those are the
deliverables the agent produces from the briefs.

## Using it in a run

The control arm works from a **pinned commit** of this baseline. Per run:

```sh
cp -R benchmarks/control-repo /tmp/ridgeline-control && cd /tmp/ridgeline-control
git init -q && git add -A && git commit -qm "control baseline"   # this commit is the pinned baseline
npm install
```

Keeping it in its own working copy (not a clodsite worktree) avoids coupling the
control's git history to Clodsite's. Record the baseline commit in the results
sheet.

## Self-service commands (the control arm's toolset)

- **Build:** `npm run build` → `_site/`
- **Preview:** `npm run serve` → http://localhost:8080
- These are the control's equivalents of Clodsite's `validate-plan` / build /
  local-preview. Neither arm gets a capability the other lacks.

## Dynamic features (scenarios 4–5)

For forms, checkout, and webhooks the control deploys to the **same platform as
Clodsite — Cloudflare Pages + Pages Functions** — so neither arm has a hosting
advantage; the only difference is built-in vs. hand-authored.

- Author Pages Functions under `functions/` (e.g. `functions/api/checkout.js`).
- Deploy: `npx wrangler pages deploy _site`.
- Provision storage/secrets yourself with wrangler (e.g. a KV namespace for order
  state, Stripe **test** keys, the fulfillment email sender) — the same primitives
  Clodsite provisions automatically.

The base stylesheet, scripts, and config here are the only things provided. The
operator supplies credentials identically to both arms (see `../README.md` →
Harness substitutions).
