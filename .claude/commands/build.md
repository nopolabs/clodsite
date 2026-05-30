Build the Clodsite static site from the approved build plan.

---

**Get site name.** Look at what the user typed after `/build`. If no site name was provided:

> "Please provide a site name: `/build <site-name>` — e.g., `/build acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[SCRIPT]** Validate the build plan:

```bash
SITE_DIR=sites/<site-name> bash scripts/validate-plan.sh
```

If this exits with errors, print them clearly to the user and stop. The user should re-run `/plan <site-name>` to regenerate the build plan.

---

**[SCRIPT]** Write structural site data:

```bash
SITE_DIR=sites/<site-name> bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
SITE_DIR=sites/<site-name> bash scripts/apply-theme.sh
```

---

**[LLM]** Read `sites/<site-name>/build-plan.yaml`.

Generate an Eleventy Nunjucks template for each page in `pages[]`. All content comes from the build plan — do not invent, shorten, or rewrite any copy.

**Template rules:**
- The first page in `nav.order` gets `permalink: /` in its front matter and is saved as `sites/<site-name>/src/index.njk`
- All other pages get `permalink: /[page-id]/` (trailing slash required — Eleventy v3) and are saved as `sites/<site-name>/src/[page-id].njk`
- Every template uses `layout: base.njk` and sets `pageTitle` to the page's `title` from the plan
- Convert `pages[n].content` (markdown) to HTML. Use semantic markup: `<h1>` for `#`, `<h2>` for `##`, `<p>` for paragraphs, `<pre><code>` for fenced code blocks, `<ul><li>` for bullet lists, `<table>` for tables
- **Images:** place image files in `sites/<site-name>/images/` and reference them as `/images/<filename>` in `<img>` tags. Eleventy copies that directory to the deployed site.
- **Page-specific CSS:** if `build_notes` calls for custom styling, put it in a `<style>` block inside the page body, immediately after the closing `---` of the front matter. **Never modify theme files** in `scaffold/src/css/themes/`.

**Template format:**

```
---
layout: base.njk
pageTitle: [page title from build-plan.yaml pages[n].title]
permalink: [/ for first page, /[id]/ for others — trailing slash required]
---
[page content as HTML, converted from build-plan.yaml pages[n].content]
```

Use the Write tool to create each file at its exact path.

---

**[SCRIPT]** Run the Eleventy build:

```bash
SITE_DIR=sites/<site-name> bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `sites/<site-name>/dist/`. Fix the template(s) and re-run this script.
