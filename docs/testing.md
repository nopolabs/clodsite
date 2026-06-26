# Testing Clodsite

Use this guide when you need to understand, run, or extend Clodsite's tests.
For the shorter development checklist, see
[`agent-development.md`](agent-development.md).

## Test Map

| Area | Files | What They Cover |
|---|---|---|
| Integration and script regression suite | `scripts/test/run-tests.sh` | Shell scripts, plan validation, rendering, generated HTML/CSS, deploy stubs, commerce, proxies, certificate awards, and fixture builds |
| JS library unit tests | `scripts/lib/*.test.mjs`, nested `scripts/lib/**/*.test.mjs` | Pure or mostly-pure library behavior such as catalog validation, catalog resolution, commerce checkout/webhook helpers, build-plan parsing, proxy validation, and 404 helpers |
| MCP tests | `mcp/*.test.js` | MCP pipeline behavior |
| Fixtures | `scripts/test/fixtures/` | Build plans, catalogs, provider responses, favicon fixtures, and Cloudflare status fixtures used by tests |
| Component contracts | `components/<name>/schema.json`, `components/<name>/component.njk`, `components/<name>/component.css` | Not tests by themselves, but most component tests assert behavior generated from these files |

## Running Tests

Run the broad regression suite before proposing shared behavior changes:

```bash
bash scripts/test/run-tests.sh
```

Run all JS library and MCP unit tests directly when you are working in
`scripts/lib/` or `mcp/`:

```bash
node --test scripts/lib/*.test.mjs mcp/pipeline.test.js
```

The shell suite also runs all nested JS library tests near the end with:

```bash
node --test $(find scripts/lib -name '*.test.mjs' | sort)
```

The `package.json` scripts provide two narrow shortcuts:

```bash
npm run test:lib
npm run test:mcp
```

`npm run test:lib` only covers `scripts/lib/*.test.mjs` at one directory level.
Use `bash scripts/test/run-tests.sh` or the explicit `find scripts/lib` command
when you need nested commerce/provider tests too.

## Reading Results

`scripts/test/run-tests.sh` is intentionally plain text. It prints sections like:

```text
=== validate-plan.sh ===
  ✓ valid plan passes
  ✗ missing required field exits 1 (expected exit 1, got 0)
```

Each line is an assertion. A failing line usually names the behavior that
regressed and often includes the expected string, file, or exit code.

At the end, the suite prints:

```text
Results: 895 passed, 0 failed
```

The script exits `0` only when the failed count is zero. Treat any non-zero exit
as a failed suite, even if most sections passed.

Node's built-in test runner prints its own TAP/spec-style output. For focused
library work, the useful signals are:

- the failing test name;
- the assertion diff or thrown error;
- the file path in the stack trace;
- the final pass/fail summary.

## Choosing The Right Check

Start narrow, then broaden:

| Change Type | Start With | Broaden To |
|---|---|---|
| Pure helper in `scripts/lib/` | Relevant `node --test ...test.mjs` file | `bash scripts/test/run-tests.sh` |
| Component schema/template/CSS | Fixture-oriented section in `scripts/test/run-tests.sh` | Full `run-tests.sh` |
| Build/deploy script | Relevant section in `run-tests.sh` | Full `run-tests.sh`; local site build |
| Commerce checkout/webhook/provider logic | Relevant `scripts/lib/commerce/**/*.test.mjs` | Full `run-tests.sh`; manual provider smoke test only with explicit approval |
| Documentation-only change | Usually no code test required | Run a relevant build/test if the docs describe commands or generated output |

For local verification of a real site build without deploying:

```bash
for s in validate-plan write-site-json apply-theme render-templates \
         render-functions build-site render-headers render-redirects; do
  SITE_NAME=<site-name> bash scripts/$s.sh || { echo "BUILD FAILED at $s"; break; }
done
```

For a real deployment, use the wrapper:

```bash
SITES_DIR=/path/to/clodsite-sites bash scripts/build-deploy.sh <site-name> "reason for deploy"
```

Do not manually run `deploy.sh` plus `deploy-finalize.sh` for normal deploys.
The wrapper is the tested path.

## Where To Add Tests

Add tests close to the behavior being protected:

- Add validation, rendering, build, deploy, and generated-output assertions to
  `scripts/test/run-tests.sh`.
- Add pure library tests beside the library under `scripts/lib/*.test.mjs` or
  `scripts/lib/**/<name>.test.mjs`.
- Add MCP tests under `mcp/*.test.js`.
- Add or update fixtures under `scripts/test/fixtures/` when behavior needs a
  representative `build-plan.yaml`, `catalog.json`, provider response, or asset.

For a new component or component behavior, the usual coverage is:

1. schema validation accepts the intended shape;
2. schema validation rejects malformed or unsafe input;
3. `render-templates.sh` includes the component template;
4. a fixture build renders expected HTML;
5. `apply-theme.sh` bundles the component CSS;
6. generated output does not leak secrets or provider-only identifiers.

## Test Environment Isolation

`run-tests.sh` forces `SITES_DIR=sites` and installs a controlled `.env` during
tests. It also unsets real provider credentials such as Cloudflare, Resend,
Stripe, Printful, and Turnstile keys so missing-key and deployment-stub tests do
not accidentally inherit a developer's live environment.

That isolation is part of the contract. If you add tests that need credentials,
prefer stubs or fixture files. Do not require real network calls or real secrets
from the default suite.

## Live-Service Tests

The default suite should be offline and deterministic. Tests that touch live
services, create Stripe sessions, or create Printful orders are manual smoke
tests, not default automated tests.

When a task requires live commerce validation:

- confirm Stripe mode before testing;
- remember that Stripe test mode can still trigger live Printful fulfillment;
- coordinate Printful order cancellation before creating an order;
- record what was tested in the relevant plan, PR, or deployment notes.

For post-checkout diagnostics, use:

```bash
SITES_DIR=/path/to/clodsite-sites SITE_NAME=<site> \
  bash scripts/commerce-debug.sh <stripe-checkout-session-id>
```

The command reads the site's local webhook state, Stripe session metadata,
Cloudflare `ORDERS` KV record, and Printful external order id. It touches live
APIs but does not create Stripe sessions or Printful orders.

## Maintenance Notes

- Keep section names in `run-tests.sh` clear; they are the fastest way to find
  the failing area.
- Prefer assertions that name user-visible behavior over assertions that only
  mirror implementation details.
- When a test does need an implementation-detail assertion, keep the assertion
  tight and update it when the implementation changes intentionally.
- If a behavior is important enough to fix twice, it is important enough to
  cover in the suite.
