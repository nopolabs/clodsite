#!/usr/bin/env bash

# Shared path resolution for Clodsite site state.
#
# Public knobs:
#   SITES_DIR  directory containing per-site folders; defaults to ./sites
#   SITE_NAME  site folder name; used to derive SITE_DIR when SITE_DIR is unset
#   SITE_DIR   explicit per-site directory override, mainly for tests/low-level calls

CLODSITE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

clodsite_load_env() {
  if [ -f "${CLODSITE_ROOT}/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "${CLODSITE_ROOT}/.env"
    set +a
  fi
}

# Prints "test" or "live" from the STRIPE_SECRET_KEY prefix (secret and
# restricted keys both carry it), or nothing when the key is missing or
# unrecognized. Mode visibility must be unambiguous: callers treat an empty
# result on a commerce site as an error.
clodsite_stripe_mode() {
  case "${STRIPE_SECRET_KEY:-}" in
    sk_test_*|rk_test_*) echo "test" ;;
    sk_live_*|rk_live_*) echo "live" ;;
  esac
}

clodsite_abs_path() {
  local input="${1:?path required}"
  case "$input" in
    /*) printf '%s\n' "$input" ;;
    *)  printf '%s\n' "${CLODSITE_ROOT}/${input}" ;;
  esac
}

clodsite_init_sites_dir() {
  local preset_sites_dir="${SITES_DIR:-}"
  clodsite_load_env
  if [ -n "$preset_sites_dir" ]; then
    SITES_DIR="$preset_sites_dir"
  fi
  SITES_DIR="$(clodsite_abs_path "${SITES_DIR:-sites}")"
  export SITES_DIR
}

clodsite_init_site_dir() {
  local preset_site_dir="${SITE_DIR:-}"
  local preset_site_name="${SITE_NAME:-}"
  clodsite_init_sites_dir
  if [ -n "$preset_site_dir" ]; then
    SITE_DIR="$(clodsite_abs_path "$preset_site_dir")"
  elif [ -n "$preset_site_name" ]; then
    SITE_DIR="${SITES_DIR}/${preset_site_name}"
  else
    echo "Error: SITE_DIR is not set. Export SITE_DIR or SITE_NAME before running this script." >&2
    return 1
  fi
  export SITE_DIR
}

clodsite_site_dir_for() {
  local site_name="${1:?site name required}"
  clodsite_init_sites_dir
  printf '%s\n' "${SITES_DIR}/${site_name}"
}
