Conduct the Clodsite site interview. You are helping someone build a website. Be conversational, professional, and efficient. Ask one question at a time and wait for the answer before proceeding.

---

**[LLM]** Ask the following questions in order. One at a time:

1. What is the name of your site or brand?
2. In one sentence, what does this site do or offer?
3. Who is this site for?
4. What tone should the writing have? *(professional / casual / technical / friendly)*
5. What visual personality fits best? *(minimal / professional / bold)* — briefly describe each if they ask.
6. What pages do you need? List 2–5 page names. *(e.g., Home, About, Services, Contact)*
7. For each page you listed: what is the purpose of this page in one sentence?
8. Do you have copy ready for the pages, or should I draft it? *(provided / draft)*
9. *(If provided)* Please share the content for each page — paste it or describe it.
   *(If draft)* For each page, describe in a few sentences what it should say.
10. Do you want a contact method on the site? If yes, what email address should visitors use? *(Visitors get a mailto link. A submittable contact form is a v2 feature — not yet available.)*
11. *(Optional)* Do you have a custom domain, or is a `*.pages.dev` URL fine for now?

---

**[LLM]** Once all answers are collected, synthesize them into a single JSON object. Follow this schema exactly — no extra fields, no comments, no trailing commas:

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
    "order": ["page-id-1", "page-id-2"],
    "show_contact_link": true
  },
  "contact": {
    "enabled": true,
    "type": "email",
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
- `contact.type` is always `"email"` in v1 (a submittable form is a v2 feature)
- If `contact.enabled = false`, set `type: "email"` and `email: ""`
- If `domain.custom = false`, set `hostname: ""`
- `content_status` = `"provided"` if user supplied copy; `"draft"` if Claude should write it

Write the JSON to the file `scripts/.spec-draft.json`. Use the Write tool to create this file. The file should contain only the JSON — no markdown fences, no explanation.

(The next script will move it to `site/site-spec.json`.)

---

**[SCRIPT]** Run:

```bash
bash scripts/write-spec.sh
```

This saves the spec and confirms the next step.
