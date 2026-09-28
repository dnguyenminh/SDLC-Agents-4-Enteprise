# Software Test Plan (STP)

## Pi Coding Agent Extension — SA4E-313: Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace')

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-313 |
| Title | Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace') |
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

This test plan defines the strategy, scope, environment, schedule, resources and quality criteria for testing SA4E-313: passing IDE workspace root as cwd to Pi SDK session. The objective is to verify that the VS Code extension correctly detects workspace root, passes cwd to createAgentSession and SessionManager.inMemory(cwd), and ensures built-in tools and resource loader operate against the correct project without prompting user for workspace path.

### 1.2 Test Objectives

- Verify all functional requirements from FSD Section 3.1 are implemented correctly
- Validate business rules BR-1 to BR-7 are enforced
- Ensure non-functional requirements for performance and security are met
- Confirm error handling for missing workspace and invalid path
- Ensure chatbox no longer prompts for workspace path

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-313/BRD.md |
| FSD | documents/SA4E-313/FSD.md |
| TDD | documents/SA4E-313/TDD.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties for path handling and cwd validation | Automated | fast-check |
| UT | Unit/edge case tests for workspace detection logic | Automated | vitest |
| IT | Integration tests for extension ↔ VS Code API ↔ Pi SDK session creation | Automated | vitest + mocks |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser/Extension UI E2E for chatbox behavior | Automated | Playwright |
| SIT | Manual exploratory / visual UX checks | Manual | VS Code UI |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases | Yes |
| Regression Testing | Ensure existing tools still work | Yes |
| Performance Testing | cwd resolution synchronous <50ms | Yes |
| Security Testing | Path sanitization, absolute path validation | Yes |
| Usability Testing | Chatbox no longer prompts for path | Yes |

### 2.3 Test Approach

Risk-based testing focusing on workspace detection and session initialization. Unit tests cover workspace path extraction and validation. Integration tests verify createAgentSession receives correct cwd. E2E-UI tests validate chatbox behavior in VS Code. Manual SIT covers visual confirmation and edge cases not easily automated.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT extension build, unit tests passed, test workspace prepared |
| UAT | SIT completed with no Critical/Major defects open, UAT environment ready |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open |
| UAT | All UAT scenarios passed, business sign-off obtained |

**E2E Automation Coverage**: SIT scenarios for CRUD-like operations, form validation, auth checks, status changes can be automated as E2E-UI. Only visual timing and complex UX flows remain manual.

### Test Levels Table

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs) | Automated | fast-check |
| UT | Unit/edge case tests | Automated | vitest |
| IT | API integration (Hono app in-process) | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only | Manual | Browser |

### Test Cases Summary Table

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 5 | 5 | 0 |
| IT | 3 | 3 | 0 |
| E2E-API | 0 | 0 | 0 |
| E2E-UI | 4 | 4 | 0 |
| SIT | 2 | 0 | 2 |
| **Total** | **16** | **14 (87.5%)** | **2 (12.5%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Pass IDE workspace root as cwd to Pi SDK session | MUST HAVE | UC-1, BR-1..BR-7 | Functional/Integration/E2E-UI |
| 2 | Workspace detection fallback | MUST HAVE | AF-1, EF-1, EF-2 | Exception |
| 3 | Built-in tools resolve against cwd | MUST HAVE | BR-3 | Functional |
| 4 | AGENTS.md auto-load | MUST HAVE | BR-5 | Functional |
| 5 | No workspace path prompt | MUST HAVE | BR-4, AC-4 | UI/Usability |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Changes to Pi SDK core library | Out of scope per BRD 1.2 |
| 2 | Multi-root workspace beyond first folder | Out of scope per BRD 1.2 |
| 3 | Sessions created outside VS Code extension | Out of scope |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Purpose |
|-------------|-----|---------|
| SIT | VS Code Insiders + Local Extension Build | System Integration Testing |
| UAT | VS Code Stable + Release Candidate | User Acceptance Testing |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| N/A - VS Code Extension | - | Windows 10+/macOS 12+ | Yes |

### 4.3 Test Data Requirements

| Data Type | Description | Source |
|-----------|-------------|--------|
| Valid workspace path | Existing project folder with AGENTS.md | Local test project |
| Missing workspace | No workspace opened | VS Code empty window |
| Invalid path | Relative path / non-existent folder | Mock config |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| VS Code Workspace API | workspace.workspaceFolders | Yes - mock object |
| Pi SDK | createAgentSession, SessionManager | Yes - in-memory |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-25 | 2026-09-25 | 1 day | STP + STC approved |
| Test Execution | 2026-09-26 | 2026-09-27 | 2 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-28 | 2026-09-29 | 2 days | All Critical/Major fixed |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | TBD | Bug fixing, unit test coverage |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | workspaceFolders unavailable in headless mode | Medium | Low | Fallback with warning tested |
| 2 | Path sanitization bypass | High | Low | Security tests for absolute path validation |
| 3 | Multi-root ambiguity | Medium | Medium | Document limitation, use first folder |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition |
|----------|-----------|
| Critical | Session fails to create, data loss |
| Major | Feature not working, workaround exists |
| Minor | UI issue, log message missing |
| Trivial | Typo |

### 8.2 Priority Levels

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

### 9.1 Metrics

| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥ 95% |
| Critical Defect Count | 0 |

### 9.2 Reporting Schedule

| Report | Frequency |
|--------|-----------|
| Daily Test Status | Daily during SIT |
| Test Completion Report | End of SIT |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| cwd | Current working directory passed to Pi SDK |
| SIT | System Integration Testing |

### Assumptions

- User opens VS Code with at least one workspace folder
- Pi SDK cwd parameter works as documented
