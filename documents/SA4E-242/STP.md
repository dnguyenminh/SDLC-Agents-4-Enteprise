# Software Test Plan (STP)

## SA4E-242 — KB Scope Auto-Detection based on VCS presence and branch for Extension ingest

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-242 |
| Title | KB Scope Auto-Detection based on VCS presence and branch for Extension ingest |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related BRD | BRD.md v1.1 |
| Related FSD | FSD.md v1.1 |
| Related TDD | TDD.md v1.0 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## 1. Introduction

### 1.1 Purpose
This Test Plan defines the strategy, scope, schedule, resources and entry/exit criteria for testing KB Scope Auto-Detection based on VCS presence and branch for Extension ingest (SA4E-242). The feature ensures KB entries are automatically assigned WORKSPACE scope on non-main branches / no VCS, and PROJECT scope on git main/master branches.

### 1.2 Test Objectives
- Verify detectKbScope() returns correct scope based on VCS presence and branch name
- Validate business rules BR-1 to BR-10 are enforced
- Ensure scope detection is used by PegaSchemaIndexer, AttachmentFetcher, KbEntryBuilder, JiraProjectIndexer
- Verify caching, override, error fallback, and migration idempotency
- Ensure non-functional requirements: detector overhead <50ms, no credential exposure, backward compatibility

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-242/BRD.md v1.1 |
| FSD | documents/SA4E-242/FSD.md v1.1 |
| TDD | documents/SA4E-242/TDD.md v1.0 |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties of scope detection (random inputs) | Automated | fast-check |
| UT | Unit tests for detectKbScope logic, cache, override | Automated | vitest |
| IT | API integration (Hono app in-process) | Automated | vitest + Hono app.request() |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only | Manual | Browser |

### 2.2 Test Types
| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases UC-1/UC-2/UC-3 | Yes |
| Regression Testing | Ensure existing PROJECT ingest on main unaffected | Yes |
| Performance Testing | Detector overhead <50ms p95, cache hit <5ms | Yes |
| Security Testing | No VCS credentials exposed, read-only checks | Yes |
| Integration Testing | Scope propagation to indexer-http, IsolationLayer | Yes |

### 2.3 E2E Automation Coverage
SIT manual tests limited to visual/UX timing. CRUD operations, form validation, API responses, RBAC checks, status changes are automated as E2E-API/E2E-UI.

### 2.4 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 12 | 12 | 0 |
| IT | 8 | 8 | 0 |
| E2E-API | 6 | 6 | 0 |
| E2E-UI | 4 | 4 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **39** | **33 (85%)** | **6 (15%)** |

### 2.5 Entry Criteria
| Level | Entry Criteria |
|-------|---------------|
| SIT | Code merged to test branch, unit tests passed, test data prepared, TDD approved |
| UAT | SIT completed with 0 Critical defects, ≤2 Major defects open |

### 2.6 Exit Criteria
| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects open, ≤2 Major defects open, coverage ≥90% |
| UAT | All UAT scenarios passed, business sign-off obtained |

---

## 3. Test Scope

### 3.1 Features In Scope
| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | US-1 Auto-assign WORKSPACE on non-main branch / no VCS | High | UC-1, BR-1/2/3 | Functional / Integration |
| 2 | US-2 Auto-assign PROJECT on git main/master | High | UC-2, BR-4/5/6 | Functional / Integration |
| 3 | US-3 Seamless migration for existing entries | Medium | UC-3, BR-7/8/9/10 | Functional / Regression |
| 4 | Scope override option | Medium | API 5.1 options.scopeOverride | Functional |
| 5 | Cache behavior and forceRefresh | Medium | FSD 2.3 | Performance / Integration |
| 6 | Error handling fallback to WORKSPACE | High | FSD 5.1 Error Handling | Exception |

### 3.2 Features Out of Scope
| # | Feature | Reason |
|---|---------|--------|
| 1 | Changing IsolationLayer backend logic | Per BRD out of scope |
| 2 | Modifying data retention policies | Per BRD out of scope |
| 3 | UI changes for manual scope override | Per BRD out of scope |

---

## 4. Test Environment

### 4.1 Environment Requirements
| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | SQLite dev | System Integration Testing |
| UAT | http://uat.example.com | PostgreSQL | User Acceptance Testing |

### 4.2 Test Data Requirements
| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| VCS workspaces | .git present with branches main, master, feature/x, develop | Scripted | Create temp dirs with git init |
| No VCS workspaces | Workspace without .git | Scripted | Empty dirs |
| mem_ingest payloads | KB entries with scope field | Test data CSV | documents/SA4E-242/testdata/ |

### 4.3 External Dependencies
| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Git CLI | git rev-parse | Mock exec in unit tests |
| indexer-http | POST /api/v1/kb/ingest | Real server in SIT |

---

## 5. Test Schedule
| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-05 | 2026-09-05 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-05 | 2026-09-06 | 1 day | Test data ready |
| SIT Execution | 2026-09-07 | 2026-09-09 | 3 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-10 | 2026-09-12 | 3 days | All Critical/Major fixed |
| UAT Execution | 2026-09-13 | 2026-09-14 | 2 days | UAT sign-off |

---

## 6. Resources & Responsibilities
| Role | Name | Responsibility |
|------|------|----------------|
| Test Lead | QA Agent | Test planning, coordination |
| QA Engineer | QA Agent | Test design, execution |
| BA | BA Agent | UAT support |
| Developer | DEV Agent | Bug fixing |
| DevOps | DevOps Agent | Environment setup |

---

## 7. Risk & Mitigation
| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Git CLI unavailable in test env | High | Medium | Mock exec in unit tests, fallback validation |
| 2 | Cache masking detection bugs | Medium | Medium | ForceRefresh tests, cache TTL verification |
| 3 | Workspace path variations | Medium | Low | Test multiple OS path patterns |

---

## 8. Defect Management
### 8.1 Severity
Critical: scope mis-assignment causing data pollution
Major: detector fails, fallback not working
Minor: logging message mismatch
Trivial: typo in reason string

### 8.2 Defect Lifecycle
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics
| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥95% |
| Critical Defect Count | 0 |
| Detector latency p95 | <50ms |

---

## Appendix
Glossary: WORKSPACE, PROJECT, VCS, KB, detectKbScope
