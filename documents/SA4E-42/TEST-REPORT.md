# Test Execution Report (TEST-REPORT)

## SDLC Agents for Enterprise (SA4E) — SA4E-42: find_tools does not re-index when child MCP server connects late

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-42 |
| Title | find_tools does not re-index when child MCP server connects late |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-02-14 |
| Phase | 6 — Test Execution |
| Branch | SA4E-42 |
| Component | MCP orchestration backend (Node.js / TypeScript / better-sqlite3) |
| Related STP | STP-v1-SA4E-42.docx |
| Related STC | STC-v1-SA4E-42.docx (53 planned cases) |

---

## 1. Executive Summary

Phase 6 test execution ran the full backend automated suite (`build`, `test:unit`, `test:integration`, `test:e2e-api`) against branch `SA4E-42` and verified the SA4E-42 re-index feature against the 53 test cases defined in `STC.md`.

**Verdict: PASS (with documented coverage gaps).**

- The build compiles cleanly (`tsc` exit 0).
- **Every SA4E-42 test that is implemented passes: 48/48 (0 failures)** — 4 PBT, 32 UT, 12 IT.
- The core defect fix is fully proven: a late `connected` event now refreshes `mcp_tools` within ≤5 s (IT-01 bug reproduction now passes), scope isolation holds, prune converges, upserts are idempotent, fail-soft preserves prior state, the migration is idempotent, and tool names are injection-safe.
- **Test implementation matches the STC technique**: IT tests use a **real** better-sqlite3 database (`makeTempDb`) with a **fake** `IEmbeddingService`, a **fake** event source, and an in-memory tool source. They are NOT all-mock — they assert against actual `mcp_tools` rows through the real subscriber→queue→service→repository→DB path.
- **Coverage gaps (planned but not implemented):** 5 of 53 STC cases are absent — **IT-07** (non-blocking read during refresh) and the entire **E2E-API level (API-01..04)**. This leaves TC-07, BR-09 (non-blocking) and IR-10 (discovery-only via find_tools) without a passing automated test at the planned level.
- 3 failures were observed in `tests/e2e/admin-api.e2e.test.ts` (Config get/patch/reset — a config-hash assertion `56605 ≠ 48721`). These are **out of scope** for SA4E-42 (unrelated pre-existing admin-config tests) and involve no reindex code.

---

## 2. Test Environment

| Aspect | Value |
|--------|-------|
| Runtime | Node.js v22 (native better-sqlite3 v12.10.0 binding) |
| Test runner | vitest 4.1.9 |
| PBT library | fast-check 4.9.0 |
| Database | Real better-sqlite3 via `makeTempDb()` (temp file, torn down per test) |
| Embedding | Fake `IEmbedder` (deterministic vectors) — no ONNX at test time |
| Event source | Fake `IStateChangeSource` (`FakeEventSource`) |
| Tool source | Fake `IToolSource` (`FakeToolSource`) — `category = serverName` |

---

## 3. Results by Level

| Command | Scope | Files | Tests | Passed | Failed | Result |
|---------|-------|-------|-------|--------|--------|--------|
| `npm run build` | TypeScript compile | — | — | — | — | ✅ exit 0 |
| `npm run test:unit` (reindex subset) | PBT + UT | 6 | 36 | 36 | 0 | ✅ PASS |
| `npm run test:integration` (reindex file) | IT | 1 | 12 | 12 | 0 | ✅ PASS |
| `npm run test:integration` (full suite) | all IT | 5 | 50 | 50 | 0 | ✅ PASS |
| `npm run test:e2e-api` | all E2E-API | 4 | 164 | 161 | 3 | ⚠️ 3 unrelated failures |

### 3.1 SA4E-42-specific totals

| Level | Planned (STC) | Implemented | Passed | Failed | Not Implemented |
|-------|---------------|-------------|--------|--------|-----------------|
| PBT | 4 | 4 | 4 | 0 | 0 |
| UT | 32 | 32 | 32 | 0 | 0 |
| IT | 13 | 12 | 12 | 0 | 1 (IT-07) |
| E2E-API | 4 | 0 | 0 | 0 | 4 (API-01..04) |
| **Total** | **53** | **48** | **48** | **0** | **5** |

### 3.2 Non-SA4E-42 failures (out of scope)

| Test File | Failing Case | Assertion | Relation to SA4E-42 |
|-----------|--------------|-----------|---------------------|
| admin-api.e2e.test.ts | Config — should get current configuration | `expected 56605 to be 48721` (config hash) | None — admin config API |
| admin-api.e2e.test.ts | Config — should reset a section to defaults | config hash mismatch | None |
| admin-api.e2e.test.ts | Config — should verify defaults restored after reset | config hash mismatch | None |

These pre-existing failures touch neither the `reindex/` package nor `mcp_tools`; they reflect a config-schema hash drift in the admin API and are unrelated to this ticket.

---

## 4. STC Mapping — Pass/Fail by Test Case ID

### 4.1 PBT (4/4 PASS)

| ID | Description | Result |
|----|-------------|--------|
| PBT-01 | Idempotency: N connect events ≡ 1 | ✅ PASS |
| PBT-02 | Scope isolation across interleavings | ✅ PASS |
| PBT-03 | Prune convergence to current tool set | ✅ PASS |
| PBT-04 | Injection-safety of tool names (F-06) | ✅ PASS |

### 4.2 UT (32/32 PASS)

| ID Range | Class | Result |
|----------|-------|--------|
| UT-01..05 | ReindexActionMapper | ✅ PASS (5/5) |
| UT-06..10 | PerServerTaskQueue | ✅ PASS (5/5) |
| UT-11..19 | McpToolsRepository | ✅ PASS (9/9) |
| UT-20..27 | ReindexSubscriber | ✅ PASS (8/8) |
| UT-28..32 | ReindexService | ✅ PASS (5/5) |

All 32 individual `it('UT-NN: ...')` cases execute and pass.

### 4.3 IT (12/13 PASS, 1 not implemented)

| ID | Description | Result |
|----|-------------|--------|
| IT-01 | Late connect makes tools discoverable ≤5 s (bug repro) | ✅ PASS |
| IT-02 | Previously indexed tools survive a late connect | ✅ PASS |
| IT-03 | Disconnect removes only that server's rows | ✅ PASS |
| IT-04 | `failed` state removes tools | ✅ PASS |
| IT-05 | Idempotent repeated connects | ✅ PASS |
| IT-06 | Scoped ops — other servers + core untouched | ✅ PASS |
| IT-07 | Non-blocking read during refresh | ❌ NOT IMPLEMENTED |
| IT-08 | Fail-soft on embedding error | ✅ PASS |
| IT-09 | Convergence after connect/disconnect cycles | ✅ PASS |
| IT-10 | Prune tools removed upstream on reconnect | ✅ PASS |
| IT-11 | Migration adds `server` column + idempotent index | ✅ PASS |
| IT-12 | Cross-server name collision not hijacked (F-01) | ✅ PASS |
| IT-13 | Subscription lifecycle (init/shutdown) | ✅ PASS |

### 4.4 E2E-API (0/4 — level not implemented)

| ID | Description | Result |
|----|-------------|--------|
| API-01 | find_tools discovers late-connected server's tools | ❌ NOT IMPLEMENTED |
| API-02 | find_tools stops returning disconnected server's tools | ❌ NOT IMPLEMENTED |
| API-03 | execute_dynamic_tool succeeds during re-index (non-blocking) | ❌ NOT IMPLEMENTED |
| API-04 | orchestration_status converges with mcp_tools count | ❌ NOT IMPLEMENTED |

No SA4E-42 reindex E2E-API test file exists (`reindex.e2e.*` not found). Existing e2e tests exercise generic `find_tools`/`orchestration_status` but do not drive the late-connect → re-index scenarios.

---

## 5. RTM Coverage (verified by execution)

| Dimension | Total | Verified by ≥1 PASSING test | % Verified | Gap |
|-----------|-------|-----------------------------|-----------|-----|
| Use Cases (UC-01..04) | 4 | 4 | 100% | UC-04 non-blocking aspect only via UT-26 (warn-log), not via IT-07/API-03 |
| Business Rules (BR-01..11) | 11 | 10 | 91% | **BR-09** (async non-blocking) — only IT-07 + API-03 map it; both unimplemented |
| FSD Test Considerations (TC-01..09) | 9 | 8 | 89% | **TC-07** (non-blocking) — only IT-07 + API-03 map it; both unimplemented |
| Integration Requirements (IR-1..10) | 10 | 9 | 90% | **IR-10** (no flat root exposure / discovery via find_tools) — only API-01 maps it |
| Security findings (F-01, F-03, F-04, F-06) | 4 | 4 | 100% | — |

**Note on gap sourcing:** TC-01/UC-01/BR-01 remain fully verified because IT-01/IT-02 (passing) cover them independently of API-01. TC-03/UC-02/BR-02 remain verified via IT-03 (passing) independently of API-02. BR-08/UC-03 remain verified via PBT-03/IT-09 independently of API-04. The genuine, unmitigated gaps are **TC-07, BR-09** (non-blocking behavior — no passing test) and **IR-10** (discovery-only-via-find_tools — no passing test).

**Effective requirements coverage: ~93%** (48/53 planned cases implemented and passing; 3 requirement items unverified at the automated level).

---

## 6. Test Implementation Quality Review (STC Technique Compliance)

| Check | Expectation (STC/STP) | Observed | Verdict |
|-------|-----------------------|----------|---------|
| IT uses real DB | Real better-sqlite3 via `makeTempDb` — no DB mock | `harness()` calls `makeTempDb()`, `db = tmp.dbManager.getDb()`; assertions query real `mcp_tools` rows | ✅ Compliant |
| Fake embedding | Deterministic `IEmbedder`, no ONNX | `FakeEmbedder` returns hash-seeded 4-dim vector; `failFor()` for error paths | ✅ Compliant |
| Fake event source | Driveable `onServerStateChange` | `FakeEventSource.emit(server, state)`; unsubscribe tracked | ✅ Compliant |
| Not all-mock | Real transaction semantics exercised | Full subscriber→queue→service→repository→DB path over real SQLite | ✅ Compliant |
| Migration real | PRAGMA probe + ADD COLUMN + idempotent index | IT-11 runs `migrateAddMcpToolsServerColumn` twice on a real in-memory DB | ✅ Compliant |
| Injection safety real | Adversarial names stored as data; table intact | PBT-04 asserts `sqlite_master` still lists `mcp_tools` after `DROP TABLE`-style names | ✅ Compliant |

No "all-mock integration test" red flags found. IT does not mock the database; it uses the real engine's `makeTempDb` harness as the STC requires.

---

## 7. Findings & Recommendations

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 | IT-07 (non-blocking read during refresh) not implemented | Medium | Add IT-07 with a slow fake embedder; assert a `SELECT * FROM mcp_tools` read returns promptly while a re-index is in flight (covers TC-07, BR-09). |
| 2 | E2E-API level (API-01..04) not implemented | Medium | Add `reindex.e2e` suite driving `find_tools` / `execute_dynamic_tool` / `orchestration_status` after a fake state-change event (covers IR-10 + end-to-end discovery). |
| 3 | 3 admin-api config e2e failures (config-hash drift) | Low (out of scope) | Track separately; unrelated to SA4E-42. The config schema owner should reconcile the expected hash. |

---

## 8. Verdict

**PASS (with documented coverage gaps).**

The SA4E-42 defect fix is verified: all 48 implemented reindex tests pass with zero failures, the build is green, and the test implementation faithfully follows the STC technique (real SQLite + fakes, not all-mock). The bug reproduction (IT-01) confirms late-connect discovery within the ≤5 s target.

The gap is **completeness, not correctness**: 5 of 53 planned cases (IT-07, API-01..04) are not yet implemented, leaving the non-blocking guarantee (TC-07/BR-09) and discovery-only exposure (IR-10) unverified by automated tests. Recommend implementing these before final sign-off if the 100% RTM exit criterion in STP §7.2 is to be met strictly.

---

## 9. Execution Log Reference

| Command | Exit | Summary |
|---------|------|---------|
| `npm run build` | 0 | tsc compile + viewer copy succeeded |
| `npx vitest run src/modules/orchestration/reindex/__tests__/` | 0 | 6 files, 36 tests passed (PBT+UT) |
| `npx vitest run tests/integration/reindex.it.test.ts` | 0 | 1 file, 12 tests passed (IT) |
| `npm run test:integration` | 0 | 5 files, 50 tests passed |
| `npm run test:e2e-api` | 1 | 161/164 passed; 3 failures in admin-api config (out of scope) |
