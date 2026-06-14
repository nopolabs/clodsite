# Briefs — Ridgeline Coffee Roasters

Owner-level briefs for each scenario, in plain language. Hand the agent **only
the current scenario's section**, verbatim. No Clodsite vocabulary, no YAML, no
component names — converting this into a buildable site is the work being
measured.

Scenarios run in order against the same evolving site. Site name: `ridgeline`.

---

## 01-create

> Hi! We're Ridgeline Coffee Roasters — two of us roasting small batches of
> coffee here in Bend, Oregon. We need a simple website.
>
> I think three pages: a home page that says who we are and why our coffee is
> worth it, a page about our coffee (how we roast, what makes it good), and a
> contact page so people can reach us. Warm and down-to-earth, knowledgeable but
> not snobby — we want people to feel welcome, not lectured.
>
> Here's a blurb we already wrote you can use or rework:
>
> "Ridgeline Coffee is roasted in small batches and shipped fresh. We source
> beans we'd be happy to drink every morning, roast them to bring out what makes
> each one special, and get them to you fast. No mystery blends, no burnt
> bitterness — just honest, careful coffee."
>
> For contact, people can email us at hello@ridgelinecoffee.example. Our pages-
> dot-dev URL is fine for now; we don't have a custom domain yet.

---

## 02-reposition

> Looking at the home page, I'd like it to lead with what actually makes us
> different — that everything is **roasted to order and shipped within 24 hours**.
> That's our whole thing and it's buried right now. Can you put that front and
> center at the top?
>
> Also, move our little founder quote up near the top — it sets the tone:
> *"We started Ridgeline because we were tired of stale grocery-store coffee. —
> Sam & Dana."*
>
> Don't change the other pages, just the home page.

---

## 03-add-page

> Can you add an About page that tells our story? Two friends — Sam and Dana —
> who started roasting in a one-car garage back in 2019, outgrew it twice, and
> now run a little roastery off the highway. We're proud it's still just the two
> of us. Add it to the menu so people can find it.

---

## 04-catalog

> We're ready to sell our coffee online. We have three to start — can you put up
> a page that shows them with prices and a short description of each? All 12-ounce
> bags.
>
> - **Ridgeline Blend** — $16. Our everyday cup: balanced, smooth, a little
>   chocolatey. Good in anything.
> - **Sunrise Light Roast** — $17. Bright and fruity, single-origin Ethiopian.
>   Best in a pour-over.
> - **Midnight Dark Roast** — $17. Bold and rich without tasting burnt. Great
>   with milk.

---

## 05-checkout

> Let's let people actually buy the coffee — pay by card, right on the site.
> When an order comes in, email it to us at orders@ridgelinecoffee.example so we
> know what to roast and where to ship it. We only ship within the US for now.

---

## 06-reskin

> Honestly the site looks a little plain and safe. Can you make it feel bolder
> and more confident — more like a brand with some personality? Same content,
> just a stronger look.

---

## 07a-compose

> Two small additions to the home page: drop in a few customer quotes — people
> say nice things and we should show them — and put a clear "Shop our coffee"
> button at the bottom so people land on the products page. Here are three quotes:
>
> - "The freshest coffee I've ever had shipped to me." — Mara T.
> - "Sunrise Light Roast ruined every other pour-over for me." — Devin K.
> - "You can taste that someone actually cared." — Priya R.
>
> Leave the rest of the site as it is.

---

## 07b-faq

> We keep getting the same questions by email. Can you add a Frequently Asked
> Questions section where each question can be clicked to open up its answer
> (and clicked again to close it) — so the page stays tidy? Cover these three:
>
> - **How fast do you ship?** We roast to order and ship within 24 hours, usually
>   arriving in 2–4 business days.
> - **Can I choose how it's ground?** Right now everything ships as whole bean —
>   grinding fresh makes a real difference. Bag-by-bag grind options are coming.
> - **Do you offer a subscription?** Not yet, but it's the most-requested thing on
>   our list — email us and we'll let you know when it launches.

---

## 08 — rebuild (no brief)

No owner input. Build the site twice from the unchanged scenario-07b source and
compare normalized output for determinism (see the protocol §5, Build
determinism).
