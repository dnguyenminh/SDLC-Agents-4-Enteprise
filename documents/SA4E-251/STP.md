# Software Test Plan (STP)

## SA4E-251 — Jira MCP tool description layout broken on update

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-251 |
| Title | Jira MCP tool description layout broken on update |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-06 |
| Status | Draft |
| Related BRD | documents/SA4E-251/BRD.md |
| Related FSD | documents/SA4E-251/FSD.md |
| Related TDD | documents/SA4E-251/TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer |  | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-06 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, environments, resources, and entry/exit criteria for verifying that markdown formatting is preserved when updating Jira issue descriptions via the `jira_update_issue` MCP tool. Focus areas are heading preservation, nested list indentation, and SA4E-XXX smart link conversion, achieving parity with manual paste behavior.

### 1.2 Test Objectives

- Verify all functional requirements from FSD for heading, nested list, and smart link preservation are implemented correctly
- Validate business rules BR-01 to BR-07 are enforced
- Ensure acceptance criteria from BRD Stories 1-3 are met
- Verify error handling and validation per TDD
- Ensure non-functional requirements: no added latency, automation parity with manual paste
- Minimize manual SIT to visual/UX-only checks via E2E automation

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-251/BRD.md |
| FSD | documents/SA4E-251/FSD.md |
| TDD | documents/SA4E-251/TDD.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties for description string handling with random markdown inputs | Automated | fast-check |
| UT | Unit tests for UpdateIssueSchema validation, jira-issue-tools handler, JiraApiClient mapping | Automated | vitest |
| IT | API integration tests using Hono app in-process with mocked Jira client | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E against real MCP server and Jira test instance | Automated | vitest + fetch |
| E2E-UI | Browser UI verification of rendered description in Jira Cloud UI | Automated | Playwright |
| SIT | Manual exploratory / visual layout verification | Manual | Browser |

**E2E Automation Coverage:** CRUD update operations, form validation, auth checks, status changes are automated as E2E-API/E2E-UI. SIT reserved for visual timing, complex UX flows, and layout rendering judgment.

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify headings, nested lists, smart links preserved per use cases | Yes |
| Regression Testing | Ensure existing jira_update_issue behavior not broken | Yes |
| Non-Functional Testing | Latency parity, data integrity | Yes |
| Security Testing | Auth validation, input sanitization | Yes |
| UI Testing | Visual rendering in Jira UI | Yes |

### 2.3 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 6 | 6 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 6 | 6 | 0 |
| E2E-UI | 4 | 4 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **29** | **23 (79%)** | **6 (21%)** |

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT environment, unit tests passed, test data prepared, Jira test project available |
| UAT | SIT completed with no Critical/Major defects open, UAT environment ready |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open, RTM coverage 100% |
| UAT | All UAT scenarios passed, business sign-off obtained |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Preserve markdown headings on MCP update | MUST HAVE | UC-01, BR-01/02/03 | Functional/E2E-UI |
| 2 | Preserve nested lists on MCP update | MUST HAVE | UC-02, BR-04/05 | Functional/E2E-UI |
| 3 | Preserve SA4E-XXX smart links on MCP update | MUST HAVE | UC-03, BR-06/07 | Functional/E2E-API |
| 4 | Validation and error handling for description updates | MUST HAVE | TDD §3.2, FSD §9 | Functional/Integration |
| 5 | Parity with manual paste rendering | MUST HAVE | BRD AC 1.3, 2.2, 3.1 | E2E-UI/SIT |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Jira server-side rendering engine changes | Out of scope per BRD 1.2 |
| 2 | Support for non-markdown description formats | Out of scope per BRD 1.2 |
| 3 | Enhancements beyond description field in MCP tool | Out of scope per BRD 1.2 |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | N/A | MCP server + Jira test instance |
| UAT | Jira Cloud SA4E project | N/A | Business validation |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chrome | 120+ | Windows/Mac | Yes |
| Firefox | 120+ | Windows/Mac | No |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Test Issues | SA4E-xxx issues for update tests | Jira test project | Pre-seeded via CSV |
| Description Payloads | Markdown with headings, lists, smart links | test-data/*.csv | Prepared in test-data folder |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Jira Cloud REST API | Issue update endpoint | Test instance available, no mock needed |
| MCP Server | jira_update_issue tool | Real server in SIT |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-06 | 2026-09-06 | 1d | STP + STC approved |
| Test Data Preparation | 2026-09-06 | 2026-09-06 | 1d | Test data ready |
| SIT Execution | 2026-09-07 | 2026-09-08 | 2d | SIT sign-off |
| Defect Fix & Retest | 2026-09-09 | 2026-09-09 | 1d | All Critical/Major fixed |
| UAT Execution | 2026-09-10 | 2026-09-10 | 1d | UAT sign-off |

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
| 1 | Jira API strips markdown formatting | High | Medium | Validate payload format; test with multiple clients |
| 2 | Smart link conversion depends on Jira server settings | Medium | Medium | Document prerequisite settings |
| 3 | Test data not available on time | High | Medium | Prepare mock data in advance |
| 4 | Environment instability | Medium | Medium | Dedicated test environment, monitoring |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, security breach | MCP tool crashes on update |
| Major | Feature not working, workaround exists | Headings not rendered |
| Minor | UI issue, cosmetic defect | Minor spacing difference |
| Trivial | Typo, minor alignment issue |  |

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
| MCP | Model Context Protocol |

### Assumptions

- Manual paste works correctly today
- Jira supports markdown rendering for descriptions
- Smart links conversion is server-side after content stored
