Run the **Orders** workflow documented in `AGENTS.md`.

Argument form: `/orders [site]` (an optional site slug narrows the report).

Runs `bash scripts/orders.sh [site]` — a read-only audit of commerce order state
across sites (groups by state; highlights `failed` and stale `processing`). See
`AGENTS.md` for what the output covers.
