# Structured Build Plan Design

## Problem

`/plan` produces `build-plan.md` — a markdown document the LLM re-reads during
`/build` to generate Nunjucks templates. The LLM makes content decisions in both
`/plan` and `/build`. This contradicts the inference-boundary claim: the plan
should capture all decisions; `/build` should be a render step, not a content
authoring step.

## Solution

Change `/plan` to produce `build-plan.json`. All page content is written during
`/plan` inference and frozen in the JSON. `/build` reads the JSON and passes it
to the LLM as the content source — the LLM renders content into templates, not
decides what to write. A `validate-plan.sh` guard catches malformed plans before
`/build` runs.

## Schema

```json
{
  "site_name": "string — matches site.name in site-spec.json",
  "overview": "string — one paragraph written during /plan",
  "style": "string — one of: minimal, professional, bold",
  "tone": "string — one of: professional, casual, technical, friendly",
  "pages": [
    {
      "id": "string — matches page id in site-spec.json",
      "title": "string — display title",
      "content": "string — full page content in markdown"
    }
  ],
  "nav": {
    "order": ["array of page ids in display order"],
    "show_contact_link": "boolean"
  },
  "contact": {
    "enabled": "boolean",
    "type": "email",
    "email": "string — omit if contact.enabled is false"
  },
  "build_notes": "string — optional special rendering instructions for /build"
}
```

`pages[n].content` is markdown. The LLM in `/build` converts it to HTML when
generating Nunjucks templates.

## What does NOT change

- `site-spec.json` schema is unchanged
- The LLM still generates `.njk` templates in `/build`
- Eleventy build process, `write-site-json.sh`, and `apply-theme.sh` are unchanged
- All other scripts are unchanged

## Migration

Existing `build-plan.md` files are not read by the new pipeline. Re-run
`/plan <site-name>` to generate `build-plan.json` for any existing site that
needs a rebuild.
