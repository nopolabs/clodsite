Generate the Clodsite build plan from the approved spec.

---

**[SCRIPT]** Validate the spec first:

```bash
bash scripts/validate-spec.sh
```

If this exits with errors, print them clearly to the user and stop. Do not proceed until the spec is valid. The user can edit `site/site-spec.json` directly or re-run `/interview`.

---

**[LLM]** Read `site/site-spec.json`. Generate the build plan as markdown with these sections:

## Site Overview
Name, purpose, audience, tone, and style. One short paragraph.

## Pages
One section per page. For each:
- **[page title]** — `[page id]`
- Purpose: (from spec)
- Content:
  - If `content_status = "provided"`: use `content_outline` as-is
  - If `content_status = "draft"`: generate complete, publish-ready copy using `content_outline` as your brief. Write real sentences. Match the site tone. This is the copy that will appear on the live site.

## Navigation
Confirm the nav order. Note whether the contact link appears in the nav.

## Contact
How contact is handled: email address shown, contact form, or disabled.

## Build Notes
Anything unusual about this site that `/build` should know (e.g., specific layout needs, contact form handling).

---

Write the complete plan markdown to the file `site/build-plan.md`. Use the Write tool. The file should contain the markdown above — no extra commentary.

---

Tell the user: "Review `site/build-plan.md` — check the page copy and structure. When ready, run `/build`."
