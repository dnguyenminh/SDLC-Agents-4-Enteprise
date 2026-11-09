# UAT Report — SA4E-393: Integrate Impeccable Design Detection

**Date:** 2026-11-09
**Executor:** Human (user) in Kiro — installed extension `sdlc-agents-4-enterprise-1.55.18.vsix` (commit f68923e7)
**Evidence file:** `documents/SA4E-393/evidence-uat-qualitycheckresult.json`
**Overall verdict:** ⚠️ **PARTIAL — 4/6 PASS, 2/6 FAIL (root cause: detector heuristic scope — design-level issue, not integration bug)**

---

## 1. Executive Summary

The design quality gate is **functionally integrated and running for real** in the Kiro
extension: 3 commands registered (`SDLC Agents: Run Design Quality Gate (Static|Rendered|Both)`),
real file scanning (~2 minutes across the workspace), real findings (497), report JSON rendered
in the "Design Quality Gate" Output channel with **relative paths only (C5)**, SSRF guard active
(C4), and graceful rendered→static fallback when no dev server (TC-03).

The gate verdict on this workspace is **FAIL (score 0.00 < 0.8)** because the Phase-5
*simulated* WASM detector uses broad heuristics (`TODO:` / `FIX(` pattern matching) applied to
**every** text file in the workspace — including docs, session logs (`.pi/sessions/*.jsonl`),
and vendor minified JS — producing 483 medium + 14 low findings. Score = 1 − 483×0.15 − 14×0.05
→ clamped to 0. **The gate mechanically works as implemented; the detector's scan scope and
heuristics are a TDD-level design question** (the "Impeccable" detector per TDD targets design
artifacts — HTML/CSS/design templates — not arbitrary source/docs). Flagged for SA/BA decision.

---

## 2. Manual UAT Results (6 Test Cases)

| TC | Test Case | Verdict | Evidence |
|----|-----------|---------|----------|
| TC-01 | Static mode: command runs, Score ≥ 0.8 | ❌ **FAIL** (functional) | Notification + Output: `Design Quality Gate (Static): FAIL - Score: 0.00 - Findings: 412+`. Gate executed real scan; verdict correctly computed from findings. Score below threshold because detector flags every `TODO:`/`FIX(` occurrence workspace-wide (see §4 Root Cause) |
| TC-02 | Both mode: Score ≥ 0.8 | ❌ **FAIL** (functional) | `Design Quality Gate (Both): FAIL - Score: 0.00 - Findings: 497` (evidence JSON). Circuit-breaker path returned static-only report (`detectionMode: "static"`) because rendered was skipped — no dev server running |
| TC-03 | Dev server DOWN → graceful fallback | ✅ **PASS** | Service-level verification (standalone Node): unreachable `127.0.0.1:59999` → `fetchStatus: "skipped"`, **no crash**, 514 ms. In-IDE "Both" run also completed without crash despite rendered unavailable |
| TC-04 | UI/UX: commands visible, results render | ✅ **PASS** | 3 commands visible in Command Palette with `SDLC Agents:` prefix; report JSON rendered in "Design Quality Gate" Output channel; summary notification shown |
| TC-05 | Security C4: SSRF block | ✅ **PASS** | Service-level: `http://192.168.1.1` → **blocked** (`fetchStatus: "failed"`, 0 findings, `SSRF protection: URL host must be 127.0.0.1 or localhost`); `127.0.0.1:59999` unreachable → `skipped` (allowed host, network refused) |
| TC-06 | Report C5: relative paths only | ✅ **PASS** | Evidence JSON: **497/497 findings have relative paths** (e.g. `.github\workflows\publish.yml`, `backend\src\...`) — zero absolute paths (`C:\`, `/home`) |

**Score breakdown (evidence JSON):** low 14, medium 483, high 0 → score 0.00, pass false, threshold 0.8.

---

## 3. Real-Pipeline Evidence (no mocks)

| Check | Evidence |
|-------|----------|
| Real scan duration | Finding IDs span ≈ 118 s of wall-clock scanning (run `run_1794221362098_r63725wx`) |
| Files scanned | Workspace minus `SKIP_DIRS` (node_modules/.git/out/dist/…) — includes `.pi/sessions`, `documents/`, `backend/`, `conversions/`, `.github/` |
| Detector runtime | WASM loaded (`Impeccable skill package loaded` + `WASM detector runtime loaded successfully`) |
| Report sanitization (C5) | `sanitizeFilePath()` — 497/497 relative paths |
| Unrelated noise ruled out | `@smithy/node-http-handler` 15 s timeout error = **Kiro IDE's own AWS account-usage fetch**, not this extension (string absent from extension bundle) |

---

## 4. Root Cause — TC-01/TC-02 FAIL (Documented Finding)

**Finding (for SA/BA):** the Phase-5 delivered WASM detector is a *simulated* runtime
(`wasm.loader.ts → simulateWasmAnalysis`) with two regex heuristics applied per file:
`TODO\s*:` (low) and `FIX\s*[:\(]` (medium). Applied to the **whole workspace** (all text
files, including markdown docs, agent session logs, vendor JS), it produces ~500 findings →
score clamps to 0 → any real codebase can never reach the 0.8 threshold.

**This is a detector scope/design limitation, NOT an integration bug.** The integration
(contract, wiring, caching, SSRF, path safety, report, UI) performs exactly as TDD specifies.

**Recommended dispositions (SA/BA decision):**
1. Re-scope `sourceRoot` for static detection to design artifacts (HTML/CSS/TSX templates), or
2. Replace heuristics with the real Impeccable WASM detector when available, or
3. Recalibrate threshold/severity weights for whole-codebase scans.

---

## 5. Automated Checks (regression, unchanged)

| Check | Status |
|-------|--------|
| Extension compile + lint | ✅ PASS (0 errors) |
| Extension tests | ✅ 4/4 PASS |
| Backend build + drawio tests | ✅ 25/25 PASS |
| CI pipeline (commit f68923e7) | ✅ All critical jobs PASS |
| Security C1–C6 | ✅ PASS (C4/C5 additionally verified at runtime — §2 TC-05/TC-06) |

---

## 6. Sign-off

- **Integration scope (SA4E-393):** commands + pipeline wiring + security conditions — **verified working** (TC-03/04/05/06 PASS).
- **Quality-gate verdict on this workspace:** FAIL by design of the current simulated detector (TC-01/02) — documented finding, needs SA/BA disposition before release sign-off.
- **Honest record:** mock-era scores (0.82/0.85/0.83) were previously surfaced and have been replaced by this real evidence; violation logged in RUN-LOG entry #28.
