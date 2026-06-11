#!/usr/bin/env bash
# Ensures the ORDERS KV namespace exists and is bound to the site's Pages
# project (spec §6: the webhook's order state machine lives in KV). Gated on
# the rendered webhook Function — preview and lookbook sites skip it entirely.
# Idempotent; keeps no state file (the namespace is found again by title).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir

PLAN="${SITE_DIR}/build-plan.yaml"
WEBHOOK_FUNCTION="${SITE_DIR}/functions/api/webhook.js"
API_BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-}"

if [ ! -f "$WEBHOOK_FUNCTION" ]; then
  exit 0
fi

if [ ! -f "$PLAN" ]; then
  echo "Error: $PLAN not found."
  exit 1
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: KV provisioning requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
  exit 1
fi

SITE_NAME=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" "$PLAN" slug)
if [ -z "$SITE_NAME" ]; then
  echo "Error: build-plan.yaml is missing slug."
  exit 1
fi

NAMESPACE_TITLE="clodsite-${SITE_NAME}-orders"

api_request() {
  local method="${1:?method required}"
  local url="${2:?url required}"
  local payload="${3:-}"
  local response

  if [ -n "$payload" ]; then
    if ! response=$(curl --fail-with-body --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      --header "Content-Type: application/json" \
      --data "$payload" \
      "$url"); then
      echo "Error: Cloudflare API request failed (${method} ${url})." >&2
      echo "Ensure the token has Workers KV Storage > Edit and Pages > Edit permission." >&2
      return 1
    fi
  else
    if ! response=$(curl --fail-with-body --silent --show-error \
      --request "$method" \
      --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "$url"); then
      echo "Error: Cloudflare API request failed (${method} ${url})." >&2
      echo "Ensure the token has Workers KV Storage > Edit and Pages > Edit permission." >&2
      return 1
    fi
  fi

  if ! RESPONSE="$response" node <<'NODE'
const response = JSON.parse(process.env.RESPONSE);
if (response.success !== true) {
  const message = (response.errors || []).map((error) => error.message).filter(Boolean).join('; ');
  if (message) console.error(message);
  process.exit(1);
}
NODE
  then
    echo "Error: Cloudflare API returned an unsuccessful response." >&2
    return 1
  fi

  printf '%s' "$response"
}

# Find the namespace by title (paginated list; titles are unique per account).
NAMESPACE_ID=""
PAGE=1
while [ -z "$NAMESPACE_ID" ]; do
  LIST_RESPONSE=$(api_request GET "${API_BASE}/storage/kv/namespaces?per_page=100&page=${PAGE}")
  FOUND=$(RESPONSE="$LIST_RESPONSE" NAMESPACE_TITLE="$NAMESPACE_TITLE" node -e "
const response=JSON.parse(process.env.RESPONSE);
const result=response.result || [];
const match=result.find((namespace) => namespace.title === process.env.NAMESPACE_TITLE);
process.stdout.write(match ? match.id : (result.length === 0 ? 'END' : ''));
")
  unset LIST_RESPONSE
  if [ "$FOUND" = "END" ]; then
    break
  fi
  NAMESPACE_ID="$FOUND"
  PAGE=$((PAGE + 1))
done

if [ -z "$NAMESPACE_ID" ]; then
  echo "Creating KV namespace '$NAMESPACE_TITLE'..."
  CREATE_PAYLOAD=$(NAMESPACE_TITLE="$NAMESPACE_TITLE" node -e "
process.stdout.write(JSON.stringify({ title: process.env.NAMESPACE_TITLE }));
")
  CREATE_RESPONSE=$(api_request POST "${API_BASE}/storage/kv/namespaces" "$CREATE_PAYLOAD")
  NAMESPACE_ID=$(RESPONSE="$CREATE_RESPONSE" node -e "
const response=JSON.parse(process.env.RESPONSE);
process.stdout.write(response.result && response.result.id || '');
")
  unset CREATE_RESPONSE
else
  echo "Reusing KV namespace '$NAMESPACE_TITLE'..."
fi

if [ -z "$NAMESPACE_ID" ]; then
  echo "Error: Cloudflare did not return a KV namespace id."
  exit 1
fi

# Bind as ORDERS on the Pages project unless it is already bound.
PROJECT_RESPONSE=$(api_request GET "${API_BASE}/pages/projects/${SITE_NAME}")
ALREADY_BOUND=$(RESPONSE="$PROJECT_RESPONSE" NAMESPACE_ID="$NAMESPACE_ID" node -e "
const configs=(JSON.parse(process.env.RESPONSE).result || {}).deployment_configs || {};
const bound=(environment) => {
  const namespaces=(configs[environment] || {}).kv_namespaces || {};
  return namespaces.ORDERS && namespaces.ORDERS.namespace_id === process.env.NAMESPACE_ID;
};
process.stdout.write(bound('production') && bound('preview') ? 'true' : 'false');
")
unset PROJECT_RESPONSE

if [ "$ALREADY_BOUND" = "true" ]; then
  echo "✓ ORDERS KV namespace already bound to '$SITE_NAME'."
  exit 0
fi

echo "Binding ORDERS KV namespace to '$SITE_NAME'..."
BIND_PAYLOAD=$(NAMESPACE_ID="$NAMESPACE_ID" node -e "
const binding={ kv_namespaces: { ORDERS: { namespace_id: process.env.NAMESPACE_ID } } };
process.stdout.write(JSON.stringify({
  deployment_configs: { production: binding, preview: binding },
}));
")
api_request PATCH "${API_BASE}/pages/projects/${SITE_NAME}" "$BIND_PAYLOAD" > /dev/null

echo "✓ ORDERS KV namespace provisioned for '$SITE_NAME'."
