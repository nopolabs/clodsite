#!/usr/bin/env bash
set -euo pipefail

# Modes:
#   --check   verify wrangler is installed (no token needed)
#   --verify  verify token already written to .env
#   (none)    full interactive mode for direct terminal use
#
# Destructive cleanup lives in scripts/clean.sh — kept separate so the whole
# of this script is non-destructive and safe to auto-allow.

MODE="${1:-}"

# ── --check: just verify wrangler is present ────────────────────────────────
if [ "$MODE" = "--check" ]; then
  if ! command -v wrangler &> /dev/null; then
    echo "wrangler is not installed."
    echo -n "Install it now with 'npm install -g wrangler'? [y/N] "
    read -r INSTALL_WRANGLER
    echo ""
    if [[ "$INSTALL_WRANGLER" =~ ^[Yy]$ ]]; then
      echo "Installing wrangler..."
      npm install -g wrangler
      echo ""
    else
      echo "Install wrangler manually: npm install -g wrangler"
      echo "Then run /setup again."
      exit 1
    fi
  fi
  echo "✓ wrangler found: $(wrangler --version)"
  exit 0
fi

# ── --verify: confirm token and account ID in .env actually work ──────────────
if [ "$MODE" = "--verify" ]; then
  if [ ! -f ".env" ]; then
    echo "Error: .env not found."
    exit 1
  fi
  # shellcheck source=/dev/null
  source .env
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "Error: CLOUDFLARE_API_TOKEN not set in .env."
    exit 1
  fi
  if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "Error: CLOUDFLARE_ACCOUNT_ID not set in .env."
    exit 1
  fi
  echo "Verifying token..."
  if ! wrangler whoami > /dev/null 2>&1; then
    echo ""
    echo "Error: Token verification failed."
    echo "Check that your token has 'Cloudflare Pages: Edit' permission and try again."
    exit 1
  fi
  echo "✓ Token verified."
  echo "✓ Account ID present."
  echo "✓ .env is ready."
  echo ""
  echo "Next step: run /interview"
  exit 0
fi

# ── interactive mode (direct terminal use, not called by /setup command) ─────
echo "=== Clodsite Setup ==="
echo ""

if ! command -v wrangler &> /dev/null; then
  echo "wrangler is not installed."
  echo -n "Install it now with 'npm install -g wrangler'? [y/N] "
  read -r INSTALL_WRANGLER
  echo ""
  if [[ "$INSTALL_WRANGLER" =~ ^[Yy]$ ]]; then
    echo "Installing wrangler..."
    npm install -g wrangler
    echo ""
  else
    echo "Install wrangler manually: npm install -g wrangler"
    exit 1
  fi
fi

echo "✓ wrangler found: $(wrangler --version)"
echo ""

echo "Enter your Cloudflare API Token."
echo "(Create one at: https://dash.cloudflare.com/profile/api-tokens)"
echo -n "Token: "
read -rs CF_TOKEN
echo ""

if [ -z "$CF_TOKEN" ]; then
  echo "Error: No token entered."
  exit 1
fi

echo "Enter your Cloudflare Account ID."
echo "(Find it in the Cloudflare dashboard URL: dash.cloudflare.com/<account-id>)"
echo -n "Account ID: "
read -r CF_ACCOUNT_ID
echo ""

if [ -z "$CF_ACCOUNT_ID" ]; then
  echo "Error: No account ID entered."
  exit 1
fi

echo "Verifying token..."
if ! CLOUDFLARE_API_TOKEN="$CF_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID" wrangler whoami > /dev/null 2>&1; then
  echo ""
  echo "Error: Token verification failed."
  echo "Check that your token has 'Cloudflare Pages: Edit' permission and try again."
  exit 1
fi

printf "CLOUDFLARE_API_TOKEN=%s\nCLOUDFLARE_ACCOUNT_ID=%s\n" "$CF_TOKEN" "$CF_ACCOUNT_ID" > .env
echo ""
echo "✓ Token verified."
echo "✓ .env written."
echo ""
echo "Next step: run /interview"
