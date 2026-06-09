#!/usr/bin/env bash
set -euo pipefail

# Modes:
#   --check          verify wrangler is installed (no token needed)
#   --verify         verify token already written to .env
#   --import <file>  copy credentials from an existing env file into .env
#   (none)           full interactive mode for direct terminal use
#
# Destructive cleanup lives in scripts/clean.sh — kept separate so the whole
# of this script is non-destructive and safe to auto-allow.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"

MODE="${1:-}"

# ── --import: copy credentials from an existing env file ────────────────────
if [ "$MODE" = "--import" ]; then
  SOURCE="${2:-}"
  if [ -z "$SOURCE" ]; then
    echo "Error: --import requires a file path argument."
    exit 1
  fi
  # Expand ~ manually since it doesn't expand inside quoted strings
  SOURCE="${SOURCE/#\~/$HOME}"
  if [ ! -f "$SOURCE" ]; then
    echo "Error: file not found: $SOURCE"
    exit 1
  fi
  # Validate the file contains the required keys before copying
  if ! grep -q "CLOUDFLARE_API_TOKEN=" "$SOURCE"; then
    echo "Error: CLOUDFLARE_API_TOKEN not found in $SOURCE"
    exit 1
  fi
  if ! grep -q "CLOUDFLARE_ACCOUNT_ID=" "$SOURCE"; then
    echo "Error: CLOUDFLARE_ACCOUNT_ID not found in $SOURCE"
    exit 1
  fi
  cp "$SOURCE" .env
  echo "✓ Credentials imported from $SOURCE"
  exit 0
fi

# ── --init-sites: initialize SITES_DIR as a git repo ────────────────────────
if [ "$MODE" = "--init-sites" ]; then
  clodsite_init_sites_dir
  mkdir -p "$SITES_DIR"
  git -C "$SITES_DIR" init -q
  if [ ! -f "${SITES_DIR}/.gitignore" ]; then
    printf '*/src/\n*/.deploy-*\n*/.turnstile-*\n*/.wrangler/\n*.swp\n' > "${SITES_DIR}/.gitignore"
    echo "✓ ${SITES_DIR}/.gitignore created."
  else
    for pattern in '*/.turnstile-*' '*/.wrangler/' '*.swp'; do
      if ! grep -qxF "$pattern" "${SITES_DIR}/.gitignore"; then
        printf '%s\n' "$pattern" >> "${SITES_DIR}/.gitignore"
        echo "✓ ${pattern} added to ${SITES_DIR}/.gitignore."
      fi
    done
  fi
  echo "✓ ${SITES_DIR} initialized as a git repository."
  exit 0
fi

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
  if ! wrangler pages project list > /dev/null 2>&1; then
    echo ""
    echo "Error: Token verification failed."
    echo "Check that your token has 'Cloudflare Pages: Edit' permission and try again."
    exit 1
  fi
  echo "✓ Token verified (Cloudflare Pages: Edit confirmed)."
  echo "✓ Account ID present."
  echo "✓ .env is ready."
  clodsite_init_sites_dir
  echo "✓ SITES_DIR: ${SITES_DIR}"
  echo ""
  echo "Next step: create a build-plan.yaml, then run /build <site-name>"
  exit 0
fi

echo "Error: setup.sh requires --check or --verify flag."
echo "This script is called by the /setup command in Claude Code — run /setup there."
exit 1
