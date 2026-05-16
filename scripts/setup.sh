#!/usr/bin/env bash
set -euo pipefail

echo "=== Clodsite Setup ==="
echo ""

# Check wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo "Error: wrangler is not installed."
  echo ""
  echo "Install it with:"
  echo "  npm install -g wrangler"
  echo ""
  echo "Then run /setup again."
  exit 1
fi

echo "✓ wrangler found: $(wrangler --version)"
echo ""

# Prompt for token (masked)
echo "Enter your Cloudflare API Token."
echo "(Create one at: https://dash.cloudflare.com/profile/api-tokens)"
echo -n "Token: "
read -rs CF_TOKEN
echo ""

if [ -z "$CF_TOKEN" ]; then
  echo "Error: No token entered."
  exit 1
fi

# Verify token
echo "Verifying token..."
if ! CLOUDFLARE_API_TOKEN="$CF_TOKEN" wrangler whoami > /dev/null 2>&1; then
  echo ""
  echo "Error: Token verification failed."
  echo "Check that your token has 'Cloudflare Pages: Edit' permission and try again."
  exit 1
fi

# Write .env
echo "CLOUDFLARE_API_TOKEN=$CF_TOKEN" > .env
echo ""
echo "✓ Token verified."
echo "✓ .env written."
echo ""
echo "Next step: run /interview"
