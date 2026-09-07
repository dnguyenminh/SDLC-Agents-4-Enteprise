# Software Test Plan (STP)

## SDLC-Agents-4-Enterprise — SA4E-247: Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-247 |
| Title | Cải thiện UI KB Graph: Legend window, Minimap và Filter với tách component |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-06 |
| Status | Draft |
| Related BRD | documents/SA4E-247/BRD.md |
| Related FSD | documents/SA4E-247/FSD.md |
| Related TDD | documents/SA4E-247/TDD.md |
| Related Security Review | documents/SA4E-247/SECURITY-REVIEW.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | – | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-06 | QA Agent | Initiate document — auto-generated from BRD, FSD, TDD, SECURITY-REVIEW |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

Test Plan này định nghĩa chiến lược kiểm thử cho việc cải thiện UI KB Graph: Legend Window độc lập, Minimap Enhanced, Filter Panel với wildcard search và tách component. Mục tiêu đảm bảo các component mới hoạt động đúng theo BRD/FSD/TDD, đạt non-functional requirements và giảm thiểu rủi ro bảo mật đã xác định trong SECURITY-REVIEW.

### 1.2 Test Objectives

- Verify all functional requirements từ FSD UC-001, UC-002, UC-003 được implement chính xác
- Validate business rules BR-01 đến BR-06 được enforce
- Ensure UI component separation và state persistence hoạt động đúng
- Validate wildcard search realtime <200ms p95
- Verify security controls cho localStorage, postMessage, wildcard RegExp, XSS prevention
- Ensure backward compatibility với backend viewer hiện tại

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-247/BRD.md |
| FSD | documents/SA4E-247/FSD.md |
| TDD | documents/SA4E-247/TDD.md |
| SECURITY-REVIEW | documents/SA4E-247/SECURITY-REVIEW.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties random inputs | Automated | fast-check |
| UT | Unit/edge case tests | Automated | vitest |
| IT | API integration Hono app in-process | Automated | vitest + Hono app.request() |
| E2E-API | REST endpoint E2E real server | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E Playwright | Automated | Playwright |
| SIT | Manual exploratory / visual | Manual | Browser |

### 2.2 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 12 | 12 | 0 |
| IT | 6 | 6 | 0 |
| E2E-API | 8 | 8 | 0 |
| E2E-UI | 22 | 22 | 0 |
| SIT | 10 | 0 | 10 |
| **Total** | **61** | **51 (84%)** | **10 (16%)** |

### 2.3 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD use cases | Yes |
| Regression Testing | Ensure existing graph viewer not broken | Yes |
| Performance Testing | Filter realtime <200ms, minimap 60fps | Yes |
| Security Testing | localStorage poisoning, ReDoS, XSS, postMessage | Yes |
| Usability Testing | Drag/resize/move UX | Yes |
| Compatibility Testing | Chrome/Edge VS Code webview | Yes |

### 2.4 Test Approach

Risk-based prioritization. Legend Window, Minimap Enhanced và Filter Panel wildcard là MUST HAVE. Security findings High/Medium từ SECURITY-REVIEW được ưu tiên test sớm. Automation tập trung vào E2E-API/E2E-UI để giảm manual SIT xuống visual/UX only.

E2E Automation Coverage:
- CRUD-like UI flows → E2E-UI
- API response verification → E2E-API
- RBAC/auth → E2E-API
- Status changes → E2E-UI
- Blocking overlay timing → SIT manual
- Visual/layout → SIT manual

### 2.5 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code merged to test branch, unit tests passed, TDD approved, test data prepared |
| UAT | SIT completed with 0 Critical, ≤2 Major open, security findings High mitigated |

### 2.6 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, Pass Rate ≥95%, 0 Critical defects open |
| UAT | All UAT scenarios passed, BA sign-off obtained |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Legend Window Independent draggable/resizable/maximizable | MUST | UC-001, BR-01, BR-02 | Functional, UI, Security |
| 2 | Minimap Enhanced rotate/span/zoom-to-click | MUST | UC-002, BR-03, BR-04 | Functional, Performance |
| 3 | Filter Panel with wildcard * ? realtime | SHOULD | UC-003, BR-05, BR-06 | Functional, Performance, Security |
| 4 | Component separation LegendWindow/MinimapController/FilterPanel | MUST | TDD 5.1 | Integration |
| 5 | Security controls localStorage sanitization, postMessage validation, safe wildcard | HIGH | SECURITY-REVIEW Findings #1-#5 | Security |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Backend graph data logic/API changes | No API contract change per BRD 1.2 |
| 2 | Layout algorithm change | Out of scope |
| 3 | Export/import graph | Not requested |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Purpose |
|-------------|-----|---------|
| SIT | VS Code extension webview localhost | System Integration Testing |
| UAT | VS Code production extension | User Acceptance |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|----|----------|
| Chrome | 120+ | Windows/Mac | Yes |
| VS Code Webview | Latest | Windows/Mac | Yes |

### 4.3 Test Data Requirements

- Node types sample >100 items for legend scroll
- Node types with special chars for wildcard test
- localStorage poisoned values for security tests
- JWT valid token for API tests

### 4.4 External Dependencies

| System | Dependency | Mock/Stub |
|--------|------------|-----------|
| Backend Viewer API | GET /api/v1/admin/kb-graph/nodes/summary | No, real API |
| Pega Rule Index | Data source via backend | Mock data set |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-06 | 2026-09-06 | 1d | STP + STC approved |
| Test Data Prep | 2026-09-07 | 2026-09-07 | 1d | Data ready |
| SIT Execution | 2026-09-08 | 2026-09-10 | 3d | SIT sign-off |
| Defect Fix & Retest | 2026-09-11 | 2026-09-12 | 2d | Critical/Major fixed |
| UAT Execution | 2026-09-13 | 2026-09-14 | 2d | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|----------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | DEV Agent | Bug fixing, unit test coverage |
| DevOps | DevOps Agent | Environment setup |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Component refactor breaks layout | High | Medium | Visual regression E2E-UI |
| 2 | Performance degrade with large legend | Medium | Low | Virtualized list, performance test |
| 3 | Minimap rotate coordinate mapping error | Medium | Medium | Integration tests with graph library |
| 4 | ReDoS via wildcard search | High | Medium | Security test + safe regex implementation |
| 5 | localStorage poisoning DoS UI | Medium | Medium | Sanitization test |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, security breach | ReDoS freeze UI |
| Major | Feature not working | Legend window not draggable |
| Minor | UI issue | Misaligned button |
| Trivial | Typo | Wrong label |

### 8.2 Priority Levels

| Priority | Definition | SLA |
|----------|-----------|-----|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 day |
| P3 | Should fix if time permits | 3 days |
| P4 | Nice to fix | Next release |

### 8.3 Defect Lifecycle

New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥95% |
| Critical Defect Count | 0 |
| Defect Fix Rate | ≥90% |

### 9.2 Reporting Schedule

Daily status during SIT/UAT, final completion report.

---

## 10. Appendix

![Test Execution Flow](diagrams/test-execution-flow.png)
