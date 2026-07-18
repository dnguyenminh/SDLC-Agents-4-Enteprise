# Software Test Plan (STP)

## SA4E — SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Title | Persistent Task Queue cho KB Ingest + Remove CodeIntelModule from Backend |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-17 |
| Status | Draft |
| Related BRD | BRD-v3-SA4E-44.docx |
| Related FSD | FSD-v2.2-SA4E-44.docx |
| Related TDD | TDD-v2.1-SA4E-44.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-17 | QA Agent | Initial STP — Full dual-scope test plan |

---

## 1. Introduction

### 1.1 Purpose

This STP defines the test strategy, test levels, environment specifications, entry/exit criteria, and requirements traceability for SA4E-44. The plan covers both Part 1 (Persistent Task Queue) and Part 2 (Code Intelligence Migration).

### 1.2 Scope

**In Scope:**
- Part 1: Atomic ingest (UC-01), background worker (UC-02), crash recovery (UC-03), monitoring (UC-04), retry/dead letter (UC-05)
- Part 2: Extension scan (UC-06), upload to backend (UC-07), query from DB (UC-08), incremental re-index (UC-09), remove CodeIntelModule (UC-10)
- Business Rules: BR-01 through BR-10
- Security: API key auth (SEC-01), payload schema validation (SEC-02), path traversal prevention (SEC-03)
- Performance: mem_ingest < 100ms, code_intel_upload < 2s

**Out of Scope:**
- Extension UI/UX visual testing
- LangGraph pipeline integration testing
- Frontend webview panel tests

### 1.3 References

| Document | Version |
|----------|---------|
| BRD | v3.0 |
| FSD | v2.2 |
| TDD | v2.1 |

---

## 2. Test Strategy

### 2.1 Test Levels (6 Levels)

| Level | ID | Scope | Tool | Responsibility |
|-------|-----|-------|------|----------------|
| Property-Based Testing | PBT | Invariant verification across random inputs | fast-check + Vitest | DEV |
| Unit Test | UT | Individual functions/classes in isolation | Vitest (backend) / Mocha (extension) | DEV |
| Integration Test | IT | Module interactions with real DB | Vitest + Testcontainers (PostgreSQL) | DEV |
| E2E API | E2E-API | Full MCP JSON-RPC request/response cycle | Supertest / MCP JSON-RPC client | QA |
| E2E UI | E2E-UI | Extension commands via VS Code test runner | VS Code Extension Test Host + Mocha | QA |
| System Integration Test | SIT | End-to-end Extension → Backend → DB → Query | Full stack deploy + automated scripts | QA |

### 2.2 Test Approach per Part

**Part 1 — Task Queue:**
- PBT: Verify FIFO ordering invariant, backoff formula correctness, retry count bounds
- UT: PendingTaskRepository CRUD, TaskWorker state transitions, backoff calculation
- IT: Atomic transaction rollback, crash recovery with real PostgreSQL, concurrent claim
- E2E-API: mem_ingest JSON-RPC → verify entry + tasks created, /internal/tasks/stats
- SIT: Full ingest → worker process → enrichment complete cycle

**Part 2 — Code Intelligence:**
- PBT: Hash dedup invariant, payload schema validation exhaustive, symbol extraction consistency
- UT: PayloadValidator, CodeIntelReceiver UPSERT logic, TimestampResolver priority
- IT: code_intel_upload with real DB, code_search query accuracy, CALL_GRAPH_BUILD enrichment
- E2E-API: Upload batch → query → verify backward-compatible response format
- E2E-UI: Extension scan command → verify upload triggered, file save → incremental re-index
- SIT: Extension scan → upload → backend store → agent query → correct results

### 2.3 Test Data Strategy

| Category | Source | Location |
|----------|--------|----------|
| Valid payloads | Generated from FSD schemas | `test-data/valid-payloads.csv` |
| Invalid payloads | Boundary values + malformed data | `test-data/invalid-payloads.csv` |
| Edge cases | Empty, max batch, unicode, path traversal | `test-data/edge-cases.csv` |
| Performance fixtures | 100-file batches, 10K symbols | `test-data/perf-fixtures/` |

---

## 3. Test Environment

### 3.1 Backend Test Environment

| Component | Specification |
|-----------|--------------|
| Runtime | Node.js 20+ |
| Database | PostgreSQL 15+ via Testcontainers |
| Framework | Hono 4.x |
| Test Runner | Vitest 1.x |
| PBT Library | fast-check 3.x |
| HTTP Client | Supertest |
| Container | Docker (for Testcontainers) |

### 3.2 Extension Test Environment

| Component | Specification |
|-----------|--------------|
| Host | VS Code 1.85+ |
| Test Runner | Mocha + @vscode/test-electron |
| Parser | Tree-sitter WASM 0.22+ |
| Language | TypeScript 5.x |
| Mock Server | Local MCP mock for offline tests |

### 3.3 SIT Environment

| Component | Specification |
|-----------|--------------|
| Backend | Docker container (PostgreSQL + Backend Server) |
| Extension | VS Code Extension Host (test workspace) |
| Network | localhost communication (port 48721 backend, 9181 extension wrapper) |
| Data | Fixture workspace with 50+ TypeScript/Kotlin files |

### 3.4 CI/CD Integration

| Stage | Tests Run |
|-------|-----------|
| Pre-commit | UT (fast subset) |
| PR Build | PBT + UT + IT |
| Nightly | E2E-API + E2E-UI + SIT + Performance |

---

## 4. Entry / Exit Criteria

### 4.1 Entry Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Code compiles without errors | `npm run build` passes |
| 2 | Database migrations applied | Migration scripts run successfully |
| 3 | Test environment operational | Testcontainers PostgreSQL starts |
| 4 | All dependencies installed | `npm install` completes |
| 5 | TDD implementation checklist > 80% complete | Code review |
| 6 | No Critical security findings unresolved | SECURITY-REVIEW.md check |

### 4.2 Exit Criteria

| # | Criterion | Threshold |
|---|-----------|-----------|
| 1 | PBT pass rate | 100% (1000 runs per property) |
| 2 | UT pass rate | 100% |
| 3 | IT pass rate | 100% |
| 4 | E2E-API pass rate | ≥ 95% |
| 5 | E2E-UI pass rate | ≥ 90% |
| 6 | SIT pass rate | ≥ 90% |
| 7 | Code coverage (UT + IT) | ≥ 80% lines |
| 8 | Performance: mem_ingest | < 100ms p95 |
| 9 | Performance: code_intel_upload (100 files) | < 2s p95 |
| 10 | No Critical/High defects open | 0 |
| 11 | All BR-xx rules verified | 10/10 |
| 12 | Security tests pass | SEC-01, SEC-02, SEC-03 |

---

## 5. Requirements Traceability Matrix (RTM)

### 5.1 Use Case → Test Case Mapping

| UC | Use Case | PBT | UT | IT | E2E-API | E2E-UI | SIT |
|----|----------|-----|----|----|---------|--------|-----|
| UC-01 | Atomic KB Ingest | PBT-01, PBT-02 | UT-01..UT-06 | IT-01..IT-04 | API-01..API-05 | — | SIT-01 |
| UC-02 | Background Worker | PBT-03, PBT-04 | UT-07..UT-12 | IT-05..IT-08 | API-06..API-07 | — | SIT-02 |
| UC-03 | Crash Recovery | — | UT-13..UT-15 | IT-09..IT-11 | API-08 | — | SIT-03 |
| UC-04 | Task Monitoring | — | UT-16..UT-17 | IT-12 | API-09..API-11 | — | — |
| UC-05 | Retry/Dead Letter | PBT-05 | UT-18..UT-21 | IT-13..IT-15 | API-12..API-13 | — | SIT-04 |
| UC-06 | Extension Scan | PBT-06 | UT-22..UT-26 | — | — | UI-01..UI-04 | SIT-05 |
| UC-07 | Upload to Backend | PBT-07, PBT-08 | UT-27..UT-32 | IT-16..IT-20 | API-14..API-19 | UI-05 | SIT-06 |
| UC-08 | Query from DB | — | UT-33..UT-37 | IT-21..IT-24 | API-20..API-24 | — | SIT-07 |
| UC-09 | Incremental Re-index | PBT-09 | UT-38..UT-40 | IT-25..IT-26 | API-25 | UI-06..UI-08 | SIT-08 |
| UC-10 | Remove CodeIntelModule | — | UT-41..UT-42 | IT-27 | API-26 | — | SIT-09 |

### 5.2 Business Rule → Test Case Mapping

| BR | Business Rule | Test Cases |
|----|--------------|------------|
| BR-01 | Atomic Ingest | PBT-01, IT-01, IT-02, API-01, SIT-01 |
| BR-02 | FIFO Processing | PBT-03, UT-07, IT-05, API-06 |
| BR-03 | Exponential Backoff | PBT-04, UT-09, UT-10 |
| BR-04 | Stale Task Threshold (5min) | UT-13, IT-09, IT-10 |
| BR-05 | Max 3 Retries | PBT-05, UT-18, UT-19, IT-13, API-12 |
| BR-06 | Hash-Based Dedup | PBT-07, UT-27, IT-16, API-14, UI-06 |
| BR-07 | Backend No Filesystem | UT-41, IT-27, API-26, SIT-09 |
| BR-08 | Backward Compatible Queries | UT-33, IT-21, API-20, SIT-07 |
| BR-09 | Timestamp Resolution Priority | PBT-09, UT-38, UT-39, UI-07 |
| BR-10 | Timestamp Usage | UT-40, IT-25, API-25 |

### 5.3 Security → Test Case Mapping

| SEC | Security Requirement | Test Cases |
|-----|---------------------|------------|
| SEC-01 | API Key Auth | API-27, API-28, SIT-10 |
| SEC-02 | Payload Schema Validation | PBT-02, PBT-08, UT-04, UT-30, API-04, API-17 |
| SEC-03 | Path Traversal Prevention | UT-31, UT-32, API-18, API-19 |

---

## 6. Test Schedule

| Phase | Duration | Activities |
|-------|----------|------------|
| Test Prep | 2 days | Environment setup, test data creation, fixture workspace |
| PBT + UT | 3 days | Property-based tests + unit tests for all modules |
| IT | 3 days | Integration tests with Testcontainers PostgreSQL |
| E2E-API | 2 days | Full MCP JSON-RPC cycle tests |
| E2E-UI | 2 days | Extension test host scenarios |
| SIT | 2 days | End-to-end system integration |
| Performance | 1 day | Latency benchmarks, load tests |
| Regression | 1 day | Full suite re-run after fixes |

---

## 7. Risk Assessment

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Testcontainers Docker unavailable in CI | IT tests blocked | Fallback to SQLite adapter for basic tests |
| 2 | VS Code test host instability | E2E-UI flaky | Retry mechanism, increase timeouts |
| 3 | Tree-sitter WASM loading in test | Extension tests fail | Pre-load WASM in test setup fixture |
| 4 | Large workspace perf test variance | Inconsistent results | Run 5x, report p50/p95/p99 |
| 5 | Network timeout in SIT | False failures | Increase timeouts, add health check wait |

---

## 8. Defect Management

### 8.1 Severity Classification

| Severity | Definition | Response Time |
|----------|------------|---------------|
| Critical | System crash, data loss, security breach | Immediate fix |
| High | Feature broken, no workaround | Fix within 1 day |
| Medium | Feature degraded, workaround exists | Fix within 3 days |
| Low | Cosmetic, minor UX issue | Fix in next sprint |

### 8.2 Defect Workflow

1. Tester finds defect → log with reproduction steps
2. Assign severity + priority
3. DEV fixes → commit with test
4. QA verifies fix → close or reopen

---

## 9. Test Diagrams

![Test Coverage](diagrams/test-coverage.png)

![Test Execution Flow](diagrams/test-execution-flow.png)

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
