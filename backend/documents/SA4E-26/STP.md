# Software Test Plan (STP)

## SA4E Code Intelligence — SA4E-26: KB Knowledge Base thiếu Project Isolation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Title | KB Knowledge Base thiếu Project Isolation — Data từ nhiều projects bị trộn lẫn |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-26.docx |
| Related FSD | FSD-v1-SA4E-26.docx |
| Related TDD | TDD-v1-SA4E-26.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## 1. Introduction

### 1.1 Purpose

This test plan covers the verification of project isolation for the KB Knowledge Base memory system. The fix adds a `project_id` column to `knowledge_entries` and modifies scope filtering to ensure PROJECT-scope entries are only visible within the originating workspace.

### 1.2 Test Objectives

- Verify all 14 business rules (BR-01 to BR-14) are correctly enforced
- Validate project-isolated search returns only authorized entries
- Validate project-tagged ingestion stores correct project_id
- Validate backward compatibility with legacy entries (NULL project_id)
- Verify SHARED-scope entries remain cross-project visible
- Verify projectId derivation from workspace path and config override
- Verify schema migration is idempotent and non-destructive

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-26.docx |
| FSD | FSD-v1-SA4E-26.docx |
| TDD | TDD-v1-SA4E-26.docx |

---

## 2. Test Strategy

### 2.1 Test Levels (6 Levels)

| Level | ID Prefix | Scope | Responsibility | Tools | Automation |
|-------|-----------|-------|---------------|-------|------------|
| Property-Based Testing (PBT) | PBT- | Invariant verification for scope clause logic | Developer | fast-check | 100% automated |
| Unit Testing (UT) | UT- | Individual functions: buildScopeClause, buildScopeParams, insert, deriveProjectId | Developer | Jest/Vitest | 100% automated |
| Integration Testing (IT) | IT- | MemoryEngine + SQLite interaction, schema migration | Developer + QA | Jest + better-sqlite3 (real DB) | 100% automated |
| E2E-API Testing | E2E-API- | Full tool call path: MCP → Dispatcher → Engine → DB | QA | Jest + MCP client | 100% automated |
| E2E-UI Testing | E2E-UI- | N/A for this ticket (no UI changes) | — | — | — |
| System Integration Testing (SIT) | SIT- | Multi-workspace simulation, real backend process | QA | Custom test harness | 90% automated |

> **Note:** E2E-UI level is not applicable for SA4E-26 as there are no frontend/UI changes. All 5 applicable levels are 100% or 90%+ automated.

### 2.2 Test Approach

| Aspect | Approach |
|--------|----------|
| Data Setup | In-memory SQLite for UT/IT, file-based SQLite for E2E/SIT |
| Isolation | Each test gets fresh DB instance (no shared state between tests) |
| Mocking | Only for external dependencies not under test (e.g., vector embeddings in UT) |
| Regression | Existing MemoryEngine tests must continue passing unchanged |

### 2.3 Test Environment

| Environment | Purpose | Configuration |
|-------------|---------|---------------|
| Local (Developer) | UT, PBT, IT | Node.js 20, SQLite in-memory |
| CI Pipeline | All automated tests | Node.js 20, SQLite file-based |
| Integration | SIT | Full backend process, multiple workspace configs |

### 2.4 Entry/Exit Criteria

**Entry Criteria:**
- Code implementation complete (all 5 files modified per TDD)
- Build passes without errors
- Existing tests pass (regression baseline)

**Exit Criteria:**
- All Critical/High priority test cases pass
- 0 Critical defects open
- RTM coverage = 100% (all BRs and UCs covered)
- Property-based tests pass with 100 samples

---

## 3. Test Cases Summary by Level

### 3.1 Property-Based Testing (PBT) — 4 tests

| ID | Property | Generator | Invariant |
|----|----------|-----------|-----------|
| PBT-01 | Scope clause always includes SHARED | Random ScopeContext (projectId: string \| undefined) | Result SQL always contains `scope = 'SHARED'` |
| PBT-02 | Scope clause with projectId always filters PROJECT by project_id | Random non-empty projectId | Result SQL contains `project_id = ?` |
| PBT-03 | Scope params count matches placeholders | Random ScopeContext | params.length === SQL.match(/\?/g).length |
| PBT-04 | Insert always stores project_id from context | Random entries with random projectId | SELECT after INSERT has matching project_id |

### 3.2 Unit Testing (UT) — 14 tests

| ID | Function Under Test | Scenario | Expected |
|----|--------------------:|----------|----------|
| UT-01 | buildScopeClause | With projectId | Returns clause with project_id filter |
| UT-02 | buildScopeClause | Without projectId | Returns backward-compat clause (all PROJECT visible) |
| UT-03 | buildScopeClause | With tableAlias | Clause prefixed with alias (e.g., `ke.scope`) |
| UT-04 | buildScopeClause | Empty string projectId | Treated as falsy → backward-compat clause |
| UT-05 | buildScopeParams | With projectId | Returns [projectId, userId] |
| UT-06 | buildScopeParams | Without projectId | Returns [userId] |
| UT-07 | insert | With project_id field | Stores project_id in DB |
| UT-08 | insert | Without project_id field | Stores NULL |
| UT-09 | deriveProjectId | Normal path `/projects/my-app` | Returns `my-app` |
| UT-10 | deriveProjectId | Windows path `C:\projects\my-app` | Returns `my-app` |
| UT-11 | deriveProjectId | Root path `/` | Returns `default` |
| UT-12 | deriveProjectId | Empty string | Returns `default` |
| UT-13 | deriveProjectId | With config override | Returns override value |
| UT-14 | deriveProjectId | With env variable | Returns env value |

### 3.3 Integration Testing (IT) — 12 tests

| ID | Scenario | Components | Expected |
|----|----------|------------|----------|
| IT-01 | Search with projectId filters PROJECT entries | Engine + SQLite | Only matching project entries returned |
| IT-02 | Search without projectId shows all PROJECT entries | Engine + SQLite | All PROJECT entries visible (backward compat) |
| IT-03 | SHARED entries visible regardless of projectId | Engine + SQLite | SHARED always in results |
| IT-04 | Legacy entries (NULL project_id) visible to all | Engine + SQLite | NULL entries in results for any project |
| IT-05 | USER entries filtered by user_id only | Engine + SQLite | Only own USER entries |
| IT-06 | Cross-project isolation | Engine + SQLite | Project-A entries NOT visible from project-B |
| IT-07 | Ingest stores project_id from ScopeContext | Engine + SQLite | SELECT confirms project_id stored |
| IT-08 | Ingest without projectId stores NULL | Engine + SQLite | project_id = NULL in DB |
| IT-09 | Schema migration creates column | Schema + SQLite | Column exists after migration |
| IT-10 | Schema migration is idempotent | Schema + SQLite | No error on second run |
| IT-11 | Index creation succeeds | Schema + SQLite | idx_ke_project_id exists |
| IT-12 | Mixed scope query correctness | Engine + SQLite | Correct entries from mixed PROJECT/SHARED/USER/NULL |

### 3.4 E2E-API Testing — 8 tests

| ID | Tool Call | Scenario | Expected Response |
|----|-----------|----------|-------------------|
| E2E-API-01 | mem_search | With projectId, entries from multiple projects | Only current project entries in response |
| E2E-API-02 | mem_search | Without projectId (legacy client) | All PROJECT entries visible |
| E2E-API-03 | mem_search | SHARED entry from another project | SHARED entry visible |
| E2E-API-04 | mem_ingest | Ingest with projectId | Entry created with correct project_id |
| E2E-API-05 | mem_ingest | Ingest without projectId | Entry created with NULL project_id |
| E2E-API-06 | mem_ingest | Ingest SHARED scope with projectId | Entry stores project_id (audit) but visible cross-project |
| E2E-API-07 | mem_search | Empty query | Validation error returned |
| E2E-API-08 | mem_list | List with projectId filter | Only project entries returned |

### 3.5 E2E-UI Testing — N/A

Not applicable for SA4E-26 (backend-only change, no UI modifications).

### 3.6 System Integration Testing (SIT) — 4 tests

| ID | Scenario | Automation | Expected |
|----|----------|------------|----------|
| SIT-01 | Two backend instances with different workspace paths | Automated (process spawn) | Each sees only its own PROJECT entries |
| SIT-02 | Backend restart with existing DB | Automated | Migration idempotent, data preserved |
| SIT-03 | Project ID override via config | Automated | Override takes precedence over path derivation |
| SIT-04 | Performance: 10k entries, search with project filter | Automated (benchmark) | < 5ms additional overhead vs without filter |

---

## 4. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Migration fails on existing large DB | High | Low | Test with 10k+ rows, migration is ALTER ADD (instant) |
| Scope clause SQL error | High | Low | PBT + UT comprehensive coverage |
| Backward compat broken (legacy entries invisible) | High | Medium | Dedicated IT-04, IT-12 tests for NULL handling |
| Performance degradation | Medium | Low | SIT-04 benchmark, indexed column |
| SHARED entries accidentally filtered | High | Low | IT-03, E2E-API-03 explicit tests |

---

## 5. Test Schedule

| Phase | Duration | Level | Dependency |
|-------|----------|-------|-----------|
| Test Implementation | 1 day | PBT + UT + IT | Code complete |
| E2E-API Setup | 0.5 day | E2E-API | Test infra ready |
| Execution (CI) | Automated | All | PR submitted |
| SIT | 0.5 day | SIT | E2E pass |

---

## 6. Test Data Requirements

### 6.1 Seed Data for Integration Tests

| Entry ID | content | scope | project_id | user_id | Description |
|----------|---------|-------|------------|---------|-------------|
| seed-1 | "Project A pattern" | PROJECT | app-A | user-1 | Project A entry |
| seed-2 | "Project B pattern" | PROJECT | app-B | user-1 | Project B entry |
| seed-3 | "Shared knowledge" | SHARED | app-A | user-1 | Shared entry (from A) |
| seed-4 | "Legacy entry" | PROJECT | NULL | user-1 | Pre-migration entry |
| seed-5 | "User private" | USER | app-A | user-1 | User-scoped entry |
| seed-6 | "Other user" | USER | app-A | user-2 | Other user's entry |
| seed-7 | "Project A second" | PROJECT | app-A | user-2 | Another A entry |

### 6.2 Test Data Files

| File | Purpose | Format |
|------|---------|--------|
| testdata/seed-entries.csv | Integration test seed data | CSV |
| testdata/scope-context-variations.csv | ScopeContext permutations | CSV |
| testdata/projectid-derivation.csv | Path → projectId mapping cases | CSV |

---

## 7. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Priority |
|-------------|--------|------------|----------|
| BR-01 (PROJECT filtered by project_id) | FSD §3.1.3 | PBT-02, UT-01, IT-01, IT-06, E2E-API-01 | Critical |
| BR-02 (SHARED always visible) | FSD §3.1.3 | PBT-01, IT-03, E2E-API-03 | Critical |
| BR-03 (Legacy NULL visible to all) | FSD §3.4.3 | IT-04, IT-12, E2E-API-02 | Critical |
| BR-04 (USER filtered by user_id) | FSD §3.1.3 | IT-05 | High |
| BR-05 (No projectId → all PROJECT visible) | FSD §3.1.3 | UT-02, IT-02, E2E-API-02 | Critical |
| BR-06 (Ingest stores project_id) | FSD §3.2.3 | UT-07, IT-07, E2E-API-04 | Critical |
| BR-07 (SHARED stores project_id for audit) | FSD §3.2.3 | E2E-API-06 | High |
| BR-08 (No projectId → NULL stored) | FSD §3.2.3 | UT-08, IT-08, E2E-API-05 | High |
| BR-09 (Derive from workspace path) | FSD §3.3.3 | UT-09, UT-10, SIT-01 | High |
| BR-10 (Config override) | FSD §3.3.3 | UT-13, SIT-03 | High |
| BR-11 (projectId in every ScopeContext) | FSD §3.3.3 | E2E-API-01, E2E-API-04, SIT-01 | High |
| BR-12 (Migration idempotent) | FSD §3.4.3 | IT-09, IT-10, SIT-02 | Critical |
| BR-13 (NULL passes scope filter) | FSD §3.4.3 | IT-04, IT-12 | Critical |
| BR-14 (No data migration required) | FSD §3.4.3 | IT-04, SIT-02 | High |
| UC-01 (Project-Isolated Search) | FSD §3.1.2 | PBT-01, PBT-02, UT-01-06, IT-01-06, E2E-API-01-03 | Critical |
| UC-02 (Project-Tagged Ingestion) | FSD §3.2.2 | UT-07-08, IT-07-08, E2E-API-04-06 | Critical |
| UC-03 (Auto Project ID Derivation) | FSD §3.3.2 | UT-09-14, SIT-01, SIT-03 | High |
| UC-04 (Legacy Backward Compat) | FSD §3.4.2 | IT-04, IT-12, E2E-API-02, SIT-02 | Critical |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Business Rules (BR) | 14 | 14 | 100% |
| Use Cases (UC) | 4 | 4 | 100% |
| Stories (BRD) | 5 | 5 | 100% |
| **Overall** | **23** | **23** | **100%** |

---

## 8. Automation Strategy

| Level | Framework | Runner | Automation % |
|-------|-----------|--------|--------------|
| PBT | fast-check + Jest | CI | 100% |
| UT | Jest/Vitest | CI | 100% |
| IT | Jest + real SQLite (better-sqlite3) | CI | 100% |
| E2E-API | Jest + MCP test client | CI | 100% |
| SIT | Custom harness (spawn backend) | CI | 90% |

**Total automated:** 42/42 tests = 100% automated (SIT-04 performance has manual threshold review)

---

## 9. Defect Management

| Severity | Response Time | Resolution |
|----------|--------------|------------|
| Critical (data leak) | Immediate | Block release |
| High (wrong filter) | Same day | Fix required before merge |
| Medium (edge case) | Next sprint | Track as tech debt |
| Low (cosmetic/log) | Backlog | Optional fix |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Overview | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
