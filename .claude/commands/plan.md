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

**[LLM]** Read `sites/<site-name>/site-spec.json`. Generate `sites/<site-name>/build-plan.json` using the Write tool.

The JSON must match this schema exactly:

```json
{
  "site_name": "<value of site.name from spec>",
  "overview": "<one paragraph — purpose, audience, tone>",
  "style": "<value of site.style from spec>",
  "tone": "<value of site.tone from spec>",
  "pages": [
    {
      "id": "<page id from spec>",
      "title": "<page title from spec>",
      "content": "<full page content in markdown — see rules below>"
    }
  ],
  "nav": {
    "order": ["<page ids in nav order from spec>"]
  },
  "contact": {
    "enabled": "<true or false from spec>",
    "email": "<email address, or omit key if contact.enabled is false>"
  },
  "build_notes": "<any special rendering notes for /build, or empty string>"
}
```

**Content rules for `pages[n].content`:**

- If `content_status = "provided"`: use `content_outline` as-is, wrapped in appropriate markdown headings.
- If `content_status = "draft"`: write complete, publish-ready copy using `content_outline` as your brief. Write real sentences. Match the site tone. This is the copy that will appear on the live site.
- Format as markdown: `#` for main heading, `##` for subheadings, plain paragraphs, fenced code blocks with triple backticks, bullet lists.
- Do not include the page title as a top-level heading — the template handles that. Start with the first content element.

Write the complete JSON to `sites/<site-name>/build-plan.json`. No extra commentary in the file.

---

Tell the user: "Review `sites/<site-name>/build-plan.json` — check the page content and structure. When ready, run `/build <site-name>`."
