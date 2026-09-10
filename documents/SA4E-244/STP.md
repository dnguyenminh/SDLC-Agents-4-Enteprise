# Software Test Plan (STP)

## SDLC-Agents-4-Enterprise — SA4E-244: Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-244 |
| Title | Admin Project Scope dropdown shows IDs instead of workspace/project names |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related BRD | documents/SA4E-244/BRD.md |
| Related FSD | documents/SA4E-244/FSD.md |
| Related TDD | documents/SA4E-244/TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – TBD | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, resources, schedule and exit criteria for testing the change to display human-readable workspace/project names in the Admin Project Scope dropdown at `localhost:48721/admin`. The objective is to verify that display_name is used as primary label with correct fallbacks, tooltip information, unchanged selection behavior and performance <200ms.

### 1.2 Test Objectives

- Verify Project Scope dropdown displays `display_name` when present per BRD Story 1 and FSD UC-1
- Validate fallback to workspace_path basename when display_name empty per BR-2
- Validate fallback to project_id slice when both empty per implementation
- Verify tooltip shows project_id and workspace_path per Story 2
- Verify 'All (Shared)' option remains unchanged per BR-4
- Verify selection behavior unchanged — value remains project_id per BR-3
- Verify dropdown load performance p95 <200ms per FSD 8.1
- Ensure no regression to admin filtering functionality

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-244/BRD.md |
| FSD | documents/SA4E-244/FSD.md |
| TDD | documents/SA4E-244/TDD.md |
| UG | documents/SA4E-244/UG.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties for label mapping with random inputs | Automated | fast-check |
| UT | Unit tests for label resolution logic | Automated | vitest |
| IT | API integration - Hono app in-process GET /api/admin/projects | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E - real server response schema | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E - dropdown rendering and selection | Automated | Playwright |
| SIT | Manual exploratory / visual verification only | Manual | Browser |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases UC-1, UC-2 | Yes |
| Regression Testing | Ensure existing admin filtering not broken | Yes |
| Performance Testing | Dropdown load <200ms p95 | Yes |
| Security Testing | JWT auth on GET /api/admin/projects unchanged | Yes |
| Usability Testing | Name readability vs IDs | Yes |

### 2.3 Test Approach

Risk-based prioritization. Happy path and fallback scenarios automated as E2E-API/E2E-UI. Only visual timing and layout verification remains manual SIT. Test data seeded via CSV testdata files. API tests use in-process Hono app; UI tests use Playwright against localhost:48721/admin with admin token.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to testing environment, implementation completed in backend/src/server/routes/admin/index.ts and backend/src/viewer/admin/index.html, test data prepared in documents/SA4E-244/testdata/ |
| UAT | SIT completed with 0 Critical defects, performance target met |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤1 Major defects open, performance p95 <200ms |
| UAT | All acceptance criteria from BRD signed off |

### 2.6 E2E Automation Coverage

CRUD not applicable. Automation covers:
- API response schema and label mapping
- UI dropdown option label and tooltip
- Selection persistence
Manual SIT retained for visual layout and blocking overlay timing.

**STP Test Cases Summary Table**

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 3 | 3 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 3 | 3 | 0 |
| E2E-UI | 5 | 5 | 0 |
| SIT | 2 | 0 | 2 |
| **Total** | **19** | **17 (89%)** | **2 (11%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Project Scope dropdown displays human-readable names | High | UC-1, BR-1, BR-2, BR-3 | Functional/E2E-UI |
| 2 | Optional identifier visibility via tooltip | Medium | UC-2, BR-5, BR-6 | Functional/E2E-UI |
| 3 | 'All (Shared)' option unchanged | High | BR-4 | Functional |
| 4 | Selection behavior unchanged | High | BR-3 | Regression |
| 5 | Performance load <200ms | Medium | FSD 8.1 | Non-Functional |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Project/workspace creation/deletion workflows | BRD 1.2 Out of Scope |
| 2 | Backend data model changes | No schema change per TDD |
| 3 | Other admin dropdowns | Only Project Scope |
| 4 | Authorization logic changes | Existing auth unchanged |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:48721/admin | SQLite project_registry | System Integration Testing |
| UAT | http://localhost:48721/admin | SQLite project_registry | User Acceptance |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chrome | 120+ | Windows | Yes |
| Edge | 120+ | Windows | No |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Project registry rows | project_id, display_name, workspace_path | SQLite seed | CSV pre-seeded-projects.csv |
| Admin token | JWT for authenticated API calls | Auth endpoint | Generated per test run |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Backend Admin Service | GET /api/admin/projects | No - real SQLite |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-05 | 2026-09-05 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-05 | 2026-09-05 | 0.5 day | Test data ready |
| SIT Execution | 2026-09-05 | 2026-09-06 | 1 day | SIT sign-off |
| Defect Fix & Retest | 2026-09-06 | 2026-09-06 | 0.5 day | All defects fixed |
| UAT Execution | 2026-09-07 | 2026-09-07 | 1 day | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | DEV Agent | Bug fixing, unit test coverage |
| DevOps | DevOps Agent | Environment setup |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | display_name missing for >10% rows | Medium | Medium | Fallback to ID, warning logged, test with empty names |
| 2 | Performance regression >200ms | Medium | Low | Measure p95, add in-memory cache if needed |
| 3 | Tooltip not rendered in some browsers | Low | Low | E2E-UI test across Chrome |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | Dropdown fails to load, selection breaks filtering | API returns 500 |
| Major | Wrong label shown, fallback not working | display_name ignored |
| Minor | Tooltip missing workspace_path | UI inconsistency |
| Trivial | Typo in 'All (Shared)' | Label mismatch |

### 8.2 Priority Levels

| Priority | Definition | SLA |
|----------|------------|-----|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix | Next release |

### 8.3 Defect Lifecycle

```
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed
                                                      → Reopened → In Progress
```

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥ 95% |
| Defect Density | Defects / Test Cases | ≤ 0.1 |
| Critical Defect Count | Count | 0 |
| Performance p95 | Measured load time | <200ms |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily | Project team |
| Test Completion Report | End of SIT | All stakeholders |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| SIT | System Integration Testing |
| STP | Software Test Plan |
| STC | Software Test Cases |

### Assumptions

- display_name populated for majority of projects
- Admin token available for UI tests
- No localization required

## Diagram References

![Test Coverage](diagrams/test-coverage.png)
![Test Execution Flow](diagrams/test-execution-flow.png)
