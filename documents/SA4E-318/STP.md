# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-318: Add Prompt Templates + configure Settings/Models/Credentials

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-318 |
| Title | Add Prompt Templates + configure Settings/Models/Credentials |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-318.docx |
| Related FSD | FSD-v1.0-SA4E-318.docx |
| Related TDD | TDD-v1.0-SA4E-318.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | – – – | Review document |

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
This test plan defines the strategy, scope, and approach for testing SA4E-318: Add Prompt Templates + configure Settings/Models/Credentials. The objective is to verify that prompt templates are discoverable via slash commands, model/thinkingLevel configuration works correctly, and settings/credentials are loaded securely without hardcoding secrets.

### 1.2 Test Objectives
- Verify all functional requirements from FSD UC-1, UC-2, UC-3 are implemented correctly
- Validate business rules BR-1 to BR-6 are enforced
- Ensure error handling for template not found, invalid model, missing credential, settings parse error works as specified
- Verify non-functional requirements: prompt discovery <500ms, credentials reference-only, settings file-backed/in-memory support
- Ensure session initialization succeeds with valid configuration

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-318/BRD.md |
| FSD | documents/SA4E-318/FSD.md |
| TDD | documents/SA4E-318/TDD.md |

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
| Regression Testing | Ensure existing Pi SDK session features not broken | Yes |
| Performance Testing | Prompt discovery <500ms for <100 templates | Yes |
| Security Testing | Credentials reference-only, no hardcode | Yes |
| Usability Testing | Slash command autocomplete | No |
| Compatibility Testing | OS file path discovery | Yes |

### 2.3 Test Approach
Risk-based prioritization focusing on prompt discovery, model configuration, and secure credential loading. Automation prioritized for API-level tests. SIT limited to visual/UX verification of chat input autocomplete. E2E-API tests cover createAgentSession with various configs. E2E-UI tests cover slash command input flow.

### 2.4 Entry Criteria
| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT, unit tests passed, test prompt templates prepared, settings files ready |
| UAT | SIT completed with 0 Critical defects, UAT environment ready |

### 2.5 Exit Criteria
| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open |
| UAT | All UAT scenarios passed, business sign-off obtained |

**STP Test Cases Summary Table**

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 6 | 6 | 0 |
| IT | 6 | 6 | 0 |
| E2E-API | 4 | 4 | 0 |
| E2E-UI | 5 | 5 | 0 |
| SIT | 3 | 0 | 3 |
| **Total** | **27** | **24 (89%)** | **3 (11%)** |

---

## 3. Test Scope

### 3.1 Features In Scope
| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Prompt Templates discoverable via slash commands | High | UC-1, BR-1, BR-2 | Functional/E2E-UI |
| 2 | Model + ThinkingLevel configuration | High | UC-2, BR-3, BR-4 | Functional/E2E-API |
| 3 | Settings and Credentials configuration | High | UC-3, BR-5, BR-6 | Functional/Security |
| 4 | Error handling for template not found / load error | High | EF-1, EF-2 | Exception |
| 5 | Performance prompt discovery <500ms | Medium | NFR Performance | Non-Functional |

### 3.2 Features Out of Scope
| # | Feature | Reason |
|---|---------|--------|
| 1 | UI chính thức cho cấu hình | Phạm vi cấu hình qua code/config file |
| 2 | Quản lý secrets enterprise vault | Chỉ tham chiếu key name |
| 3 | Thay đổi workflow LangGraph | Ngoài việc migrate sang Pi SDK |

---

## 4. Test Environment

### 4.1 Environment Requirements
| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | SQLite | System Integration Testing |
| UAT | http://uat.example.com | PostgreSQL | User Acceptance Testing |

### 4.2 Browser / Device Requirements
| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chrome | 120+ | Windows/Mac | Yes |
| Edge | 120+ | Windows | No |

### 4.3 Test Data Requirements
| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Prompt templates | brd.md, fsd.md, tdd.md files | .pi/prompts | Create files with valid markdown |
| Settings file | JSON/YAML with model config | file-backed | Prepare valid/invalid files |
| Credentials reference | openai_api_key → env:OPENAI_KEY | in-memory | Mock env vars |
| Invalid model | unknown-model | test data | Inject invalid value |

### 4.4 External Dependencies
| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Pi SDK | @earendil-works/pi-agent-core | No - use real SDK |
| File System | .pi/prompts discovery | Mock folder |
| Credential Store | Environment variables | Mock |

---

## 5. Test Schedule
| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-25 | 2026-09-25 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-25 | 2026-09-26 | 1 day | Test data ready |
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
| 1 | Template discovery fail do path sai | High | Medium | Validate path và log diagnostics |
| 2 | Credential leak nếu hardcode | High | Low | Enforce reference-only, static scan |
| 3 | Model không tương thích | Medium | Medium | Validate model list trước khi khởi tạo |
| 4 | Performance discovery >500ms | Medium | Low | Benchmark with <100 templates |

---

## 8. Defect Management

### 8.1 Severity Levels
| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, security breach | Credential hardcoded |
| Major | Feature not working, workaround exists | Template not discoverable |
| Minor | UI issue, cosmetic defect | Autocomplete missing |
| Trivial | Typo | - |

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
| Defect Fix Rate | Fixed / Total × 100% | ≥ 90% |

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
| UAT | User Acceptance Testing |
| STP | Software Test Plan |
| STC | Software Test Cases |

### Assumptions
- Pi SDK API ổn định theo docs
- Người dùng có quyền truy cập thư mục prompts
- Credentials được quản lý bởi hệ thống môi trường bên ngoài
