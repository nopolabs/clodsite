Build the Clodsite static site from the approved spec and build plan.

---

**[SCRIPT]** Write structural site data:

```bash
bash scripts/write-site-json.sh
```

**[SCRIPT]** Validate theme file:

```bash
bash scripts/apply-theme.sh
```

---

**[LLM]** Read `site/site-spec.json` and `site/build-plan.md`.

Generate an Eleventy Nunjucks template for each page listed in `site/site-spec.json pages[]`.

**Template rules:**
- The first page in `nav.order` gets `permalink: /` in its front matter and is saved as `scaffold/src/index.njk`
- All other pages get `permalink: /[page-id]` and are saved as `scaffold/src/[page-id].njk`
- Every template uses `layout: base.njk` and sets `pageTitle` to the page's display title
- Write page content directly as HTML — do not use `{{ site.* }}` references for copy. Use site data references only for structural elements you need from the layout (those are already in `base.njk`)
- Use semantic HTML: `<h1>` for the main page heading, `<p>` for paragraphs, `<section>` to group content blocks
- Use the copy from `site/build-plan.md` exactly as written. Do not shorten, rewrite, or summarize.

**Template format:**

```
---
layout: base.njk
pageTitle: [page title from spec]
permalink: [/ for first page, /[id] for others]
---
[full HTML content from site/build-plan.md]
```

Use the Write tool to create each file at its exact path.

---

**If `contact.enabled = true` and `contact.type = "email"`**, also write `scaffold/src/contact.njk`:

```nunjucks
---
layout: base.njk
pageTitle: Contact
permalink: /contact
---
<section class="contact-section">
  <h1>Get in Touch</h1>
  <p>Reach us at: <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a></p>
</section>
```

---

**[SCRIPT]** Run the Eleventy build:

```bash
bash scripts/build-site.sh
```

If it exits with an error, show the error output clearly. Common causes: malformed Nunjucks syntax in a generated template, missing layout reference, or empty `site/dist/`. Fix the template(s) and re-run this script.
