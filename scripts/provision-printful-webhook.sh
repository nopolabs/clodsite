#!/usr/bin/env bash
# Ensures Printful's package_shipped webhook is registered for the site's
# /api/printful-webhook route, and that PRINTFUL_WEBHOOK_SECRET is installed
# as a Pages secret. Gated on the rendered shipping-notification Function
# (item 2 phase 3).
#
# Unlike Stripe's signing secret (which Stripe generates and we merely
# capture), PRINTFUL_WEBHOOK_SECRET is self-minted, so it is treated as a
# stable, explicitly-set .env credential like every other secret in this
# codebase — never generated and used within the same run. Regenerating it
# every deploy would risk Pages and Printful holding different tokens if a
# deploy is interrupted between the two writes (see
# docs/superpowers/plans/2026-06-30-printful-shipping-notifications.md,
# Decision 1, revised). Both sides always converge on whatever .env already
# holds; rotation is an explicit .env edit by the operator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
SHIPPING_FUNCTION="${SITE_DIR}/functions/api/printful-webhook.js"
PRINTFUL_API_BASE="https://api.printful.com"

if [ ! -f "$SHIPPING_FUNCTION" ]; then
  exit 0
fi

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found."
  exit 1
fi
if [ -z "${PRINTFUL_API_KEY:-}" ]; then
  echo "Error: Printful shipping-webhook provisioning requires PRINTFUL_API_KEY in .env."
  exit 1
fi
if [ -z "${PRINTFUL_WEBHOOK_SECRET:-}" ]; then
  GENERATED=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
  echo "Error: PRINTFUL_WEBHOOK_SECRET is not set in .env but this site's shipping-notification"
  echo "webhook needs it (a shared secret embedded in the registered URL; Printful's v1 webhooks"
  echo "aren't signed, so this is a defense-in-depth gate, not the auth model itself — see"
  echo "docs/superpowers/plans/2026-06-30-printful-shipping-notifications.md)."
  echo "Add PRINTFUL_WEBHOOK_SECRET=${GENERATED} to .env and redeploy."
  exit 1
fi

PLAN_VALUES=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" "$PLAN" slug custom-domain printful-store-id)
SITE_NAME=$(echo "$PLAN_VALUES" | sed -n '1p')
CUSTOM_DOMAIN=$(echo "$PLAN_VALUES" | sed -n '2p')
STORE_ID=$(echo "$PLAN_VALUES" | sed -n '3p')
if [ -z "$SITE_NAME" ]; then
  echo "Error: build-plan.yaml is missing slug."
  exit 1
fi
if [ -z "$STORE_ID" ]; then
  echo "Error: commerce.printful.store_id (a positive integer) not found in build-plan.yaml."
  exit 1
fi

WEBHOOK_HOST=$(clodsite_resolve_webhook_host "$SITE_NAME" "$CUSTOM_DOMAIN") || exit 1
WEBHOOK_URL="https://${WEBHOOK_HOST}/api/printful-webhook?token=${PRINTFUL_WEBHOOK_SECRET}"

# Prints the response body. Returns 0 on 2xx, 1 otherwise.
#
# The Webhook API scopes an account-level token to a store via the
# X-PF-Store-Id header, not the ?store_id= query param the Orders API uses
# elsewhere in this codebase (confirmed against Printful's v1 docs,
# developers.printful.com/docs/#tag/Webhook-API) — the two APIs disagree on
# this, so printful_request is scoped to Webhook-API calls only.
printful_request() {
  local method="${1:?method required}"
  local url="${2:?url required}"
  local data="${3:-}"
  local response http_code body

  if [ -n "$data" ]; then
    if ! response=$(curl --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${PRINTFUL_API_KEY}" \
      --header "X-PF-Store-Id: ${STORE_ID}" \
      --header "Content-Type: application/json" \
      --data "$data" \
      --write-out $'\n%{http_code}' \
      "$url"); then
      echo "Error: could not reach the Printful API." >&2
      return 1
    fi
  else
    if ! response=$(curl --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${PRINTFUL_API_KEY}" \
      --header "X-PF-Store-Id: ${STORE_ID}" \
      --write-out $'\n%{http_code}' \
      "$url"); then
      echo "Error: could not reach the Printful API." >&2
      return 1
    fi
  fi

  http_code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  printf '%s' "$body"
  case "$http_code" in
    2*) return 0 ;;
    *)
      echo "Error: Printful API request failed (${method} ${url}, HTTP ${http_code})." >&2
      return 1
      ;;
  esac
}

# An unchanged registration is a no-op — compare before writing. Confirmed
# against Printful's v1 docs (developers.printful.com/docs/#tag/Webhook-API):
# GET/POST/DELETE /webhooks is a single store-scoped config, not a list —
# "Set up webhook configuration" is POST (replace), not PUT.
CURRENT_URL=""
set +e
CURRENT_RESPONSE=$(printful_request GET "${PRINTFUL_API_BASE}/webhooks")
GET_STATUS=$?
set -e
if [ "$GET_STATUS" -eq 0 ]; then
  CURRENT_URL=$(RESPONSE="$CURRENT_RESPONSE" node -e "
try {
  const r = JSON.parse(process.env.RESPONSE);
  process.stdout.write((r.result && r.result.url) || '');
} catch {}
")
fi
unset CURRENT_RESPONSE

if [ "$CURRENT_URL" = "$WEBHOOK_URL" ]; then
  echo "Reusing Printful shipping-webhook registration for ${WEBHOOK_HOST}..."
else
  echo "Registering Printful shipping webhook for ${WEBHOOK_HOST} (package_shipped)..."
  WEBHOOK_BODY=$(WEBHOOK_URL="$WEBHOOK_URL" node -e "
process.stdout.write(JSON.stringify({ url: process.env.WEBHOOK_URL, types: ['package_shipped'] }));
")
  printful_request POST "${PRINTFUL_API_BASE}/webhooks" "$WEBHOOK_BODY" > /dev/null
fi

echo "Setting PRINTFUL_WEBHOOK_SECRET secret for '$SITE_NAME'..."
if ! printf '%s' "$PRINTFUL_WEBHOOK_SECRET" | wrangler pages secret put PRINTFUL_WEBHOOK_SECRET \
    --project-name "$SITE_NAME"; then
  echo "Error: failed to set PRINTFUL_WEBHOOK_SECRET Pages secret."
  exit 1
fi

echo "✓ Printful shipping webhook provisioned at ${WEBHOOK_HOST} (package_shipped)."
