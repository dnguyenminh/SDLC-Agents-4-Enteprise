# Software Test Plan (STP)

## Pi Chat 3-pane Layout Redesign — SA4E-305: SA4E-289.9 - Pi Chat 3-pane Layout Redesign

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-305 |
| Title | SA4E-289.9 - Pi Chat 3-pane Layout Redesign |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related BRD | BRD.md |
| Related FSD | FSD.md |
| Related TDD | TDD.md |

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
| 1.0 | 2026-09-25 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, resources, and schedule for testing the Pi Chat 3-pane Layout Redesign feature (SA4E-305). The objective is to verify that the webview UI renders the new 3-pane workflow layout with Toolbar, Left, Center, Right, Input and Status Bar, Approval Panel and Worklist tab integration, reuses existing Svelte components/stores, and uses real data via extension-webview bridge with no hardcoded session/provider/model per SEC-289-11.

### 1.2 Test Objectives

- Verify all functional requirements from FSD UC-01 and UC-02 are implemented correctly
- Validate business rules BR-1 to BR-3 are enforced
- Ensure UI specifications for 8 layout elements are rendered per FSD 3.1.5
- Verify error handling for bridge timeout/failure
- Validate non-functional requirements: UI responsive, page loads < 2s, no hardcoded credentials
- Ensure regression of existing Pi Chat functionality

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-305/BRD.md |
| FSD | documents/SA4E-305/FSD.md |
| TDD | documents/SA4E-305/TDD.md |

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
| Security Testing | Verify no hardcoded credentials per SEC-289-11 | Yes |
| Usability Testing | Verify UI/UX meets specifications | Yes |
| Compatibility Testing | Verify browser/device compatibility | Yes |

### 2.3 Test Approach

Risk-based testing prioritizing layout rendering, bridge data flow, and business rules. Automation prioritized for E2E-UI and E2E-API scenarios. SIT limited to visual/UX timing verification. Property-based tests for store state transitions.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT environment, runtime model-resolution fixed, test data prepared, BRD/FSD approved |
| UAT | SIT completed with no Critical/Major defects open, UAT environment ready |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open, page load <2s verified |
| UAT | All UAT scenarios passed, business sign-off obtained |

#### Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 3 | 3 | 0 |
| IT | 2 | 2 | 0 |
| E2E-API | 2 | 2 | 0 |
| E2E-UI | 12 | 12 | 0 |
| SIT | 5 | 0 | 5 |
| **Total** | **26** | **21 (81%)** | **5 (19%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | 3-pane Layout Redesign with Toolbar/Left/Center/Right/Input/Status Bar | MUST HAVE | UC-01, BR-1, BR-2, BR-3 | Functional, UI, Non-Functional |
| 2 | Approval Panel and Worklist tab integration | SHOULD HAVE | UC-02 | Functional, UI |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Backend workflow logic changes | No functional change implied in ticket |
| 2 | New data entities | No new data model |
| 3 | Authentication changes | Existing extension authentication applies |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | localhost:3000 | N/A | System Integration Testing |
| UAT | VS Code extension webview | N/A | User Acceptance Testing |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chrome / Edge | 120+ | Windows/Mac | Yes |
| VS Code Webview | Latest | Windows/Mac/Linux | Yes |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Store state | Existing Svelte stores with mock messages | Extension mock | Use existing seed |
| Bridge messages | JSON messages for chat data | Extension host | Mock bridge in SIT |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| VS Code Extension Host | Message passing for real data | Yes - mock bridge |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-25 | 2026-09-25 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-26 | 2026-09-26 | 1 day | Test data ready |
| SIT Execution | 2026-09-27 | 2026-09-29 | 3 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-30 | 2026-10-01 | 2 days | All Critical/Major fixed |
| UAT Execution | 2026-10-02 | 2026-10-03 | 2 days | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | DEV Agent | Bug fixing, unit test coverage |
| DevOps | DevOps Agent | Environment setup, deployment |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Spec documents not accessible | High | Medium | Locate documents/SA4E-289/* before design |
| 2 | Runtime model-resolution not fixed | High | Medium | Enforce prerequisite gate |
| 3 | Breaking existing Svelte stores | Medium | Medium | Reuse components, follow frontend-structure steering |
| 4 | Bridge timing issues causing flaky E2E | Medium | Medium | Add retry and wait strategies in Playwright |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, webview fails to load, data loss | Webview blank after open |
| Major | Feature not working, workaround exists | Approval Panel not visible |
| Minor | UI issue, cosmetic defect | Misaligned toolbar spacing |
| Trivial | Typo, minor alignment issue | Label typo |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

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
| Critical Defect Count | Count of Critical severity | 0 |
| Defect Fix Rate | Fixed / Total Defects × 100% | ≥ 90% |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily during SIT/UAT | Project team |
| Defect Summary | Daily | Dev team + PM |
| Test Completion Report | End of SIT / End of UAT | All stakeholders |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| SIT | System Integration Testing |
| UAT | User Acceptance Testing |
| STP | Software Test Plan |
| STC | Software Test Cases |

### Assumptions

- Specification documents exist at documents/SA4E-289/PI-CHAT-LAYOUT-SPEC.md
- Existing Svelte components/stores can support 3-pane layout with minimal changes
- Extension <-> webview bridge is functional for real data
