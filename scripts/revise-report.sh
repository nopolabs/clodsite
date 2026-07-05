#!/usr/bin/env bash
# Usage:
#   bash scripts/revise-report.sh --check-baseline <site>
#   bash scripts/revise-report.sh <site>
#   bash scripts/revise-report.sh --abandon [--yes] <site>
#
# Governed revise workflow helper. The default mode validates and rebuilds a
# proposal, then reports the authored-input diff and built-site blast radius.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/sites.sh
source "${SCRIPT_DIR}/lib/sites.sh"

MODE="report"
ASSUME_YES=false
SITE_ARG=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-baseline) MODE="baseline"; shift ;;
    --abandon) MODE="abandon"; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      if [ -z "$SITE_ARG" ]; then
        SITE_ARG="$1"
        shift
      else
        echo "Usage: bash scripts/revise-report.sh [--check-baseline|--abandon [--yes]] <site>" >&2
        exit 2
      fi
      ;;
  esac
done

if [ -z "$SITE_ARG" ]; then
  echo "Usage: bash scripts/revise-report.sh [--check-baseline|--abandon [--yes]] <site>" >&2
  exit 2
fi

export SITE_NAME="$SITE_ARG"
clodsite_init_site_dir

if [ ! -d "${SITE_DIR}/.git" ] && ! git -C "$SITE_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Error: ${SITE_DIR} is not inside a git worktree; revise reports need sites-repo history." >&2
  exit 1
fi

GIT_ROOT="$(git -C "$SITE_DIR" rev-parse --show-toplevel)"
SITE_PREFIX="$(git -C "$SITE_DIR" rev-parse --show-prefix)"
SITE_REL="${SITE_PREFIX%/}"
if [ -z "$SITE_REL" ]; then
  echo "Error: SITE_DIR must point at a per-site directory inside the sites repo, not the repo root." >&2
  exit 1
fi

status_offenders() {
  local mode="$1"
  git -C "$GIT_ROOT" status --porcelain=v1 -z --untracked-files=all -- "$SITE_REL" \
    | node "${SCRIPT_DIR}/lib/revise-report.mjs" dirty "$mode" "$SITE_REL"
}

build_generated_output() {
  echo "==> reset report-owned dist"
  git -C "$GIT_ROOT" restore -- "$SITE_REL/dist" 2>/dev/null || true
  git -C "$GIT_ROOT" clean -fd -- "$SITE_REL/dist" >/dev/null

  echo "==> validate"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/validate-plan.sh"

  echo "==> write-site-json"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/write-site-json.sh"

  echo "==> apply-theme"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/apply-theme.sh"

  echo "==> render-templates"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/render-templates.sh"

  echo "==> build"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/build-site.sh"

  echo "==> render-headers"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/render-headers.sh"

  echo "==> render-redirects"
  SITE_NAME="$SITE_ARG" bash "${SCRIPT_DIR}/render-redirects.sh"
}

check_baseline() {
  local offenders
  if ! offenders=$(status_offenders baseline); then
    echo "Error: ${SITE_ARG} has pre-existing dirty state. Commit, stash, or clean before revising:" >&2
    echo "$offenders" | sed 's/^/  /' >&2
    return 1
  fi
  echo "✓ ${SITE_ARG}: clean source baseline"

  build_generated_output

  local dist_status
  dist_status="$(node "${SCRIPT_DIR}/lib/revise-report.mjs" status "$GIT_ROOT" "$SITE_REL" dist)"
  if [ -z "$dist_status" ]; then
    echo "✓ ${SITE_ARG}: generated baseline matches current Clodsite compiler"
    return 0
  fi

  echo "Error: ${SITE_ARG} generated output is stale for the current Clodsite compiler." >&2
  echo "Commit/deploy this compiler baseline before starting a site revision:" >&2
  echo "" >&2
  REPORT_TITLE="Generated baseline drift for ${SITE_ARG}" \
    AUTHORED_STATUS="" DIST_STATUS="$dist_status" \
    node "${SCRIPT_DIR}/lib/revise-report.mjs" report \
      "$SITE_ARG" "$SITE_REL" "${GIT_ROOT}/${SITE_REL}/dist/_redirects" >&2
  return 1
}

if [ "$MODE" = "baseline" ]; then
  check_baseline
  exit $?
fi

if [ "$MODE" = "abandon" ]; then
  echo "Abandoning revision for ${SITE_ARG}..."
  git -C "$GIT_ROOT" restore -- "$SITE_REL"
  UNTRACKED="$(git -C "$GIT_ROOT" ls-files --others --exclude-standard -- "$SITE_REL")"
  if [ -n "$UNTRACKED" ]; then
    echo "Untracked files to remove:"
    echo "$UNTRACKED" | sed 's/^/  /'
    if [ "$ASSUME_YES" != true ]; then
      printf 'Remove these files? Type yes to continue: '
      read -r answer
      if [ "$answer" != "yes" ]; then
        echo "Abandon cancelled; tracked files were restored, untracked files remain."
        exit 1
      fi
    fi
    git -C "$GIT_ROOT" clean -fd -- "$SITE_REL" >/dev/null
  fi
  echo "✓ ${SITE_ARG}: revision abandoned"
  exit 0
fi

REPORT_OFFENDERS=""
if ! REPORT_OFFENDERS=$(status_offenders report); then
  echo "Error: ${SITE_ARG} has dirty state outside the authored-input proposal surface:" >&2
  echo "$REPORT_OFFENDERS" | sed 's/^/  /' >&2
  echo "Commit, stash, clean, or abandon unrelated changes before reporting this revision." >&2
  exit 1
fi

build_generated_output

AUTHORED_STATUS="$(node "${SCRIPT_DIR}/lib/revise-report.mjs" status "$GIT_ROOT" "$SITE_REL" authored)"
DIST_STATUS="$(node "${SCRIPT_DIR}/lib/revise-report.mjs" status "$GIT_ROOT" "$SITE_REL" dist)"

echo ""
AUTHORED_STATUS="$AUTHORED_STATUS" DIST_STATUS="$DIST_STATUS" \
  node "${SCRIPT_DIR}/lib/revise-report.mjs" report \
    "$SITE_ARG" "$SITE_REL" "${GIT_ROOT}/${SITE_REL}/dist/_redirects"
