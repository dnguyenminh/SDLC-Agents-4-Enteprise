# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-314: Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-314 |
| Title | Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-314.docx |
| Related FSD | FSD-v1.0-SA4E-314.docx |
| Related TDD | TDD-v1.0-SA4E-314.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – QA Lead | Review document |

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

This test plan defines the strategy, scope, and approach for testing the DefaultResourceLoader wiring feature for Pi SDK resource discovery in SA4E-314. The objective is to ensure DefaultResourceLoader is correctly constructed with cwd and agentDir, reload is invoked before session creation, and diagnostics are logged.

### 1.2 Test Objectives

- Verify all functional requirements from FSD UC-1, UC-2, UC-3 are implemented correctly
- Validate business rules BR-1 to BR-5 are enforced
- Ensure non-functional requirements for performance (<2s reload) and security path traversal are met
- Ensure error handling for invalid cwd and reload failure works as specified
- Ensure 100% traceability to BRD acceptance criteria

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-314/BRD.md |
| FSD | documents/SA4E-314/FSD.md |
| TDD | documents/SA4E-314/TDD.md |

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
| Performance Testing | Verify reload response times and load capacity | Yes |
| Security Testing | Verify path traversal prevention | Yes |
| Usability Testing | Verify UI/UX meets specifications | No |
| Compatibility Testing | Verify browser/device compatibility | No |

### 2.3 Test Approach

Risk-based testing focusing on deterministic resource discovery. Automated tests cover unit, integration, and E2E-API levels. SIT is limited to manual verification of diagnostics logging and edge cases. Property-based tests validate loader construction with random valid/invalid paths.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT environment, unit tests passed, test data prepared, Pi SDK installed |
| UAT | SIT completed with no Critical/Major defects open, UAT environment ready |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open |
| UAT | All UAT scenarios passed, business sign-off obtained |

### 2.6 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 6 | 6 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 3 | 3 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 5 | 0 | 5 |
| **Total** | **20** | **15 (75%)** | **5 (25%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Wire up DefaultResourceLoader with cwd + agentDir | High | UC-1, BR-1..BR-4 | Functional/Integration |
| 2 | Reload loader before session creation | High | UC-2, BR-5 | Functional/Integration |
| 3 | Log diagnostics/warnings | Medium | UC-3 | Functional |
| 4 | Performance: reload <2s | Medium | NFR Performance | Non-Functional |
| 5 | Security: path traversal prevention | High | NFR Security | Security |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Custom tools implementation | Separate ticket |
| 2 | System prompt/skills wiring | Separate ticket |
| 3 | Prompt templates/settings | Separate ticket |
| 4 | UI for resource discovery | No UI component |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | N/A | System Integration Testing |
| UAT | http://uat.example.com | N/A | User Acceptance Testing |

### 4.2 Browser / Device Requirements

Not applicable – backend configuration only.

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Valid cwd | Existing workspace path | Local FS | Create temp workspace |
| Invalid cwd | Non-existent path | Synthetic | Use random path |
| agentDir | ~/.pi/agent path | Local FS | Ensure directory exists |
| Pi SDK | @earendil-works/pi-coding-agent | npm | Installed |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Pi SDK | DefaultResourceLoader class | No – use real SDK |
| Workspace files | .pi/skills, .pi/extensions, .pi/prompts, AGENTS.md | Yes – create temp files |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-25 | 2026-09-25 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-26 | 2026-09-26 | 1 day | Test data ready |
| SIT Execution | 2026-09-27 | 2026-09-28 | 2 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-29 | 2026-09-30 | 2 days | All Critical/Major fixed |
| UAT Execution | 2026-10-01 | 2026-10-02 | 2 days | UAT sign-off |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | TBD | Bug fixing, unit test coverage |
| DevOps | TBD | Environment setup, deployment |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | cwd not accurate | High | Medium | Validate path exists, dependency SA4E-313 |
| 2 | Pi SDK API changes | Medium | Low | Pin version, monitor release notes |
| 3 | Test data not available | Medium | Low | Prepare mock .pi files in advance |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, security breach | Reload failure aborts session |
| Major | Feature not working, workaround exists | Loader not instantiated |
| Minor | UI issue, cosmetic defect | Log message format |
| Trivial | Typo, minor alignment issue | N/A |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

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
| DefaultResourceLoader | Pi SDK class for resource discovery |

### Assumptions

- SA4E-313 provides correct cwd
- Pi SDK supports DefaultResourceLoader with cwd and agentDir parameters
- Workspace has standard .pi/* structure
