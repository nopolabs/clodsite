---
type: Guide
title: Clodsite Documentation Index
description: Role-based router into Clodsite's documentation.
tags: [docs, index]
timestamp: 2026-06-28T00:00:00Z
---

# Clodsite Documentation

The canonical agent guide is [`../AGENTS.md`](../AGENTS.md) — start there for the
workflow contract, architecture boundary, and multi-agent norms. (`CLAUDE.md` is
a pure pointer to it.) The role-specific guides below go deeper.

Start from the role you are playing.

## If you are helping develop Clodsite

Read [`agent-development.md`](agent-development.md).

That guide explains the current source map, the compiler boundary, where to make
changes, which documents are operational versus historical, and how to verify
changes before proposing them.

## If you are using Clodsite to build or modify a site

Read [`agent-authoring.md`](agent-authoring.md).

That guide explains the site-authoring workflow: collect intent, write or edit
`build-plan.yaml`, validate it, build it, inspect generated output, and deploy
only after the plan is reviewable.

## Reference Documents

| Document | Purpose |
|---|---|
| [`knowledge/index.md`](knowledge/index.md) | Knowledge format (OKF) — type vocabulary and frontmatter contract for these docs |
| [`authoring-build-plan.md`](authoring-build-plan.md) | Detailed `build-plan.yaml` authoring contract |
| [`client-onboarding.md`](client-onboarding.md) | Account ownership map for external-client sites |
| [`../components/CATALOG.md`](../components/CATALOG.md) | Generated component vocabulary and examples |
| [`testing.md`](testing.md) | Test layout, commands, result interpretation, fixtures, and where to add coverage |
| [`THEMES.md`](THEMES.md) | Theme contract and theme-authoring notes |
| [`theme-system-notes.md`](theme-system-notes.md) | Current theme-system experiments and findings |
| [`clodsite_vision_brief-final.md`](clodsite_vision_brief-final.md) | Product thesis, architecture direction, and claims discipline |
| [`benchmark-protocol.md`](benchmark-protocol.md) | Measurement protocol for Clodsite's core claims |
| [`../ROADMAP.md`](../ROADMAP.md) | Prioritized product and architecture work |

## Historical Design Records

The dated documents under [`superpowers/specs/`](superpowers/specs/) and
[`superpowers/plans/`](superpowers/plans/) are design and implementation records.
Use them for history and rationale. Do not treat them as current operating
instructions unless a current document or roadmap item explicitly points there.
