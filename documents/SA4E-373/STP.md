# Software Test Plan (STP)

## ide_launch / Kiro — SA4E-373: Fix ide_launch DevToolsActivePort timeout for Kiro

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-373 |
| Title | Fix ide_launch DevToolsActivePort timeout for Kiro |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related BRD | documents/SA4E-373/BRD.md |
| Related FSD | documents/SA4E-373/FSD.md |
| Related TDD | documents/SA4E-373/TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer |  –  | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | QA Agent | Initiate document — auto-generated from BRD, FSD, TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines testing strategy, scope, approach, environment, schedule, resources and exit criteria for verifying the fix to ide_launch DevToolsActivePort timeout for Kiro IDE with custom userDataDir. The plan ensures reliable launch with explicit remote-debugging-port support, timeout handling, error validation and security controls identified in SECURITY-REVIEW.md.

### 1.2 Test Objectives

- Verify ide_launch successfully launches Kiro with custom userDataDir without DevToolsActivePort timeout
- Validate explicit --remote-debugging-port forwarding makes port exposure deterministic
- Verify validation of userDataDir accessibility and remoteDebuggingPort availability
- Confirm timeout scenarios, error messages and recovery behavior
- Ensure backward compatibility for launches without custom userDataDir
- Validate security controls: localhost binding, path traversal protection, process spawn safety, DevTools access restrictions

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-373/BRD.md |
| FSD | documents/SA4E-373/FSD.md |
| TDD | documents/SA4E-373/TDD.md |
| SECURITY-REVIEW | documents/SA4E-373/SECURITY-REVIEW.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Responsibility | Tools |
|-------|-------|---------------|-------|
| Unit Testing | waitForDevtoolsPort, validation helpers | Developer | vitest |
| Integration Testing | IdeSessionManager launch flow | Developer + QA | vitest + child_process |
| System Testing (SIT) | End-to-end ide_launch CLI with Kiro | QA Team | Manual + scripted |
| Security Testing | Injection, path traversal, port exposure | QA + Security | Manual + scripted |
| User Acceptance Testing (UAT) | Manual UAT for SA4E-370 | BA + Business Users | Manual |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD UC-001, UC-002 | Yes |
| Regression Testing | Existing launches without custom dir still work | Yes |
| Performance Testing | Launch detection within 60s p95 | Yes |
| Security Testing | Input validation, port binding, path safety | Yes |
| Compatibility Testing | Kiro launch across OS paths | Yes |

### 2.3 Test Approach

Risk-based approach prioritizing happy path launch with custom userDataDir, explicit remote debugging port, and security findings. Manual SIT for IDE launch timing; automated unit/integration for validation logic. Security tests executed manually with evidence.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT, unit tests passed, Kiro installed, test userDataDir prepared |
| Security | TDD reviewed, SECURITY-REVIEW findings documented |
| UAT | SIT completed with 0 Critical defects, ≤2 Major defects open |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open, launch success rate >95% |
| Security | All High/Critical findings verified with mitigation or documented risk acceptance |
| UAT | All UAT scenarios passed, business sign-off obtained |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Reliable Kiro launch with custom userDataDir | High | UC-001, BR-1..BR-6 | Functional/Integration |
| 2 | Explicit remote debugging port support | High | UC-002, BR-7..BR-9 | Functional/Integration |
| 3 | Timeout handling and extended detection | Medium | UC-001 AF-2, BR-3 | Functional/Performance |
| 4 | Validation: userDataDir accessibility | Medium | BR-4, EF-1 | Functional/Security |
| 5 | Validation: remoteDebuggingPort availability | Medium | BR-5, EF-2 | Functional/Security |
| 6 | Security: localhost binding enforcement | High | SECURITY-REVIEW Finding #1 | Security |
| 7 | Security: userDataDir path traversal protection | High | SECURITY-REVIEW Finding #2 | Security |
| 8 | Security: process spawn injection mitigation | Critical | SECURITY-REVIEW Finding #3 | Security |
| 9 | Security: DevTools authentication/limitations | Medium | SECURITY-REVIEW Finding #4 | Security |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Modifications to Kiro IDE core source | Out of scope per BRD 1.2 |
| 2 | Other IDE launch mechanisms | Not related to DevToolsActivePort detection |
| 3 | userDataDir management beyond launch validation | Separate feature |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | Purpose |
|-------------|---------|
| SIT | System Integration Testing of ide_launch |
| UAT | User Acceptance Testing for SA4E-370 |

### 4.2 System Requirements

| Component | Version | OS |
|-----------|---------|-----|
| Node.js | 20.x | Windows 10/11 |
| Kiro IDE | latest | Windows 10/11 |
| ide_launch tool | SA4E-373 branch | Windows 10/11 |

### 4.3 Test Data Requirements

| Data Type | Description | Preparation |
|-----------|-------------|-------------|
| userDataDir | Custom isolated directories | Create C:\temp\kiro-uat, C:\temp\kiro-invalid |
| remoteDebuggingPort | Valid/invalid ports | Reserve 9222, 9223 |
| Timeout values | 10s, 30s, 60s | CLI param |

### 4.4 External Dependencies

| System | Dependency | Mock Available |
|--------|-----------|----------------|
| Kiro IDE | --remote-debugging-port flag support | No - real IDE required |
| Filesystem | userDataDir access | Yes - local directories |

---

## 5. Test Schedule

| Phase | Start | End | Duration |
|-------|-------|-----|----------|
| Test Planning | 2026-10-19 | 2026-10-19 | 1 day |
| Test Data Preparation | 2026-10-20 | 2026-10-20 | 1 day |
| SIT Execution | 2026-10-21 | 2026-10-23 | 3 days |
| Security Testing | 2026-10-22 | 2026-10-23 | 2 days |
| Defect Fix & Retest | 2026-10-24 | 2026-10-25 | 2 days |
| UAT Execution | 2026-10-26 | 2026-10-27 | 2 days |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|---------------|
| Test Lead | Test planning, coordination, reporting |
| QA Engineer | Test case design, execution, defect reporting |
| BA | UAT support, acceptance criteria clarification |
| Developer | Bug fixing, unit test coverage |
| Security | Security test case review |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Kiro does not support --remote-debugging-port | High | Medium | Fallback to extended timeout |
| 2 | Port conflict | Medium | Low | Validate port availability |
| 3 | Custom userDataDir slows launch >60s | Medium | Medium | Configurable timeout up to 300s |
| 4 | Security findings not mitigated | High | Medium | Security tests mandatory |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition |
|----------|-----------|
| Critical | Launch failure, security breach, RCE |
| Major | Feature not working, workaround exists |
| Minor | UI issue, cosmetic |
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
| Pass Rate | ≥95% |
| Critical Defect Count | 0 |
| Launch Success Rate | >95% |

### 9.2 Reporting Schedule

| Report | Frequency |
|--------|-----------|
| Daily Test Status | Daily during SIT/UAT |
| Defect Summary | Daily |
| Test Completion Report | End of SIT/UAT |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| DevToolsActivePort | File containing remote debugging port |
| userDataDir | Isolated profile directory |
| ide_launch | CLI tool for launching IDE with CDP |

### Assumptions

- Kiro accepts --remote-debugging-port flag
- Custom userDataDir increases initialization time but does not prevent DevTools exposure
- Timeout increase to 60s is acceptable for UAT workflow
