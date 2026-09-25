# Software Test Plan (STP)

## SA4E-294 — Checkpointer Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-294 |
| Title | Checkpointer Adapter |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-294/BRD.md (missing) |
| Related FSD | FSD.md |
| Related TDD | TDD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | QA Agent | Initial test plan from FSD and TDD |

---

## 1. Introduction

### 1.1 Purpose
This Test Plan defines the testing strategy, scope, schedule, resources and entry/exit criteria for SA4E-294 Checkpointer Adapter. The adapter provides serialization/deserialization between Pi SDK internal state and RemoteCheckpointer backend to enable PiWorkflow Engine persistence via Knowledge Service.

### 1.2 Test Objectives
- Verify Checkpointer Adapter correctly persists and retrieves Pi state via RemoteCheckpointer
- Validate StateAdapter mapping PipelineState ↔ PiInternalState
- Ensure business rules BR-001 to BR-004 enforced
- Validate error handling for KB unreachable, serialization error, payload too large, invalid UUID
- Verify non-functional requirements: save latency <500ms p95, availability, scalability
- Maintain backward compatibility with existing checkpoints

### 1.3 References
| Document | Location |
|----------|----------|
| FSD | documents/SA4E-294/FSD.md |
| TDD | documents/SA4E-294/TDD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs) | Automated | fast-check |
| UT | Unit/edge case tests | Automated | vitest |
| IT | API integration (Hono app in-process) | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only | Manual | Browser |

### 2.2 Test Types
| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases | Yes |
| Regression Testing | Ensure existing checkpoints not broken | Yes |
| Performance Testing | Verify response times and load capacity | Yes |
| Security Testing | Auth, workspace binding, data protection | Yes |
| Integration Testing | Knowledge Service integration | Yes |

### 2.3 E2E Automation Coverage
SIT manual limited to visual/UX timing. CRUD operations, form validation, API response verification, RBAC/auth checks, status changes, confirmation dialogs classified as E2E-API/E2E-UI automated.

### 2.4 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 6 | 6 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 8 | 8 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **24** | **20 (83%)** | **4 (17%)** |

### 2.5 Entry Criteria
| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT, unit tests passed, test data prepared, Knowledge Service accessible |
| UAT | SIT completed with 0 Critical defects, test environment stable |

### 2.6 Exit Criteria
| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open |
| UAT | All UAT scenarios passed, business sign-off obtained |

---

## 3. Test Scope

### 3.1 Features In Scope
| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Checkpointer Adapter PUT/GET checkpoint | High | UC-001 | Functional / Integration / E2E-API |
| 2 | StateAdapter PipelineState ↔ PiInternalState mapping | High | 3.1.1 | Functional / Unit |
| 3 | Serialization of Pi session, agent outputs, chat history | High | 3.1.4 | Functional |
| 4 | Business Rules BR-001..BR-004 enforcement | High | 3.1.3 | Business Rule |
| 5 | Error handling KB_UNREACHABLE, SERIALIZATION_ERROR, PAYLOAD_TOO_LARGE, THREAD_NOT_FOUND | High | 9.1, 3.1.5 | Exception |
| 6 | Performance <500ms p95, concurrent threads 1000 | Medium | 8 | Non-Functional |
| 7 | Workspace binding via X-Project-Id / JWT | High | BR-003 | Security |

### 3.2 Features Out of Scope
| # | Feature | Reason |
|---|---------|--------|
| 1 | Modification of Knowledge Service schema | Backend change out of scope |
| 2 | Pi SDK provider implementation | Separate story SA4E-294 Step 1 |
| 3 | Phase router logic | Not part of adapter |

---

## 4. Test Environment

### 4.1 Environment Requirements
| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://127.0.0.1:48721 | SQLite | System Integration Testing |
| UAT | https://kb.example.com | PostgreSQL | User Acceptance Testing |

### 4.2 Test Data Requirements
| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Pre-seeded threads | Valid UUID v4 threads with workspace binding | CSV pre-seeded-data.csv | Seed before tests |
| PiInternalState samples | Valid/invalid Pi state payloads | create-checkpoint-testdata.csv | Generated |
| Invalid UUIDs | Malformed threadId | create-checkpoint-testdata.csv | Generated |
| Large payload | >10MB checkpoint | create-checkpoint-testdata.csv | Generated |

### 4.3 External Dependencies
| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Knowledge Service | /api/v1/threads checkpoint API | No, real service required |
| Auth Service | JWT validation | Mock JWT generator |

---

## 5. Test Schedule
| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-16 | 2026-09-16 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-17 | 2026-09-17 | 1 day | Test data ready |
| SIT Execution | 2026-09-18 | 2026-09-19 | 2 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-20 | 2026-09-21 | 2 days | All Critical/Major fixed |
| UAT Execution | 2026-09-22 | 2026-09-23 | 2 days | UAT sign-off |

---

## 6. Resources & Responsibilities
| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | TA Agent | UAT support, acceptance criteria clarification |
| Developer | SA Agent | Bug fixing, unit test coverage |
| DevOps | DevOps Agent | Environment setup, deployment |

---

## 7. Risk & Mitigation
| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Knowledge Service not available | High | Medium | Mock fallback, retry policy validation |
| 2 | BRD missing, business rules incomplete | High | Low | Derive from FSD/TDD, confirm with TA |
| 3 | Checkpoint size >10MB causing failures | Medium | Medium | Boundary tests with generated payloads |
| 4 | Workspace binding misconfiguration | High | Low | Security test suite with invalid JWT |

---

## 8. Defect Management
### 8.1 Severity
| Severity | Definition |
|----------|------------|
| Critical | System crash, data loss, security breach |
| Major | Checkpoint save fails, version not monotonic |
| Minor | Logging issue, non-critical warning |
| Trivial | Typo in error message |

### 8.2 Priority
| Priority | SLA |
|----------|-----|
| P1 | 4 hours |
| P2 | 1 business day |
| P3 | 3 business days |
| P4 | Next release |

### 8.3 Defect Lifecycle
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting
| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥95% |
| Critical Defect Count | 0 |
| Checkpoint save latency p95 | <500ms |

---

## 10. Appendix
Assumptions: BRD missing, scope derived from FSD/TDD. No UI component, E2E-UI not applicable.
