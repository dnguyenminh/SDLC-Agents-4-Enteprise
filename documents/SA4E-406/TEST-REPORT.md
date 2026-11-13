# Test Execution Report — SA4E-406

## drawio_auto_layout: detector precision + verify loop + ELK compound + extension migration (STORY 7 diagram-quality guarantees)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-406 |
| Title | drawio_auto_layout: detector precision + verify loop + ELK compound + extension migration |
| Executed By | QA Agent |
| Date | 2026-11-12 |
| Environment | Extension vitest suite (Node 24.8.0, Windows 11), in-process real tool via `executeLocalTool`; corpus evidence on temp copies under `MCP_WORKSPACE_ROOTS` |
| Browser | N/A (MCP tools, no UI) |
| Overall Verdict | **✅ PASS** — all automated suites green (462 files / 3,602 tests, 0 failures); QA-11 (PD-QA1) re-enabled and **PASS** — DEV round 4c fix forwards `portsOnly` through `enforceFinalGate` (drawio-verify-loop.ts:50-54/79/86-89; drawio-apply-validate.ts:79-86; drawio-grid-snap.ts:23-33); measured evidence — node c stays (400,80), honest `status='partial'`, `node_proximity` still reported, 3 distinct edge anchors (0.25/0.5/0.75); PD-QA1 → CLOSED (Major); manual SIT (SIT-01..08) scheduled 2026-11-13/14 |
| Re-test Rounds | 5 (rounds 1–2 on 2026-11-11, round 3 on 2026-11-12, round 4 follow-up on 2026-11-12, round 5 QA FINAL on 2026-11-12; details in Appendix A) |
| Report Version | v3.2 (supersedes v3.1 of 2026-11-12) |

---

## 1. Executive Summary

Five QA rounds (rounds 1–2, round 3, round 4 follow-up, round 5 QA FINAL) verified the enhanced `drawio_auto_layout` / `drawio_export_png` tools against BRD Stories 1–7, FSD UC-01..UC-06 and BR-01..BR-65. Round 3 closed the last two automated-suite failures (one wrong test fixture, one documented production defect PD-QA1). Round 4 follow-up re-attempted QA-11 (PD-QA1): DEV round 4b fixed `commitLayout`/`snapDiagramToGrid` (partial) but `finalize()` still re-snapped without `opts`; QA-11 left skipped. Round 5 QA FINAL: DEV round 4c fix forwards `portsOnly` through `enforceFinalGate` (drawio-verify-loop.ts:50-54/79/86-89; drawio-apply-validate.ts:79-86; drawio-grid-snap.ts:23-33) and QA-11 re-enabled → **PASS**. Measured evidence — node c stays (400,80), honest `status='partial'`, `node_proximity` still reported, 3 distinct edge anchors (0.25/0.5/0.75); PD-QA1 → CLOSED (Major). Regression lock `drawio-ports-only-positions.test.ts` (QA-20) added. The nine user-reported diagram defects (BR-57..BR-65) are verified on a fresh 23-diagram corpus audit, and the F1/F2/F4 hardening tests (QA-16..QA-19) are green. Security hardening (bounded-time parse/sanitize, 25 MB byte cap, 10,000-cell pre-pass, file-level symlink guard) is regression-locked.

| Level | Total | Passed | Failed | Pass Rate |
|-------|-------|--------|--------|-----------|
| Automated (extension vitest, incl. QA verification suite) | 3,608 | 3,602 | 0 | 99.8% (6 skipped: 6 env-gated live-proxy, 0 defect-gated — QA-11 re-enabled and passing) |
| Manual SIT | 8 | 0 | 0 | scheduled 2026-11-13/14 (STP v2.2 §5) |
| **Total** | **3,616** | **3,602** | **0** | — |

---

## 2. Automated Test Results

### 2.1 Execution

| Metric | Value |
|--------|-------|
| Drawio tool suite (`npx vitest run src/tools/drawio`) | **24 files — 171 tests: 171 pass + 0 skipped** (QA-11 re-enabled and PASS; QA-20 regression lock included), 0 fail |
| Full extension suite (`npx vitest run`) | **461 files passed | 1 skipped (462); 3,602 tests passed | 6 skipped (3,608)**, 0 fail |
| Duration | 215.07s (transform 10.86s, setup 0ms, import 91.69s, tests 43.47s, environment 11.79s) |
| Skips | 6 tests env-gated (`live-content-proxy.test.ts`), 0 test skipped-by-design (QA-11 re-enabled and passing; PD-QA1 closed) |
| Delta vs dev baseline (453 files / 3,572 tests) | +9 files / +36 tests: +4 QA round-3 files (15 tests) + F1/F2/F4 hardening files (drawio-xml-rewrite, fs-guards.symlink-file, drawio-session-root-f4) + QA-20 regression lock (drawio-ports-only-positions.test.ts) + QA-11 re-enabled (skipped→passed) |

### 2.2 SA4E-406 Test Breakdown (QA verification suite — STC §11)

| Test File | Tests | Passed | Failed | Skipped | Covers |
|-----------|-------|--------|--------|---------|--------|
| drawio-corridor-invariants.test.ts | 3 | 3 | 0 | 0 | BR-59 stale waypoints, BR-60 edge parents, BR-57 band budget |
| drawio-final-gate.test.ts | 5 | 5 | 0 | 0 | BR-62 grid, BR-65 mxfile-free, BR-63 honesty |
| drawio-scope-args.test.ts | 5 | 5 | 0 | 0 | FSD 3.1.4 scope contract, BR-23 clamp, **QA-11/PD-QA1 closed (passing)** |
| drawio-session-root-binding.test.ts | 2 | 2 | 0 | 0 | A6/A7 session-root binding, BR-55 |
| drawio-sa406-defects.test.ts (dev round, QA-verified) | 14 | 14 | 0 | 0 | BR-57/58/60/62/64/65, thresholds, A2 contract |
| drawio-xml-rewrite.test.ts (F1) | 9 | 9 | 0 | 0 | batch XML rewrite + 2,000-cell timing guard |
| fs-guards.symlink-file.test.ts (F2) | 3 | 3 | 0 | 0 | file-level symlink escape guard |
| drawio-session-root-f4.test.ts (F4) | 1 | 1 | 0 | 0 | session-root threading |
| drawio-ports-only-positions.test.ts (QA-20 regression lock) | 2 | 2 | 0 | 0 | PD-QA1 close evidence: ports-only positions kept, anchors spread, status=partial |
| **QA suite total (27 defined)** | **27** | **27** | **0** | **0** | STC §11 |

### 2.3 Non-SA4E-406 Failures (Excluded)

None — the full suite is green (previous EntraConfig failures no longer present in the 2026-11-12 run).

---

## 3. Manual SIT Results (Final)

### 3.1 Environment

Not executed in this round. SIT-01..08 (STC §10) are scheduled 2026-11-13/14 per STP v2.0 §5; visual layout quality and renderer-output checks require human review of rendered PNGs.

### 3.2 Results Summary

| Total | Passed | Failed | Blocked | Skipped |
|-------|--------|--------|---------|---------|
| 8 | 0 | 0 | 0 | 8 (not yet executed) |

### 3.3 Detailed Test Execution

Pending — see STC §10 for the 8 defined SIT cases and `TEST-REPORT-SA4E-406.csv` for the execution tracker.

---

## 4. Defect Summary

### 4.1 Production Defect

#### PD-QA1: scope='ports' node move via final-gate de-buncher — CLOSED ✅ (Major, fixed by DEV round 4c)

| Field | Value |
|-------|-------|
| Contract | FSD §3.1 fix strategies: *"Ports Only (`scope=ports`): Redistribute edge anchor ports, **keep all node positions**"* |
| Evidence (before fix, this session) | Fixture a(0,150) b(400,0) c(400,80) d(400,300) + edges a→b/c/d, call `scope:'ports'`. Result: `status='fixed'`, `repositioned_nodes=[{id:'c', x_old:400, y_old:80, x_new:400, y_new:100}]`, node c moved 20px although `scope='ports'`; `node_proximity` silently fixed, honesty contract broken (`expect 100 to be 80` failed at drawio-scope-args.test.ts:84) |
| Evidence (after DEV round 4c fix, measured this session) | Node c stays at y=80 (`repositioned_nodes=[]`); honest `status='partial'`; `node_proximity` still reported; 3 distinct edge anchors (exit y = 0.25/0.5/0.75), no entry keys. QA-11 assertions all pass. |
| Actual vs expected | **Expected:** node c stays at y=80, `status='partial'`, `node_proximity` flagged. **Actual (after fix):** node c stays (400,80), `status='partial'`, `node_proximity` flagged — matches expectation. |
| Root cause (resolved) | `drawio-verify-loop.ts:87` `finalize()` called `enforceFinalGate(filePath)` **WITHOUT `opts`**, so `debunch()` re-ran on the ports-only file after `commitLayout` preserved positions. The `portsOnly` flag was lost at the final gate. |
| DEV round 4c fix references | `drawio-verify-loop.ts:50-54` computes `portsOnly` once from the original request scope; `:79` passes `{portsOnly}` into `finalize`; `:86,:89` forward `{portsOnly}` into `enforceFinalGate`; `drawio-apply-validate.ts:79-86` `enforceFinalGate(filePath, opts?)` forwards `opts` to `snapDiagramToGrid`; `drawio-grid-snap.ts:23-33` skips `debunch()`/`separateContainers()` when `opts?.portsOnly`. (Round 4b partial: `drawio-grid-snap.ts:27-30`, `drawio-apply-validate.ts:59-65`, `drawio-apply-strategy.ts:173`.) |
| Verified correct parts | Anchor redistribution honours the contract: e1/e2/e3 exit y = 0.25/0.5/0.75, no entry keys — unchanged by the fix. |
| Regression lock | `drawio-ports-only-positions.test.ts` (QA-20): 2 tests — positions preserved through apply+verify+final-gate; final-gate invariants (on-grid, `<mxfile>`-free) enforced on the ports path; status stays `partial`, `node_proximity` reported. |
| Status | **CLOSED ✅ — QA-11 re-enabled (`it.skip` removed, assertions unchanged) and now PASS. PD-QA1 fixed by DEV round 4c. Production code NOT touched by QA (role boundary); fix authored by DEV. No test remains skipped due to an unresolved production defect.** |

### 4.2 Corpus Residuals After the Tool (Honest Reporting Verified, Not Silently Hidden)

Fresh audit 2026-11-12: 23 repo diagrams copied to temp (originals untouched), real tool run twice per file. Exactly **15 blocking issues remain, all honestly reported** — the tool-reported issue list equals a fresh detection on the written bytes on every file (delta 0/23). Breakdown: data-model ×5 (node_overlap/high ×4 + stacked_edges ×1), use-case ×5 (edge_crossing/high ×1 + edge_wrong_parent/medium ×4), deployment ×2 + security ×1 + state-layout-status ×1 (stacked_edges), er-diagram ×1 (edge_edge_crossing/medium). These are accepted residuals: the tool reports them with fix hints instead of making a destructive rewrite that would not improve the diagram (SA4E-406 honesty-over-rewrite rule). Rework decision belongs to SM/DEV/content owners.

### 4.3 Nine User-Reported Defects (BRD STORY 7) — Before/After

**Before** = pre-fix state from QA rounds 1–2 corpus audit (user-reported corpus). **After** = fresh 2026-11-12 audit on the current build (23 diagrams × 2 runs, temp copies).

| # | Measured dimension | Requirement | Before | After | Verdict |
|---|--------------------|-------------|--------|-------|---------|
| 1 | Off-grid detector-vertex instances | BR-62 | 795 | **0** | ✅ CLOSED |
| 2 | Off-grid edge-label-fraction leftovers | BR-62 | 6 (round-2 audit) | **0** | ✅ CLOSED |
| 3 | Files with `<mxfile>` root after the tool | BR-65 | several | **0** | ✅ CLOSED |
| 4 | Lane/container overlaps after the tool | BR-57/58 family | 1 | **0** | ✅ CLOSED |
| 5 | Idempotency (2nd run byte-identical) | BR-62 / verify loop | 21/23 | **23/23** | ✅ CLOSED |
| 6 | Blocking issues honestly reported | A2 honesty contract | under-reported | **15 residuals, report↔disk delta 0 on all 23 files** | ✅ CLOSED (residuals accepted, §4.2) |
| 7 | Hostile-file parse time (unterminated mxCell, 1 MB) | Security | 77s | **<0.1s, bounded** (regression-locked, drawio-security.test.ts) | ✅ CLOSED |
| 8 | Hostile-file sanitize time | Security | 129s | **ms, bounded** (regression-locked) | ✅ CLOSED |
| 9 | Resource pre-pass guards | Security | none | **25 MB byte cap (`MAX_INPUT_BYTES`) + 10,000-cell pre-pass (`MAX_INPUT_CELLS`), actionable errors** | ✅ CLOSED |

### 4.4 F1 Performance Fix — drawio-xml-rewrite batch rewriter (measured this session)

| Dimension | Before | After | Verdict |
|-----------|--------|-------|---------|
| Primitive rewrite (2,000 cells) | 158,092 ms | **26 ms** | ✅ ~6,000× faster |
| End-to-end sanitize (hostile 1 MB unterminated mxCell) | 122,992 ms | **836 ms** | ✅ ~147× faster, bounded |
| Full preflight (parse + sanitize + guards) | — | **887 ms** | ✅ bounded, well under tool timeout |
| Output correctness | — | **byte-identical** for untouched cells; all 9 drawio-xml-rewrite tests pass | ✅ no regression |

`rewriteCells()` (drawio-xml-rewrite.ts) walks `<mxCell` open tags once — literal anchor search + `indexOf`, forward-advancing offset, no backtracking regex — O(fileBytes + cells) instead of O(cells × fileBytes). Covered by QA-16 (9 vitest tests) and QA-17 (2,000-cell timing guard < 2 s).

### 4.5 F2 / F3 / F4 / F5 / F9 Hardening

| Fix | File(s) | What it does | Verified by |
|-----|---------|--------------|-------------|
| F2 file-level symlink guard | `extension/src/backend-local-tools/fs-guards.ts` | `checkSymlinkGuardForPath` realpaths only the parent dir, then rejects an existing workspace file that is itself a symlink pointing outside the root; non-existent paths still allowed (new-file writes) | QA-18 (fs-guards.symlink-file.test.ts, 3 tests) |
| F3 backend execFileSync port | `backend/src/engine/tools/drawio-renderers.ts` | `exportWithCli` uses `execFileSync(cliPath, [arg array])` — no shell interpolation, so paths with spaces/quotes cannot become command syntax | compile-verified only (no runtime test in extension suite) |
| F4 session-root threading | `drawio-tool.ts:106,116` / `drawio-export-png.ts:70,84` | Handlers accept `ctx?: ToolCallContext` and forward `ctx?.sessionRoot` so session-bound clients resolve `file_path` under their session root, not legacy `folders[0]` | QA-19 (drawio-session-root-f4.test.ts) |
| F5 handler signature | `drawio-export-png.ts:99-102` | Local handler — no `orchestrationEngine` threaded through `executeLocalTool`; CLI is the self-contained path; no crash when upstream renderers unavailable | code review |
| F9 sanitizeLogText | `fs-guards.ts` (via `services/PathResolver`) | All rejection/error messages sanitize paths before logging — no filesystem details leaked in errors | code review + TC-350/TC-613 |

**Requirement-level verdict (BR-57..BR-65):**

| BR | Defect | Owner | Verification | Verdict |
|----|--------|-------|--------------|---------|
| BR-57 | band_oversize | TOOL-OWNED | QA-D-01, QA-06, QA-15; corpus: 0 remaining | ✅ |
| BR-58 | children_corner_cluster | TOOL-OWNED | QA-D-02; corpus: 0 remaining | ✅ |
| BR-59 | stale_edge_waypoints | TOOL-OWNED | QA-13, QA-14, QA-D-04 | ✅ |
| BR-60 | wrong_edge_parent | TOOL-OWNED | QA-13, QA-D-04, QA-D-05; corpus: use-case ×4 remain honestly reported (content decision needed) | ✅ detect/fix verified |
| BR-61 | stack_layout_container | TOOL-OWNED | QA-D-04 (no `childLayout=` in output) | ✅ |
| BR-62 | off_grid_alignment | TOOL-OWNED | QA-03, QA-05, QA-06, QA-D-07; corpus: 0 off-grid | ✅ |
| BR-63 | empty_lane_title | CONTENT-OWNED | QA-07: detected, never invented; corpus: 4 remain honestly reported | ✅ detect-only |
| BR-64 | missing_decision_label | CONTENT-OWNED | QA-D-03 + QA-03 (unambiguous 2-branch labelled by geometry, 3-branch reported only) | ✅ detect-only |
| BR-65 | mxfile_root | TOOL-OWNED | QA-05, QA-D-06; corpus: 0 mxfile roots | ✅ |

---

## 5. Test Metrics

| Metric | Value |
|--------|-------|
| Automated pass rate (drawio suite) | 171/171 executed = 100% (0 skipped; QA-11 re-enabled and passing, QA-20 regression lock included) |
| Automated pass rate (full extension suite) | 3,602/3,602 executed = 100% (6 skipped: 6 env-gated live-proxy, 0 defect-gated) |
| RTM coverage | 128/128 items (STC §12): UC 6/6, BR 65/65, AC 35/35, error codes 22/22 |
| Defect density (QA-found) | 0 open production defects / 27 QA tests (PD-QA1 closed by DEV round 4c) + 1 test-fixture defect (fixed in round 3) |
| Idempotency | 23/23 corpus files |
| Honesty | tool-report ↔ disk-bytes delta 0 on 23/23 corpus files |

---

## 6. Evidence Files

| Artifact | Location |
|----------|----------|
| Fresh corpus audit summary (23 files × 2 runs) | scratch `qa406/audit-v3-summary.json` (temp workspace; repo originals untouched) |
| Full-suite vitest log | scratch `qa406/vitest-full-rerun2.log` |
| QA test files | `extension/src/tools/drawio/__tests__/{drawio-session-root-binding,drawio-final-gate,drawio-scope-args,drawio-corridor-invariants,drawio-xml-rewrite,drawio-session-root-f4}.test.ts` + `extension/src/services/__tests__/fs-guards.symlink-file.test.ts` |
| Security regression locks | `extension/src/tools/drawio/__tests__/drawio-security.test.ts` (7 tests) |
| Corpus originals (CONTENT edits owned by ba-agent: lane titles / Yes-No labels; geometry untouched by dev) | `documents/SA4E-406/diagrams/*.drawio` (23 files) |
| Execution tracker | `documents/SA4E-406/TEST-REPORT-SA4E-406.csv` |

**Evidence method:** every corpus measurement was produced on TEMP COPIES of the repo diagrams (audit-v3 harness, mkdtemp dir, allowlisted `MCP_WORKSPACE_ROOTS`); the repo originals were never written by the audit — the measured input state still contains the pre-fix defects (e.g. 451 off-grid vertices across the 23 originals), proving originals were untouched. Content edits present in some originals (lane titles, Yes/No branch labels) are CONTENT-OWNED work by ba-agent; dev touched geometry only.

---

## 7. Conclusion

✅ **PASS** — All automated tests pass (0 failures); no test remains skipped due to an unresolved production defect (QA-11 re-enabled and passing; PD-QA1 closed by DEV round 4c). The STORY 7 tool-owned guarantees are verified end-to-end and the tool's reporting is honest by measurement. The F1/F2/F4 hardening tests (QA-16..QA-19) are green; regression lock QA-20 (`drawio-ports-only-positions.test.ts`) guards the PD-QA1 fix. Remaining items (not blocking the automated verdict): (1) completion of manual SIT-01..08 (scheduled 2026-11-13/14); (2) triage of the 15 accepted corpus residuals (§4.2) for follow-up tickets. The 6 env-gated live-proxy skips are environment-gated, not defect-gated.

---

## Appendix A: Re-Test History

### Timeline Overview

| Round | Date | Scope | Outcome |
|-------|------|-------|---------|
| 1 | 2026-11-11 | Dev-round verification: 21-test drawio suite, detector precision, ELK, migration | Green; 8 QA verification files staged |
| 2 | 2026-11-11/12 | 9-defect corpus audit (temp copies): off-grid, mxfile, idempotency, security benchmarks | Baseline numbers for §4.3 'Before'; suite green (453 files) |
| 3 | 2026-11-12 | Fix residual failures; full-suite re-run; docs regeneration | 2 failures resolved (1 fixture fix + 1 production defect documented+skipped); full suite green |
| 4 | 2026-11-12 | QA follow-up: re-enable QA-11 (still fails — PD-QA1 open); add F1/F2/F4 hardening tests; full-suite re-run; docs regeneration | QA-11 still FAILS (enforceFinalGate verify-loop.ts:87 re-snaps without opts) → left skipped; F1/F2/F4 green (QA-16..19); full suite green |
| 5 | 2026-11-12 | QA FINAL: DEV round 4c fix lands (portsOnly through enforceFinalGate); re-enable QA-11; add QA-20 regression lock; full-suite re-run; docs regeneration (STP/STC v2.2, TEST-REPORT v3.2) | QA-11 PASS (node c stays 400,80; status=partial; node_proximity reported); PD-QA1 → CLOSED; full suite 462 files / 3,602 passed / 6 skipped (3,608), 0 failures; verdict → PASS |

### Round 3 — 2026-11-12 (final)

| Failure | Diagnosis | Resolution |
|---------|-----------|------------|
| drawio-corridor-invariants.test.ts > 'an unrelated edge-less band never becomes a corridor' — band_oversize flagged on fixture | Fixture band was genuinely oversized per the band budget: 400×180 = 72,000 px² ≥ MIN_BAND_AREA 60,000, single 120×60 child → fill 0.1 < MIN_FILL 0.2 (drawio-detect-structure.ts:18-21). Detector correct; defect class orthogonal to the corridor invariant under test | **Test fixture fixed** (band 200×150 = 30,000 px² < 60,000), expectation unchanged — test passes |
| drawio-scope-args.test.ts > scope='ports' fan test — node c moved (400,80)→(400,100) | **REAL production defect PD-QA1** (§4.1): final-gate debunch runs on the ports-only path, violating FSD 'keep all node positions' | **Test skipped with TODO + evidence**; production code NOT touched (QA role boundary). Re-enable after DEV fix |

Post-fix (round 3): drawio suite 21 files / 158 pass + 1 skipped; full suite 458 files / 3,586 pass + 7 skipped, 0 failures.
Post-follow-up (round 4, this session): drawio suite 23 files / 168 pass + 1 skipped (QA-11/PD-QA1); full suite 460 files passed | 1 skipped (461) / 3,599 tests passed | 7 skipped (3,606), 0 failures.

### Round 4 — 2026-11-12 (QA follow-up, this session)

| Item | Detail | Outcome |
|------|--------|---------|
| QA-11 re-enabled | `it.skip` dropped in drawio-scope-args.test.ts, assertions unchanged | **FAILS** — node c moves 400,80→400,100 (`expected 100 to be 80` at drawio-scope-args.test.ts:84) because `enforceFinalGate(filePath)` in drawio-verify-loop.ts:87 re-snaps without `opts` → `debunch()` re-runs on ports-only path | Left **skipped**, updated TODO; PD-QA1 still OPEN |
| F1 drawio-xml-rewrite | `rewriteCells()` batch rewriter + 9 vitest tests incl. 2,000-cell timing guard | ✅ PASS — primitive 158,092 ms → 26 ms; sanitize 122,992 ms → 836 ms; preflight 887 ms; output byte-identical |
| F2 fs-guards symlink | `checkSymlinkGuardForPath` file-level symlink escape + 3 vitest tests | ✅ PASS |
| F4 session-root threading | handlers accept `ctx`, forward `ctx?.sessionRoot` + drawio-session-root-f4.test.ts | ✅ PASS |
| Full suite | `npx vitest run` | 460 files passed | 1 skipped (461); 3,599 passed | 7 skipped (3,606); 0 failures |

### Round 5 — 2026-11-12 (QA FINAL, this session)

| Item | Detail | Outcome |
|------|--------|---------|
| QA-11 re-enabled | `it.skip` removed in drawio-scope-args.test.ts, assertions unchanged | ✅ **PASS** — node c stays (400,80), honest `status='partial'`, `node_proximity` reported, 3 distinct anchors (0.25/0.5/0.75); PD-QA1 → CLOSED |
| QA-20 regression lock | New file drawio-ports-only-positions.test.ts (2 tests) | ✅ PASS — positions preserved through apply+verify+final-gate; final-gate invariants enforced on ports path |
| Fix references | drawio-verify-loop.ts:50-54/79/86-89; drawio-apply-validate.ts:79-86; drawio-grid-snap.ts:23-33 | Forward `portsOnly` through `enforceFinalGate` → `snapDiagramToGrid` skips `debunch` on ports path |
| Full suite | `npx vitest run` | 462 files / 3,602 passed / 6 skipped (3,608), 0 failures (6 skips = env-gated live-proxy, 0 defect-gated) |
| Verdict | TEST-REPORT v3.2 | ✅ PASS (no test skipped due to unresolved production defect) |



---

**QA Lead**: QA Agent  
**Date**: 2026-11-12  
**Status**: ⚠️ CONDITIONAL PASS — PD-QA1 open (Major, QA-11 skipped), F1/F2/F4 hardening green, manual SIT pending
