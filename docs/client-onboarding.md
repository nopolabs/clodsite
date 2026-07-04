---
type: Guide
title: Client Onboarding
description: Account ownership map for external-client Clodsite sites.
tags: [clients, onboarding, accounts, secrets]
timestamp: 2026-07-04T00:00:00Z
---

# Client Onboarding

This guide is the operator runbook for
[item 25 (client readiness)](../ROADMAP.md#25-client-readiness--what-stands-between-us-and-client-1):
the account-ownership model for building and maintaining a Clodsite site for an
external client under the current
[single-trusted-operator model](../ROADMAP.md#16-multi-tenant-isolation-model)
(item 16's tier-1 boundary).

## Account Ownership

| Provider | Owner | Notes |
|---|---|---|
| Stripe | Client | The client owns the Stripe account because it controls their money, KYC, payouts, receipts, refunds, tax records, and customer payment history. Clodsite uses restricted keys with the minimum scopes required for checkout and webhook operation. The operator's shared env registry holds custody of the credential name/value used during deploy. |
| Domain registration | Client | The domain is the client's durable business asset. The client should own the registrar account or be able to transfer the domain away without depending on the operator. |
| Cloudflare | Operator | Clodsite sites currently deploy into the operator's shared Cloudflare account. This includes Pages projects, Workers/Pages Functions, Turnstile widgets, KV namespaces, and DNS automation when the operator manages the zone. |
| Resend | Operator | Transactional email currently sends through the operator's shared Resend account. For a client sender address, the client's sender domain is verified in the operator's Resend account. This was the explicit operating decision on 2026-07-03. |

## Credential Handling

Secrets never belong in `build-plan.yaml` or generated site files. A client site
declares the names of env vars it uses, and the operator's private
[shared env registry](../AGENTS.md#secrets--the-shared-env-registry) stores the
actual values.

Use restricted provider keys wherever possible. For Stripe, use the minimum
permissions needed for the site's checkout and webhook workflows rather than a
full-access account key.

## If We Part Ways

The client should leave with:

- their domain registration, including the ability to point DNS elsewhere;
- their Stripe account, including payouts, payments, receipts, refunds, and
  reporting history;
- the site's content and `build-plan.yaml`, which are the source contract for
  rebuilding the site.

The operator keeps the shared Cloudflare and Resend accounts. If the client
moves to a different operator or platform, the site can be rebuilt from the
content/build plan, the domain can be repointed, and the Stripe account remains
the client's payment system of record.
