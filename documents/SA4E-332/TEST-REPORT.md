# Test Execution Report — SA4E-332

## Shared kernel extraction (move McpBridge/providers/stream-handler out of langgraph)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-332 |
| Title | Shared kernel extraction: move McpBridge/providers/stream-handler out of langgraph |
| Epic | SA4E-289 Migrate LangGraph -> Pi SDK (Option C) |
| Executed By | QA Agent |
| Date | 2026-09-27 |
| Environment | Windows workstation, Node v24.8.0, `extension/` (vitest 4.1.11, tsc, ESLint 8.67 flat, madge 8.0.0 pinned npx) |
| Branch / HEAD | `SA4E-332` @ `5537ed7` (kernel `5b05539` + scope-narrow `5537ed7` on top of `1721971` decommission) |
| Overall Verdict | **⚠️ CONDITIONAL PASS — merge allowed; Pi production wiring blocked until carried-High hardening tickets land** |
| Re-test Rounds | 0 (all executed tests green on first run; 5 TCs NOT_RUN with compensating UT coverage — see §1 notes) |

---

## 1. Executive Summary

Phase 6 re-executed all SA4E-332 gates on the post-narrow tree: full extension suite **2077 passed + 20 todo (221 files passed, 2 skipped)** — identical to DEV gates; targeted kernel/provider/extension/Pi suites all green; `tsc`/`eslint`/`madge` clean; all move-grep gates at 0 except the single documented `panels/workflow-panel.ts:11` exclusion (yielded to SA4E-289). Of 37 STC cases, **32 PASS, 0 FAIL, 5 NOT_RUN** (3 PBT property harnesses + 2 new E2E scoping files were never implemented; their assertions are covered deterministically by passing UTs). Security: **0 new findings** — 4 Highs from 3.7 resolve to 3 carried + 1 closed (SEC-332-09 fail-closed verified in code), residual Mediums/Lows tracked as SA4E-289 production-wiring blockers, not merge blockers.

| Level | Total | Passed | Failed | Not Run | Pass Rate (executed) |
|-------|-------|--------|--------|---------|----------------------|
| Automated (PBT + UT + IT) | 25 | 22 | 0 | 3 | 100% |
| E2E-API | 4 | 2 | 0 | 2 | 100% |
| Manual SIT | 8 | 8 | 0 | 0 | 100% |
| **Total** | **37** | **32** | **0** | **5** | **100% (32/32)** |

NOT_RUN rationale (not failures): PBT-01/02/03 — no fast-check property files exist under `src/mcp/` or `src/pi-agent/` (verified by grep; fast-check ^4.9.0 is a devDependency used elsewhere); behavior covered by UT-04 (recursion incl. arrays), UT-10 (floor/shapes), UT-01 (timeout). E2E-API-03/04 — specified new files `pi-hang-fails-fast.e2e.test.ts` / `pi-search-resilience.e2e.test.ts` were never created (verified absent); behavior covered by UT-07g (timeout → `mcp_error` with cause) and UT-08 (retry/fail-open/dedupe). Recorded as test-debt follow-up, non-blocking for merge.

---

## 2. Automated Test Results

### 2.1 Execution

```
# Full suite (from extension/)
npm test                                  # vitest run
# Targeted suites re-run by QA
npx vitest run src/mcp/__tests__/
npx vitest run src/mcp/providers
npx vitest run src/pi-agent/extensions/__tests__/
npx vitest run src/pi-workflow src/pi-agent
npm run test:e2e                           # vitest run --config vitest.e2e.config.ts
# Build / lint / cycle gates
npm run compile                            # tsc -p ./
npm run lint                               # npx eslint src/
npx -y madge@8.0.0 --circular src/mcp/
```

| Metric | Result |
|--------|--------|
| Total tests (full) | 2097 (2077 passed, 20 todo) |
| Test files (full) | 223 (221 passed, 2 skipped) |
| Failed | 0 |
| Duration (full) | 85.75s |

### 2.2 SA4E-332 Test Breakdown

| Category | Count | Status |
|----------|-------|--------|
| Property-Based Tests (PBT-01 to PBT-03) | 3 specified, 0 implemented | ⚠️ NOT_RUN — covered by UT-01/04/10 (see §1) |
| Unit Tests (UT-01 to UT-12) | 12 | ✅ All pass (via suites below) |
| Integration / Move Gates (IT-01 to IT-10) | 10 | ✅ All pass (1 documented exclusion — IT-02) |

Targeted suite evidence (QA re-run, all exit 0):

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| `src/mcp/__tests__/` (UT-01→06, stream) | 3 passed | 30 passed | ✅ |
| `src/mcp/providers` (UT-11/12 + matrix) | 11 passed | 134 passed | ✅ |
| `src/pi-agent/extensions/__tests__/` (UT-07 policy) | 1 passed | 14 passed | ✅ |
| `src/pi-workflow` + `src/pi-agent` (UT-07/08, budget, search) | 63 passed | 435 passed | ✅ |
| E2E (`drawio-convert`, `cross-process` on `../mcp/mcp-bridge`) | 2 passed | 2 passed, 1 skipped | ✅ |

Move-gate evidence (QA re-run with `rg`):

| Gate | Check | Result |
|------|-------|--------|
| IT-01 | `langgraph/core/mcp-bridge`, `mcp-bridge\.js`, `\.\./core/mcp-bridge` in `extension/src/*.ts` | 0 / 0 / 0 ✅ |
| IT-02 | `from.*langgraph/` outside `src/langgraph/` | 1 hit = `panels/workflow-panel.ts:11` (sole documented exclusion, yielded to SA4E-289) ✅ conditional |
| IT-02 | `require.*langgraph` outside `src/langgraph/` (SEC-332-05) | 0 ✅ |
| IT-02 | `langgraph/core/llm-provider(.js)?` outside legacy | 0 ✅ |
| IT-03 | wrapper symbols in pi-agent/pi-workflow prod (excl. tests) | 0 ✅ |
| IT-04 | `npm run compile` from `extension/` | exit 0 ✅ |
| IT-05 | tree `npm run lint` | exit 0 ✅; temp fixture outside legacy FAILS with exact SA4E-332 FROZEN message (exit 1, fixture removed after) ✅ |
| IT-06 | `ApiKey`-literal scan (mcp+pi-agent+pi-workflow) | 0 ✅ |
| IT-06 | `127.0.0.1:9181` in `*.ts` | 1 hit = `proxy/__tests__/global-fetch-patch.test.ts:138` (pre-existing bypass-fixture, out of SA4E-332 scope — see §2.3) ✅ with note |
| IT-07 | `extension/tests/mcp-bridge.test.ts/.js` + `require.*base-node` | deleted / 0 ✅ |
| IT-08 | `vscode/tool-registry` in `src/mcp/`; `madge --circular src/mcp/` | 0 / 0 cycles (75 files) ✅ |
| IT-10 | `interface McpToolDefinition` definitions | exactly 1 (`mcp-types.ts:9`) ✅ |

### 2.3 Non-SA4E-332 Failures (Excluded)

None — zero failures in the full run. Two observations (not failures, not defects):

| Item | Location | Reason not a SA4E-332 defect |
|------|----------|------------------------------|
| `127.0.0.1:9181` test-fixture URL | `extension/src/proxy/__tests__/global-fetch-patch.test.ts:138` | Pre-existing proxy bypass test asserting loopback goes direct; `proxy/` untouched by SA4E-332; scoped IT-06 gate (mcp+pi-agent+pi-workflow) is 0 |
| README doc mention of `127.0.0.1:9181` | `extension/src/langgraph/README.md:17` | Documentation ("Never hard-code…"), not a code literal; FROZEN notice working as intended |

---

## 3. Manual SIT Results (Final)

### 3.1 Environment

| Component | Location | Status |
|-----------|----------|--------|
| Repo / branch | `SA4E-332` @ `5537ed7` | ✅ Checked out, HEAD verified |
| Extension toolchain | `extension/` (Node v24.8.0, vitest 4.1.11) | ✅ Running, all suites executed |
| Kernel | `extension/src/mcp/` (bridge, caller, types, providers, budget) | ✅ Present per TDD §5.1 layout |
| Login | N/A (no UI change — E2E-UI = 0 by design) | ➖ Not applicable |

### 3.2 Results Summary

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| SIT-01 | Import-only diff review | High | ✅ PASS | `mcp-bridge.ts` rename 95% similarity, 4 import lines only; all other non-import lines within allowlist (type-owner move, caller/types NEW, signature threading, README+lint) |
| SIT-02 | History preserved | Medium | ✅ PASS | `git log --follow` on `mcp-bridge.ts` shows `5b05539` + ancestors; `git mv` renames confirmed |
| SIT-03 | Policy parity exploratory | High | ✅ PASS | 14-test extension suite green; allowlist/chaining/approval/audit assertions identical; EF-6 layers separate |
| SIT-04 | Fail-open approval (SEC-332-03) | High | ✅ PASS | `:87` auto-approved without hook confirmed (carried, documented); fail-closed throw `:158-160` verified |
| SIT-05 | Validation-audit gap (SEC-332-04) | Medium | ✅ PASS | Gap confirmed (validation branch has no `audit(`); follow-up ticket required before prod wiring |
| SIT-06 | Interceptor parity witness | High | ✅ PASS | No `realpath`/`basename`/size-cap added in move diff (honest carry); frozen strings intact |
| SIT-07 | README FROZEN check | Medium | ✅ PASS | FROZEN header, no-new-importers rule, kernel paths as built, SA4E-289/332 refs, token/URL hygiene — all present |
| SIT-08 | Merge-condition sign-off | High | ✅ PASS | IT-05/07/09/02 evidence recorded in §2.2; follow-ups tracked in §5 |

**Final SIT Pass Rate: 8/8 = 100%**

### 3.3 Detailed Test Execution

#### SIT-01: Import-only diff review ✅ PASS

- `git diff 79579bc..5b05539 --stat`: 68 files, moves + adapter + config + deletions only.
- `mcp-bridge.ts` diff: rename (95% similarity), exactly 4 import lines changed (`../`→`../../` depth + `./mcp-types` owner); frozen constants (`60_000`, `10_000`, `Proxy Error` strings) untouched.
- Remaining non-import changed lines: `McpToolDefinition` delete + re-export, `mcp-bridge-caller.ts` NEW (18 lines), `mcp-types.ts` NEW, `createMcpSearchProvider`/`createExecuteHandler` signature threading, test re-mock (`mockMcpClient`→`mockBridge`), README FROZEN, lint config — all within the STC allowlist.
- Narrow diff `1721971..5537ed7`: 6 files (panel revert + exclusion + docs) — the DISC-04 deviation, recorded in §5.

#### SIT-02: History preserved ✅ PASS

- `git log --follow -- extension/src/mcp/mcp-bridge.ts` returns `5b05539` plus pre-move ancestors — `git mv` semantics honored, no copy+delete break.

#### SIT-03: Policy parity exploratory ✅ PASS

- `src/pi-agent/extensions/__tests__/`: 14/14 pass — allowlisted exec, chaining-deny (default + inner-target), approval grant/deny, keys-only audit assertions identical to pre-cutover.
- Pi approval flow and LangGraph `ToolApprovalGate` remain separate layers (EF-6 intact).

#### SIT-04: Fail-open approval check ✅ PASS

- `mcp-bridge-extension.ts:87`: absent-hook auto-approve confirmed — carried fail-open documented, NOT fixed in move (per design).
- Production control verified: `BridgeOptions.serverManager` required + fail-closed throw present (`:158-160`).
- Follow-up (fail-closed when hook missing for gated tools, or explicit risk acceptance) must be filed before SA4E-289 production wiring.

#### SIT-05: Validation-audit gap check ✅ PASS

- Validation-fail branch returns `validation` payload with no `audit(` call (other deny branches all audit) — A09 gap confirmed as carried.
- One-line fix (`audit({toolName, argKeys, decision:"denied"})`) assigned to separate ticket; FSD BR-13 claim annotated false-for-this-branch until fix.

#### SIT-06: Interceptor parity witness ✅ PASS

- `_as_path` (`:62-80`) and `_base64_file` (`:82-109`) code paths byte-identical post-move; cross-checked move diff adds no containment/`basename`/size-cap — vulnerabilities carried honestly (SEC-332-01/02/08/10).
- Pi `_as_path` amplification (LLM-controlled params now reach file-read) explicitly tracked to P1 follow-up before production wiring.

#### SIT-07: README FROZEN content check ✅ PASS

- `extension/src/langgraph/README.md` (19 lines): FROZEN header; no-new-code/importers rule; kernel paths as built (`mcp-bridge.ts` + `mcp-types.ts`, `llm-provider.ts`, `stream-handler.ts`, `state-types.ts`, `providers/*`, `context-budget`); SA4E-289/SA4E-332 refs; token/URL hygiene (`SecretStorage`, settings, `IServerManager.port`/`mcpServerPort`/`mcpServerUrl`, never hard-code `127.0.0.1:9181`).

#### SIT-08: Merge-condition sign-off ✅ PASS

- IT-05 fixture-FAIL + tree-PASS recorded (§2.2); IT-07 stale files deleted; IT-09 fail-closed verified; IT-02 `require` gate 0 with single listed exclusion.
- Follow-ups for SEC-332-01/02/03/04/08/10 required as SA4E-289 production-wiring blockers (§5); move itself not blocked (0 Critical, 0 new surface).

---

## 4. Defect Summary

> No new defects found during test execution. All 32 executed TCs passed on first run.

Two pre-existing scope observations carried as tracked follow-ups (not test-execution defects):

### OBS-01: PBT + hang/search E2E harnesses never implemented — OPEN (test debt, non-blocking)

| Field | Value |
|-------|-------|
| Severity | Minor |
| Priority | P3 |
| Test Case | PBT-01/02/03, E2E-API-03/04 |
| Component | `extension/src/mcp/__tests__/`, `extension/src/__tests__/` (missing files) |
| Status | **OPEN** |

**Description:** STC-specified fast-check properties (1000+/500+ runs) and two new E2E scoping files do not exist; only deterministic UT coverage exists for those assertions.

**Root Cause:** DEV implemented behavior moves + re-mocks but no new property/e2e harness files.

**Fix:** Add 3 fast-check property specs + 2 e2e scoping files under a follow-up ticket (SA4E-289 test hardening); merge not blocked — compensating UT coverage passes.

### OBS-02: Fail-closed `serverManager` throw has no unit test — OPEN (assurance gap, Low)

| Field | Value |
|-------|-------|
| Severity | Minor |
| Priority | P3 |
| Test Case | IT-09 (partial) |
| Component | `extension/src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts` |
| Status | **OPEN** |

**Description:** SEC-332-09 fix verified in code (`:158-160`) and by QA gate, but no test asserts the throw — a future refactor could silently reintroduce fallback (matches 5.7 Finding #11).

**Fix:** One `it('fail-closed: throws without serverManager', …)` case in the extension suite; recommend in-ticket follow-up.

---

## 5. Security Conditions (Phase 5.7 post-implementation assessment)

Source: `SECURITY-ASSESSMENT.md` v1.0 (static code review on HEAD `5537ed7`; direct reads, DEV report not trusted) against `SECURITY-REVIEW.md` v1.0 (Phase 3.7, CONDITIONAL PASS, 0 Critical / 4 High / 5 Medium).

### 5.1 Four Highs (3.7) → status after 5.7

| ID | Title | 3.7 Severity | 5.7 Status |
|----|-------|--------------|------------|
| SEC-332-01 | `_as_path` arbitrary file read (no containment), Pi-amplified | High | 🟠 **CARRIED** — byte-identical at `src/mcp/mcp-bridge.ts:62-80`; P1 hardening ticket required before prod wiring |
| SEC-332-02 | `_filename` path traversal on `_base64_file` write | High | 🟠 **CARRIED** — byte-identical at `:95-96`; P1 hardening ticket required |
| SEC-332-03 | Fail-open approval (absent hook = auto-approved) | High | 🟠 **CARRIED** — preserved at `mcp-bridge-extension.ts:87`; fail-closed ticket or risk acceptance + wired hook required |
| SEC-332-09 | `serverManager` fail-closed (conditional) | High (conditional) | ✅ **CLOSED** — throw implemented (`:158-160`); `grep 127.0.0.1:9181` in scope = 0; wrapper deleted |

**Result: 3 carried + 1 closed, 0 new Highs introduced by the move (proven by 4-line import-only diff on `mcp-bridge.ts`).**

### 5.2 Residual Mediums / Lows

| ID | Severity | Status |
|----|----------|--------|
| SEC-332-04 validation-without-audit | Medium | Carried — one-line fix in separate ticket (blocks prod wiring) |
| SEC-332-05 `require()` lint bypass | Medium (residual) | Compensated by CI grep gate (0 verified); in-IDE enforcement open |
| SEC-332-08 unbounded base64 decode | Medium | Carried — cap + random-suffix ticket (blocks prod wiring) |
| SEC-332-10 TOCTOU + path-in-log | Medium | Carried — hygiene ticket |
| SEC-332-06 lint-runnable | Medium → closed core, Low residual | ✅ Core closed (script fixed, override added); residual: `**/*.js` ignore remains (0 checked-in `.js` today) |
| SEC-332-07 loopback defaults (8990/11434) | Low | Carried, accepted (loopback-only, allowlisted) |
| SEC-332-11 stale `.js` | Low → closed | ✅ Deleted + verified |
| SEC-332-12 madge supply-chain | Low | Residual — pin or shasum-verify; paired with `require` grep |
| OBS-332-11 fail-closed test gap (5.7 Finding #11) | Low (new) | Open — tracked as OBS-02 above |

### 5.3 Known deviations (scope-narrow)

- **DISC-04 (new, scope-narrow):** SM decision to yield Workflow Graph UI panel to SA4E-289 (merge-first). Commit `5537ed7` reverts `panels/workflow-graph-data.ts` move and restores `workflow-panel.ts` legacy import. BRD/FSD/TDD/STP/STC intentionally NOT amended — deviation recorded here.
- **Exclusion `src/panels/workflow-panel.ts:11`:** the ONLY `from.*langgraph/` outside `src/langgraph/` in the tree; target is zero-import pure data pending SA4E-289 deletion. Mirrored in `eslint.config.js:38` (single-file, commented override) and `ci-sa4e-332.yml` TC-MOVE-02 exclusion. Condition: DO NOT extend; SA4E-289 deletes both files. Its CSP `unsafe-eval` (three.js) dies with the panel.

---

## 6. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| UT Pass Rate | 100% (12/12) | 100% (12/12) | ✅ Met |
| IT Pass Rate | 100% (10/10) | 100% (10/10, 1 listed exclusion) | ✅ Met |
| E2E-API Pass Rate (executed) | 100% | 100% (2/2) | ✅ Met |
| SIT Pass Rate | 100% (8/8) | 100% (8/8) | ✅ Met |
| Executed Pass Rate | ≥95% | 100% (32/32) | ✅ Met |
| TC Execution Rate | 100% (37/37) | 86% (32/37; 5 NOT_RUN with UT cover) | ⚠️ Partial — test-debt follow-up |
| Critical Defects | 0 | 0 | ✅ Met |
| Major Defects | 0 | 0 | ✅ Met |
| Open Defects (new) | 0 | 0 (2 Minor observations tracked) | ✅ Met |
| RTM Coverage | 100% | 100% (every req has ≥1 TC; §App-B) | ✅ Met |
| NFR Parity (60s/10s, 50ms/100, 4/2000/85/95) | 100% | 100% (constants + strings verified) | ✅ Met |

---

## 7. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| `documents/SA4E-332/TEST-REPORT-SA4E-332.csv` | Per-case execution tracking (37 rows) | §1, App-B |
| `documents/SA4E-332/testdata/*.csv` (7 files, 114 rows) | Test data covering every TC ID | §1, App-B |
| `extension/src/mcp/__tests__/` (3 files, 30 tests) | UT-01→06 + stream evidence | §2.2 |
| `extension/src/mcp/providers/` (11 files, 134 tests) | UT-11/12 + provider matrix evidence | §2.2 |
| `extension/src/pi-agent/extensions/__tests__/` (14 tests) | UT-07 policy-parity evidence | §2.2, SIT-03 |
| `extension/src/__tests__/drawio-convert.e2e.test.ts`, `cross-process.e2e.test.ts` | E2E-API-01/02 kernel-path evidence | §2.2 |
| `extension/src/langgraph/README.md` | SIT-07 FROZEN wording evidence | §3.3 |
| `extension/eslint.config.js:38` + `.github/workflows/ci-sa4e-332.yml` | Exclusion mirroring evidence | §5.3 |

Full terminal outputs (vitest/tsc/eslint/madge/rg) were observed live during this Phase 6 run and transcribed into §2.2; rerun any command in §2.1 to reproduce.

---

## 8. Conclusion

**Overall Verdict: ⚠️ CONDITIONAL PASS**

| Metric | Result |
|--------|--------|
| Automated tests (UT + IT executed) | 22/22 PASS (100%) |
| E2E-API tests (executed) | 2/2 PASS (100%) |
| Manual SIT tests | 8/8 PASS (100%) |
| New bugs found | 0 |
| New security findings | 0 (3 High carried + 1 closed, per 5.7) |
| Re-test rounds | 0 (first-run green) |
| Critical/Major defects | 0 |

**Recommendation:** Approve merge of `SA4E-332` subject to these conditions before Phase 7 (deployment/UAT handoff):

1. **File hardening follow-ups before SA4E-289 production wiring (block wiring, not this merge):** `_as_path` containment + `_filename`/size-cap (SEC-332-01/02/08/10) and approval fail-closed + validation-audit (SEC-332-03/04).
2. **File test-debt follow-up (non-blocking):** 3 fast-check PBT specs + 2 E2E scoping files (OBS-01) + fail-closed unit test (OBS-02).
3. **Do not extend** the `panels/workflow-panel.ts` exclusion; SA4E-289 deletes both panel files.
4. SM to update `STATUS.json` (`testing.status`) and attach this report + DOCX to Jira.

---

## Appendix A: Re-Test History

> No re-test rounds required — all 32 executed TCs passed on first run; 0 defects raised during execution. The 5 NOT_RUN TCs are implementation gaps (harness files never created), not failures, tracked as OBS-01.

```
Round 1 (Initial, 2026-09-27) → 32/32 executed PASS, 0 bugs found, 5 NOT_RUN (PBT-01/02/03, E2E-API-03/04)
```

| Item | Round 1 | Final |
|------|---------|-------|
| OBS-01 (PBT/E2E harness debt) | 📝 Noted | OPEN (P3 follow-up) |
| OBS-02 (fail-closed test gap) | 📝 Noted | OPEN (P3 follow-up) |

---

## Appendix B: TC Execution Matrix (37 TCs × testdata rows)

| TC | Title | Result | Evidence | Testdata Row(s) |
|----|-------|--------|----------|-----------------|
| PBT-01 | `_as_path` recursion property | ⚠️ NOT_RUN (covered by UT-04) | No fast-check file in scope | `bridge-behavior` PBT-01 |
| PBT-02 | Budget conservativeness | ⚠️ NOT_RUN (covered by UT-10) | No fast-check file in scope | `providers-stream-budget` PBT-02a/b/c |
| PBT-03 | Timeout race property | ⚠️ NOT_RUN (covered by UT-01) | No fast-check file in scope | `bridge-behavior` PBT-03 |
| UT-01 | `callTool` timeout | ✅ PASS | mcp suite 30/30 | `bridge-behavior` UT-01 |
| UT-02 | `listTools` success | ✅ PASS | mcp suite 30/30 | `bridge-behavior` UT-02 |
| UT-03 | `listTools` abort + passthrough | ✅ PASS | mcp suite 30/30 | `bridge-behavior` UT-03a/b/c |
| UT-04 | `_as_path` interceptor | ✅ PASS | mcp suite 30/30 | `bridge-behavior` UT-04a/b/c/d |
| UT-05 | `_base64_file` interceptor | ✅ PASS | mcp suite 30/30 | `bridge-behavior` UT-05a/b/c/d/e |
| UT-06 | Availability guard | ✅ PASS | mcp suite 30/30 | `bridge-behavior` UT-06a/b/c |
| UT-07 | `McpBridgeCaller` + policy | ✅ PASS | extension suite 14/14 | `pi-cutover` UT-07a–g |
| UT-08 | Search resilience | ✅ PASS | pi suites 435/435 | `pi-cutover` UT-08a–d |
| UT-09 | `StreamHandler` semantics | ✅ PASS | mcp suite 30/30 | `providers-stream-budget` UT-09a–d |
| UT-10 | Budget math | ✅ PASS | pi suites (budget) | `providers-stream-budget` UT-10a–d |
| UT-11 | Provider factory | ✅ PASS | providers 134/134 | `providers-stream-budget` UT-11a–d |
| UT-12 | URL guard + secrets | ✅ PASS | providers 134/134 | `providers-stream-budget` UT-12a–d + `security-gates` UT-12-scan |
| IT-01 | Old path gone | ✅ PASS | rg 0/0/0 | `move-gates` IT-01 (3 patterns) |
| IT-02 | No reverse deps | ✅ PASS* | rg import 1*=exclusion; require 0 | `move-gates` IT-02 (*1 listed exclusion) |
| IT-03 | No wrapper consumers | ✅ PASS | rg prod 0 | `move-gates` IT-03 |
| IT-04 | `tsc` clean | ✅ PASS | exit 0 | `move-gates` IT-04 |
| IT-05 | Lint freeze proven | ✅ PASS | tree 0 + fixture FAIL msg | `security-gates` IT-05a–e |
| IT-06 | Secret/URL scan | ✅ PASS* | ApiKey 0; 9181 scoped 0 (*test-fixture note §2.3) | `security-gates` IT-06a–d |
| IT-07 | Stale `.js` gone | ✅ PASS | deleted; base-node 0 | `move-gates` IT-07 |
| IT-08 | Cycle gate | ✅ PASS | registry 0; madge 0/75 files | `security-gates` IT-08a–c |
| IT-09 | `serverManager` fail-closed | ✅ PASS | throw verified `:158-160` | `security-gates` IT-09a–d |
| IT-10 | Single type owner | ✅ PASS | exactly 1 | `move-gates` IT-10 |
| E2E-API-01 | `drawio-convert` kernel path | ✅ PASS | e2e 2 files green; import `../mcp/mcp-bridge` | `pi-cutover` E2E-API-01 |
| E2E-API-02 | `cross-process` kernel path | ✅ PASS | e2e green + clean exit | `pi-cutover` E2E-API-02 |
| E2E-API-03 | Hung Pi tool fails fast | ⚠️ NOT_RUN (covered by UT-07g) | File never created | `pi-cutover` E2E-API-03 |
| E2E-API-04 | Search resilience e2e | ⚠️ NOT_RUN (covered by UT-08) | File never created | `pi-cutover` E2E-API-04a/b/c |
| SIT-01 | Import-only diff review | ✅ PASS | §3.3 excerpt | `manual-sit` SIT-01 |
| SIT-02 | History preserved | ✅ PASS | log --follow | `manual-sit` SIT-02 |
| SIT-03 | Policy parity exploratory | ✅ PASS | 14/14 + wiring read | `manual-sit` SIT-03 |
| SIT-04 | Fail-open approval | ✅ PASS | `:87` + `:158-160` read | `security-gates` SIT-04a/b/c |
| SIT-05 | Validation-audit gap | ✅ PASS | branch read | `security-gates` SIT-05 |
| SIT-06 | Interceptor parity witness | ✅ PASS | diff cross-check | `manual-sit` SIT-06 |
| SIT-07 | README FROZEN check | ✅ PASS | 19-line read | `manual-sit` SIT-07 |
| SIT-08 | Merge-condition sign-off | ✅ PASS | §2.2 + §5 | `manual-sit` SIT-08 |

RTM coverage remains 100% per STC §10 — every requirement retains ≥1 executed passing TC (NOT_RUN TCs are redundantly covered by passing UTs as mapped above).
