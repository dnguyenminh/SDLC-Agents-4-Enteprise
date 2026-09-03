#!/usr/bin/env bash
# =============================================================================
# SA4E-241 — Hardcoded-secret gate (SEC-03)
# -----------------------------------------------------------------------------
# Blocks commits/CI when a known-leaked or hardcoded Pega credential (or a
# hardcoded default projectId) appears in source. Root-cause enforcement of
# TDD §8.4: credentials must come from VS Code SecretStorage / per-request
# authHeader — never a literal in code (No-Workaround rule).
#
# Patterns blocked (case-sensitive where it matters):
#   - SSA@TGB                       (leaked Pega operator id — must be rotated)
#   - pega123!                      (leaked Pega password — must be rotated)
#   - username ... || 'SSA@TGB'     (default-credential fallback pattern)
#   - password ... || 'pega123!'    (default-credential fallback pattern)
#   - 'PegaCollProj' used as a DEFAULT (|| 'PegaCollProj')  (SEC-01/SEC-02)
#
# Modes:
#   --staged           Scan staged files only (pre-commit hook)
#   --changed <base>   Scan files changed vs <base>..HEAD (CI / PR gate)
#   --all              Scan the whole tracked tree (full audit)
#
# Scope: source only — backend/src, extension/src, scripts. Docs, tests
# fixtures, and this script itself are excluded (they legitimately reference
# the patterns to describe/scan for them).
#
# Exit code: 0 = clean, 1 = secret/violation found, 2 = usage error.
# =============================================================================
set -o pipefail

MODE="staged"
BASE="origin/master"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)  MODE="staged" ;;
    --changed) MODE="changed"
      if [[ $# -ge 2 && "$2" != --* ]]; then BASE="$2"; shift; fi ;;
    --all)     MODE="all" ;;
    -h|--help)
      echo "Usage: $0 [--staged] [--changed <base>] [--all]"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$GIT_ROOT" ]]; then
  echo "[check-secrets] not a git repo — skipping (informational)."
  exit 0
fi
cd "$GIT_ROOT"

echo "== hardcoded-secret gate (SA4E-241 / SEC-03) =="
echo "mode=$MODE"

# --- Collect candidate files ---------------------------------------------------
raw=()
case "$MODE" in
  staged)  mapfile -t raw < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null) ;;
  changed) mapfile -t raw < <(git diff --name-only "${BASE}...HEAD" --diff-filter=ACMR 2>/dev/null) ;;
  all)     mapfile -t raw < <(git ls-files) ;;
esac

# Only scan PRODUCTION source; exclude tests/fixtures/docs/this-script.
# Test files legitimately reference sample operator ids (e.g. mocked config) and
# are NOT shipped — the SEC-03 rule targets production credential handling.
LIST_FILE="$(mktemp)"
trap 'rm -f "$LIST_FILE"' EXIT
for f in "${raw[@]}"; do
  case "$f" in
    scripts/check-secrets.sh)                    continue ;;  # describes the patterns
    documents/*|docs/*|*.md)                     continue ;;  # docs describe rotation
    */__tests__/*|*/tests/*|*.test.ts|*.spec.ts) continue ;;  # test code / mocks
    */fixtures/*|*/__fixtures__/*)               continue ;;  # test fixtures
    backend/src/*.ts|extension/src/*.ts|backend/src/**/*.ts|extension/src/**/*.ts)
      printf '%s\n' "$f" >> "$LIST_FILE" ;;
    scripts/*.ts|scripts/*.js|scripts/*.mjs|scripts/*.cjs)
      printf '%s\n' "$f" >> "$LIST_FILE" ;;
    *) : ;;
  esac
done

if [[ ! -s "$LIST_FILE" ]]; then
  echo "No in-scope source files to scan. Gate PASSED."
  exit 0
fi
count=$(wc -l < "$LIST_FILE" | tr -d ' ')

# --- Secret / default-credential patterns (ERE) --------------------------------
# Single combined ERE. Matches:
#   - leaked literals SSA@TGB / pega123!
#   - default-credential fallbacks:  || 'SSA@TGB' , || 'pega123!'
#   - hardcoded default projectId:   || 'PegaCollProj'
COMBINED_ERE="SSA@TGB|pega123!|\\|\\|[[:space:]]*['\"](SSA@TGB|pega123!|PegaCollProj)['\"]"

# One batched grep over the whole file list (fast). -I skips binaries.
matches="$(grep -nIE "$COMBINED_ERE" $(cat "$LIST_FILE") 2>/dev/null || true)"

if [[ -n "$matches" ]]; then
  echo "VIOLATION: hardcoded secret / default-credential found (SEC-03 / SEC-01/02):"
  echo "$matches" | sed 's/^/    /'
  echo ""
  echo "FAILED: hardcoded-secret / default-credential violation(s). (SEC-03 / No-Workaround)"
  echo "Fix: read Pega credentials from VS Code SecretStorage and pass per-request authHeader;"
  echo "     derive projectId from authenticated identity (never a hardcoded default)."
  exit 1
fi

echo "PASSED: scanned $count in-scope production file(s); no hardcoded secrets found."
exit 0
