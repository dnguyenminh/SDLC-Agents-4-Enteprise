# Software Test Plan (STP)

## SA4E-276 — Admin UI for Entra SSO configuration management

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-276 |
| Title | Admin UI for Entra SSO configuration management |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-17 |
| Status | Draft |
| Related BRD | BRD.md |
| Related FSD | FSD.md |
| Related TDD | TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – Product Owner | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-17 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, resources, schedule and exit criteria for testing the Admin UI for Entra SSO configuration management (SA4E-276). The plan ensures functional, non-functional, security and integration requirements from BRD and FSD are verified, secrets are handled securely, RBAC is enforced, and hot reload works without downtime.

### 1.2 Test Objectives

- Verify all functional requirements from FSD Use Cases UC-001 to UC-004 are implemented correctly.
- Validate business rules BR-001 to BR-006 are enforced on UI and API.
- Ensure secrets are stored in Secret Store, never in plain text DB.
- Verify RBAC enforcement for view and edit operations.
- Validate hot reload / controlled restart completes within 5s p95 and audit logging works.
- Verify UI specifications for Entra SSO Configuration screen match FSD Section 3.1.5.
- Ensure error handling and user messages match FSD Section 9.

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-276/BRD.md |
| FSD | documents/SA4E-276/FSD.md |
| TDD | documents/SA4E-276/TDD.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties with random inputs | Automated | fast-check |
| UT | Unit/edge case tests | Automated | vitest |
| IT | API integration in-process Hono | Automated | vitest + Hono app.request() |
| E2E-API | REST endpoint E2E real server | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E Playwright | Automated | Playwright |
| SIT | Manual exploratory / visual UX only | Manual | Browser |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD use cases | Yes |
| Regression Testing | Ensure existing features not broken | Yes |
| Performance Testing | Config save/reload ≤5s p95 | Yes |
| Security Testing | RBAC, secret handling, auth | Yes |
| Usability Testing | UI/UX per FSD UI specs | Yes |
| Compatibility Testing | Chrome/Edge latest | Yes |

### 2.3 Test Approach

Risk-based testing prioritizing secret handling, RBAC and validation. Functional happy paths automated via E2E-API/E2E-UI. Alternative and exception flows automated. Business rules validated via UT/IT. Non-functional tests manual + automated metrics. SIT limited to visual timing and complex UX.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT, unit tests passed, test data prepared, Secret Store mock available |
| UAT | SIT completed with 0 Critical defects, ≤2 Major open, test plan approved |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open, all UC/BR covered |
| UAT | All UAT scenarios passed, business sign-off obtained |

### 2.6 E2E Automation Coverage

SIT manual limited to blocking overlay timing and visual layout verification. CRUD operations, form validation, RBAC checks, status changes automated as E2E-UI/E2E-API.

### 2.7 Test Levels Summary Table

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 4 | 4 | 0 |
| UT | 12 | 12 | 0 |
| IT | 10 | 10 | 0 |
| E2E-API | 18 | 18 | 0 |
| E2E-UI | 22 | 22 | 0 |
| SIT | 8 | 0 | 8 |
| **Total** | **74** | **66 (89%)** | **8 (11%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Manage Entra SSO Configuration via Admin Portal UI | MUST HAVE | UC-001, BR-001..006 | Functional/E2E-UI/E2E-API |
| 2 | Store Secrets in Secure Secret Store | MUST HAVE | UC-002, BR-006 | Functional/Security/IT |
| 3 | RBAC Enforcement for Edit Auth Method | MUST HAVE | UC-003, BR-005 | Functional/Security/E2E-API |
| 4 | Hot Reload / Controlled Restart | SHOULD HAVE | UC-004 | Functional/Non-Functional |
| 5 | View Current Entra SSO Status and Health | SHOULD HAVE | UC-001 | Functional/UI |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Entra ID OIDC login flow implementation | Covered in SA4E-262 |
| 2 | JIT provisioning logic | Out of scope for this ticket |
| 3 | User-facing SSO login UI changes | Covered in SA4E-273 |
| 4 | Secret Store implementation itself | Assumed existing infrastructure |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | https://admin-sit.sa4e.local | PostgreSQL SIT | System Integration Testing |
| UAT | https://admin-uat.sa4e.local | PostgreSQL UAT | User Acceptance Testing |

### 4.2 Browser / Device Requirements

| Browser | Version | OS | Required |
|---------|---------|----|----------|
| Chrome | 120+ | Windows/Mac | Yes |
| Edge | 120+ | Windows | Yes |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Pre-seeded Entra SSO config | Existing config for update tests | DB seed + Secret Store seed | SQL script + CSV |
| Valid/invalid UUIDs | TenantId/ClientId validation | CSV testdata | create-entra-testdata.csv |
| RBAC users | Auth Admin, System Admin, Viewer, No role | Auth service seed | pre-seeded-users.csv |
| Secret Store entries | Client secrets for configs | Secret Store mock | pre-seeded-secrets.csv |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Secret Store Service | Store/retrieve client secret | Mock available with 3-retry simulation |
| Config Reload Service | Hot reload trigger | Stub with success/failure toggle |
| Audit Log Service | Write audit events | Real SIT, mock for UT/IT |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-17 | 2026-09-18 | 2 days | STP + STC approved |
| Test Data Preparation | 2026-09-18 | 2026-09-19 | 2 days | Test data ready |
| SIT Execution | 2026-09-20 | 2026-09-24 | 5 days | SIT sign-off |
| Defect Fix & Retest | 2026-09-25 | 2026-09-26 | 2 days | All Critical/Major fixed |
| UAT Execution | 2026-09-27 | 2026-09-29 | 3 days | UAT sign-off |
| Go-Live | 2026-09-30 | 2026-09-30 | 1 day | Production deployment |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | UAT support, acceptance criteria clarification |
| Developer | Dev Agent | Bug fixing, unit test coverage |
| DevOps | DevOps Agent | Environment setup, deployment |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Secret Store unavailable during SIT | High | Medium | Mock Secret Store with retry simulation |
| 2 | RBAC misconfiguration allows unauthorized edit | High | Low | Backend enforcement tests + security review |
| 3 | Hot reload failure causes downtime | Medium | Low | Controlled restart fallback, monitoring |
| 4 | Test data for secrets not prepared on time | Medium | Medium | Prepare CSV seed files in advance |
| 5 | Requirement changes during testing | High | Low | Change freeze during SIT/UAT |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | System crash, data loss, security breach | Secret stored in plain text DB |
| Major | Feature not working, workaround exists | Save fails with valid data |
| Minor | UI issue, cosmetic defect | Misaligned label |
| Trivial | Typo, minor alignment issue | Spelling error in tooltip |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Must fix immediately | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

### 8.3 Defect Lifecycle

New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed
                                                      → Reopened → In Progress

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
| RBAC | Role-Based Access Control |

### Assumptions

- Secure Secret Store service is available and accessible.
- RBAC roles are defined and enforced in Admin Portal.
- Config reload service supports hot reload for auth settings.
- Admin users are trained on SSO configuration.
