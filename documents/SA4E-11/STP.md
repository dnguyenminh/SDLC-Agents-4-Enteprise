# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-11: Production Infrastructure

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-11 |
| Title | Production Infrastructure |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-28 |
| Status | Draft |
| Related BRD | documents/SA4E-11/BRD.md |
| Related FSD | documents/SA4E-11/FSD.md |
| Related TDD | documents/SA4E-11/TDD.md |

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
| 1.0 | 2026-09-28 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, schedule, resources and approach for testing SA4E-11 Production Infrastructure. The objective is to verify Docker Compose orchestration, nginx reverse proxy with TLS termination, PostgreSQL persistent checkpointer migration, health check endpoints, and CORS/CSRF protection per BRD/FSD/TDD.

### 1.2 Test Objectives

- Verify all functional requirements from FSD use cases UC-01 to UC-05 are implemented correctly
- Validate business rules BR-01 to BR-10 are enforced
- Ensure non-functional requirements for performance, security and availability are met
- Verify integration between Docker services, PostgreSQL and backend
- Ensure error handling and security controls work as specified

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-11/BRD.md |
| FSD | documents/SA4E-11/FSD.md |
| TDD | documents/SA4E-11/TDD.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties with random inputs for checkpointer UUID validation, payload JSON schema | Automated | fast-check |
| UT | Unit tests for checkpointer repository, health service, CORS/CSRF middleware | Automated | vitest |
| IT | API integration tests with Hono app in-process, PostgreSQL test container | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E against real server with Docker Compose stack | Automated | vitest + fetch |
| E2E-UI | Browser E2E for nginx TLS redirect and health page visibility | Automated | Playwright |
| SIT | Manual exploratory for visual UX, timing, complex flows | Manual | Browser |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases | Yes |
| Integration Testing | Component interactions: backend ↔ PostgreSQL, nginx ↔ backend | Yes |
| Regression Testing | Ensure existing features not broken | Yes |
| Performance Testing | Container startup <30s, health latency <100ms | Yes |
| Security Testing | TLS 1.2+, CORS whitelist, CSRF token | Yes |
| Non-Functional Testing | Availability, scalability | Yes |

### 2.3 Test Approach

Risk-based prioritization. Automate PBT/UT/IT/E2E-API/E2E-UI to maximize coverage. SIT limited to visual/timing checks that cannot be automated. Test data CSVs prepared for all CRUD/checkpointer scenarios. Docker Compose environment used for E2E tests.

### 2.4 Entry/Exit Criteria per Level

| Level | Entry Criteria | Exit Criteria |
|-------|----------------|---------------|
| PBT | TDD definitions stable | 100% properties pass |
| UT | Code committed, dependencies available | 100% UT pass, coverage ≥80% |
| IT | UT passed, test DB available | All IT cases pass |
| E2E-API | Docker Compose stack up, migrations run | All E2E-API cases pass, 0 Critical |
| E2E-UI | Nginx serving, TLS certs in place | All E2E-UI cases pass |
| SIT | E2E passed, manual test data ready | 100% SIT executed, 0 Critical/Major open |

### 2.5 E2E Automation Coverage

SIT scenarios classified as E2E-UI/E2E-API where possible:
- Docker compose up → E2E-API
- Health endpoints → E2E-API
- Checkpointer CRUD → E2E-API
- CORS/CSRF rejection → E2E-API
- TLS redirect → E2E-UI
- Visual layout of logs → SIT manual

---

## STP Test Levels Table

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs) | Automated | fast-check |
| UT | Unit/edge case tests | Automated | vitest |
| IT | API integration (Hono app in-process) | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only | Manual | Browser |

---

## STP Test Cases Summary Table

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 4 | 4 | 0 |
| UT | 12 | 12 | 0 |
| IT | 10 | 10 | 0 |
| E2E-API | 15 | 15 | 0 |
| E2E-UI | 6 | 6 | 0 |
| SIT | 8 | 0 | 8 |
| **Total** | **55** | **47 (86%)** | **8 (14%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Docker Compose Orchestration | MUST HAVE | UC-01, BR-01, BR-02 | Functional / Integration |
| 2 | nginx Reverse Proxy with TLS | MUST HAVE | UC-02, BR-03, BR-04 | Functional / Security / E2E-UI |
| 3 | PostgreSQL Persistent Checkpointer | MUST HAVE | UC-03, BR-05, BR-06 | Functional / Integration / E2E-API |
| 4 | Health Check Endpoints /healthz /ready | SHOULD HAVE | UC-04, BR-07, BR-08 | Functional / E2E-API |
| 5 | CORS/CSRF Protection | MUST HAVE | UC-05, BR-09, BR-10 | Security / E2E-API |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | CI/CD pipeline definition | Out of scope per BRD 1.2 |
| 2 | Kubernetes migration | Docker Compose target for release |
| 3 | Application business logic beyond checkpointer | Not part of SA4E-11 |

![Test Coverage](diagrams/test-coverage.png)

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:80 | PostgreSQL docker pgvector/pg16:16 | System Integration Testing |
| UAT | https://uat.sa4e.local | PostgreSQL | User Acceptance Testing |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|-----|----------|
| Chrome | 120+ | Windows/Linux | Yes |
| Firefox | 120+ | Windows/Linux | Optional |

### 4.3 Test Data Requirements

Test data CSVs located at `documents/SA4E-11/testdata/`:
- `pre-seeded-data.csv` — baseline users/services
- `checkpoint-testdata.csv` — valid/invalid checkpoints
- `auth-testdata.csv` — CORS origins, CSRF tokens
- `health-testdata.csv` — expected health responses

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| PostgreSQL | Docker image pgvector/pg16:16 | No — real container |
| nginx | nginx:alpine | No — real container |
| Monitoring System | Health polling | Stubbed responses |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-28 | 2026-09-28 | 1 day | STP + STC approved |
| Test Data Preparation | 2026-09-29 | 2026-09-29 | 1 day | Test data ready |
| SIT Execution | 2026-09-30 | 2026-10-02 | 3 days | SIT sign-off |
| Defect Fix & Retest | 2026-10-03 | 2026-10-04 | 2 days | All Critical/Major fixed |
| UAT Execution | 2026-10-05 | 2026-10-06 | 2 days | UAT sign-off |
| Go-Live | 2026-10-07 | 2026-10-07 | 1 day | Production deployment |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | DEV Agent | Bug fixing, unit test coverage |
| DevOps | DevOps Agent | Environment setup, deployment |

Tools: Vitest, Playwright, Docker Compose, PostgreSQL, draw.io

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | PostgreSQL migration data loss | High | Medium | Backup JSON files before migration, test migration script |
| 2 | nginx TLS misconfiguration | High | Low | Use reference config, automated tests for HTTPS |
| 3 | Health check false positives | Medium | Medium | Implement deep health checks for DB dependency |
| 4 | Test environment instability | Medium | Medium | Dedicated test environment, monitoring |
| 5 | Requirement changes during testing | High | Low | Change freeze during SIT/UAT |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, security breach | Container fails to start, DB connection loss |
| Major | Feature not working, workaround exists | Health endpoint returns 500 |
| Minor | UI issue, cosmetic defect | Log format mismatch |
| Trivial | Typo, minor alignment issue | Documentation typo |

### 8.2 Priority Levels

| Priority | Definition | SLA |
|----------|-----------|-----|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

### 8.3 Defect Lifecycle

New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥ 95% |
| Defect Density | Defects / Test Cases | ≤ 0.1 |
| Critical Defect Count | Count | 0 |
| Defect Fix Rate | Fixed / Total × 100% | ≥ 90% |

Reporting: Daily during SIT/UAT, Test Completion Report at end.

---

![Test Execution Flow](diagrams/test-execution-flow.png)

## 10. Appendix

### Glossary

SIT — System Integration Testing
UAT — User Acceptance Testing
STP — Software Test Plan
STC — Software Test Cases

### Assumptions

- Application supports PostgreSQL checkpointer interface
- Docker Compose acceptable deployment model
- DeerFlow reference infra applicable

