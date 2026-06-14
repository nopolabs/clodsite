# Acceptance — Ridgeline Coffee Roasters

Reviewer-only. **Do not show this to the agent.** Each scenario's checklist
defines "done" and is applied to the agent's self-declared deliverable —
**blind to which arm produced it, and without editing the output** (see
`../rubric.md`).

Every item is objectively checkable (pass/fail). This is the **first benchmark:
functional correctness only** — do not score visual quality here (deferred to the
second benchmark). A "reskin looks good" judgment is out of scope; "the style
changed and nothing broke" is in scope.

After scoring a scenario, run the **cumulative regression check**: re-verify the
acceptance items of all *prior* scenarios against this same deliverable. Any
previously-passing item now failing is a regression (see `../rubric.md`).

---

## 01-create

- [ ] Exactly three pages exist: a home page, a coffee page, a contact page.
- [ ] Every page is reachable from the site navigation; nav appears on each page.
- [ ] Home conveys who they are and a reason the coffee is worth it (per brief).
- [ ] The coffee page describes the roasting / what makes it good.
- [ ] A working contact method is present: the email `hello@ridgelinecoffee.example`
      (as a mailto or in a form).
- [ ] No broken internal links.
- [ ] The site builds and serves/deploys with no errors.

## 02-reposition

- [ ] The roasted-to-order / shipped-within-24-hours differentiator is the first
      substantive content on the home page (above earlier content).
- [ ] The founder quote ("We started Ridgeline… — Sam & Dana") appears near the
      top of the home page.
- [ ] **Drift:** the coffee and contact pages are unchanged from scenario 01.
- [ ] Builds; nav and links intact.

## 03-add-page

- [ ] An About page exists with the story (Sam & Dana, garage, 2019).
- [ ] About is listed in the navigation and reachable.
- [ ] **Drift:** home, coffee, and contact pages' content unchanged.
- [ ] No broken links; builds.

## 04-catalog

- [ ] A products/shop area lists exactly the three coffees.
- [ ] Names, prices, and descriptions are correct: Ridgeline Blend $16; Sunrise
      Light Roast $17; Midnight Dark Roast $17; all noted as 12 oz.
- [ ] The products area is reachable from the site (nav or a home-page link).
- [ ] **Drift:** previously-built pages unchanged.
- [ ] No broken links; builds.

## 05-checkout

> Heaviest scenario. Requires a deploy target + Stripe **test** keys (and, for the
> Clodsite arm, the commerce KV namespace). If the environment can't support a
> live test purchase, mark the scenario **blocked** with the reason — do not fake
> a pass.

- [ ] Each product can be purchased and paid for by card (Stripe **test mode**).
- [ ] A test purchase completes end to end (checkout → confirmation).
- [ ] The order is recorded, and a fulfillment email is sent to
      `orders@ridgelinecoffee.example` on a successful purchase.
- [ ] Shipping is restricted to the US (address collection limited to US, or
      explicitly US-only).
- [ ] **Drift:** prior pages still navigable and unchanged in content.
- [ ] Builds/deploys; no errors.

## 06-reskin

- [ ] The site's visual style is demonstrably different site-wide from the
      pre-scenario state (different theme/style applied everywhere).
- [ ] **Drift:** all page *content* (text, products, structure) is unchanged —
      only presentation differs.
- [ ] Builds; nav and links intact.
- [ ] *(Do not judge whether it looks good — functional change only.)*

## 07a-compose

- [ ] The home page has a testimonials section containing the three quotes
      (Mara T., Devin K., Priya R.).
- [ ] A "Shop our coffee" button/CTA appears at the bottom of the home page and
      links to the products page.
- [ ] **Drift:** all other pages unchanged.
- [ ] The CTA link resolves; builds.

## 07b-faq

- [ ] An FAQ section exists (on a sensible page) covering all three topics:
      shipping speed, grind options, subscription.
- [ ] Each question **expands to reveal its answer on click, and collapses on a
      second click**, in the built/served site (verify the interaction, not just
      that the text is present).
- [ ] Answers match the brief's content.
- [ ] **Drift:** all other pages unchanged.
- [ ] Builds.

## 08 — rebuild (determinism)

- [ ] Building twice from the unchanged scenario-07b source produces identical
      output after normalizing known-variable fields (timestamps, content hashes
      — document the normalization).
