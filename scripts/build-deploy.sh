#!/usr/bin/env bash
# Usage: bash scripts/build-deploy.sh <site-name>
# Runs the full build+deploy pipeline without LLM involvement.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_NAME="${1:-}"

if [ -z "$SITE_NAME" ]; then
  echo "Usage: bash scripts/build-deploy.sh <site-name>"
  exit 1
fi

export SITE_NAME

echo "==> validate"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/validate-plan.sh"

echo "==> write-site-json"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/write-site-json.sh"

echo "==> apply-theme"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/apply-theme.sh"

echo "==> render-templates"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/render-templates.sh"

echo "==> render-functions"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/render-functions.sh"

echo "==> build"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/build-site.sh"

echo "==> render-headers"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/render-headers.sh"

echo "==> deploy"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/deploy.sh"

echo "==> finalize"
SITE_NAME="$SITE_NAME" bash "${SCRIPT_DIR}/deploy-finalize.sh"
