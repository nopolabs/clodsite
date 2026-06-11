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

# Endpoints and their signing secrets are scoped to one Stripe mode, so the
# state file records which mode it belongs to.
STRIPE_MODE=$(clodsite_stripe_mode)
if [ -z "$STRIPE_MODE" ]; then
  echo "Error: STRIPE_SECRET_KEY does not look like a Stripe secret key"
  echo "(expected an sk_test_/sk_live_ or rk_test_/rk_live_ prefix)."
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
STATE_MODE=""
if [ -f "$STATE" ]; then
  ENDPOINT_ID=$(STATE="$STATE" node -e "
try {
  const state=JSON.parse(require('fs').readFileSync(process.env.STATE,'utf8'));
  process.stdout.write(state.endpoint_id || '');
} catch {}
")
  STATE_MODE=$(STATE="$STATE" node -e "
try {
  const state=JSON.parse(require('fs').readFileSync(process.env.STATE,'utf8'));
  process.stdout.write(state.mode || '');
} catch {}
")
fi

# A key-mode switch (test <-> live) makes the recorded endpoint unreachable:
# endpoints live in one mode's workspace and the current key opens the other.
# Don't bother fetching it — announce the switch and provision fresh.
if [ -n "$ENDPOINT_ID" ] && [ -n "$STATE_MODE" ] && [ "$STATE_MODE" != "$STRIPE_MODE" ]; then
  echo "Stripe mode changed: ${STATE_MODE} → ${STRIPE_MODE}."
  echo "Webhook endpoints are mode-scoped, so a new ${STRIPE_MODE}-mode endpoint will be"
  echo "created. The ${STATE_MODE}-mode endpoint '${ENDPOINT_ID}' stays in your Stripe"
  echo "${STATE_MODE} workspace and is reprovisioned when you switch back."
  ENDPOINT_ID=""
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
  # returns the signing secret only at creation time. When the orphan carries
  # our own "clodsite:<slug>" description it is ours — typically the previous
  # endpoint for this mode, left behind by a test <-> live round trip — and
  # its secret is unusable anyway (Pages holds only the most recent one), so
  # it is replaced. Anything else gets a hard stop.
  LIST_RESPONSE=$(stripe_request GET "${STRIPE_API_BASE}/webhook_endpoints?limit=100")
  ORPHAN=$(RESPONSE="$LIST_RESPONSE" WEBHOOK_URL="$WEBHOOK_URL" SITE_NAME="$SITE_NAME" node -e "
const response=JSON.parse(process.env.RESPONSE);
const match=(response.data || []).find((endpoint) => endpoint.url === process.env.WEBHOOK_URL);
if (match) {
  const ours = match.description === 'clodsite:' + process.env.SITE_NAME;
  process.stdout.write(match.id + ' ' + (ours ? 'ours' : 'foreign'));
}
")
  unset LIST_RESPONSE
  if [ -n "$ORPHAN" ]; then
    ORPHAN_ID="${ORPHAN% *}"
    if [ "${ORPHAN#* }" = "ours" ]; then
      echo "Replacing the previous clodsite ${STRIPE_MODE}-mode endpoint '${ORPHAN_ID}' for"
      echo "${WEBHOOK_URL} (its signing secret from an earlier deploy cannot be recovered)..."
      if ! stripe_request DELETE "${STRIPE_API_BASE}/webhook_endpoints/${ORPHAN_ID}" > /dev/null; then
        exit 1
      fi
    else
      echo "Error: Stripe already has a webhook endpoint '${ORPHAN_ID}' for ${WEBHOOK_URL},"
      echo "but it was not created by clodsite and ${STATE} does not record it."
      echo "Its signing secret cannot be recovered. Either restore the state file from a"
      echo "backup, or delete the endpoint in the Stripe dashboard (Developers > Webhooks)"
      echo "and deploy again to create a fresh one."
      exit 1
    fi
  fi

  echo "Creating Stripe webhook endpoint for ${WEBHOOK_URL} (${STRIPE_MODE} mode)..."
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

ENDPOINT_ID="$ENDPOINT_ID" WEBHOOK_URL="$WEBHOOK_URL" STRIPE_MODE="$STRIPE_MODE" STATE="$STATE" node <<'NODE'
const fs = require('fs');
fs.writeFileSync(process.env.STATE, JSON.stringify({
  endpoint_id: process.env.ENDPOINT_ID,
  url: process.env.WEBHOOK_URL,
  mode: process.env.STRIPE_MODE,
}, null, 2) + '\n');
NODE

echo "✓ Stripe webhook provisioned at ${WEBHOOK_URL} (${STRIPE_MODE} mode)."
