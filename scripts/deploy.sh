#!/usr/bin/env bash
# Note: not using set -e here — we capture wrangler exit code manually

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"
clodsite_init_site_dir
MODE="${1:-}"

# ── --local: serve locally, no Cloudflare token needed ───────────────────────
if [ "$MODE" = "--local" ]; then
  echo "Starting local dev server at http://localhost:8080 (Ctrl-C to stop)..."
  echo ""
  cd scaffold && exec npm run serve
fi

# ── Cloudflare Pages deploy ──────────────────────────────────────────────────

if [ ! -f ".env" ]; then
  echo "Error: .env not found. Run /setup first."
  exit 1
fi

clodsite_load_env

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set in .env. Run /setup first."
  exit 1
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID not set in .env. Run /setup first."
  exit 1
fi

if [ ! -f "${SITE_DIR}/build-plan.yaml" ]; then
  echo "Error: ${SITE_DIR}/build-plan.yaml not found. Run /plan first."
  exit 1
fi

if [ ! -d "${SITE_DIR}/dist" ] || [ -z "$(ls -A "${SITE_DIR}/dist" 2>/dev/null)" ]; then
  echo "Error: ${SITE_DIR}/dist/ is empty or missing. Run /build first."
  exit 1
fi

PLAN_VALUES=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
  "${SITE_DIR}/build-plan.yaml" slug commerce-provider stripe-mode commerce-contact-from)
SITE_NAME=$(echo "$PLAN_VALUES" | sed -n '1p')
COMMERCE_PROVIDER=$(echo "$PLAN_VALUES" | sed -n '2p')
STRIPE_DECLARED_MODE=$(echo "$PLAN_VALUES" | sed -n '3p')
COMMERCE_CONTACT_FROM=$(echo "$PLAN_VALUES" | sed -n '4p')

# The manual provider fulfills by emailing the merchant through Resend, so a
# live commerce site needs the key even without a resend-form component.
NEEDS_RESEND="false"
NEEDS_COMMERCE_ALERTS="false"
if [ -f "${SITE_DIR}/functions/api/contact.js" ]; then
  NEEDS_RESEND="true"
elif [ -f "${SITE_DIR}/functions/api/webhook.js" ] && [ "$COMMERCE_PROVIDER" = "manual" ]; then
  NEEDS_RESEND="true"
fi
if [ -f "${SITE_DIR}/functions/api/webhook.js" ] \
    && { [ -n "${CLODSITE_COMMERCE_ALERT_TO:-}" ] || [ -n "${CLODSITE_COMMERCE_ALERT_FROM:-}" ]; }; then
  NEEDS_COMMERCE_ALERTS="true"
  NEEDS_RESEND="true"
fi
# commerce.contact.from (item 2 phase 2) enables the customer-facing
# order-confirmation email, sent via the same shared Resend key.
if [ -f "${SITE_DIR}/functions/api/webhook.js" ] && [ -n "$COMMERCE_CONTACT_FROM" ]; then
  NEEDS_RESEND="true"
fi
if [ "$NEEDS_RESEND" = "true" ] && [ -z "${RESEND_API_KEY:-}" ]; then
  echo "Error: RESEND_API_KEY is not set in .env but this site needs Resend"
  echo "(resend-form component, manual-provider order emails, commerce alerts,"
  echo "and/or the order-confirmation email)."
  echo "Add RESEND_API_KEY=re_... to .env and redeploy."
  exit 1
fi
if [ "$NEEDS_COMMERCE_ALERTS" = "true" ]; then
  if [ -z "${CLODSITE_COMMERCE_ALERT_TO:-}" ] || [ -z "${CLODSITE_COMMERCE_ALERT_FROM:-}" ]; then
    echo "Error: commerce alerting is partially configured."
    echo "Set both CLODSITE_COMMERCE_ALERT_TO and CLODSITE_COMMERCE_ALERT_FROM in .env, or remove both."
    exit 1
  fi
fi

# When the plan declares a Stripe mode (item 12), the mode block below names the
# missing mode-selected source; only the undeclared bare-name path is handled
# here.
if [ -f "${SITE_DIR}/functions/api/checkout.js" ] && [ -z "${STRIPE_SECRET_KEY:-}" ] \
    && [ -z "$STRIPE_DECLARED_MODE" ]; then
  echo "Error: STRIPE_SECRET_KEY is not set in .env but this site has live checkout."
  echo "Add STRIPE_SECRET_KEY=sk_... to .env and redeploy."
  exit 1
fi

# The printful provider's webhook creates Printful orders server-side. With a
# per-site alias (commerce.printful.api_key_env, item 12) the canonical
# PRINTFUL_API_KEY is bound from that source; name it so a missing source is
# obvious.
if [ -f "${SITE_DIR}/functions/api/webhook.js" ] && [ "$COMMERCE_PROVIDER" = "printful" ] \
    && [ -z "${PRINTFUL_API_KEY:-}" ]; then
  PRINTFUL_SOURCE=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
    "${SITE_DIR}/build-plan.yaml" printful-api-key-env)
  if [ -n "$PRINTFUL_SOURCE" ]; then
    echo "Error: commerce.printful.api_key_env names ${PRINTFUL_SOURCE}, but it is not set in .env."
    echo "Add ${PRINTFUL_SOURCE}=... to .env (Printful dashboard > Settings > Stores > API) and redeploy."
  else
    echo "Error: PRINTFUL_API_KEY is not set in .env but this site fulfills via Printful."
    echo "Add PRINTFUL_API_KEY=... to .env (Printful dashboard > Settings > Stores > API) and redeploy."
  fi
  exit 1
fi

# Generated proxy Functions hold their bearer credentials as Pages secrets;
# every secret name the plan's proxies declare must be present in .env.
PROXY_SECRETS=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
  "${SITE_DIR}/build-plan.yaml" proxy-secrets)
for SECRET_NAME in $PROXY_SECRETS; do
  if [ -z "${!SECRET_NAME:-}" ]; then
    echo "Error: ${SECRET_NAME} is not set in .env but a proxy in build-plan.yaml declares it."
    echo "Add ${SECRET_NAME}=... to .env and redeploy."
    exit 1
  fi
done

# Say which Stripe mode this deploy targets, loudly, before anything is
# provisioned — test-mode setup and mode visibility must be easy and
# unambiguous (commerce spec, phase 7).
if [ -f "${SITE_DIR}/functions/api/checkout.js" ]; then
  # Item 12 preflight: when the plan declares a mode, the mode-selected source
  # (STRIPE_SECRET_KEY_TEST/LIVE) must be present and the resolved key must
  # carry the matching prefix — a mis-populated registry (mode: live bound to
  # an sk_test_ value) is rejected here, not trusted.
  if [ -n "$STRIPE_DECLARED_MODE" ]; then
    # Item 21: the source var is <base>_<MODE> where base is the shared
    # STRIPE_SECRET_KEY or a per-site commerce.checkout.secret_key_env. Resolve it
    # from the plan so the error names the var the operator must actually set.
    STRIPE_SOURCE_VAR=$(node "${SCRIPT_DIR}/lib/build-plan.mjs" \
      "${SITE_DIR}/build-plan.yaml" stripe-secret-key-env)
    if [ -z "${!STRIPE_SOURCE_VAR:-}" ]; then
      echo "Error: commerce.checkout.mode is ${STRIPE_DECLARED_MODE} but ${STRIPE_SOURCE_VAR} is not set in .env."
      echo "Add ${STRIPE_SOURCE_VAR}=sk_${STRIPE_DECLARED_MODE}_... to .env and redeploy."
      exit 1
    fi
  fi
  STRIPE_MODE=$(clodsite_stripe_mode)
  if [ -z "$STRIPE_MODE" ]; then
    echo "Error: STRIPE_SECRET_KEY does not look like a Stripe secret key"
    echo "(expected an sk_test_/sk_live_ or rk_test_/rk_live_ prefix)."
    echo "Copy the key from the Stripe dashboard (Developers > API keys) into .env."
    exit 1
  fi
  if [ -n "$STRIPE_DECLARED_MODE" ] && [ "$STRIPE_MODE" != "$STRIPE_DECLARED_MODE" ]; then
    echo "Error: commerce.checkout.mode is ${STRIPE_DECLARED_MODE} but the resolved Stripe key"
    echo "is a ${STRIPE_MODE}-mode key (${STRIPE_SOURCE_VAR} carries the wrong prefix)."
    echo "Put an sk_${STRIPE_DECLARED_MODE}_/rk_${STRIPE_DECLARED_MODE}_ key in ${STRIPE_SOURCE_VAR} and redeploy."
    exit 1
  fi
  case "$STRIPE_MODE" in
    test)
      echo "────────────────────────────────────────────────────────────"
      echo "  Stripe mode: TEST — no real money can move."
      echo "  Checkout accepts test cards only (e.g. 4242 4242 4242 4242)."
      echo "────────────────────────────────────────────────────────────"
      ;;
    live)
      echo "────────────────────────────────────────────────────────────"
      echo "  Stripe mode: LIVE — real cards will be charged."
      echo "────────────────────────────────────────────────────────────"
      ;;
  esac
  if [ -n "$STRIPE_DECLARED_MODE" ]; then
    echo "  (declared by commerce.checkout.mode; key from ${STRIPE_SOURCE_VAR})"
  fi
  echo ""
fi

# Ensure the Cloudflare Pages project exists in *this* account.
#
# wrangler v4 requires the project to exist before `pages deploy` — it will not
# auto-create it. We deliberately do NOT pre-check with `wrangler pages project
# list`: that list can span every account the token can see, so a project with
# the same slug in a different account causes a false-positive "exists" — and
# then the deploy (scoped to CLOUDFLARE_ACCOUNT_ID) fails with "Project not
# found." Instead we always attempt create and tolerate "already exists."
echo "Ensuring Pages project '$SITE_NAME' exists in account $CLOUDFLARE_ACCOUNT_ID..."
CREATE_OUT=$(wrangler pages project create "$SITE_NAME" --production-branch main 2>&1)
CREATE_EXIT=$?
if [ "$CREATE_EXIT" -eq 0 ]; then
  echo "✓ Project created."
elif echo "$CREATE_OUT" | grep -qi "already exists\|already taken"; then
  echo "✓ Project already exists in this account."
else
  echo "Error: could not create Pages project '$SITE_NAME'."
  echo "$CREATE_OUT"
  exit 1
fi
echo ""

# Protected forms provision or reuse their Turnstile widget, push its secret,
# and inject the public site key and expected hostnames into built artifacts.
if ! bash "${SCRIPT_DIR}/provision-turnstile.sh"; then
  exit 1
fi

# Live commerce provisions the ORDERS KV namespace + binding and the Stripe
# webhook endpoint (whose signing secret is pushed straight to Pages, never
# written to disk). Both gate themselves on functions/api/webhook.js.
if ! bash "${SCRIPT_DIR}/provision-kv.sh"; then
  exit 1
fi
if ! bash "${SCRIPT_DIR}/provision-stripe-webhook.sh"; then
  exit 1
fi
# Item 2 phase 3: registers Printful's package_shipped webhook and pushes
# PRINTFUL_WEBHOOK_SECRET. Gates itself on functions/api/printful-webhook.js.
if ! bash "${SCRIPT_DIR}/provision-printful-webhook.sh"; then
  exit 1
fi

# Push RESEND_API_KEY as a Pages secret when a generated Function needs it:
# the contact form, the manual provider's order emails, commerce alerts,
# and/or the order-confirmation email.
if [ "$NEEDS_RESEND" = "true" ]; then
  echo "Setting RESEND_API_KEY secret for '$SITE_NAME'..."
  if ! printf '%s' "$RESEND_API_KEY" | wrangler pages secret put RESEND_API_KEY \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set RESEND_API_KEY Pages secret."
    exit 1
  fi
  echo ""
fi

if [ "$NEEDS_COMMERCE_ALERTS" = "true" ]; then
  echo "Setting CLODSITE_COMMERCE_ALERT_TO secret for '$SITE_NAME'..."
  if ! printf '%s' "$CLODSITE_COMMERCE_ALERT_TO" | wrangler pages secret put CLODSITE_COMMERCE_ALERT_TO \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set CLODSITE_COMMERCE_ALERT_TO Pages secret."
    exit 1
  fi
  echo ""

  echo "Setting CLODSITE_COMMERCE_ALERT_FROM secret for '$SITE_NAME'..."
  if ! printf '%s' "$CLODSITE_COMMERCE_ALERT_FROM" | wrangler pages secret put CLODSITE_COMMERCE_ALERT_FROM \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set CLODSITE_COMMERCE_ALERT_FROM Pages secret."
    exit 1
  fi
  echo ""
fi

# Push STRIPE_SECRET_KEY as a Pages secret when the checkout Function is
# present — it creates Checkout Sessions server-side.
if [ -f "${SITE_DIR}/functions/api/checkout.js" ]; then
  echo "Setting STRIPE_SECRET_KEY secret for '$SITE_NAME'..."
  if ! printf '%s' "$STRIPE_SECRET_KEY" | wrangler pages secret put STRIPE_SECRET_KEY \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set STRIPE_SECRET_KEY Pages secret."
    exit 1
  fi
  echo ""
fi

# Push PRINTFUL_API_KEY as a Pages secret when the webhook fulfills via
# Printful — it creates and confirms Printful orders.
if [ -f "${SITE_DIR}/functions/api/webhook.js" ] && [ "$COMMERCE_PROVIDER" = "printful" ]; then
  echo "Setting PRINTFUL_API_KEY secret for '$SITE_NAME'..."
  if ! printf '%s' "$PRINTFUL_API_KEY" | wrangler pages secret put PRINTFUL_API_KEY \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set PRINTFUL_API_KEY Pages secret."
    exit 1
  fi
  echo ""
fi

# Push each proxy-declared bearer credential as a Pages secret (presence in
# .env was checked above, before any provisioning).
for SECRET_NAME in $PROXY_SECRETS; do
  echo "Setting ${SECRET_NAME} secret for '$SITE_NAME'..."
  if ! printf '%s' "${!SECRET_NAME}" | wrangler pages secret put "$SECRET_NAME" \
      --project-name "$SITE_NAME"; then
    echo "Error: failed to set ${SECRET_NAME} Pages secret."
    exit 1
  fi
  echo ""
done

echo "Deploying '$SITE_NAME' to Cloudflare Pages..."
echo ""

# Wrangler discovers functions/ relative to its working directory.
cd "${SITE_DIR}"
wrangler pages deploy dist --project-name "$SITE_NAME" \
  > ".deploy-output" 2> ".deploy-error"
WRANGLER_EXIT=$?

echo "$WRANGLER_EXIT" > ".deploy-exit"
exit $WRANGLER_EXIT
