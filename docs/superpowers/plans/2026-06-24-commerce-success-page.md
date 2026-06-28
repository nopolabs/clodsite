---
type: Plan
title: "Commerce Success Page Return URLs"
description: "Implementation plan for post-checkout success page return URLs."
tags: ["commerce", "checkout"]
status: shipped
timestamp: 2026-06-24T00:00:00Z
---

# Commerce Success Page Return URLs

## Goal

Give commerce sites a clear post-checkout acknowledgement path instead of
returning silently to the shop page.

## Contract

`commerce.checkout` is an object:

```yaml
checkout:
  provider: stripe
  success_url: /success/?session_id={CHECKOUT_SESSION_ID}
  cancel_url: /
```

- `provider` is required and only accepts `stripe`.
- `success_url` and `cancel_url` are required site-root-relative paths.
- `success_url` must contain Stripe's `{CHECKOUT_SESSION_ID}` placeholder so
  Clodsite can clear the cart after a completed checkout.
- `cancel_url` does not support placeholders.

## Hidden Pages

`nav.order` is visible navigation order, not the complete page list. Every
`pages[]` entry is still rendered; pages omitted from `nav.order` are useful for
utility pages such as `/success/`.

## Implementation Tasks

1. Validate the new checkout object shape and URL rules.
2. Pass configured return URLs into the rendered checkout Function.
3. Keep cart chrome and live Function detection keyed on
   `commerce.checkout.provider: stripe`.
4. Update authoring docs and commerce fixtures.
5. Add an HMC next-gen `/success/` page omitted from navigation.
6. Build, deploy, and run one Stripe test checkout; stop with the Printful order
   id so the live fulfillment order can be cancelled.
