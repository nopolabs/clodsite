Generate the Clodsite build plan from the approved spec.

---

**Get site name.** Look at what the user typed after `/plan`. If no site name was provided:

> "Please provide a site name: `/plan <site-name>` — e.g., `/plan acme-corp`"

And stop.

---

**[SCRIPT]** Check for a v1 `site/` directory and auto-migrate if found:

```bash
bash scripts/migrate-site.sh
```

---

**[SCRIPT]** Validate the spec:

```bash
SITE_DIR=sites/<site-name> bash scripts/validate-spec.sh
```

If this exits with errors, print them clearly to the user and stop. Do not proceed until the spec is valid. The user can edit `sites/<site-name>/site-spec.json` directly or re-run `/interview <site-name>`.

---

**[SCRIPT]** Generate the component catalog reference:

```bash
bash scripts/generate-catalog-md.sh
```

---

**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate `sites/<site-name>/build-plan.yaml` using the Write tool.

The YAML must match this schema exactly:

```yaml
slug: <site directory name — same as what was passed to /plan, e.g. acme-corp>
overview: >-
  <one paragraph — purpose, audience, tone>
style: <value of site.style from spec>
tone: <value of site.tone from spec>
pages:
  - id: <page id>
    title: <page title>
    components:
      - type: <component name from components/CATALOG.md>
        # ... required and optional fields per the component's schema
nav:
  order:
    - <page ids in nav order from spec>
contact:
  enabled: <true or false from spec>
  email: <email address — omit this key if contact.enabled is false>
```

Do not include a `name` field — the display name is injected automatically by `finalize-plan.sh` after this step.

**Content rules for `pages[n].components`:**

Read `components/CATALOG.md` first — it lists every available component type
and its required/optional fields. You MUST only use component types listed
there. `validate-plan.sh` will reject unknown types.

The default and most common component is `prose`, which accepts a `markdown`
field containing GFM (headings, paragraphs, lists, links, fenced code blocks,
tables). A page whose body is purely textual is a single `prose` component.

Pages that need richer presentation (image gallery, contact form) compose
multiple components in order. Components stack vertically.

- If `content_status = "provided"`: use `content_outline` as-is inside a
  `prose` component's `markdown` field.
- If `content_status = "draft"`: write complete, publish-ready copy as GFM
  inside a `prose` component's `markdown` field. Match the site tone.
- Component fields use the appropriate YAML type (string, array, object) per
  the component's schema.

Write the complete YAML to `sites/<site-name>/build-plan.yaml`. No extra commentary in the file.

---

**[SCRIPT]** Finalize the plan — injects display name from the spec and validates:

```bash
SITE_DIR=sites/<site-name> bash scripts/finalize-plan.sh
```

If this exits with errors, print them clearly and stop.

---

Tell the user: "Review `sites/<site-name>/build-plan.json` — check the page content and structure. When ready, run `/build <site-name>`."
