#!/usr/bin/env bash
# =============================================================================
# SA4E-358 — CORS gate-first consistency gate (SCAN-01 + SCAN-02 + I-1 + G-2)
# -----------------------------------------------------------------------------
# Fails when CORS emission drifts outside the OriginGate entry point
# (TDD v1.1 §3.6 + §8.6 checklist; STP v1.1 §2.5 SCAN-01/SCAN-02; security
# review merge condition #6: grep 0 `ACAO: *`).
#
# Single source of truth: evaluateOriginGate() from
# extension/src/services/OriginGate.ts — MUST be the first statement of
# WrapperServer.handleRequest (I-1: gate before every route dispatch and
# before every res.setHeader).
#
# Checks:
#   G1 (SCAN-01, merge cond #6): 0 x wildcard Access-Control-Allow-Origin
#       ("*") anywhere in production extension/src — setHeader form,
#       object-literal form, raw-header form. Comments INCLUDED on purpose:
#       merge condition #6 is a raw grep (`grep 0 ACAO *`), so the exact
#       quoted literal must not survive anywhere, even in comments.
#   G2 (SCAN-02 + I-1): Access-Control-* emission ONLY inside
#       WrapperServer.handleRequest AFTER the evaluateOriginGate() call:
#         - non-WrapperServer production files: 0 x Access-Control-*
#         - WrapperServer.ts: >= 1 gate call; every Access-Control-* line
#           AND every route dispatch marker (u.pathname === / handleMcp( /
#           writeHead(204)) must sit on a line strictly AFTER the gate call.
#   G3 (G-2 purity, when OriginGate.ts exists): OriginGate.ts must be a pure
#       module — ONLY import allowed is sanitizeLogText from ./PathResolver;
#       no http/vscode/other imports (TDD G-2, STP §2.4 UT entry criterion).
#
# Scope: extension/src/**/*.ts (tracked only — webview/node_modules is
# gitignored and never scanned) EXCLUDING __tests__/*.test.ts/*.spec.ts
# (test fixtures assert deny shapes; wrapper-server.helpers.ts legitimately
# scans `access-control-` key prefixes).
#
# Modes:
#   --staged           staged files only (pre-commit hook; default)
#   --changed <base>   files changed vs <base>...HEAD (PR gate)
#   --all              whole tracked tree (full audit / CI REQUIRED gate)
# WrapperServer-specific checks (G2) run only when that file is in the scan
# set; OriginGate purity (G3) runs only when OriginGate.ts is in the set.
#
# Exit code: 0 = clean, 1 = violation found, 2 = usage error.
#
# NOTE (RED by design until DEV lands TDD §12 steps C1+C3): the pre-fix code
# still contains WrapperServer.ts:126-128 — unconditional
# setHeader("Access-Control-Allow-Origin", "*") / Allow-Methods /
# Allow-Headers — and NO evaluateOriginGate() call. The CI `--all` gate is
# RED exactly for those lines. Do NOT "fix" the gate — implement TDD §3.6
# (delete :126-128, gate first, echo-only CORS after gate).
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
  echo "[check-cors-gate-sa4e358] not a git repo — skipping (informational)."
  exit 0
fi
cd "$GIT_ROOT"

echo "== CORS gate-first consistency gate (SA4E-358 / TDD §8.6, STP §2.5 SCAN) =="
echo "mode=$MODE"

# --- Collect candidate files ---------------------------------------------------
raw=()
case "$MODE" in
  staged)  mapfile -t raw < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null) ;;
  changed) mapfile -t raw < <(git diff --name-only "${BASE}...HEAD" --diff-filter=ACMR 2>/dev/null) ;;
  all)     mapfile -t raw < <(git ls-files) ;;
esac

WS=""
OG=""
for f in "${raw[@]}"; do
  case "$f" in
    # BR-18 refactor: the handleRequest implementation (gate call + CORS echo)
    # lives in WrapperServer/request-handler.ts; WrapperServer.ts is a facade.
    # Prefer the real entry file when present, fall back to the legacy layout.
    extension/src/services/WrapperServer/request-handler.ts) WS="$f" ;;
    extension/src/services/WrapperServer.ts) [[ -z "$WS" ]] && WS="$f" ;;
    extension/src/services/OriginGate.ts)    OG="$f" ;;
  esac
done

LIST_FILE="$(mktemp)"
NONWS_FILE="$(mktemp)"
trap 'rm -f "$LIST_FILE" "$NONWS_FILE"' EXIT
for f in "${raw[@]}"; do
  case "$f" in
    */__tests__/*|*.test.ts|*.spec.ts)       continue ;;  # fixtures may carry CORS literals
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

# --- G1: no wildcard Access-Control-Allow-Origin (SCAN-01 / merge cond #6) ----
# Matches all three emission forms, case-insensitive:
#   res.setHeader("Access-Control-Allow-Origin", "*")
#   "Access-Control-Allow-Origin": "*"          (object literal in writeHead)
#   Access-Control-Allow-Origin: *              (raw header string)
# The echo line `setHeader(..., gate.echoOrigin)` can never match (value is
# not a quoted star). Comments match too — deliberate (see header).
P1="access-control-allow-origin[\"']?[[:space:]]*[:,][[:space:]]*[\"']?\*"
matches1="$(grep -inE "$P1" $(cat "$LIST_FILE") 2>/dev/null || true)"
if [[ -n "$matches1" ]]; then
  echo "VIOLATION SCAN-01: wildcard Access-Control-Allow-Origin found (must be 0 anywhere — merge condition #6):"
  echo "$matches1" | sed 's/^/    /'
  echo "Fix: delete the unconditional CORS setHeader block (pre-fix WrapperServer.ts:126-128) and emit echo-only headers AFTER the gate (TDD §3.6, G-5)."
  echo ""
  fail=1
fi

# --- G2a: Access-Control-* outside WrapperServer.ts (SCAN-02 / I-1) -----------
if [[ -n "$WS" ]]; then
  grep -vF "$WS" "$LIST_FILE" > "$NONWS_FILE" || true
else
  cp "$LIST_FILE" "$NONWS_FILE"
fi
if [[ -s "$NONWS_FILE" ]]; then
  P2="access-control-"
  matches2="$(grep -inE "$P2" $(cat "$NONWS_FILE") 2>/dev/null || true)"
  if [[ -n "$matches2" ]]; then
    echo "VIOLATION SCAN-02: Access-Control-* header emitted outside the gate entry file ($WS) (the gate owns ALL CORS — I-1/G-5, TDD §3.6):"
    echo "$matches2" | sed 's/^/    /'
    echo "Fix: remove CORS emission from this file; the ONLY sanctioned CORS site is the echo block after evaluateOriginGate() in the gate entry handleRequest (WrapperServer/request-handler.ts, legacy: WrapperServer.ts)."
    echo ""
    fail=1
  fi
fi

# --- G2b: WrapperServer.ts — gate call exists and precedes CORS + routes ------
if [[ -n "$WS" && -f "$WS" ]]; then
  gate_line="$(grep -nE 'evaluateOriginGate[[:space:]]*\(' "$WS" | head -1 | cut -d: -f1)"
  if [[ -z "$gate_line" ]]; then
    echo "VIOLATION I-1: no evaluateOriginGate() call in $WS — the gate must be the FIRST statement of handleRequest (TDD §3.6 / step C3)."
    echo ""
    fail=1
  else
    # every Access-Control-* emission must be strictly after the gate call
    ac_lines="$(grep -inE 'access-control-' "$WS" | cut -d: -f1 || true)"
    for ln in $ac_lines; do
      if [[ "$ln" -le "$gate_line" ]]; then
        echo "VIOLATION SCAN-02/I-1: Access-Control-* emission at ${WS}:${ln} is NOT after the gate call (line ${gate_line}) — headers set before the gate materialize on 403 responses (TDD C-2)."
        fail=1
      fi
    done
    # every route dispatch / preflight response must be strictly after the gate
    marker_lines="$(grep -nE 'u\.pathname[[:space:]]*===|handleMcp[[:space:]]*\(|writeHead[[:space:]]*\([[:space:]]*204' "$WS" | cut -d: -f1 || true)"
    for ln in $marker_lines; do
      if [[ "$ln" -le "$gate_line" ]]; then
        echo "VIOLATION I-1: route dispatch / preflight at ${WS}:${ln} is NOT after the gate call (line ${gate_line}) — gate must precede every route (TDD §3.6 note 2, I-1)."
        fail=1
      fi
    done
  fi
fi

# --- G3: OriginGate.ts purity — only import allowed is ./PathResolver (G-2) ---
if [[ -n "$OG" && -f "$OG" ]]; then
  bad_imp="$(grep -nE "^[[:space:]]*import[[:space:]]" "$OG" | grep -v "PathResolver" || true)"
  if [[ -n "$bad_imp" ]]; then
    echo "VIOLATION G-2: OriginGate.ts imports something other than ./PathResolver — pure module contract broken (TDD G-2, STP §2.4 UT entry):"
    echo "$bad_imp" | sed 's/^/    /'
    echo ""
    fail=1
  fi
  node_imp="$(grep -nE "from[[:space:]]+[\"'](node:)?(http|https|vscode)[\"']|require\([\"'](node:)?(http|https|vscode)[\"']\)" "$OG" || true)"
  if [[ -n "$node_imp" ]]; then
    echo "VIOLATION G-2: OriginGate.ts must NOT import http/https/vscode (no I/O, no vscode API — TDD G-2):"
    echo "$node_imp" | sed 's/^/    /'
    echo ""
    fail=1
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "FAILED: CORS gate-first consistency violation(s). (SA4E-358 / TDD §8.6, STP §2.5 SCAN-01/02)"
  exit 1
fi

echo "PASSED: scanned $count in-scope production file(s); CORS emission is gate-first (SCAN-01/02 + I-1 clean)."
exit 0
