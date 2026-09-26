# Software Test Plan (STP)

## Pi Context Budget + Model Registry for small-context models — SA4E-324: Pi Context Budget + Model Registry for small-context models

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-324 |
| Title | Pi Context Budget + Model Registry for small-context models |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-26 |
| Status | Draft |
| Related BRD | documents/SA4E-324/BRD.md |
| Related FSD | documents/SA4E-324/FSD.md |
| Related TDD | documents/SA4E-324/TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – Reviewer | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-26 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines strategy, scope, schedule, resources and approach for testing Pi Context Budget + Model Registry for small-context models. It ensures Model Registry metadata is correct, context budget is calculated before session creation, thresholds enforce warning/reject, and thinkingLevel maps to maxTokens per model.

### 1.2 Test Objectives

- Verify all functional requirements from FSD UC-01 to UC-04 are implemented correctly
- Validate business rules BR-01 to BR-08 are enforced
- Ensure non-functional requirements: budget calculation <100ms, registry read-only, registry-driven scalability
- Prevent OOM crashes for small-context models

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-324/BRD.md |
| FSD | documents/SA4E-324/FSD.md |
| TDD | documents/SA4E-324/TDD.md |

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
| Regression Testing | Ensure existing session creation not broken | Yes |
| Performance Testing | Budget calculation <100ms per session | Yes |
| Security Testing | Registry read-only access | Yes |
| Usability Testing | N/A - backend config | No |

### 2.3 Test Approach

Risk-based prioritization on budget threshold and model registry. Unit tests for BudgetCalculator and ThinkingLevelMapper. Integration tests for SessionConfigurator with Model Registry. E2E-API tests for session creation gate. Manual SIT for diagnostics UI/logs.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT, unit tests passed, Model Registry seeded with phi-3-mini, smollm2-360m, llama3.1 8k |
| UAT | SIT completed with 0 Critical defects, test data ready |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open |
| UAT | All UAT scenarios passed, business sign-off obtained |

### 2.6 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 4 | 4 | 0 |
| IT | 3 | 3 | 0 |
| E2E-API | 2 | 2 | 0 |
| E2E-UI | 2 | 2 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **17** | **13 (76%)** | **4 (24%)** |

### 2.7 E2E Automation Coverage

CRUD operations via UI for registry config review → E2E-UI. API response verification for session creation → E2E-API. Visual timing of diagnostics logs → SIT manual.

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Register small-context models in Model Registry | MUST HAVE | UC-01, BR-01/02/03 | Functional |
| 2 | Calculate context budget before session | MUST HAVE | UC-02, BR-04/05 | Functional |
| 3 | Budget threshold warning/reject | MUST HAVE | UC-03, BR-06/07 | Functional |
| 4 | Map thinkingLevel to maxTokens | SHOULD HAVE | UC-04, BR-08 | Functional |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Agent core creation logic change | Out of scope per BRD 1.2 |
| 2 | Real-time streaming optimization | Out of scope per BRD 1.2 |
| 3 | Cost optimization beyond registry | Out of scope per BRD 1.2 |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | SQLite | System Integration Testing |
| UAT | http://uat.pi-agent.local | SQLite | User Acceptance Testing |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chrome | 120+ | Windows/Mac | Yes |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Model Registry entries | phi-3-mini 2048, smollm2-360m 1024, llama3.1 8192 | chat-models.ts seed | Code change |
| Session params | systemPromptChars ~7500, toolSchemaTokens, historyTokens | Test CSV | Pre-seed |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| LLM Provider | Model metadata | Mock registry |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-26 | 2026-09-26 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-27 | 2026-09-27 | 1 day | Test data ready |
| SIT Execution | 2026-09-28 | 2026-09-30 | 3 days | SIT sign-off |
| Defect Fix & Retest | 2026-10-01 | 2026-10-02 | 2 days | All Critical/Major fixed |
| UAT Execution | 2026-10-03 | 2026-10-04 | 2 days | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | Duc Nguyen Minh | UAT support, acceptance criteria clarification |
| Developer | Pi Agent Team | Bug fixing, unit test coverage |
| DevOps | TBD | Environment setup, deployment |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Token estimation inaccurate | High | Medium | Conservative heuristic + reserve 2000 |
| 2 | Model Registry incomplete | Medium | Medium | Unit test per model tier, bổ sung dần |
| 3 | Budget calc overhead >100ms | Low | Low | Cache registry, compute async |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | Session creation crashes OOM | Budget check bypass |
| Major | Feature not working, workaround exists | Threshold not enforced |
| Minor | UI log missing | Diagnostics not logged |
| Trivial | Typo in message | Message wording |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix | Next release |

### 8.3 Defect Lifecycle

New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥ 95% |
| Defect Density | Defects / Test Cases | ≤ 0.1 |
| Critical Defect Count | Count | 0 |

### 9.2 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily during SIT/UAT | Project team |
| Defect Summary | Daily | Dev team + PM |
| Test Completion Report | End of SIT/UAT | All stakeholders |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| SIT | System Integration Testing |
| STP | Software Test Plan |
| STC | Software Test Cases |

### Assumptions

- ContextWindow provided accurately by vendor
- System prompt ~7500 chars stable
