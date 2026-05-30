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

**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate `sites/<site-name>/build-plan.yaml` using the Write tool.

The YAML must match this schema exactly:

```yaml
slug: <site directory name — same as what was passed to /plan, e.g. acme-corp>
overview: >-
  <one paragraph — purpose, audience, tone>
style: <value of site.style from spec>
tone: <value of site.tone from spec>
pages:
  - id: <page id from spec>
    title: <page title from spec>
    content: |
      <full page content in GFM — see rules below>
nav:
  order:
    - <page ids in nav order from spec>
contact:
  enabled: <true or false from spec>
  email: <email address — omit this key if contact.enabled is false>
build_notes: <any special rendering notes for /build, or empty string>
```

Do not include a `name` field — the display name is injected automatically by `finalize-plan.sh` after this step.

**Content rules for `pages[n].content`:**

- If `content_status = "provided"`: use `content_outline` as-is, wrapped in appropriate markdown headings.
- If `content_status = "draft"`: write complete, publish-ready copy using `content_outline` as your brief. Write real sentences. Match the site tone. This is the copy that will appear on the live site.
- Format as GFM (GitHub Flavored Markdown): `#` for main heading, `##` for subheadings, plain paragraphs, fenced code blocks with triple backticks, bullet lists, pipe tables.
- The `content` field uses a YAML literal block scalar (`|`). Write content starting on the next line, indented 6 spaces (2 beyond the `content:` key at 4 spaces). Do not add a leading `#` heading — the template handles the page title.

Write the complete YAML to `sites/<site-name>/build-plan.yaml`. No extra commentary in the file.

---

**[SCRIPT]** Finalize the plan — injects display name from the spec and validates:

```bash
SITE_DIR=sites/<site-name> bash scripts/finalize-plan.sh
```

If this exits with errors, print them clearly and stop.

---

Tell the user: "Review `sites/<site-name>/build-plan.json` — check the page content and structure. When ready, run `/build <site-name>`."
