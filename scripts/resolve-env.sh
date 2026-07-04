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
#
# Audit mode is read-only and may be run directly:
#
#   scripts/resolve-env.sh --list <site>
#
# It lists declared binding names and set/MISSING status only, never values.
# Keep the shared env registry as one commented section per site; offboarding a
# client should be "delete that section, re-run this audit."
#
# The actual resolution always runs in a bash subprocess (the `--emit` mode
# below), so this works whether the interactive shell is bash or zsh:
# lib/sites.sh uses bash-only features (indirect expansion) that zsh cannot
# parse, so it is never sourced into the user's shell. The subprocess prints a
# value-free report on stderr and `export` lines on stdout; the sourced shell
# applies the exports with eval, setting the resolved canonical credentials.

# ── Audit worker: `resolve-env.sh --list <site>` ──────────────────────────────
# Runs under bash from the shebang. Reports declared binding names and whether
# each source is set after loading the shared env file. It never emits exports or
# secret values.
if [ "${1:-}" = "--list" ]; then
  set -uo pipefail
  site="${2:-}"
  if [ -z "$site" ]; then
    echo "Usage: scripts/resolve-env.sh --list <site>" >&2
    exit 1
  fi

  LIST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=lib/sites.sh
  source "${LIST_DIR}/lib/sites.sh"

  SITE_NAME="$site"
  if ! clodsite_init_site_dir >/dev/null 2>&1; then
    echo "Error: could not resolve site '${site}' (set SITES_DIR or SITE_DIR)." >&2
    exit 1
  fi
  plan="${SITE_DIR}/build-plan.yaml"
  if [ ! -f "$plan" ]; then
    echo "Error: ${plan} not found." >&2
    exit 1
  fi

  bindings=$(node "${LIST_DIR}/lib/build-plan.mjs" "$plan" secret-bindings 2>/dev/null || true)
  mode=$(node "${LIST_DIR}/lib/build-plan.mjs" "$plan" stripe-mode 2>/dev/null || true)

  echo "Declared secret bindings for '${site}':"
  if [ -z "$bindings" ]; then
    echo "  (none — canonical credentials are read by bare name)"
  else
    while read -r canonical source; do
      [ -n "$canonical" ] && [ -n "$source" ] || continue
      present="MISSING"
      [ -n "${!source:-}" ] && present="set"
      if [ "$canonical" = "STRIPE_SECRET_KEY" ] && [ -n "$mode" ]; then
        echo "  ${canonical} ← ${source} (${present}, Stripe mode: ${mode})"
      else
        echo "  ${canonical} ← ${source} (${present})"
      fi
    done <<< "$bindings"
  fi
  exit 0
fi

# ── Internal worker: `bash resolve-env.sh --emit <site>` ──────────────────────
# Runs under bash, where lib/sites.sh is valid. Resolves the bindings, then
# prints the report to stderr (no values) and `export NAME=value` to stdout.
if [ "${1:-}" = "--emit" ]; then
  set -uo pipefail
  site="${2:-}"
  EMIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=lib/sites.sh
  source "${EMIT_DIR}/lib/sites.sh"

  SITE_NAME="$site"
  if ! clodsite_init_site_dir >/dev/null 2>&1; then
    echo "Error: could not resolve site '${site}' (set SITES_DIR or SITE_DIR)." >&2
    exit 1
  fi
  plan="${SITE_DIR}/build-plan.yaml"
  if [ ! -f "$plan" ]; then
    echo "Error: ${plan} not found." >&2
    exit 1
  fi

  # clodsite_init_site_dir has already bound the canonical vars in this process.
  bindings=$(node "${EMIT_DIR}/lib/build-plan.mjs" "$plan" secret-bindings 2>/dev/null || true)
  mode=$(node "${EMIT_DIR}/lib/build-plan.mjs" "$plan" stripe-mode 2>/dev/null || true)

  echo "Resolved environment for '${site}':" >&2
  if [ -z "$bindings" ]; then
    echo "  (no per-site bindings declared — canonical credentials read by bare name)" >&2
  else
    while read -r canonical source; do
      [ -n "$canonical" ] && [ -n "$source" ] || continue
      present="missing"
      [ -n "${!source:-}" ] && present="set"
      if [ "$canonical" = "STRIPE_SECRET_KEY" ] && [ -n "$mode" ]; then
        echo "  Stripe: ${mode} (from ${source}, ${present})" >&2
      elif [ "$canonical" = "PRINTFUL_API_KEY" ]; then
        echo "  Printful: from ${source} (${present})" >&2
      elif [ "$canonical" = "RESEND_API_KEY" ]; then
        echo "  Resend: from ${source} (${present})" >&2
      else
        echo "  ${canonical}: from ${source} (${present})" >&2
      fi
      # Emit the resolved canonical value (stdout) for the caller's shell. %q
      # quotes it safely; it never reaches the terminal (the caller evals it).
      if [ -n "${!canonical:-}" ]; then
        printf 'export %s=%q\n' "$canonical" "${!canonical}"
      fi
    done <<< "$bindings"
  fi
  exit 0
fi

# ── Sourced entrypoint ────────────────────────────────────────────────────────
# Detect being run instead of sourced; bail with a hint rather than silently
# resolving into a throwaway subshell.
if ! (return 0 2>/dev/null); then
  echo "resolve-env.sh must be sourced to take effect:"
  echo "  source scripts/resolve-env.sh <site>"
  exit 1
fi

# Locate this file to re-invoke it under bash. It is sourced into the user's
# interactive shell, which may be zsh, so BASH_SOURCE is not enough; the eval
# keeps zsh's prompt-expansion syntax out of bash's parser.
if [ -n "${ZSH_VERSION:-}" ]; then
  eval '__clodsite_re_src=${(%):-%x}'
else
  __clodsite_re_src="${BASH_SOURCE[0]}"
fi
__clodsite_re_dir="$(cd "$(dirname "$__clodsite_re_src")" && pwd)"

if [ -z "${1:-}" ]; then
  echo "Usage: source scripts/resolve-env.sh <site>" >&2
else
  # Report (stderr) flows to the terminal; exports (stdout) are applied here.
  eval "$(bash "${__clodsite_re_dir}/resolve-env.sh" --emit "$1")"
fi
unset __clodsite_re_src __clodsite_re_dir
