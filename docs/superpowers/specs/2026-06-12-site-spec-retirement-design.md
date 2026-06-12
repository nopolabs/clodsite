# Site Spec Retirement Design

**Date:** 2026-06-12
**Status:** Proposed
**Roadmap entry:** Retire the `site-spec.json` legacy bridge

---

## Summary

Clodsite's supported build contract is `build-plan.yaml`. The build, deploy,
domain, teardown, status, and MCP workflows all operate without
`site-spec.json`, but the original `/interview` and `/plan` commands still
preserve an intermediate JSON artifact and three supporting scripts.

Retire `site-spec.json` as an active Clodsite artifact. Preserve the useful
customer interview experience, but have the agent produce a reviewable
`build-plan.yaml` directly. Remove the legacy `/plan` bridge, its scripts,
tests, fixtures, permissions, and current-documentation references.

This change aligns the implementation with the documented architecture:
everything before `build-plan.yaml` is customer-agent collaboration, and
everything after it is deterministic compilation and deployment.

---

## Current State

### Current primary workflow

```text
customer + agent
  -> build-plan.yaml
  -> validate
  -> build
  -> deploy
```

The following workflows read `build-plan.yaml` and do not require
`site-spec.json`:

- `/build`
- `/deploy`, including local preview
- `/domain`
- `/teardown`
- `/status`
- MCP deployment
- direct script-driven builds and deploys

### Remaining legacy workflow

```text
/interview
  -> site-spec.json
  -> write-spec.sh
  -> /plan
  -> validate-spec.sh
  -> agent writes build-plan.yaml without name
  -> finalize-plan.sh injects site.name
  -> validate-plan.sh
```

The remaining executable dependencies are:

| File | Current responsibility |
|---|---|
| `.claude/commands/interview.md` | Collect fixed interview answers and write `site-spec.json` |
| `.claude/commands/plan.md` | Convert a valid `site-spec.json` into `build-plan.yaml` |
| `scripts/write-spec.sh` | Check that the agent-written spec is parseable JSON and pretty-print it |
| `scripts/lib/write-spec.mjs` | Implement spec parsing and pretty-printing |
| `scripts/validate-spec.sh` | Invoke validation for the legacy spec |
| `scripts/lib/validate-spec.mjs` | Validate the legacy spec schema |
| `scripts/finalize-plan.sh` | Copy `spec.site.name` into `build-plan.yaml`, then validate the plan |
| `scripts/lib/finalize-plan.mjs` | Implement display-name injection |

No post-plan production path consumes `site-spec.json`.

### Existing site artifacts

At the time of this review, two known sites retain historical files:

- `clodsite-sites/ndig/site-spec.json`
- `clodsite-sites/nopolabs/site-spec.json`

These files are inert. Their corresponding `build-plan.yaml` files are the
active site contracts.

---

## Findings

### F1. The implementation has two advertised authoring models

The README and `CLAUDE.md` correctly describe `build-plan.yaml` as the
inference boundary, while `/interview` and `/plan` retain the original
two-artifact workflow. This creates unnecessary conceptual and maintenance
surface.

### F2. `finalize-plan.sh` preserves an obsolete ownership boundary

The `/plan` prompt asks the agent to write every plan field except `name`.
`finalize-plan.sh` then copies that single value from `site-spec.json`.
There is no longer a technical reason for this split. The agent can write the
display name into `build-plan.yaml` alongside the slug, overview, style, tone,
pages, navigation, and contact data.

### F3. The legacy schema cannot describe current Clodsite capabilities

The spec schema captures a name, purpose, audience, tone, style, one to five
page outlines, navigation, footer contact email, and domain preference. It
cannot represent the current component catalog, metadata, response headers,
theme selector, forms, commerce, functions, or other modern plan fields.

The agent must therefore reconstruct or invent the actual build contract
during `/plan`; the intermediate schema no longer provides a meaningful
validation boundary.

### F4. Some active test setup is historical residue

The `deploy-finalize.sh` tests create `site-spec.json`, although the script no
longer reads it. These copies do not exercise behavior and can be removed.

### F5. Three spec fixtures are entirely unreferenced

The following files have no active code or test references:

- `scripts/test/fixtures/domain-spec-deployed.json`
- `scripts/test/fixtures/domain-spec-no-deploy.json`
- `scripts/test/fixtures/teardown-spec-no-name.json`

### F6. Current operational documentation contains stale guidance

- `.claude/commands/build.md` tells users to rerun `/plan` after plan
  validation errors, although directly correcting `build-plan.yaml` is the
  normal workflow.
- `.claude/commands/domain.md` and `.claude/commands/deploy.md` mention not
  updating `site-spec.json`, even though it has no operational role.
- `ROADMAP.md` says the completed teardown command reads the spec; it now reads
  `build-plan.yaml`.
- `docs/demo/shot-list.md` demonstrates the old `/plan` and `build-plan.md`
  workflow.

The dated files under `docs/superpowers/specs/` and
`docs/superpowers/plans/` are historical records. Their obsolete references
should remain unchanged unless a document presents itself as current
operational guidance.

---

## Goals

- Make `build-plan.yaml` the only active per-site authoring contract.
- Preserve a conversational interview option for customers who want guided
  discovery.
- Remove the legacy conversion step and redundant validation schema.
- Remove code, tests, fixtures, and permissions used only by the retired
  artifact.
- Correct current user and agent documentation without rewriting historical
  design records.
- Keep existing sites buildable and deployable throughout the change.

## Non-Goals

- Do not redesign the `build-plan.yaml` schema.
- Do not implement the planned JSON Schema migration.
- Do not change build, deploy, domain, teardown, status, or MCP behavior.
- Do not delete historical `site-spec.json` files from the separate sites
  repository automatically.
- Do not rewrite dated design and implementation documents to pretend the
  legacy workflow never existed.
- Do not introduce a second discovery artifact under a different name.

---

## Proposed Design

### One authoring boundary

All customer collaboration paths shall terminate directly in
`$SITES_DIR/<site-name>/build-plan.yaml`.

```text
conversation, interview, notes, existing copy, screenshots, or direct editing
  -> build-plan.yaml
  -> deterministic scripts
```

### Retain `/interview`, change its output

`/interview <site-name>` shall remain available as a guided discovery
workflow. It shall:

1. Resolve and create the site directory using the existing `SITES_DIR`
   contract.
2. Start with one open question asking the customer to describe the intended
   site.
3. Ask targeted follow-up questions only for information required to produce
   a valid plan.
4. Read `components/CATALOG.md` before selecting components.
5. Present a concise confirmation summary before writing files.
6. Write a complete `build-plan.yaml`, including `slug` and human-readable
   `name`.
7. Run `SITE_NAME=<site-name> bash scripts/validate-plan.sh`.
8. Stop and report validation errors if the plan is invalid.
9. Tell the user to review the plan and run `/build <site-name>` when it is
   approved.

The command shall not create `site-spec.json`.

### Remove `/plan`

Remove `.claude/commands/plan.md`. There is no remaining conversion operation
for the command to perform. Existing customer input can be incorporated into
`build-plan.yaml` through ordinary agent collaboration or `/interview`.

### Remove legacy scripts

Remove:

- `scripts/write-spec.sh`
- `scripts/lib/write-spec.mjs`
- `scripts/validate-spec.sh`
- `scripts/lib/validate-spec.mjs`
- `scripts/finalize-plan.sh`
- `scripts/lib/finalize-plan.mjs`

`/interview` shall call `validate-plan.sh` directly after writing the plan.

### Remove tests and fixtures

Remove the `validate-spec.sh`, `write-spec.sh`, and `finalize-plan.sh` test
sections from `scripts/test/run-tests.sh`.

Remove:

- `scripts/test/fixtures/valid-spec.json`
- `scripts/test/fixtures/invalid-missing-field.json`
- `scripts/test/fixtures/invalid-bad-enum.json`
- `scripts/test/fixtures/domain-spec-deployed.json`
- `scripts/test/fixtures/domain-spec-no-deploy.json`
- `scripts/test/fixtures/teardown-spec-no-name.json`

Remove the unnecessary `site-spec.json` setup from the deploy-finalize tests.

Add or update command-level coverage so the documented `/interview` workflow
requires a complete plan containing `slug`, `name`, pages, navigation, and
component content before validation.

### Remove command permissions

Remove the `write-spec.sh`, `validate-spec.sh`, and `finalize-plan.sh`
allowlist entries from `.claude/settings.json`.

### Update current documentation

Update:

| File | Required change |
|---|---|
| `README.md` | Remove `/interview -> site-spec.json` and `/plan` architecture entries; describe `/interview` as an optional direct-to-plan workflow |
| `CLAUDE.md` | Replace the legacy scaffold sections with the direct `/interview -> build-plan.yaml -> validate-plan.sh` sequence |
| `.claude/commands/help.md` | Remove `/plan` as an alternate writer and mention `/interview` as an optional way to create the plan |
| `.claude/commands/build.md` | Tell the agent to correct the plan rather than rerun `/plan` after validation failures |
| `.claude/commands/domain.md` | Remove the obsolete `site-spec.json` warning |
| `.claude/commands/deploy.md` | Remove the obsolete statement about not writing back to `site-spec.json` |
| `ROADMAP.md` | Replace the legacy-interview enhancement item with this retirement item; correct stale completed-work descriptions |
| `docs/demo/shot-list.md` | Demonstrate direct plan creation and the current YAML workflow |

Do not bulk-edit dated documents under `docs/superpowers/`.

---

## Compatibility And Migration

No build-plan migration is required.

Existing sites with only `build-plan.yaml` continue to work unchanged.
Existing sites that also contain `site-spec.json` continue to work because no
production command reads the file. Clodsite shall not delete those files
automatically; site owners may retain them as history or remove them in a
separate sites-repository cleanup.

A site containing `site-spec.json` but no `build-plan.yaml` is not considered
buildable after this change. The agent shall read the legacy file as source
material and create a valid `build-plan.yaml` through the normal collaboration
workflow. No permanent conversion command shall be retained for this edge
case.

---

## Acceptance Criteria

1. A repository-wide search outside dated historical documents finds no
   executable reference to `site-spec.json`.
2. `/interview <site-name>` produces and validates
   `$SITES_DIR/<site-name>/build-plan.yaml` without creating an intermediate
   JSON file.
3. `/plan` is no longer advertised or installed as a command.
4. The six legacy script and module files are absent.
5. Legacy spec tests and all six spec fixtures are absent.
6. Deploy-finalize tests do not create an unused spec.
7. Current README, agent instructions, command help, roadmap, and demo
   documentation consistently identify `build-plan.yaml` as the sole
   authoring contract.
8. Dated historical design and implementation documents remain intact.
9. The complete existing test suite passes.
10. A build and local deploy of an existing plan succeeds without
    `site-spec.json` present.

---

## Risks

### Loss of a structured discovery checkpoint

The spec provided a compact interview summary before page content was written.
The replacement confirmation summary preserves the human checkpoint without
persisting a second contract.

### Reduced compatibility with abandoned partial sites

A partial site containing only `site-spec.json` will need agent-assisted plan
creation. This is acceptable because `/plan` already required an LLM and the
known active sites have build plans.

### Interview prompt becomes responsible for more structure

The current agent already creates complete plans during direct collaboration.
The interview command shall use the same component catalog and plan validator,
avoiding a separate schema that can drift again.

---

## Recommendation

Implement this retirement as one focused cleanup change. Keeping the legacy
bridge offers little compatibility value, preserves a schema that cannot
express modern Clodsite sites, and makes the documented single-contract
architecture less true.

Preserve `/interview` as a customer experience, not as a file format.
