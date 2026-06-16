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
>
> **Email is operator-substituted.** `orders@ridgelinecoffee.example` is a
> placeholder and cannot receive mail. Before the run, replace it — in the brief
> copy **both arms receive** — with an operator-controlled inbox you can read; and
> supply a **verified sender** (Resend free tier allows one verified domain) via
> each arm's normal secrets channel. Substitute identically for both arms, never
> differently per arm. Decide and record the **acceptance level** for the email
> check:
>
> - **inbox receipt** (preferred) — the message actually lands in the operator
>   inbox;
> - **provider delivery** — the email provider reports it delivered;
> - **API acceptance** (weakest) — the provider returned 2xx for the send.
>
> Use the same level for both arms. "API acceptance" only proves the request was
> made, not that fulfillment arrived — prefer inbox receipt when feasible.

- [ ] Each product can be purchased and paid for by card (Stripe **test mode**).
- [ ] A test purchase completes end to end (checkout → confirmation).
- [ ] The order is recorded, and a fulfillment email reaches the
      operator-substituted inbox (from a verified sender) on a successful
      purchase — verified at the chosen acceptance level (see the note above).
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

## 07b-brew-calculator

> Extensibility probe — no component in the catalog covers an interactive
> calculator, and the Clodsite arm may not inject raw HTML/JS into `prose` (see
> the instruction sheets), so it must author a real component. Per the rubric,
> 07b's review-diff counts **all** reviewed source in each arm, including any new
> Clodsite component (schema + template + styles + script). Report 07b
> separately from the revision-scenario medians.

- [ ] A brew calculator appears on the Coffee page.
- [ ] Changing the number of cups **updates the displayed coffee grams and water
      amount live, with no page reload** (verify the interaction, not just that the
      control is present).
- [ ] The math is correct at a 1:16 ratio with 250 ml/cup: e.g. **2 cups → 500 ml
      water and ~31 g coffee** (allow sensible rounding).
- [ ] **Drift:** all other pages unchanged.
- [ ] Builds.

> **Interaction verification is headless** (see `../rubric.md` → Interactive
> checks): load the built page in a headless browser, set the cups input, and read
> the computed output — do not score the interaction from static markup alone.

## 08 — rebuild (determinism)

- [ ] Building twice from the unchanged scenario-07b source produces identical
      output after normalizing known-variable fields (timestamps, content hashes
      — document the normalization).
