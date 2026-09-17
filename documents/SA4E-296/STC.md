# Software Test Cases (STC)

## SDLC Agents 4 Enterprise – SA4E-296: SA4E-289.7 – Integration & Human Approval Logic

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-296 |
| Title | SA4E-289.7 – Integration & Human Approval Logic |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-296.docx |
| Related FSD | FSD-v1.0-SA4E-296.docx |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 4 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 5 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 2 | Medium |
| Non-Functional | TC-600 to TC-699 | 3 | Medium |
| Integration Testing | TC-700 to TC-799 | 4 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: PiWorkflow Engine End-to-End Execution

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | Story 1 AC1, UC-001 |
| **Preconditions** | Feature toggle workflow.engine='pi' enabled, sample ticket SA4E-296 exists in Requirements phase |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke workflow.execute(ticketKey='SA4E-296', currentPhase='Requirements') | Workflow starts with Pi SDK, no LangGraphEngine called |
| 2 | Wait for phase completion | pipelineStatus = 'running', currentPhase advances to Specification |
| 3 | Continue to Implementation phase | State persisted after each turn |

**Test Data:** ticketKey=SA4E-296, threadId=uuid-001
**Postconditions:** Workflow completed to Implementation, piSessionId generated

---

### TC-002: State Persist and Resume

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | Story 1 AC2 |
| **Preconditions** | Workflow running, checkpoint saved |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop workflow mid-phase | State saved to RemoteCheckpointer |
| 2 | Restart workflow with same threadId | State loaded correctly, execution resumes from last turn |
| 3 | Verify piSessionId, currentAgentId unchanged | State consistency maintained |

**Test Data:** pre-seeded state snapshot
**Postconditions:** Resume successful

---

### TC-003: Human Approval Gate Approve Flow

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | Story 2 AC2 |
| **Preconditions** | Agent requests tool call requiring approval |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Agent initiates tool call with approval required | Workflow pauses, approval request notification shown |
| 2 | User clicks Approve | Decision persisted as 'approve' |
| 3 | Tool executes and result returned to agent | Workflow continues |

**Test Data:** toolId=tool-approve-001, rememberPattern=false
**Postconditions:** Tool result in state

---

### TC-004: Human Approval Gate Reject Flow

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | Story 2 AC3 |
| **Preconditions** | Approval pending |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User clicks Reject | Decision persisted as 'reject' |
| 2 | Workflow logs rejection | Alternative flow triggered |
| 3 | State updated with error log | Workflow continues without tool execution |

**Test Data:** toolId=tool-reject-001
**Postconditions:** Workflow in alternative path

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: rememberPattern Respected

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative |
| **Requirement** | Story 2 AC4 |
| **Preconditions** | User previously approved tool with rememberPattern=true |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Agent requests same tool again | Approval prompt skipped |
| 2 | Tool executes automatically | Workflow continues |

**Test Data:** toolId=tool-remember-001, rememberPattern=true
**Postconditions:** Auto-approval applied

---

### TC-102: Phase Transition Accuracy

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative |
| **Requirement** | Story 1 AC3 |
| **Preconditions** | Phase Router configured |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Complete phase Requirements | Router moves to Specification |
| 2 | Complete Specification | Router moves to Design |
| 3 | Verify transitions match LangGraph edges | No deviation |

**Test Data:** pipelineDefinition v1
**Postconditions:** Phase sequence correct

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: State Mapping Error Fallback

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception |
| **Requirement** | BRD Error Handling State mapping lỗi |
| **Preconditions** | Corrupt Pi state input |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke workflow with invalid state fields | Error logged ERR_STATE_MAP |
| 2 | Fallback to previous state | Workflow pauses, no data loss |
| 3 | Error captured in PipelineState.errors | Error visible |

**Test Data:** invalid piSessionId
**Postconditions:** System stable

---

### TC-202: Approval Timeout Auto-Reject

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception |
| **Requirement** | Story 2 Error Handling |
| **Preconditions** | Approval pending |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Wait 10 minutes without user decision | Workflow auto-reject |
| 2 | Notification sent to user | Timeout logged |
| 3 | Workflow continues with rejection | State updated |

**Test Data:** approval timeout scenario
**Postconditions:** Auto-reject applied

---

### TC-203: Pi SDK Exception Capture

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception |
| **Requirement** | BRD Error Handling Pi SDK exception |
| **Preconditions** | Pi SDK throws error |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger Pi SDK error | Error code ERR_PI_SDK |
| 2 | Error captured in PipelineState.errors | Workflow paused |
| 3 | User notified | No unhandled exception |

**Test Data:** mock Pi SDK failure
**Postconditions:** Workflow paused safe

---

## 4. Business Rule Validation

### TC-301: piSessionId Unique Per Thread

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BRD Validation piSessionId unique |
| **Preconditions** | Two threads created |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start workflow thread A | piSessionId generated |
| 2 | Start workflow thread B | Different piSessionId |
| 3 | Verify uniqueness | No collision |

---

### TC-302: currentPhase Valid Enumeration

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BRD Validation currentPhase valid |
| **Preconditions** | Invalid phase input |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke with currentPhase='Invalid' | Validation error returned |
| 2 | Workflow rejects input | 400 Bad Request |

---

### TC-303: toolCallCount Non-Negative

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BRD Validation toolCallCount >=0 |
| **Preconditions** | State with negative count |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load state with toolCallCount=-1 | Normalized to 0 or error |
| 2 | Verify count never negative | Business rule enforced |

---

### TC-304: Approval Decision Enum

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BRD Validation decision approve/reject |
| **Preconditions** | Invalid decision submitted |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit decision='maybe' | Validation error |
| 2 | Only approve/reject accepted | Rule enforced |

---

### TC-305: ToolId Exists In Pending Calls

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BRD Validation ToolId exists |
| **Preconditions** | Approve non-existent tool |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Approve toolId='unknown' | Error 'Tool not found' |
| 2 | Workflow remains paused | No state corruption |

---

## 5. Boundary & Negative Testing

### TC-401: Empty Ticket Key

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | workflow.execute input validation |
| **Preconditions** | None |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call workflow.execute with ticketKey='' | 400 error, validation message |

---

### TC-402: Max Tool Call Count Overflow

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | toolCallCount integer limit |
| **Preconditions** | State with high count |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set toolCallCount=2147483647 | Handled without overflow |

---

### TC-403: Approval Decision Empty

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | Decision validation |
| **Preconditions** | None |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit empty decision | Validation error returned |

---

## 6. UI/UX Testing

### TC-501: Workflow Status Indicator Display

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | BRD UI Spec Workflow Status Indicator |
| **Preconditions** | Workflow running |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open pipeline view | Status label shows 'running/paused/finished' |
| 2 | Verify label updates on phase change | UI reflects current phase |

---

### TC-502: Approval Request Notification

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | BRD UI Spec Approval Request Notification |
| **Preconditions** | Tool requires approval |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger approval-required tool | Toast/Panel notification appears |
| 2 | Verify Approve/Reject buttons visible | UX matches previous |

---

## 7. Non-Functional Testing

### TC-601: Workflow Latency vs LangGraph Baseline

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional Performance |
| **Requirement** | NFR Performance ≤15% |
| **Preconditions** | Baseline measured |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run 100 workflow turns | p95 latency ≤1.15x baseline |
| 2 | Record metrics | Acceptable |

---

### TC-602: Checkpoint Save Success Rate

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional Availability |
| **Requirement** | NFR Availability >99% |
| **Preconditions** | 1000 save operations |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform 1000 checkpoint saves | Success rate >99% |
| 2 | Verify no data loss | Logs clean |

---

### TC-603: Concurrent Workflows Scalability

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional Scalability |
| **Requirement** | NFR Scalability ≥10 concurrent |
| **Preconditions** | Test environment |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start 10 concurrent sessions | All sessions stable |
| 2 | Monitor resource usage | No deadlock |

---

## 8. Integration Testing

### TC-701: RemoteCheckpointer Integration

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 6.2 RemoteCheckpointer |
| **Preconditions** | Backend Hono running |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save state via CheckpointerAdapter | HTTP 200, state persisted |
| 2 | Load state | Data matches |

---

### TC-702: Pi SDK Integration

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 6.1 Pi SDK |
| **Preconditions** | Pi SDK installed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute PiAgent single turn | Agent returns output |
| 2 | Verify tool call interception | Approval gate triggered |

---

### TC-703: StateAdapter Mapping

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 5.2 IStateAdapter |
| **Preconditions** | PipelineState sample |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | toPiState mapping | All critical fields present |
| 2 | fromPiState mapping | Round-trip equality |

---

### TC-704: ApprovalAdapter Normalize Tool Use Id

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 5.2 IApprovalAdapter |
| **Preconditions** | Pi tool call |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Normalize tool_use_id | Format matches ToolApprovalGate |
| 2 | Handle approval decision | State updated |

---

## 9. Regression Testing

### TC-801: Baseline Output Comparison

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Story 3 AC1 |
| **Preconditions** | Baseline LangGraph output |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run end-to-end flow | Output deviation <5% vs baseline |
| 2 | Compare state snapshots | Match |

---

### TC-802: Checkpoint Resume After Restart

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Story 3 AC3 |
| **Preconditions** | Server restart |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Restart VS Code extension | Workflow resumes from checkpoint |
| 2 | Verify no state loss | Resume successful |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 PiWorkflow Integration | FSD 3.1 | TC-001, TC-002, TC-102, TC-701 | ✅ |
| UC-002 Human Approval Preservation | FSD 3.2 | TC-003, TC-004, TC-101, TC-202, TC-704 | ✅ |
| UC-003 E2E Test Flow Validation | FSD 3.3 | TC-801, TC-802, TC-601 | ✅ |
| BR-001 piSessionId unique | BRD 2.3 | TC-301 | ✅ |
| BR-002 currentPhase valid | BRD 2.3 | TC-302 | ✅ |
| BR-003 toolCallCount non-negative | BRD 2.3 | TC-303 | ✅ |
| BR-004 approval decision enum | BRD 2.3 | TC-304 | ✅ |
| Error STATE_MAPPING_ERROR | TDD 5.4 | TC-201 | ✅ |
| Error APPROVAL_TIMEOUT | TDD 5.4 | TC-202 | ✅ |
| Error PI_SDK_ERROR | TDD 5.4 | TC-203 | ✅ |
| NFR Performance ≤15% | BRD 6 | TC-601 | ✅ |
| NFR Checkpoint success >99% | BRD 6 | TC-602 | ✅ |
| NFR Scalability ≥10 concurrent | BRD 6 | TC-603 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 4 | 4 | 100% |
| Acceptance Criteria | 10 | 10 | 100% |
| Error Codes | 3 | 3 | 100% |
| **Overall** | **20** | **20** | **100%** |

---

## 11. Appendix

### Test Data Setup
Pre-seeded tickets, approval scenarios, state snapshots in documents/SA4E-296/testdata/

### Environment Configuration
Feature toggle workflow.engine='pi' in workspace config.
