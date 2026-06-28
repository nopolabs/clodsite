#!/usr/bin/env bash
# Generates an OKF Site concept into each site's docs/index.md from its
# build-plan.yaml. Offline and deterministic — safe to re-run. Writes into
# SITES_DIR (the sites repo), not this repo.
#
#   bash scripts/generate-site-docs.sh            # all sites in SITES_DIR
#   bash scripts/generate-site-docs.sh <site>...  # named sites only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve SITES_DIR the same way the rest of the pipeline does.
SITES_DIR="${SITES_DIR:-sites}"
if [ -f "${SCRIPT_DIR}/../.env" ]; then
  env_sites="$(grep -E '^SITES_DIR=' "${SCRIPT_DIR}/../.env" | cut -d= -f2- || true)"
  [ -n "${env_sites}" ] && SITES_DIR="${env_sites}"
fi

if [ ! -d "$SITES_DIR" ]; then
  echo "Error: SITES_DIR ($SITES_DIR) not found"
  exit 1
fi

if [ "$#" -gt 0 ]; then
  sites=("$@")
else
  sites=()
  for d in "$SITES_DIR"/*/; do
    [ -f "${d}build-plan.yaml" ] && sites+=("$(basename "$d")")
  done
fi

count=0
for site in "${sites[@]}"; do
  plan="${SITES_DIR}/${site}/build-plan.yaml"
  if [ ! -f "$plan" ]; then
    echo "skip ${site} (no build-plan.yaml)"
    continue
  fi
  node "${SCRIPT_DIR}/lib/generate-site-concept.mjs" "$plan" "${SITES_DIR}/${site}/docs/index.md" "$site"
  count=$((count + 1))
done
echo "✓ ${count} Site concept(s) written under ${SITES_DIR}/*/docs/"
