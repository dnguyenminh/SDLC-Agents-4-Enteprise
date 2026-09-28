# Software Test Plan (STP)

## Pi Extensions — SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-316 |
| Title | Register custom tools via Pi Extensions (bridge MCP wrapper tools) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related BRD | documents/SA4E-316/BRD.md |
| Related FSD | documents/SA4E-316/FSD.md |
| Related TDD | documents/SA4E-316/TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | SM – Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-25 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## 1. Introduction

### 1.1 Purpose
This Test Plan defines the strategy, scope, schedule, resources, and entry/exit criteria for testing the Pi Extensions feature that registers custom tools via Pi Extensions to bridge MCP wrapper tools running on port 9181.

### 1.2 Test Objectives
- Verify all functional requirements from FSD UC-1, UC-2, UC-3 are implemented correctly
- Validate business rules BR-1 to BR-4 are enforced
- Ensure non-functional requirements for latency <2s, availability, scalability >50 tools, and schema validation are met
- Ensure error reporting is clear and errors are not swallowed

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-316/BRD.md |
| FSD | documents/SA4E-316/FSD.md |
| TDD | documents/SA4E-316/TDD.md |

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
| Security Testing | Verify input validation via TypeBox/Zod | Yes |
| Usability Testing | N/A - code level extension | No |

### 2.3 Test Approach
Risk-based test design covering happy path, alternative flows, exception flows, business rules, boundary, negative, and non-functional requirements. Automation prioritized for tool registration flow, invocation proxy, and error propagation. Manual SIT for visual verification of tool list and error messages.

### 2.4 Entry/Exit Criteria per level

| Level | Entry Criteria | Exit Criteria |
|-------|----------------|---------------|
| UT | Code merged to feature branch, unit tests written | All unit tests pass, coverage ≥80% |
| IT | UT passed, MCP wrapper running on 9181 | All integration tests pass |
| E2E-API | IT passed, extension loaded | All E2E-API tests pass, latency <2s |
| SIT | E2E passed, test data prepared | 100% test cases executed, 0 Critical defects |

### 2.5 E2E Automation Coverage
SIT scenarios classified to E2E-API/E2E-UI to minimize manual testing:
- Tool registration verification → E2E-API
- Tool invocation proxy → E2E-API
- Tool list visibility → E2E-UI
- Error reporting → E2E-API/E2E-UI

**STP Test Cases Summary Table**

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 4 | 4 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 6 | 6 | 0 |
| E2E-UI | 3 | 3 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **23** | **19 (83%)** | **4 (17%)** |

---

## 3. Test Scope

### 3.1 Features In Scope
| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Register custom tools via Pi Extensions | High | UC-1, BR-1..BR-4 | Functional / Integration |
| 2 | Tools visible in session | High | UC-2 | Functional / E2E-UI |
| 3 | Clear error reporting | High | UC-3, BR-4 | Functional / Exception |

### 3.2 Features Out of Scope
| # | Feature | Reason |
|---|---------|--------|
| 1 | Implementing new MCP services | Out of scope per BRD 1.2 |
| 2 | Modifying Pi core SDK | Out of scope per BRD 1.2 |
| 3 | UI for tool management | Not required |

---

## 4. Test Environment

### 4.1 Environment Requirements
| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | N/A | Extension load & tool invocation testing |
| MCP Wrapper | http://localhost:9181 | N/A | Tool proxy validation |

### 4.2 Test Data Requirements
| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Extension file | Sample extension registering tools | Code | Create test extension |
| MCP tools | jira_get_issue, mem_search, code_search, execute_dynamic_tool | MCP 9181 | Ensure running |
| Invalid params | Bad schema payloads | Test data CSV | Predefined |

### 4.3 External Dependencies
| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| MCP Wrapper Server | Port 9181 reachable | Mock server for unreachable test |
| Pi SDK | @earendil-works/pi-coding-agent | Real SDK |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-25 | 2026-09-25 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-25 | 2026-09-26 | 1 day | Test data ready |
| SIT Execution | 2026-09-26 | 2026-09-27 | 2 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-28 | 2026-09-29 | 2 days | All Critical/Major fixed |
| Go-Live | 2026-09-30 | 2026-09-30 | 1 day | Production deployment |

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
| 1 | MCP wrapper unreachable | High | Low | Health check before registration, mock for tests |
| 2 | Schema mismatch Pi/MCP | Medium | Medium | Use shared TypeBox schemas, unit test validation |
| 3 | Tool registration path misconfig | High | Medium | Validate extension discovery paths, log registration |
| 4 | Errors swallowed | Medium | Medium | Wrap execute with try/catch, explicit error return |

---

## 8. Defect Management

### 8.1 Severity Levels
| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, tool registration failure | Extension fails to load |
| Major | Feature not working, workaround exists | Tool invocation returns wrong result |
| Minor | UI issue, cosmetic defect | Tool label truncated |
| Trivial | Typo | Description typo |

### 8.2 Priority Levels
| Priority | Definition | SLA |
|----------|-----------|-----|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix | Next release |

---

## 9. Test Metrics & Reporting

### 9.1 Metrics
| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥95% |
| Critical Defect Count | Count | 0 |

---

## 10. Appendix

### Glossary
| Term | Definition |
|------|------------|
| SIT | System Integration Testing |
| STP | Software Test Plan |
| STC | Software Test Cases |
| MCP | Model Context Protocol |

