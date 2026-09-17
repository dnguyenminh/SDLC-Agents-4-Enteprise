# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-295: SA4E-289.6 – Approval Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-295 |
| Title | SA4E-289.6 – Approval Adapter |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | BRD.md |
| Related FSD | FSD.md |
| Related TDD | TDD.md |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – Technical Lead | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose
This Test Plan defines strategy, scope, resources, and schedule for testing the Approval Adapter component `src/pi-workflow/approval-adapter.ts` in Epic SA4E-289. The adapter bridges Pi SDK tool execution with existing ToolApprovalGate, normalizes `tool_use_id`, and preserves audit trail without modifying core gate logic.

### 1.2 Test Objectives
- Verify all functional requirements from FSD UC-295-01, UC-295-02 are implemented correctly
- Validate business rules BR-295-01 to BR-295-05 are enforced
- Ensure non-functional requirements: latency <10ms, 100+ parallel sessions, no sensitive data in logs
- Ensure adapter does not modify ToolApprovalGate core logic
- Verify error codes ADAPTER-001..004 handling and audit logging

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-295/BRD.md |
| FSD | documents/SA4E-295/FSD.md |
| TDD | documents/SA4E-295/TDD.md |

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
| Regression Testing | Ensure ToolApprovalGate unchanged | Yes |
| Performance Testing | Latency <10ms, 100+ sessions | Yes |
| Security Testing | No sensitive data in logs | Yes |
| Non-Functional Testing | Audit trail retention | Yes |

**STP Test Cases Summary Table**

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 8 | 8 | 0 |
| IT | 6 | 6 | 0 |
| E2E-API | 4 | 4 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **26** | **20 (77%)** | **6 (23%)** |

### 2.3 Test Approach
Risk-based prioritization. Core ID normalization and approval flow automated via UT/IT/E2E-API. Manual SIT focused on visual audit logs and concurrent session exploration. Automation first to minimize manual SIT to visual/UX-only.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| UT/IT | Code merged to feature branch, TDD reviewed |
| E2E-API | Pi SDK & Pi Provider installed SA4E-290, PiAgent Executor SA4E-291 available |
| SIT | Unit tests passed, test data prepared, environment stable |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, 0 Critical defects, ≤2 Major defects open |
| UAT | All acceptance criteria passed, business sign-off |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Normalize tool_use_id between Pi SDK and Extension | MUST HAVE | UC-295-01, BR-295-01~03 | Functional/UT/IT |
| 2 | Integrate ToolApprovalGate via Adapter | MUST HAVE | UC-295-02, BR-295-04~05 | Functional/IT/E2E-API |
| 3 | Audit trail preservation | SHOULD HAVE | FSD 7.3, BRD 2.3 | Non-Functional |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | UI changes for approval display | Out of scope per BRD 1.2 |
| 2 | Change ToolApprovalGate core rules | Out of scope per BRD 1.2 |
| 3 | New approval types | Not in this story |

### 3.3 E2E Automation Coverage
| Scenario Type | Classify As | Lý do |
|--------------|-------------|-------|
| ID normalization CRUD | E2E-API | API-level check đủ |
| Approval request flow | E2E-API | Vitest + fetch |
| Concurrent session mapping | PBT/UT | Automated property test |
| Audit log verification | SIT (manual) | Visual log review |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| DEV | http://localhost:3000 | SQLite in-memory | Unit/IT |
| SIT | http://sit.sdcl.agents:3000 | PostgreSQL | System Integration |

### 4.2 Test Data Requirements

| Data Type | Description | Source |
|-----------|-------------|--------|
| Pre-seeded sessions | Active Pi sessions with ticketKey SA4E-295 | CSV |
| Tool calls | Valid/invalid piToolUseId samples | CSV |
| Gate decisions | Approved/Rejected/Pending responses | Mock |

### 4.3 External Dependencies

| System | Dependency | Mock/Stub |
|--------|-----------|-----------|
| ToolApprovalGate | Existing extension component | No mock, in-process |
| Pi SDK | @earendil-works/pi-agent-core | Real SDK |
| Checkpointer Adapter | Persist mapping | Stub allowed for UT |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | 2026-09-16 | 2026-09-16 | 1 day | STP+STC approved |
| Test Data Prep | 2026-09-17 | 2026-09-17 | 1 day | CSV ready |
| SIT Execution | 2026-09-18 | 2026-09-20 | 3 days | SIT sign-off |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|---------------|
| Test Lead | Test planning, coordination |
| QA Engineer | Test case design, execution, defect reporting |
| BA | UAT support |
| Developer | Bug fixing, unit test coverage |
| DevOps | Environment setup |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Pi SDK tool_use_id format changes | High | Medium | Abstract mapping, unit tests |
| 2 | ToolApprovalGate API incompatibility | High | Medium | Adapter pattern + early spike |
| 3 | Audit log retention policy unclear | Medium | Low | Confirm with Security Agent |

---

## 8. Defect Management

### 8.1 Severity Levels
Critical: System crash / data loss
Major: Approval flow broken
Minor: Log formatting

### 8.2 Priority Levels
P1: Must fix immediately <4h
P2: Before release <1 day
P3: Should fix <3 days

### 8.3 Defect Lifecycle
New → Open → In Progress → Fixed → Verified → Closed

---

## 9. Test Metrics & Reporting

| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥95% |
| Critical Defect Count | 0 |
| Test Coverage | ≥80% requirements |

---

## 10. Appendix

### Assumptions
- ToolApprovalGate remains unchanged
- Pi SDK provides stable tool_use_id
- RemoteCheckpointer backend unchanged

**End of STP**
