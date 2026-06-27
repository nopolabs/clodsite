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
    local keys=()
    local key line
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        ""|\#*) continue ;;
        export\ *) key="${line#export }"; key="${key%%=*}" ;;
        *) key="${line%%=*}" ;;
      esac
      key="${key%"${key##*[![:space:]]}"}"
      key="${key#"${key%%[![:space:]]*}"}"
      if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [ "${!key+x}" ]; then
        keys+=("$key")
        eval "__clodsite_saved_${key}=\${$key}"
      fi
    done < "${CLODSITE_ROOT}/.env"

    set -a
    # shellcheck source=/dev/null
    source "${CLODSITE_ROOT}/.env"
    set +a

    for key in "${keys[@]}"; do
      eval "export ${key}=\${__clodsite_saved_${key}}"
      unset "__clodsite_saved_${key}"
    done
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

# Resolve the site's declarative secret bindings (item 12) into the canonical
# env vars deploy and the generated Functions consume. The plan names which
# source variable supplies each credential (STRIPE_SECRET_KEY_{TEST,LIVE} via
# commerce.checkout.mode, a Printful/Resend alias via api_key_env); this sets
# the canonical name from that source whenever the source is present in the
# environment. Names only travel through the plan — values stay in the env.
#
# Best-effort and secret-free: a missing plan, an unparseable plan, or absent
# source vars leave the environment untouched, so a plain build with no
# credentials is unaffected. A declared binding overrides an ambient value of
# the canonical name (a deliberate committed selection); the source it reads
# still honors #72 exported-wins via clodsite_load_env. Existence and Stripe
# key-shape are enforced later, at the point of use, by the secret-consuming
# scripts — not here.
clodsite_resolve_bindings() {
  local plan="${SITE_DIR:-}/build-plan.yaml"
  [ -n "${SITE_DIR:-}" ] && [ -f "$plan" ] || return 0

  local bindings canonical source
  bindings=$(node "${CLODSITE_ROOT}/scripts/lib/build-plan.mjs" "$plan" secret-bindings 2>/dev/null) || return 0
  while read -r canonical source; do
    [ -n "$canonical" ] && [ -n "$source" ] || continue
    # Skip syntactically invalid names — validate-plan reports a malformed
    # api_key_env; the chokepoint must not choke on it (and an invalid name
    # cannot be a shell variable anyway).
    [[ "$canonical" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ "$source" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [ -n "${!source:-}" ]; then
      export "${canonical}=${!source}"
    fi
  done <<< "$bindings"
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
  clodsite_resolve_bindings
}

clodsite_site_dir_for() {
  local site_name="${1:?site name required}"
  clodsite_init_sites_dir
  printf '%s\n' "${SITES_DIR}/${site_name}"
}
