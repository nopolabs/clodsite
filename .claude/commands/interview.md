Conduct the Clodsite site interview. You are helping someone build a website. Be conversational, professional, and efficient. Ask one question at a time and wait for the answer before proceeding.

---

**Get site name.** Look at what the user typed after `/interview`. That word or slug is the site name. If they typed `/interview` with nothing after it, respond:

> "Please provide a site name: `/interview <site-name>` — e.g., `/interview acme-corp`"

And stop.

The site name must be a valid slug: lowercase letters, numbers, and hyphens only (e.g., `my-site`, `acme-corp`, `ndig`). If the user typed a name with spaces or capitals, suggest the lowercase-hyphenated version and ask them to confirm before continuing.

---

**[SCRIPT]** Confirm the site doesn't already exist:

```bash
SITE_NAME=<site-name> bash -c 'source scripts/lib/sites.sh && clodsite_init_site_dir && [ ! -d "$SITE_DIR" ] || echo "EXISTS"'
```

If it prints `EXISTS`, tell the user:

> "`$SITES_DIR/<site-name>/` already exists. Use `/plan <site-name>` or `/build <site-name>` to continue it. Use `/setup clean <site-name>` to start over."

And stop.

---

**[SCRIPT]** Create the site directory:

```bash
SITE_NAME=<site-name> bash -c 'source scripts/lib/sites.sh && clodsite_init_site_dir && mkdir -p "$SITE_DIR/assets/favicons"'
```

---

**Shortcut:** If the user points you to an answers file (e.g. "read from docs/demo/interview-answers.md"), read that file and synthesize the spec directly from it — skip the interactive questions entirely.

---

**[LLM]** Ask the following questions in order. One at a time. The site name is already known (`<site-name>`) — do NOT ask question 1 again; start from question 2:

1. ~~What is the name of your site or brand?~~ *(already provided as `<site-name>`)*
2. In one sentence, what does this site do or offer?
3. Who is this site for?
4. What tone should the writing have? *(professional / casual / technical / friendly)*
5. What visual personality fits best? *(minimal / professional / bold)* — briefly describe each if they ask.
6. What pages do you need? List 1–5 page names. *(e.g., Home — or Home, About, Services, Contact)*
7. For each page you listed: what is the purpose of this page in one sentence?
8. Do you have copy ready for the pages, or should I draft it? *(provided / draft)*
9. *(If provided)* Please share the content for each page — paste it or describe it.
   *(If draft)* For each page, describe in a few sentences what it should say.
10. Do you want a contact email shown in the site footer? If yes, what address should visitors use? *(A mailto link will appear in every page's footer. A contact page or submittable form can be added as a page — just include "Contact" in your page list.)*
11. *(Optional)* Do you have a custom domain, or is a `*.pages.dev` URL fine for now?

---

**[LLM]** Once all answers are collected, synthesize them into a single JSON object. The `site.name` field should be the human-readable version of the site name (may differ from the slug). Follow this schema exactly — no extra fields, no comments, no trailing commas:

```json
{
  "site": {
    "name": "...",
    "purpose": "...",
    "audience": "...",
    "tone": "professional|casual|technical|friendly",
    "style": "minimal|professional|bold"
  },
  "pages": [
    {
      "id": "lowercase-slug",
      "title": "Display Name",
      "purpose": "one sentence",
      "content_outline": "user copy or draft directive"
    }
  ],
  "nav": {
    "order": ["page-id-1", "page-id-2"]
  },
  "contact": {
    "enabled": true,
    "email": "address@example.com"
  },
  "domain": {
    "custom": false,
    "hostname": ""
  },
  "content_status": "provided|draft",
  "meta": {
    "generated_at": "ISO-8601 timestamp of right now",
    "spec_version": "1.0"
  }
}
```

Rules:
- `pages[].id` must be lowercase, no spaces, hyphens only (e.g., `home`, `about`, `our-work`)
- `nav.order` must list every page id
- If `contact.enabled = false`, omit `email` or set it to `""`
- If `domain.custom = false`, set `hostname: ""`
- `content_status` = `"provided"` if user supplied copy; `"draft"` if Claude should write it

Write the JSON to `$SITES_DIR/<site-name>/site-spec.json`. Use the Write tool. First run `mkdir -p "$SITES_DIR/<site-name>"` if the directory doesn't already exist. The file should contain only the JSON — no markdown fences, no explanation.

---

**[SCRIPT]** Run:

```bash
SITE_NAME=<site-name> bash scripts/write-spec.sh
```

This validates the JSON is parseable and pretty-prints it in place.
