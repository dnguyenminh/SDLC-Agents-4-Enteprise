# System Test Plan (STP)

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
| Status | Draft — Test Planning (Phase 4) |
| Related BRD | BRD-v1-SA4E-42.docx |
| Related FSD | FSD-v1-SA4E-42.docx (UC-01..04, BR-01..11, TC-01..09 §10, IR-1..10 §12) |
| Related TDD | TDD-v1-SA4E-42.docx (ReindexSubscriber design, §10 Testing Considerations) |
| Related Security | SECURITY-REVIEW-v1-SA4E-42.docx (F-01..F-07) |
| Issue Type | Bug |
| Component | MCP orchestration backend (Node.js / TypeScript / Hono / better-sqlite3) |
| Architecture Pattern | ai-agent |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-14 | QA Agent | Initial STP from BRD (Stories 1–4), FSD (UC-01..04, BR-01..11, TC-01..09, IR-1..10), TDD (ReindexSubscriber, PerServerTaskQueue, ReindexActionMapper, McpToolsRepository, ReindexService), and SECURITY-REVIEW (F-01, F-03, F-04, F-06). 6-level strategy, RTM 100%. |

---

## 1. Introduction

### 1.1 Purpose

This System Test Plan defines the test strategy, scope, levels, environment, and traceability for verifying SA4E-42 — the fix that makes the `find_tools` semantic index (`mcp_tools`) refresh automatically in response to child MCP server connection state-change events, without a backend restart. It governs the test cases detailed in `STC.md` and feeds the Implementation phase where dev-agent uses it for unit testing.

### 1.2 Scope

**In scope (per TDD §4 / FSD §12):**

- `ReindexSubscriber` — Observer subscription, routing, debounce, enqueue, lifecycle (IR-1, IR-2, IR-8, IR-9).
- `PerServerTaskQueue` — per-server async mutex, 250 ms debounce, fail-soft chain (IR-7, IR-9).
- `ReindexActionMapper` — `newState → ReindexAction` mapping (IR-2, BR-10).
- `ReindexService` — connect/remove orchestration, latest-state guard, embed, latency measurement (IR-3, IR-4, IR-7, IR-8, IR-9).
- `McpToolsRepository` — scoped upsert / prune / delete SQL in one transaction (IR-5, IR-6, BR-03, BR-04, BR-05).
- `schema.ts` additive migration — `server` column + `idx_mcp_tools_server` (IR-6, F-02).
- `OrchestrationModule.initialize/shutdown` wiring (IR-1).
- End-to-end discovery behavior through the MCP surface (`find_tools`, `execute_dynamic_tool`, `orchestration_status`).

**Out of scope (per BRD §1.2):** the semantic ranking algorithm / embedding model internals, `execute_dynamic_tool` routing logic, the SA4E-37 health/auto-reconnect mechanism itself (only consumed via a fake event source), new child servers/transports, and any UI (the backend has none).

### 1.3 Quality Objectives

| Objective | Target | Source |
|-----------|--------|--------|
| Requirements coverage (UC + BR) | 100% mapped in RTM | Quality gate |
| Re-index latency | ≤ 5 s from `connected` event to discoverable | NFR / UC-04 |
| Scope isolation | 0 cross-server or core (`server IS NULL`) mutations | BR-05 |
| Idempotency | Stable row count across N connect cycles | BR-03 |
| Fail-soft | No swallowed exceptions; prior state preserved on failure | BR-06 |
| Security Low findings addressed | F-01, F-03, F-04, F-06 covered by tests | SECURITY-REVIEW |

---

## 2. Test Strategy — 6 Levels

The strategy follows the mandated 6-level model. Because SA4E-42 is a **backend, event-driven, no-UI** feature, two levels are **Not Applicable** with documented justification; effort concentrates on UT, IT, and PBT.

| # | Level | Applicability | Framework / Technique | Focus |
|---|-------|--------------|----------------------|-------|
| 1 | PBT — Property-Based Testing | ✅ Applicable | `fast-check ^4.9.0` + `vitest` | Idempotency, scope-isolation, prune-convergence, injection-safety as invariants over generated inputs |
| 2 | UT — Unit Testing | ✅ Applicable (primary) | `vitest` + fakes (fake `IEmbeddingService`, fake event source, fake logger) | Each class in isolation: `ReindexSubscriber`, `PerServerTaskQueue`, `ReindexActionMapper`, `ReindexService`, `McpToolsRepository` |
| 3 | IT — Integration Testing | ✅ Applicable (primary) | `vitest` + **real better-sqlite3** (`makeTempDb`) + fake event source + fake embedding | Subscriber↔queue↔service↔repository↔real DB together; late-connect, disconnect, idempotent, scope-isolation, non-blocking, migration |
| 4 | E2E-API | ✅ Applicable | `vitest` + in-process MCP client harness (`connectMcp`) | Discovery behavior via real `find_tools` / `execute_dynamic_tool` / `orchestration_status` over the MCP transport |
| 5 | E2E-UI | ❌ **N/A** | — | **Justification:** The orchestration backend is an ai-agent backend with **no UI, no web frontend, no user-facing screens** (BRD §1.2, FSD §7.1). There is no browser surface to drive with Playwright. Consumers are AI agents calling MCP tools, covered fully by E2E-API. |
| 6 | SIT — System Integration Testing | ❌ **N/A** | — | **Justification:** SA4E-42 introduces **no new external system integration** (no new HTTP route, socket, third-party service, or cross-service contract — SECURITY-REVIEW Exec Summary). The only "integration" is an **in-process** event from SA4E-37, exercised deterministically via a fake event source at IT level and via the real MCP surface at E2E-API level. There is no multi-service topology to stand up. |

### 2.1 Why UT + IT + PBT are primary

Per TDD §10 (Testing Considerations): use a **real better-sqlite3 DB** (no DB mock) for repository/integration tests, a **fake `IEmbeddingService`** for deterministic vectors, and a **fake event source** to drive `onServerStateChange`. The core risks — idempotency, scope isolation, `await`-interleaving concurrency, and fail-soft — are best proven at UT (logic in isolation), IT (real SQL + real transaction semantics), and PBT (invariants over many generated event sequences).

### 2.2 Test Pyramid (target distribution)

```
        E2E-API (4)          <- thin, behavior through MCP surface
      IT (13)                <- real DB + fake event/embedding
   UT (32)                   <- broad base, fakes only
 PBT (4)                     <- invariants (idempotency, scope, prune, injection)
E2E-UI (N/A)  SIT (N/A)
```

### 2.3 Test Data & Fakes Strategy

| Element | Approach |
|---------|----------|
| Database | **Real** better-sqlite3 via `makeTempDb()` (SCHEMA_V1 applied); temp file, torn down per test. No DB mock. |
| Embedding service | **Fake** `IEmbeddingService` returning a deterministic fixed-length `Float32Array` (e.g. hash-seeded) — no ONNX at test time. |
| Event source | **Fake** emitter exposing `onServerStateChange(cb): Unsubscribe`, driving `ServerStateChangeEvent` sequences on demand. |
| Client manager | **Fake** exposing `getProxiedTools()` (each tool `category = serverName`) and `isServerConnected(name)` for the latest-state guard. |
| Timers | `vitest` fake timers to assert the 250 ms debounce deterministically. |
| Logger | Silent/spy `pino` (`silentLogger()`), asserted for BR-11 counts and F-03 log hygiene. |
| Tool fixtures | CSV-driven (`test-data-tools.csv`) + generated tool sets for PBT. |

---

## 3. Test Levels — Detail

### 3.1 PBT — Property-Based Testing (4 cases)

Invariants generated over random server names, tool sets, and event sequences with `fast-check`.

| ID | Property | Maps |
|----|----------|------|
| PBT-01 | **Idempotency:** applying N (N≥1) `connected` events for the same unchanged tool set yields the identical final index state (row count + contents) as applying exactly one. | BR-03, UC-03 |
| PBT-02 | **Scope isolation:** for any interleaving of connect/disconnect events across a random set of servers, rows owned by a server never change as a side effect of another server's event; core rows (`server IS NULL`) are never touched. | BR-05, TC-06 |
| PBT-03 | **Prune convergence:** after a `connected` refresh with an arbitrary changed tool set, the indexed set for that server equals exactly its current tool set (added ∪ kept, removed pruned). | BR-04, BR-08 |
| PBT-04 | **Injection-safety (F-06):** for any tool name string (including SQL metacharacters like `x'); DROP TABLE mcp_tools;--`), the tool is stored and pruned correctly as data, and the DB is intact. | F-06, BR-05 |

### 3.2 UT — Unit Testing (32 cases)

Grouped by class under test. Fakes only; the `McpToolsRepository` unit group may use `makeTempDb` for realistic SQL (still isolated to the repo).

**ReindexActionMapper (5):** UT-01..UT-05 — connected→ingest, disconnected→remove, failed→remove, unhealthy→noop, reconnecting→noop.

**PerServerTaskQueue (5):** UT-06 sequential per server; UT-07 concurrent across servers; UT-08 debounce coalesces within 250 ms; UT-09 task throw caught → chain continues (fail-soft); UT-10 debounce keeps latest event.

**McpToolsRepository (9):** UT-11 insert new; UT-12 update existing (no dup); UT-13 prune removed; UT-14 skip prune on empty set (no wipe); UT-15 deleteByServer scoped; UT-16 deleteByServer no-op (0 changes); UT-17 prune large set → temp-table fallback (F-04); UT-18 scope-aware probe skips overwriting another server + logs collision (F-01); UT-19 prune statement text is `?`-only placeholders (F-06).

**ReindexSubscriber (8):** UT-20 start subscribes / stop unsubscribes; UT-21 connected→enqueue ingest; UT-22 disconnected→enqueue remove; UT-23 intermediate states no enqueue; UT-24 memory not ready → skip+log (IR-8); UT-25 latest-state guard skips stale connect; UT-26 latency > 5 s logs warning (UC-04 EF-1); UT-27 bounded/allowlisted error logging (F-03).

**ReindexService (5):** UT-28 filters tools by `category === serverName`; UT-29 empty tool set → no-op, no delete; UT-30 embedding fail for one tool → skip tool, continue others; UT-31 latest-state guard in service; UT-32 write failure caught + logged, prior state intact.

### 3.3 IT — Integration Testing (13 cases)

Real better-sqlite3 (`makeTempDb`) + fake event source + fake embedding. Full subscriber→queue→service→repository→DB path.

| ID | Scenario | Maps |
|----|----------|------|
| IT-01 | Late connect makes tools discoverable in `mcp_tools` within ≤5 s | TC-01, UC-01, BR-01 |
| IT-02 | Previously indexed tools survive a late connect (no regression) | TC-02, UC-01 |
| IT-03 | Disconnect removes only that server's rows | TC-03, UC-02, BR-02 |
| IT-04 | `failed` state removes tools | TC-04, UC-02 AF-1 |
| IT-05 | Idempotent repeated connects — no duplicate rows | TC-05, BR-03 |
| IT-06 | Scoped operations — other servers + core (`server IS NULL`) untouched | TC-06, BR-05 |
| IT-07 | Non-blocking — `find_tools` read during refresh returns current state without blocking | TC-07, BR-09 |
| IT-08 | Fail-soft on embedding/fetch error — prior index unchanged, future events processed | TC-08, BR-06 |
| IT-09 | Convergence after connect/disconnect cycles — final set matches connected counts | TC-09, BR-08 |
| IT-10 | Prune tools removed upstream on reconnect with changed tool set | BR-04, UC-01 AF-3 |
| IT-11 | Migration: `server` column added via PRAGMA probe; `CREATE INDEX IF NOT EXISTS` idempotent; re-run safe | IR-6, F-02 |
| IT-12 | Cross-server name collision — first server's row not silently hijacked; collision logged | F-01, BR-05 |
| IT-13 | Subscription lifecycle — `initialize()` subscribes, `shutdown()` unsubscribes (no events after stop) | IR-1 |

### 3.4 E2E-API — Testing (4 cases)

In-process MCP client via `connectMcp(registry)`; drive real `find_tools` / `execute_dynamic_tool` / `orchestration_status` after a fake state-change event triggers a re-index.

| ID | Scenario | Maps |
|----|----------|------|
| API-01 | After a `connected` event, `find_tools('jira create issue')` returns the new server's tools with valid schemas | TC-01, UC-01, BR-01 |
| API-02 | After a `disconnected` event, `find_tools` no longer returns that server's tools; others remain | TC-03, UC-02, BR-02 |
| API-03 | Concurrent `execute_dynamic_tool` for a known tool succeeds while a re-index is in flight | TC-07, UC-04, BR-09 |
| API-04 | `orchestration_status` toolCount converges with `mcp_tools` count after events settle | BR-08, UC-03 |

### 3.5 E2E-UI — N/A

Not applicable. No UI surface exists (backend-only ai-agent MCP server). See §2 justification.

### 3.6 SIT — N/A

Not applicable. No new external system integration introduced; the sole trigger is an in-process SA4E-37 event exercised via a fake event source (IT) and the real MCP surface (E2E-API). See §2 justification.

---

## 4. Requirements Traceability Matrix (RTM)

### 4.1 Use Cases → Test Cases

| Use Case | Description | Test Cases | Covered |
|----------|-------------|-----------|---------|
| UC-01 | Late connect makes tools discoverable | PBT-01, IT-01, IT-02, IT-10, API-01, UT-28, UT-29, UT-30 | ✅ |
| UC-02 | Disconnect/failed removes tools | IT-03, IT-04, API-02, UT-15, UT-16 | ✅ |
| UC-03 | Event-driven automatic refresh | PBT-01, UT-01..05, UT-20..25, IT-13, API-04 | ✅ |
| UC-04 | Non-blocking, low-latency refresh | IT-07, API-03, UT-26 | ✅ |

### 4.2 Business Rules → Test Cases

| BR | Rule | Test Cases | Covered |
|----|------|-----------|---------|
| BR-01 | Ingest tools on `connected` | IT-01, API-01, UT-28, UT-11 | ✅ |
| BR-02 | Remove tools on `disconnected`/`failed` | IT-03, IT-04, API-02, UT-15 | ✅ |
| BR-03 | Idempotent upsert (no duplicates) | PBT-01, IT-05, UT-12 | ✅ |
| BR-04 | Index matches current `tools/list` (prune) | PBT-03, IT-10, UT-13, UT-14 | ✅ |
| BR-05 | Strictly scoped add/remove | PBT-02, PBT-04, IT-06, IT-12, UT-15, UT-18 | ✅ |
| BR-06 | Fail-soft, no swallowed exceptions | IT-08, UT-09, UT-24, UT-27, UT-30, UT-32 | ✅ |
| BR-07 | One incremental refresh per settled event (debounce) | UT-08, UT-10 | ✅ |
| BR-08 | Convergence to `orchestration_status` counts | PBT-03, IT-09, API-04 | ✅ |
| BR-09 | Async, non-blocking | IT-07, API-03 | ✅ |
| BR-10 | Only terminal transitions act | UT-01..05, UT-23 | ✅ |
| BR-11 | Log add/remove counts per server | UT-27, IT-01, IT-03 (log assertions) | ✅ |

### 4.3 FSD Test Considerations (§10) → Test Cases

| TC | Test Cases | Covered |
|----|-----------|---------|
| TC-01 | IT-01, API-01 | ✅ |
| TC-02 | IT-02 | ✅ |
| TC-03 | IT-03, API-02 | ✅ |
| TC-04 | IT-04 | ✅ |
| TC-05 | IT-05, PBT-01 | ✅ |
| TC-06 | IT-06, PBT-02 | ✅ |
| TC-07 | IT-07, API-03 | ✅ |
| TC-08 | IT-08 | ✅ |
| TC-09 | IT-09 | ✅ |

### 4.4 Integration Requirements (IR) → Test Cases

| IR | Test Cases | Covered |
|----|-----------|---------|
| IR-1 subscribe/unsubscribe lifecycle | IT-13, UT-20 | ✅ |
| IR-2 route by newState | UT-01..05, UT-21, UT-22, UT-23 | ✅ |
| IR-3 read tools filtered by category | UT-28 | ✅ |
| IR-4 embeddings via EmbeddingService text template | UT-30, IT-01 | ✅ |
| IR-5 scoped upsert+prune/delete in one transaction | UT-11..15, IT-05, IT-10 | ✅ |
| IR-6 `server` column + index migration | IT-11 | ✅ |
| IR-7 per-server mutex + debounce + guard | UT-06, UT-07, UT-08, UT-25, UT-31 | ✅ |
| IR-8 lazy memory DB resolution; skip if not ready | UT-24 | ✅ |
| IR-9 fail-soft + count logging | UT-09, UT-27, UT-32, IT-08 | ✅ |
| IR-10 no flat root exposure (discovery via find_tools) | API-01 (find_tools only path) | ✅ |

### 4.5 Security Findings → Test Cases

| Finding | Severity | Test Cases | Covered |
|---------|----------|-----------|---------|
| F-01 cross-server name collision | Low | IT-12, UT-18 | ✅ |
| F-03 bounded/allowlisted error logging | Low | UT-27 | ✅ |
| F-04 large tool set prune (temp-table fallback) | Low | UT-17 | ✅ |
| F-06 parameterized prune / injection-safe | Info | PBT-04, UT-19 | ✅ |

### 4.6 Coverage Summary

| Dimension | Total | Covered | % |
|-----------|-------|---------|---|
| Use Cases (UC-01..04) | 4 | 4 | 100% |
| Business Rules (BR-01..11) | 11 | 11 | 100% |
| FSD Test Considerations (TC-01..09) | 9 | 9 | 100% |
| Integration Requirements (IR-1..10) | 10 | 10 | 100% |
| Security findings (testable: F-01, F-03, F-04, F-06) | 4 | 4 | 100% |
| **Overall requirements coverage** | — | — | **100%** |

---

## 5. Test Case Count by Level

| Level | Count | Status |
|-------|-------|--------|
| PBT | 4 | Planned |
| UT | 32 | Planned |
| IT | 13 | Planned |
| E2E-API | 4 | Planned |
| E2E-UI | 0 | N/A (no UI) |
| SIT | 0 | N/A (no external integration) |
| **Total** | **53** | — |

---

## 6. Test Environment

| Aspect | Value |
|--------|-------|
| Runtime | Node.js v22.x |
| Language | TypeScript 5.5 (ESM) |
| Test runner | vitest ^4.1.9 |
| PBT library | fast-check ^4.9.0 |
| Database | better-sqlite3 (real, temp file via `makeTempDb`) |
| Embedding | Fake `IEmbeddingService` (deterministic vectors) — no ONNX runtime at test time |
| Harness | `backend/src/__tests__/sa4e-testkit.ts` (`makeTempDb`, `StubModule`, `connectMcp`, `silentLogger`, `def`) |
| Commands | `npm run test:unit` (src/), `npm run test:integration` (tests/integration/), `npm run test:e2e-api` |
| Location (planned) | UT+PBT: `backend/src/modules/orchestration/reindex/__tests__/`; IT: `backend/tests/integration/`; E2E-API: e2e config |

---

## 7. Entry & Exit Criteria

### 7.1 Entry Criteria

- BRD, FSD, TDD, SECURITY-REVIEW approved (all present).
- `reindex/` package implemented per TDD §4 (Phase 5); migration applied.
- Test harness (`sa4e-testkit.ts`) available and green on existing suites.

### 7.2 Exit Criteria

- All 53 planned test cases implemented and passing.
- RTM coverage = 100% (UC + BR + TC + IR).
- Re-index latency assertion (≤5 s) passes in IT-01.
- Zero scope-isolation violations (PBT-02, IT-06, IT-12).
- Security Low findings F-01, F-03, F-04, F-06 have passing tests.
- No swallowed exceptions detected in fail-soft paths (BR-06 cases green).

---

## 8. Risks & Mitigations (Test)

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Debounce timing flaky under real timers | Medium | Use vitest fake timers for UT-08/UT-10; tolerance windows in IT. |
| `await`-interleaving races hard to reproduce | High | PBT-02 generates interleavings; IT drives rapid connect/disconnect sequences deterministically. |
| Embedding nondeterminism | Medium | Fake `IEmbeddingService` returns deterministic vectors; assert row presence not vector equality. |
| Latency assertion environment-sensitive | Low | Assert ≤5 s with generous margin; measure elapsed, warn-log path covered separately (UT-26). |
| Large-tool-set prune limit only on extreme input | Low | UT-17 injects >900 synthetic tools to force the fallback branch. |

---

## 9. Test Data

See `test-data-tools.csv` (tool fixtures per server) and `test-data-events.csv` (state-change event sequences). Referenced by IT and E2E-API cases; PBT generates its own randomized supersets.

---

## 10. Appendix

### Diagrams

![Test Coverage](diagrams/test-coverage.png)

![Test Execution Flow](diagrams/test-execution-flow.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage — levels → components → requirements | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow — PBT→UT→IT→E2E-API gates | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |

### Traceability

Full case-level detail (preconditions, steps, expected, technique) is in `STC.md`. RTM in §4 maps every UC/BR/TC/IR and testable security finding to at least one test case (100%).
