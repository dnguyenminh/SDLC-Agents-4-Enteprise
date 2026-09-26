# Software Test Plan (STP)

## Pi Smart Context Retrieval for repos with thousands of files — SA4E-325: Pi Smart Context Retrieval for repos with thousands of files

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-325 |
| Title | Pi Smart Context Retrieval for repos with thousands of files |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-26 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-325.docx |
| Related FSD | FSD-v1.0-SA4E-325.docx |
| Related TDD | TDD-v1.0-SA4E-325.docx |

---

## 1. Introduction

### 1.1 Purpose
Test the ContextRetriever component to ensure smart context retrieval before session creation works for repositories with thousands of files, keeping token budget <6k with progressive disclosure.

### 1.2 Test Objectives
- Verify all functional requirements from FSD UC-1, UC-2, UC-3 are implemented
- Validate business rules BR-1, BR-2, BR-3 enforced
- Ensure non-functional requirements: retrieval <500ms, support 1000+ files

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-325/BRD.md |
| FSD | documents/SA4E-325/FSD.md |
| TDD | documents/SA4E-325/TDD.md |

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
| Regression Testing | Ensure existing features are not broken | Yes |
| Performance Testing | Verify response times and load capacity | Yes |
| Security Testing | Verify auth, authorization, data protection | No |
| Usability Testing | Verify UI/UX meets specifications | No |

### 2.3 Test Approach
Risk-based prioritization. Prioritize automation for API and context retrieval logic. Manual SIT for token budget visual verification.

### 2.4 Entry/Exit Criteria per Level
Entry SIT: Code deployed, unit tests passed, test data prepared.
Exit SIT: 100% test cases executed, 0 Critical defects, ≤2 Major defects.

---

## 3. Test Scope

### 3.1 Features In Scope
| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Context Retrieval Before Session | High | UC-1, BR-1, BR-2 | Functional/IT/E2E-API |
| 2 | Progressive Disclosure 3-tier | High | UC-2, BR-3 | Functional/Performance |
| 3 | File Exclusion & Pagination | Medium | UC-3 | Functional |

### 3.2 Features Out of Scope
| # | Feature | Reason |
|---|---------|--------|
| 1 | Full repo re-indexing | Not part of this release |
| 2 | UI changes | Out of scope per BRD |

---

## 4. Test Environment
SIT: localhost:3000, SQLite test DB. Browsers: Chrome 120+.

## 5. Test Schedule
Test Planning: 2026-09-26 to 2026-09-27
Test Execution: 2026-09-28 to 2026-09-30

## 6. Resources & Responsibilities
Test Lead: QA Agent
QA Engineer: QA Agent
BA: Duc Nguyen Minh

## 7. Risk & Mitigation
Risk: Token counting inaccurate → Unit tests for counter
Risk: Search quality low → TopK + outline fallback

## 8. Defect Management
Severity: Critical/Major/Minor/Trivial
Priority P1-P4 with SLA

## 9. Test Metrics
Test Execution Rate 100%, Pass Rate ≥95%

### Test Levels Table
| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties | Automated | fast-check |
| UT | Unit/edge case | Automated | vitest |
| IT | API integration | Automated | vitest + Hono |
| E2E-API | REST endpoint | Automated | vitest + fetch |
| E2E-UI | Browser UI | Automated | Playwright |
| SIT | Manual exploratory | Manual | Browser |

### Test Cases Summary
| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 8 | 8 | 0 |
| IT | 6 | 6 | 0 |
| E2E-API | 4 | 4 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 5 | 0 | 5 |
| Total | 26 | 21 | 5 |
