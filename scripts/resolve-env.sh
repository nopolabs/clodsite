#!/usr/bin/env bash
# Resolve one site's declarative secret bindings (item 12) into the CURRENT
# shell and report which source variable backs each canonical credential.
#
# This script mutates the environment, so it must be sourced:
#
#   source scripts/resolve-env.sh <site>
#   SITES_DIR=/path/to/sites source scripts/resolve-env.sh <site>
#
# It prints names and Stripe mode only — never a secret value. Run in a
# subshell (without `source`) it cannot affect the caller and says so.

# Detect being run instead of sourced; bail with a hint rather than silently
# resolving into a throwaway subshell.
if ! (return 0 2>/dev/null); then
  echo "resolve-env.sh must be sourced to take effect:"
  echo "  source scripts/resolve-env.sh <site>"
  exit 1
fi

__clodsite_resolve_env() {
  local site="${1:-}"
  if [ -z "$site" ]; then
    echo "Usage: source scripts/resolve-env.sh <site>" >&2
    return 2
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=lib/sites.sh
  source "${script_dir}/lib/sites.sh"

  SITE_NAME="$site"
  if ! clodsite_init_site_dir; then
    return 1
  fi

  local plan="${SITE_DIR}/build-plan.yaml"
  if [ ! -f "$plan" ]; then
    echo "Error: ${plan} not found." >&2
    return 1
  fi

  # clodsite_init_site_dir has already resolved the bindings into this shell.
  # Re-read them only to report which source name backs each canonical var.
  local bindings mode canonical source
  bindings=$(node "${script_dir}/lib/build-plan.mjs" "$plan" secret-bindings 2>/dev/null || true)
  mode=$(node "${script_dir}/lib/build-plan.mjs" "$plan" stripe-mode 2>/dev/null || true)

  echo "Resolved environment for '${site}':"
  if [ -z "$bindings" ]; then
    echo "  (no per-site bindings declared — canonical credentials read by bare name)"
  else
    while read -r canonical source; do
      [ -n "$canonical" ] && [ -n "$source" ] || continue
      local present="missing"
      [ -n "${!source:-}" ] && present="set"
      if [ "$canonical" = "STRIPE_SECRET_KEY" ] && [ -n "$mode" ]; then
        echo "  Stripe: ${mode} (from ${source}, ${present})"
      elif [ "$canonical" = "PRINTFUL_API_KEY" ]; then
        echo "  Printful: from ${source} (${present})"
      elif [ "$canonical" = "RESEND_API_KEY" ]; then
        echo "  Resend: from ${source} (${present})"
      else
        echo "  ${canonical}: from ${source} (${present})"
      fi
    done <<< "$bindings"
  fi
}

__clodsite_resolve_env "$@"
unset -f __clodsite_resolve_env