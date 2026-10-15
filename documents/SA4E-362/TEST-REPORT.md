# Test Execution Report — SA4E-362

## Ingest Auth Hardening — Token Refresh, Auth-Dead Pipeline Stop, Static-Token Audit

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-362 |
| Title | Ingest Auth Hardening (refresh-once-on-401, typed IngestAuthError, BFS auth-dead stop, GAP4 wiring, UT-13 header fix) |
| Executed By | QA Agent (independent verification — dev numbers re-run, not trusted) |
| Date | 2026-10-16 |
| Environment | Windows, Node v24.8.0, vitest 4.1.8, tsc — extension/ (VS Code extension), branch working tree SA4E-365 (mixed WIP: SA4E-362 + SA4E-364 + SA4E-365) |
| Overall Verdict | **✅ PASS — Automated scope 16/16 green; 1 external failure attributed to SA4E-364 WIP; SIT-01/02 pending UAT human gate** |
| Re-test Rounds | 1 (no defects — no re-tests needed) |

---

## 1. Executive Summary

Independent re-execution confirms the dev self-report: compile clean, full suite 2963/2964, and all 51 SA4E-362 targeted tests green across 6 files. All 16 automated TCs in STC v1.1 have implementing tests that PASS. The sole suite failure (pi-session-routing.test.ts) is demonstrated to be outside the SA4E-362 change-set. No new defects.

## 2. Execution Summary

### 2.1 Compile

| Check | Command | Result |
|-------|---------|--------|
| TypeScript compile | npm run compile (extension/) | **exit 0, 0 errors** (evidence/compile.log) |

### 2.2 Full Suite (npx vitest run)

| Metric | Value |
|--------|-------|
| Test Files | 304 passed / 305 (1 failed) |
| Tests | **2963 passed / 2964** (99.97%) |
| Duration | 164.72s |
| Failed file | src/pi-workflow/__tests__/pi-session-routing.test.ts (1 of 3 tests) — see §4 |

### 2.3 SA4E-362 Targeted Run (6 files, 51/51 PASS)

| Test File | Tests | Result |
|-----------|-------|--------|
| src/services/__tests__/PegaStreamIngester.auth-retry.test.ts | 13 (UT-01..07, UT-14, SEC-02, PBT-01) | ✅ 13/13 |
| src/services/__tests__/PegaBfsPipeline.auth-dead.test.ts | 2 (UT-08, UT-09) | ✅ 2/2 |
| src/code-intel/delta/__tests__/BackendHttpPoster.test.ts | 6 (3 legacy + UT-10a/b/c) | ✅ 6/6 |
| src/auth/__tests__/auth-manager.test.ts | 26 (25 legacy + UT-12) | ✅ 26/26 |
| src/services/__tests__/IndexingService.ingest-auth.test.ts | 3 (UT-11 ×3) | ✅ 3/3 |
| src/services/__tests__/PegaSchemaIndexer.auth.test.ts | 1 (UT-13) | ✅ 1/1 |
| **Total** | **51** | **✅ 51/51** |

## 3. TC Status Rollup (STC v1.1 — 16 automated TCs)

| Level | Count | PASS | FAIL | BLOCKED/MISSING |
|-------|-------|------|------|-----------------|
| UT (UT-01..UT-14) | 14 | 14 | 0 | 0 |
| PBT (PBT-01) | 1 | 1 | 0 | 0 |
| REG (REG-13) | 1 | 1 | 0 | 0 |
| **Total automated** | **16** | **16 (100%)** | 0 | 0 |

Every automated TC has a located implementing test (test names embed the TC ID, e.g. "UT-12 — concurrent refresh dedupe"). Full per-TC evidence in test-data/TEST-REPORT-SA4E-362.csv (Status=PASS ×16, Evidence=test file path, Executed 2026-10-16).

Remaining manual scope: E2E-API-01..04 (Covered-by-SIT) and SIT-01/SIT-02 — **pending UAT human gate** (require TTL=60s temp build + mid-job refresh-token revoke; not automatable in CI per STP §2.2).

## 4. External Failure Attribution (pi-session-routing.test.ts)

**Evidence (git diff --stat, working tree):** 5 files, +26/−4 — src/pi-workflow/pi-agent-session-host.ts, pi-event-mapper.ts, pi-provider-types.ts, pi-workflow-adapter.ts, types/executor.types.ts. These are **SA4E-364 session-routing WIP files, untouched by SA4E-362**. Failing test: "PiWorkflowAdapter session routing (local vs cloud) > cloud provider with key routes to the session path" (src/pi-workflow/__tests__/pi-session-routing.test.ts). **Verdict: failure attributed to SA4E-364 WIP (external), NOT the SA4E-362 change-set.** SA4E-362 production files (PegaStreamIngester, PegaBfsPipeline, PegaHttpClient, IndexingService, PegaSchemaIndexer, BackendHttpPoster, backend-auth-headers, PegaBackendClient, auth-manager) are all green in-suite.

## 5. Defects

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| — | — | No new defects found in SA4E-362 scope | — |

## 6. Quality Gate

| Gate | Result |
|------|--------|
| Compile 0 errors | ✅ |
| Targeted SA4E-362 tests 51/51 | ✅ |
| Automated RTM execution 16/16 PASS | ✅ |
| REG-13 SM-6 audit (0 static-token path on /api/v1/pega/*) | ✅ — all call sites provider/withAuthRetry-wrapped (PegaCatalogIndexer→IndexerHttpClient; CodeIntelDiscovery/SchemaIndexer/StreamIngester/PegaBackendClient→withAuthRetry; BulkCheckClient/panel receive caller-built provider headers) |
| Regression (legacy 3 BackendHttpPoster tests, 26 legacy auth-manager tests) | ✅ green |
| Zero-tolerance gate (no TC without implementing test) | ✅ 16/16 located |

## 7. UAT Readiness Statement

Automated scope is complete and green — code is ready for UAT. SIT-01 (TTL=60s → exactly 1 refresh mid-job, 0 spam) and SIT-02 (revoke refresh token mid-job → graceful stop, incremental rerun) require a human tester with a temporary ACCESS_TTL_SEC=60 build and a revocable Pega refresh token; they remain the UAT entry gate. E2E-API-01..04 auth contracts execute within SIT-01 per STP §2.2 justification.

## Appendix A — Re-test History

No re-tests needed — first independent execution round, zero defects.

---

## UAT Execution (API-level) — 2026-10-16 · v1.1

Thực thi bởi SM Agent theo ủy quyền của user. Môi trường: backend live (`CODE_INTEL_REQUIRE_AUTH=true`, TTL=60s tạm — đã revert), PostgreSQL sa4e_db local.

| Scope | Kết quả |
|-------|---------|
| Part A — Automated re-run (16 TCs) | ✅ 2977/2977 tests PASS (309 files) |
| Part B — SIT-01 refresh mid-job (API-level) | ✅ expired → 401 `Invalid or expired token` → refresh rotation → retry 201 success |
| Part B — SIT-02 revoke refresh (API-level) | ✅ logout → refresh 401; garbage → 401 no crash (auth-dead path) |
| Part C — E2E-API-01..04 | ✅ 13/13 API checks PASS (xem UAT-CHECKLIST §0) |
| Part D — UX spot-checks | ✅ verified qua automated tests + API-level; IDE-visual DEFERRED (không có Pega server/IDE trong env) |

**Defects mới: 0.** RTM: 22/22 TCs PASS (16 automated + 6 API-level UAT). Residual: trình diễn end-to-end với Pega server thật — script sẵn sàng trong UAT-CHECKLIST Part B.
Evidence: `evidence/uat-api-results.json` (13 checks), `uat-api-transcript.txt`, `run-uat-api.ps1`, `uat-partA-full-suite.log`, `uat-backend.log`.
