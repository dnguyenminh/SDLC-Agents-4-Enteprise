#!/usr/bin/env bash
# =============================================================================
# SA4E-356 — PathResolver consistency gate (N-8)
# -----------------------------------------------------------------------------
# Fails when an audit tool handler still resolves a raw `file_path` with a
# single-argument `path.resolve(...)` or touches fs with a raw `file_path`.
# Single source of truth: `resolveWorkspacePath()` from
# `extension/src/services/PathResolver.ts` (TDD v1.1 §9 N-8, BR-01, C-4).
#
# Forbidden patterns (TDD §9):
#   resolve(file_path) | resolve(args.file_path) | resolve(a.file_path) |
#   path.resolve(file_path) | rs(a.file_path)   (single argument, no comma)
#   fs.readFileSync(file_path..) | fs.writeFileSync(file_path..) |
#   fs.appendFileSync(file_path..) | readFile(file_path..) | ...
#
# Scope: extension/src/**/*.ts EXCLUDING __tests__/*.test.ts and
# PathResolver.ts itself; backend/ excluded (shadowed duplicate, OI-4).
#
# Triage (SECURITY-REVIEW.md INFO-02, pre-triaged):
#   readFile(resolvedPath)/writeFile(resolvedPath) = FALSE POSITIVE by design
#   (containment passed + T3/T3b/T8) — this script only matches args containing
#   the literal token `file_path`, so resolved-path calls can never match.
#
# Modes:
#   --staged           Scan staged files only (pre-commit hook)
#   --changed <base>   Scan files changed vs <base>..HEAD (CI / PR gate)
#   --all              Scan the whole tracked tree (full audit / CI gate)
#
# Exit code: 0 = clean, 1 = N-8 violation found, 2 = usage error.
#
# NOTE (RED by design until DEV finishes TDD steps C3–C8): the pre-fix code
# still contains violations (e.g. jira-attachment-tools.ts `resolve(file_path)`).
# `--staged` only scans staged files, so Phase 4.5 infra commits pass. The CI
# `--all` gate turns green once the call-site refactor lands.
# =============================================================================
set -o pipefail

MODE="staged"
BASE="origin/main"

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
  echo "[check-pathresolver-n8] not a git repo — skipping (informational)."
  exit 0
fi
cd "$GIT_ROOT"

echo "== path-resolver N-8 consistency gate (SA4E-356 / TDD §9) =="
echo "mode=$MODE"

# --- Collect candidate files ---------------------------------------------------
raw=()
case "$MODE" in
  staged)  mapfile -t raw < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null) ;;
  changed) mapfile -t raw < <(git diff --name-only "${BASE}...HEAD" --diff-filter=ACMR 2>/dev/null) ;;
  all)     mapfile -t raw < <(git ls-files) ;;
esac

LIST_FILE="$(mktemp)"
trap 'rm -f "$LIST_FILE"' EXIT
for f in "${raw[@]}"; do
  case "$f" in
    extension/src/services/PathResolver.ts)  continue ;;  # the helper itself
    */__tests__/*|*.test.ts|*.spec.ts)       continue ;;  # tests use raw paths as fixtures
    extension/src/*.ts|extension/src/**/*.ts)
      printf '%s\n' "$f" >> "$LIST_FILE" ;;
    *) : ;;
  esac
done

if [[ ! -s "$LIST_FILE" ]]; then
  echo "No in-scope source files to scan. Gate PASSED."
  exit 0
fi
count=$(wc -l < "$LIST_FILE" | tr -d ' ')

fail=0

# --- Pattern 1: single-argument resolve(<...file_path...>) ----------------------
# `(^|[^word])` guard + `resolve\s*\(` does NOT match `resolveWorkspacePath(`
# (next char after `resolve` is `W`, not `(`). Two-arg resolve(root, raw) has a
# comma inside the parens and is excluded by `[^,()]*`.
P1='(^|[^A-Za-z0-9_$])(path\.resolve|resolve|rs)[[:space:]]*\([^,()]*file_path[^,()]*\)'
matches1="$(grep -nIE "$P1" $(cat "$LIST_FILE") 2>/dev/null || true)"
if [[ -n "$matches1" ]]; then
  echo "VIOLATION N-8a: single-argument resolve(<...file_path...>) found:"
  echo "$matches1" | sed 's/^/    /'
  echo "Fix: use resolveWorkspacePath() from services/PathResolver.ts (BR-01, C-4)."
  echo ""
  fail=1
fi

# --- Pattern 2: raw fs.*(<...file_path...>) ------------------------------------
P2='(readFileSync|writeFileSync|appendFileSync|createReadStream|createWriteStream|promises\.readFile|promises\.writeFile|promises\.appendFile)[[:space:]]*\([^,()]*file_path[^,()]*\)'
matches2="$(grep -nIE "$P2" $(cat "$LIST_FILE") 2>/dev/null || true)"
if [[ -n "$matches2" ]]; then
  echo "VIOLATION N-8b: raw fs.*(<...file_path...>) found:"
  echo "$matches2" | sed 's/^/    /'
  echo "Fix: resolve first, then touch fs ONLY with resolution.resolvedPath (I-4, C-4)."
  echo ""
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "FAILED: N-8 consistency violation(s). (SA4E-356 / TDD §9)"
  exit 1
fi

echo "PASSED: scanned $count in-scope production file(s); no N-8 violations."
exit 0
