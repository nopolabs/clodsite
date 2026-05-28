Build the Clodsite static site from the approved spec and build plan.

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

**[SCRIPT]** Write structural site data:

```bash
SITE_DIR=sites/<site-name> bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
SITE_DIR=sites/<site-name> bash scripts/apply-theme.sh
```

---

**[LLM]** Read `sites/<site-name>/site-spec.json` and `sites/<site-name>/build-plan.md`.

Generate an Eleventy Nunjucks template for each page listed in `sites/<site-name>/site-spec.json pages[]`.

**Template rules:**
- The first page in `nav.order` gets `permalink: /` in its front matter and is saved as `sites/<site-name>/src/index.njk`
- All other pages get `permalink: /[page-id]/` (with a **trailing slash** — Eleventy v3 requires it for directory-style permalinks) and are saved as `sites/<site-name>/src/[page-id].njk`
- Every template uses `layout: base.njk` and sets `pageTitle` to the page's display title
- Write page content directly as HTML — do not use `{{ site.* }}` references for copy. Use site data references only for structural elements you need from the layout (those are already in `base.njk`)
- Use semantic HTML: `<h1>` for the main page heading, `<p>` for paragraphs, `<section>` to group content blocks
- Use the copy from `sites/<site-name>/build-plan.md` exactly as written. Do not shorten, rewrite, or summarize.
- **Images:** place image files in `sites/<site-name>/images/` and reference them as `/images/<filename>` in `<img>` tags. Eleventy copies that directory to the deployed site.
- **Page-specific CSS:** if a page needs custom styling (e.g. a gallery grid), put it in a `<style>` block **inside the page content body**, immediately after the closing `---` of the front matter. The front matter must be the very first thing in the file. **Never modify the theme files** in `scaffold/src/css/themes/`.

**Template format:**

```
---
layout: base.njk
pageTitle: [page title from spec]
permalink: [/ for first page, /[id]/ for others — trailing slash required]
---
[full HTML content from sites/<site-name>/build-plan.md]
```

Use the Write tool to create each file at its exact path.

---

**If `contact.enabled = true`**, also write `sites/<site-name>/src/contact.njk` (contact is always a mailto link in v1):

```nunjucks
---
layout: base.njk
pageTitle: Contact
permalink: /contact/
---
<section class="contact-section">
  <h1>Get in Touch</h1>
  <p>Reach us at: <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a></p>
</section>
```

---

**[SCRIPT]** Run the Eleventy build:

```bash
SITE_DIR=sites/<site-name> bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `sites/<site-name>/dist/`. Fix the template(s) and re-run this script.
