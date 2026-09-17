# Software Test Cases (STC)

## SA4E-297 — SA4E-289.8 – Testing QA & LangGraph Cleanup

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-297 |
| Title | SA4E-289.8 – Testing QA & LangGraph Cleanup |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-297.md |
| Related FSD | FSD-v1.0-SA4E-297.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Level | ID Prefix | Count | Priority |
|-------|-----------|-------|----------|
| PBT | PBT-XX | 2 | High |
| UT | UT-XX | 6 | High |
| IT | IT-XX | 4 | High |
| E2E-API | E2E-API-XX | 3 | High |
| E2E-UI | E2E-UI-XX | 0 | - |
| SIT | SIT-XX | 3 | Medium |

---

## 1. Property-Based Tests

### PBT-01: State Adapter Mapping Preserves TicketKey

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property-Based Test |
| **Requirement** | BR-004, UC-001 |
| **Preconditions** | State Adapter implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random PipelineState with ticketKey, threadId, currentPhase, pipelineStatus | State generated |
| 2 | Serialize via State Adapter to Pi state and deserialize back | Round-trip succeeds |
| 3 | Assert all 4 fields equal original | Fields preserved for all generated cases |

**Test Data:** fast-check arbitraries for string/number fields
**Postconditions:** No data loss

### PBT-02: Phase Router Transition Is Deterministic

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based Test |
| **Requirement** | BR-002, UC-001 |
| **Preconditions** | Phase Router implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random currentPhase and pipelineStatus | Input generated |
| 2 | Execute phase transition logic | Output phase computed |
| 3 | Repeat with same input | Same output always |

**Test Data:** Random phase names
**Postconditions:** Deterministic behavior verified

---

## 2. Unit Tests

### UT-01: pi-workflow.ts Orchestrator Initialization

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-001, BR-001 |
| **Preconditions** | Module imported |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate PiWorkflowEngine with valid config | Instance created |
| 2 | Call init() | Returns success, RemoteCheckpointer connected |

**Test Data:** config with test RemoteCheckpointer URL
**Postconditions:** Engine ready

### UT-02: pi-agent-executor Single Turn Execution

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-001 |
| **Preconditions** | PiAgent Executor implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute single turn with mock user input | Returns agent output |
| 2 | Verify tool_use_id normalized | tool_use_id present |

**Test Data:** mock input, mock Pi SDK response
**Postconditions:** Output matches expectation

### UT-03: phase-router Transition Logic

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-002, UC-001 |
| **Preconditions** | Phase Router implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input currentPhase='requirements' | Next phase='design' |
| 2 | Input terminal phase | Returns completed status |

**Test Data:** phase mapping table
**Postconditions:** Transitions correct

### UT-04: state-adapter Serialize/Deserialize

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-004, UC-001 |
| **Preconditions** | State Adapter implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Serialize PipelineState | JSON output contains ticketKey, threadId, currentPhase, pipelineStatus |
| 2 | Deserialize back | Fields match original |

**Test Data:** PipelineState with all required fields
**Postconditions:** No loss

### UT-05: checkpointer-adapter Save/Load

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-001, BR-003 |
| **Preconditions** | RemoteCheckpointer mock available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save state via adapter | HTTP 200 |
| 2 | Load state by threadId | Returned state matches saved |

**Test Data:** test threadId
**Postconditions:** Persistence works

### UT-06: approval-adapter Tool Use ID Normalization

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | UC-001 |
| **Preconditions** | Approval Adapter implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input Pi SDK tool_use_id | Normalized to internal format |
| 2 | Verify approval gate triggers | Gate opens correctly |

**Test Data:** sample tool_use_id
**Postconditions:** Normalization correct

---

## 3. Integration Tests

### IT-01: End-to-End 7-Phase SDLC Pipeline

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-001, BR-002 |
| **Preconditions** | All modules merged, RemoteCheckpointer up |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger pipeline for ticket SA4E-297 | Pipeline starts |
| 2 | Wait for phase transitions | All 7 phases completed |
| 3 | Verify final pipelineStatus='COMPLETED' | Status correct |

**Test Data:** ticketKey=SA4E-297
**Postconditions:** Pipeline completed

### IT-02: State Persistence Across Restarts

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-004, UC-001 |
| **Preconditions** | Checkpointer adapter ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save PipelineState | Saved |
| 2 | Simulate restart | Engine reloads |
| 3 | Load state | ticketKey, threadId, currentPhase, pipelineStatus preserved |

**Test Data:** state with 4 required fields
**Postconditions:** State intact

### IT-03: Human Approval Flow

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-001 |
| **Preconditions** | Approval Adapter implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger tool requiring approval | Approval request created |
| 2 | Approve via API | Pipeline resumes |

**Test Data:** tool requiring approval
**Postconditions:** Flow continues

### IT-04: Test Execution API Contract

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-001, FSD 3.1.6 |
| **Preconditions** | Hono app running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/v1/tests/execute with ticketKey, scope | 200 with executionId |
| 2 | Verify summary passCount >=0 | Response correct |

**Test Data:** ticketKey=SA4E-297, scope=unit
**Postconditions:** Execution recorded

---

## 4. E2E-API Tests

### E2E-API-01: Trigger Test Execution With Valid JWT

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | tests/e2e/PiWorkflowTests.e2e.test.ts |
| **Traces To** | BRD Req 1, FSD UC-001 |

**Preconditions:** Server running, valid JWT for QA Engineer

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/v1/tests/execute with Authorization Bearer | 200 OK |
| 2 | Verify executionId returned | UUID present |

**Test Data:** ticketKey=SA4E-297, scope=unit
**Postconditions:** Execution logged

### E2E-API-02: Trigger Test Execution Without Token

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated |
| **File** | tests/e2e/PiWorkflowTests.e2e.test.ts |
| **Traces To** | Security Requirement |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/v1/tests/execute without Authorization | 401 Unauthorized |

**Test Data:** any payload
**Postconditions:** Access denied

### E2E-API-03: Trigger Test Execution With Missing Prerequisite

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated |
| **File** | tests/e2e/PiWorkflowTests.e2e.test.ts |
| **Traces To** | FSD EF-1 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST with ticketKey for unmerged prerequisite | 400 with message "Prerequisite SA4E-29x not completed" |

**Test Data:** ticketKey=SA4E-999
**Postconditions:** Error logged

---

## 5. SIT Manual Tests

### SIT-01: LangGraph Cleanup Verification

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual |
| **Requirement** | UC-002, BR-006, BR-007 |
| **Preconditions** | Cleanup branch merged |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm run build` | Build succeeds without LangGraph workflow dependencies |
| 2 | Grep src/pi-workflow/ for 'LangGraphEngine' | No references found |
| 3 | Run existing tests | All pass |

**Test Data:** source code
**Postconditions:** Cleanup verified

### SIT-02: QA Sign-off Checklist

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual |
| **Requirement** | UC-003, BR-008 |
| **Preconditions** | Test execution completed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Review test execution reports | All passed |
| 2 | Verify defect closure | No open Critical/Major |
| 3 | Confirm LangGraph cleanup completed | Checklist signed |

**Test Data:** test reports
**Postconditions:** Sign-off recorded in KB

### SIT-03: Exploratory Regression for PipelineState Fields

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | Medium |
| **Type** | Manual |
| **Requirement** | BR-004, BR-005 |
| **Preconditions** | State Adapter deployed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute manual pipeline run | ticketKey, threadId, currentPhase, pipelineStatus preserved in logs |
| 2 | Inspect RemoteCheckpointer data | Fields present and correct |

**Test Data:** manual ticket
**Postconditions:** Backward compatibility confirmed

---

## 6. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 Test execution | FSD 3.1 | PBT-01, PBT-02, UT-01..UT-06, IT-01..IT-04, E2E-API-01..03 | ✅ |
| BR-001 Unit coverage | FSD 3.1.3 | UT-01..UT-06 | ✅ |
| BR-002 Integration 7 phases | FSD 3.1.3 | IT-01, UT-03 | ✅ |
| BR-003 Checkpointer config | FSD 3.1.3 | IT-02, UT-05 | ✅ |
| BR-004 State fields preserved | FSD 3.1.3 | PBT-01, UT-04, IT-02, SIT-03 | ✅ |
| UC-002 LangGraph Cleanup | FSD 3.2 | SIT-01 | ✅ |
| BR-005 Backward compatibility | FSD 3.2.3 | SIT-03 | ✅ |
| BR-006 No LangGraph refs | FSD 3.2.3 | SIT-01 | ✅ |
| BR-007 Build succeeds | FSD 3.2.3 | SIT-01 | ✅ |
| UC-003 QA Sign-off | FSD 3.3 | SIT-02 | ✅ |
| BR-008 Sign-off checklist | FSD 3.3 | SIT-02 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 8 | 8 | 100% |
| Acceptance Criteria | 3 | 3 | 100% |
| **Overall** | **14** | **14** | **100%** |

---

## 7. Appendix

### Test Data Setup

CSV files created at `documents/SA4E-297/testdata/`:
- pre-seeded-data.csv
- create-testdata.csv
- auth-testdata.csv

### Environment Configuration

- Node 20+, Vitest 4.1.9, Hono 4.0.0
- RemoteCheckpointer test instance
- JWT secret for QA role
