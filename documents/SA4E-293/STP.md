# Software Test Plan (STP)

## SDLC-Agents-4-Enterprise — SA4E-293: SA4E-289.4 – State Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-293 |
| Title | SA4E-289.4 – State Adapter |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-293/BRD.md |
| Related FSD | documents/SA4E-293/FSD.md |
| Related TDD | N/A |

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
| 1.0 | 2026-09-16 | QA Agent | Initiate document — auto-generated from BRD, FSD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose
This Test Plan defines strategy, scope, resources and schedule for testing State Adapter component for Pi SDK migration Option C. The adapter provides bidirectional mapping between PipelineState and PiInternalState, ensuring data fidelity, correct Pi-specific field handling, and backward compatibility with RemoteCheckpointer.

### 1.2 Test Objectives
- Verify bidirectional state mapping `toPiState`/`fromPiState` implements FSD UC-001 and UC-002 correctly
- Validate business rules BR-001 to BR-003 are enforced
- Ensure round-trip conversion is lossless for core PipelineState fields
- Verify Pi-specific fields piSessionId, currentAgentId, toolCallCount are initialized, persisted and incremented
- Validate non-functional requirements: mapping latency <5ms p95, reliability 99.9%, state size up to 5MB
- Ensure serialization compatibility with RemoteCheckpointer backend
- Confirm error handling for missing required fields and serialization failures

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-293/BRD.md |
| FSD | documents/SA4E-293/FSD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties - round-trip lossless with random inputs | Automated | fast-check |
| UT | Unit tests for toPiState/fromPiState and validation helpers | Automated | vitest |
| IT | Integration tests with in-process RemoteCheckpointer serialization | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only | Manual | Browser |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features work per FSD use cases UC-001, UC-002 | Yes |
| Regression Testing | Ensure existing PipelineState fields remain unbroken | Yes |
| Performance Testing | Mapping latency <5ms, 5MB state support | Yes |
| Security Testing | State data confidentiality via existing RemoteCheckpointer | Yes |
| UI Testing | N/A - no UI changes | No |
| Compatibility Testing | TypeScript types and JSON serialization compatibility | Yes |

### 2.3 Test Approach
Risk-based prioritization. Automate unit, property-based and integration tests for deterministic logic. State Adapter has no HTTP UI exposure, therefore E2E-API/E2E-UI tests are not applicable. SIT limited to manual exploratory verification of checkpoint restore and schema drift scenarios. Test data covers valid states, missing optional fields, null fields, large objects, invalid ticketKey and negative toolCallCount.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| UT | Source code for state-adapter.ts and types/pi-workflow-state.ts checked in, vitest configured |
| IT | RemoteCheckpointer backend available in test environment, test DB seeded |
| SIT | Code deployed to SIT environment, unit tests passed, test data prepared |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| UT/IT/PBT | 100% critical test cases passed, 0 Critical defects open, ≤2 Major defects open |
| SIT | 100% test cases executed, round-trip verification passed, checkpoint save/load successful |

### 2.6 E2E Automation Coverage
State Adapter is an internal TypeScript mapping library without HTTP endpoints or UI. 
- E2E-API: 0 - no REST API
- E2E-UI: 0 - no UI changes
- SIT: Manual verification of checkpoint restore and schema compatibility only

---

## STP Test Cases Summary Table

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 5 | 5 | 0 |
| IT | 3 | 3 | 0 |
| E2E-API | 0 | 0 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **14** | **10 (71%)** | **4 (29%)** |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Bidirectional state mapping toPiState/fromPiState | High | UC-001, BR-001/002/003 | Functional / UT / PBT |
| 2 | Pi-specific fields piSessionId, currentAgentId, toolCallCount initialization and persistence | High | UC-002, Story 2 | Functional / IT |
| 3 | Backward compatibility with RemoteCheckpointer serialization | High | BRD 1.2, FSD 5.2 | Integration / SIT |
| 4 | Error handling StateMappingError on missing required field | High | EF-1 UC-001 | Functional / UT |
| 5 | Serialization failure handling - log warning and return original state | Medium | EF-1 UC-002 | Functional / IT |
| 6 | Non-functional: mapping latency <5ms p95, 5MB state support | Medium | FSD 8 | Performance |
| 7 | Round-trip lossless for core fields ticketKey, threadId, currentPhase, pipelineStatus, chatHistory, agentOutputs | High | BR-003 | PBT / UT |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Workflow execution engine | Out of scope per BRD 1.2 |
| 2 | Phase router, agent executor, approval adapter | Out of scope per BRD 1.2 |
| 3 | UI changes | No UI in scope |
| 4 | LangGraph removal/cleanup | Separate epic |
| 5 | Pi SDK provider installation | System prerequisite |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | Purpose |
|-------------|---------|
| Local Dev | Unit and property tests |
| SIT | Integration with RemoteCheckpointer test DB |
| UAT | Business validation of checkpoint restore |

### 4.2 Test Data Requirements

| Data Type | Description | Preparation |
|-----------|-------------|-------------|
| Valid PipelineState | Complete state with all required fields | Seed JSON fixtures |
| State missing optional Pi fields | No piSessionId/currentAgentId/toolCallCount | Fixture |
| State with large payload | 5MB chatHistory/agentOutputs | Generated |
| Invalid ticketKey | Pattern violation | Fixture |
| Negative toolCallCount | Validation edge | Fixture |

### 4.3 External Dependencies

| System | Dependency | Mock/Stub |
|--------|-----------|-----------|
| Pi SDK | @earendil-works/pi-agent-core types | Types only, no runtime call |
| RemoteCheckpointer | SQLite/PostgreSQL backend | Test container |

---

## 5. Test Schedule

| Phase | Milestone |
|-------|-----------|
| Test Planning | STP + STC approved |
| Test Data Preparation | Fixtures ready |
| UT/PBT/IT Execution | Automated suite green |
| SIT Execution | Manual checkpoint verification |
| Defect Fix & Retest | All Critical/Major fixed |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|---------------|
| Test Lead | Test planning, coordination, reporting |
| QA Engineer | Test case design, execution, defect reporting |
| BA | Acceptance criteria clarification |
| Developer | Bug fixing, unit test coverage |
| DevOps | Test environment setup |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | State schema drift between PipelineState and Pi SDK | High | Medium | Property tests + schema validation |
| 2 | RemoteCheckpointer incompatibility with extended fields | High | Medium | Round-trip IT tests |
| 3 | Missing Pi SDK state fields causes execution errors | Medium | Medium | Defaults and validation in adapter |

---

## 8. Defect Management

### 8.1 Severity Levels
Critical - System crash, data loss
Major - Mapping returns incorrect data, workaround exists
Minor - Logging format issue
Trivial - Typo in error message

### 8.2 Priority Levels
P1 - Must fix immediately - 4 hours
P2 - Must fix before release - 1 business day
P3 - Should fix if time permits - 3 business days
P4 - Next release

### 8.3 Defect Lifecycle
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting

| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥ 95% |
| Critical Defect Count | 0 |
| Mapping latency p95 | <5ms |

---

## 10. Appendix

### Glossary
SIT - System Integration Testing
STP - Software Test Plan
STC - Software Test Cases

### Assumptions
Pi SDK internal state structure stable and documented
RemoteCheckpointer can store extended JSON schema without changes
