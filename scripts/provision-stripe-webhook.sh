#!/usr/bin/env bash
# Ensures a Stripe webhook endpoint exists for the site's /api/webhook route
# and that its signing secret is installed as the STRIPE_WEBHOOK_SECRET Pages
# secret. Gated on the rendered webhook Function.
#
# The signing secret is returned by Stripe ONLY on endpoint creation. It is
# pushed straight to Pages and NEVER written to disk — the sites repo is
# auto-committed on deploy, so the state file records { endpoint_id, url }
# and nothing else. Updating an endpoint's URL keeps its secret.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
STATE="${SITE_DIR}/.stripe-webhook-state.json"
WEBHOOK_FUNCTION="${SITE_DIR}/functions/api/webhook.js"
STRIPE_API_BASE="https://api.stripe.com/v1"

if [ ! -f "$WEBHOOK_FUNCTION" ]; then
  exit 0
fi

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found."
  exit 1
fi
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "Error: Stripe webhook provisioning requires STRIPE_SECRET_KEY in .env."
  exit 1
fi

PLAN_VALUES=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" "$PLAN" slug custom-domain)
SITE_NAME=$(echo "$PLAN_VALUES" | sed -n '1p')
CUSTOM_DOMAIN=$(echo "$PLAN_VALUES" | sed -n '2p')
if [ -z "$SITE_NAME" ]; then
  echo "Error: build-plan.yaml is missing slug."
  exit 1
fi

# The webhook must be reachable at the production hostname: the custom domain
# when one is planned, the *.pages.dev subdomain otherwise.
WEBHOOK_HOST="$CUSTOM_DOMAIN"
if [ -z "$WEBHOOK_HOST" ]; then
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "Error: resolving the Pages subdomain requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
    exit 1
  fi
  if ! PROJECT_RESPONSE=$(curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${SITE_NAME}"); then
    echo "Error: could not read the Cloudflare Pages project '${SITE_NAME}'."
    exit 1
  fi
  WEBHOOK_HOST=$(RESPONSE="$PROJECT_RESPONSE" node -e "
const response=JSON.parse(process.env.RESPONSE);
process.stdout.write(response.success === true && response.result && response.result.subdomain || '');
")
  unset PROJECT_RESPONSE
  if [ -z "$WEBHOOK_HOST" ]; then
    echo "Error: Cloudflare Pages project did not return a production subdomain."
    exit 1
  fi
fi
WEBHOOK_URL="https://${WEBHOOK_HOST}/api/webhook"

# Prints the response body. Returns 0 on 2xx, 4 on 404, 1 otherwise.
stripe_request() {
  local method="${1:?method required}"
  local url="${2:?url required}"
  local data="${3:-}"
  local response http_code body

  if [ -n "$data" ]; then
    if ! response=$(curl --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
      --data "$data" \
      --write-out $'\n%{http_code}' \
      "$url"); then
      echo "Error: could not reach the Stripe API." >&2
      return 1
    fi
  else
    if ! response=$(curl --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
      --write-out $'\n%{http_code}' \
      "$url"); then
      echo "Error: could not reach the Stripe API." >&2
      return 1
    fi
  fi

  http_code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  printf '%s' "$body"
  case "$http_code" in
    2*) return 0 ;;
    404) return 4 ;;
    *)
      RESPONSE="$body" node -e "
try {
  const message=(JSON.parse(process.env.RESPONSE).error || {}).message;
  if (message) console.error('Stripe: ' + message);
} catch {}
" >&2
      echo "Error: Stripe API request failed (${method} ${url}, HTTP ${http_code})." >&2
      return 1
      ;;
  esac
}

ENDPOINT_ID=""
if [ -f "$STATE" ]; then
  ENDPOINT_ID=$(STATE="$STATE" node -e "
try {
  const state=JSON.parse(require('fs').readFileSync(process.env.STATE,'utf8'));
  process.stdout.write(state.endpoint_id || '');
} catch {}
")
fi

CREATE_ENDPOINT="false"
if [ -n "$ENDPOINT_ID" ]; then
  set +e
  DETAIL_RESPONSE=$(stripe_request GET "${STRIPE_API_BASE}/webhook_endpoints/${ENDPOINT_ID}")
  STRIPE_STATUS=$?
  set -e
  if [ "$STRIPE_STATUS" -eq 4 ]; then
    echo "Recorded Stripe webhook endpoint '${ENDPOINT_ID}' no longer exists; creating a new one..."
    ENDPOINT_ID=""
    CREATE_ENDPOINT="true"
  elif [ "$STRIPE_STATUS" -ne 0 ]; then
    exit 1
  else
    CURRENT_URL=$(RESPONSE="$DETAIL_RESPONSE" node -e "
process.stdout.write(JSON.parse(process.env.RESPONSE).url || '');
")
    if [ "$CURRENT_URL" != "$WEBHOOK_URL" ]; then
      echo "Updating Stripe webhook endpoint URL to ${WEBHOOK_URL} (signing secret is kept)..."
      stripe_request POST "${STRIPE_API_BASE}/webhook_endpoints/${ENDPOINT_ID}" \
        "url=${WEBHOOK_URL}" > /dev/null
    else
      echo "Reusing Stripe webhook endpoint '${ENDPOINT_ID}'..."
    fi
  fi
  unset DETAIL_RESPONSE
else
  CREATE_ENDPOINT="true"
fi

if [ "$CREATE_ENDPOINT" = "true" ]; then
  # An endpoint for this URL without local state is unrecoverable: Stripe
  # returns the signing secret only at creation time.
  LIST_RESPONSE=$(stripe_request GET "${STRIPE_API_BASE}/webhook_endpoints?limit=100")
  ORPHAN_ID=$(RESPONSE="$LIST_RESPONSE" WEBHOOK_URL="$WEBHOOK_URL" node -e "
const response=JSON.parse(process.env.RESPONSE);
const match=(response.data || []).find((endpoint) => endpoint.url === process.env.WEBHOOK_URL);
process.stdout.write(match ? match.id : '');
")
  unset LIST_RESPONSE
  if [ -n "$ORPHAN_ID" ]; then
    echo "Error: Stripe already has a webhook endpoint '${ORPHAN_ID}' for ${WEBHOOK_URL},"
    echo "but ${STATE} does not record it. Its signing secret cannot be recovered."
    echo "Either restore the state file from a backup, or delete the endpoint in the"
    echo "Stripe dashboard (Developers > Webhooks) and deploy again to create a fresh one."
    exit 1
  fi

  echo "Creating Stripe webhook endpoint for ${WEBHOOK_URL}..."
  CREATE_RESPONSE=$(stripe_request POST "${STRIPE_API_BASE}/webhook_endpoints" \
    "url=${WEBHOOK_URL}&enabled_events[]=checkout.session.completed&description=clodsite:${SITE_NAME}")
  ENDPOINT_ID=$(RESPONSE="$CREATE_RESPONSE" node -e "
process.stdout.write(JSON.parse(process.env.RESPONSE).id || '');
")
  WEBHOOK_SIGNING_SECRET=$(RESPONSE="$CREATE_RESPONSE" node -e "
process.stdout.write(JSON.parse(process.env.RESPONSE).secret || '');
")
  unset CREATE_RESPONSE
  if [ -z "$ENDPOINT_ID" ] || [ -z "$WEBHOOK_SIGNING_SECRET" ]; then
    echo "Error: Stripe did not return the webhook endpoint id and signing secret."
    exit 1
  fi

  # Push the signing secret immediately; it exists nowhere but this variable.
  echo "Setting STRIPE_WEBHOOK_SECRET secret for '$SITE_NAME'..."
  if ! (cd "$SITE_DIR" && printf '%s' "$WEBHOOK_SIGNING_SECRET" |
    wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name "$SITE_NAME"); then
    unset WEBHOOK_SIGNING_SECRET
    echo "Error: failed to set STRIPE_WEBHOOK_SECRET Pages secret."
    echo "The Stripe endpoint '${ENDPOINT_ID}' was created but its secret is now lost;"
    echo "delete it in the Stripe dashboard and deploy again."
    exit 1
  fi
  unset WEBHOOK_SIGNING_SECRET
fi

ENDPOINT_ID="$ENDPOINT_ID" WEBHOOK_URL="$WEBHOOK_URL" STATE="$STATE" node <<'NODE'
const fs = require('fs');
fs.writeFileSync(process.env.STATE, JSON.stringify({
  endpoint_id: process.env.ENDPOINT_ID,
  url: process.env.WEBHOOK_URL,
}, null, 2) + '\n');
NODE

echo "✓ Stripe webhook provisioned at ${WEBHOOK_URL}."
