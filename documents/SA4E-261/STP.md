# Software Test Plan (STP)

## Code Intelligence Indexer — SA4E-261: Indexer skips non-Java source files (JSP/XML/SQL/config) - index all supported source artifacts

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-261 |
| Title | Indexer skips non-Java source files (JSP/XML/SQL/config) - index all supported source artifacts |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-11 |
| Status | Draft |
| Related BRD | BRD.md |
| Related FSD | FSD.md |
| Related TDD | TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | — | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-11 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose
This Test Plan defines the testing strategy, scope, approach, environment, resources and risks for SA4E-261. The feature extends the Code Intelligence indexer to pick up non-Java source artifacts (JSP/XML/SQL/config), align extension whitelist between extension and backend via single source of truth, and enable Tier B full-text indexing for grammar-less files.

### 1.2 Test Objectives
- Verify UC-01 Unified Extension Whitelist & File Discovery is implemented per FSD 3.1.
- Verify UC-02 Tier B Full-Text Indexing for non-grammar files per FSD 3.2.
- Validate Business Rules BR-01 to BR-04 from FSD.
- Ensure API contract POST /api/index/source validates extensions, rejects unsupported files, and stores Tier A/B correctly.
- Ensure contract test guards extension/backend divergence.
- Validate non-functional requirements: indexing time increase <20%, response p95 <500ms, scalability to 10k+ files.
- Verify full-text search returns results for JSP/XML/SQL/config files.

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-261/BRD.md |
| FSD | documents/SA4E-261/FSD.md |
| TDD | documents/SA4E-261/TDD.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties for extension validation and tier routing | Automated | fast-check |
| UT | Unit tests for resolver, path sanitization, extension matching | Automated | vitest |
| IT | API integration in-process Hono app.request() | Automated | vitest + Hono app.request() |
| E2E-API | Real server REST endpoint /api/index/source, JWT auth, Tier A/B storage | Automated | vitest + fetch |
| E2E-UI | VS Code extension file discovery glob behavior (if UI exposed) | Automated | Playwright |
| SIT | Manual exploratory, visual KB search verification, visual timing | Manual | Browser |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify UC-01, UC-02, BR-01..BR-04 | Yes |
| Non-Functional Testing | Performance <20% increase, response p95 <500ms | Yes |
| Security Testing | JWT auth, path traversal protection | Yes |
| Integration Testing | Extension ↔ Backend ↔ KB | Yes |
| Regression Testing | Ensure Java/TS indexing not broken | Yes |

### 2.3 E2E Automation Coverage
Goal: minimize manual SIT to visual/UX only.

| Scenario Type | Classify As | Reason |
|--------------|-------------|--------|
| Upload .jsp/.xml/.sql via API | E2E-API | Status codes and tier verification |
| Auth 401/403 checks | E2E-API | API-level check sufficient |
| Extension contract divergence test | UT / IT | Automated guard |
| KB search for full-text files | E2E-API | Search API verification |
| File discovery glob includes new extensions | E2E-UI/Manual | Extension behavior |
| Visual KB search UI | SIT Manual | Human judgment |

### 2.4 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 5 | 5 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 6 | 6 | 0 |
| E2E-UI | 2 | 2 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **24** | **20 (83%)** | **4 (17%)** |

### 2.5 Entry Criteria
| Level | Entry Criteria |
|-------|---------------|
| SIT | Code merged to test branch, unit tests pass, test data prepared for projectId 97c72f0c2366 |
| UAT | SIT completed with 0 Critical/Major defects, contract test passing |

### 2.6 Exit Criteria
| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, Pass Rate ≥95%, 0 Critical defects open |
| UAT | Business sign-off on acceptance criteria BRD 2.3 |

---

## 3. Test Scope

### 3.1 Features In Scope
| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Index non-Java source artifacts | MUST HAVE | UC-01, BR-01, BR-02, BR-03 | Functional / E2E-API |
| 2 | Full-text indexing for non-grammar files | SHOULD HAVE | UC-02, BR-04 | Functional / E2E-API |
| 3 | Unified extension contract guard | MUST HAVE | BR-02, TDD §9 | Integration / UT |
| 4 | Tier A/B routing | MUST HAVE | FSD 3.1, 3.2, TDD §10 | Integration |
| 5 | Performance <20% increase | MUST HAVE | NFR Performance | Non-functional |
| 6 | API contract POST /api/index/source | MUST HAVE | FSD 3.1.6, TDD §8 | E2E-API |

### 3.2 Features Out of Scope
| # | Feature | Reason |
|---|---------|--------|
| 1 | Semantic JSP parser | Phase 1 limits to reference extraction per BRD 1.2 |
| 2 | UI changes beyond indexer behavior | No UI changes per BRD |
| 3 | Full performance load test with 100k files | Out of scope for this ticket |

---

## 4. Test Environment

### 4.1 Environment Requirements
| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | SQLite better-sqlite3 | System Integration Testing |
| UAT | http://uat.code-intel.local | Postgres | User Acceptance |

### 4.2 Test Data Requirements
| Data Type | Description | Source |
|-----------|-------------|--------|
| Sample project 97c72f0c2366 | e-commerce Spring Boot with JSP/XML/SQL | Pre-seeded |
| Test files .jsp/.xml/.sql/.properties/.yml/.html/.css | Valid and invalid content | testdata/ |
| JWT token admin | Auth for API tests | Auth service |

### 4.3 External Dependencies
| System | Dependency | Mock/Stub |
|--------|------------|-----------|
| Knowledge Base MCP | mem_ingest for Tier B | No |
| Tree-sitter grammars | Grammar existence check | N/A |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-11 | 2026-09-11 | 1d | STP + STC approved |
| Test Data Prep | 2026-09-12 | 2026-09-12 | 1d | Test data ready |
| SIT Execution | 2026-09-13 | 2026-09-14 | 2d | SIT sign-off |
| Defect Fix & Retest | 2026-09-15 | 2026-09-16 | 2d | All Critical/Major fixed |
| UAT | 2026-09-17 | 2026-09-18 | 2d | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|---------------|
| Test Lead | Test planning, coordination |
| QA Engineer | Test case design, execution, defect reporting |
| BA | UAT support, acceptance criteria clarification |
| Developer | Bug fixing, unit test coverage |
| DevOps | Environment setup |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Large XML/SQL files increase index time | Medium | Medium | Exclude >5MB via config, Tier B full-text |
| 2 | Extension/backend drift reoccurs | High | Medium | Contract test guard + single source constant |
| 3 | Sample project data unavailable | Medium | Low | Use seeded test files in testdata/ |
| 4 | JWT auth blocking API tests | Medium | Low | Use test auth helper |

---

## 8. Defect Management

### 8.1 Severity
Critical: System crash, silent drop of files
Major: Tier routing wrong, search missing
Minor: Log message mismatch
Trivial: Typo

### 8.2 Priority SLA
P1 4h, P2 1 day, P3 3 days, P4 next release

### 8.3 Defect Lifecycle
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting

| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥95% |
| Critical Defect Count | 0 |
| Defect Fix Rate | ≥90% |

Reporting daily during SIT.

---

## 10. Appendix

Test Coverage Overview diagram: `diagrams/test-coverage.png`
Test Execution Flow diagram: `diagrams/test-execution-flow.png`
