# Contact Footer Design

## Problem

Contact is currently implemented as a special auto-generated page. When
`contact.enabled = true`, `/build` writes a `/contact/` page and base.njk adds
a "Contact" link to the nav. This forces a second page onto single-page sites
and conflates two independent concepts: having a contact email and having a
contact page.

## Solution

Contact moves to the footer. `contact.enabled` / `contact.email` in the spec
exclusively drives a footer email link — no page, no nav entry. If a site owner
wants a contact page, they add it to `pages[]` like any other page and write
its content in the build plan. A contact form (future) would follow the same
pattern: a user-specified page.

## Schema Changes

### `site-spec.json`

Remove `nav.show_contact_link` and `contact.type`. Contact is now:

```json
"contact": { "enabled": true, "email": "hello@example.com" }
```

or:

```json
"contact": { "enabled": false }
```

### `build-plan.json`

Same: remove `contact.type`. Contact is:

```json
"contact": { "enabled": true, "email": "hello@example.com" }
```

## Template Changes (`scaffold/src/_includes/base.njk`)

Remove the Contact nav link block:

```nunjucks
{# REMOVE this block entirely #}
{% if site.nav.show_contact_link and site.contact.enabled %}
  <li><a href="/contact/">Contact</a></li>
{% endif %}
```

Update the footer to show the email link when contact is enabled:

```nunjucks
<footer class="site-footer">
  <p>
    &copy; {{ site.name }}
    {% if site.contact.enabled %}
      &nbsp;·&nbsp; <a href="mailto:{{ site.contact.email }}">{{ site.contact.email }}</a>
    {% endif %}
  </p>
</footer>
```

## Script Changes

### `scripts/write-site-json.sh`

- Remove `show_contact_link` from the nav output
- Remove the `hasContactPage` special-case logic
- Remove `type` from the contact default fallback
- Output contact as `{ enabled, email }` only

### `scripts/validate-spec.sh`

- Remove the `contact.type !== 'email'` check

### `scripts/test/fixtures/valid-spec.json`

- Remove `nav.show_contact_link`
- Remove `contact.type`

### `scripts/test/fixtures/valid-build-plan.json`

- Remove `contact.type`

## Command Changes

### `.claude/commands/build.md`

Remove the auto-generated `contact.njk` section entirely. Contact is no longer
a generated page.

### `.claude/commands/plan.md`

- Remove `contact.type` from the build-plan.json schema template
- Update contact description: "controls footer email only — not a page"

### `.claude/commands/interview.md`

Change the contact question from "Do you want a Contact page?" to "Do you want
a contact email shown in the footer?" The answer sets `contact.enabled` and
`contact.email`.

## ROADMAP.md

Update the "Contact form + form backend" pending entry to reflect that a contact
form would be a user-specified page in `pages[]`, not a special auto-generated
page.

## Migration

Existing `site-spec.json` files with `nav.show_contact_link` and `contact.type`
are not broken by this change — those fields are simply ignored by the updated
scripts. Re-running `/plan` and `/build` for a site will pick up the new footer
behavior. The old auto-generated `contact.njk` and `/contact/` page will no
longer be produced.

## What Does NOT Change

- `contact.enabled` and `contact.email` field names are unchanged
- `build-plan.json` contact object structure is unchanged (minus `type`)
- All other spec fields are unchanged
- The Eleventy build process is unchanged
