# Software Test Cases (STC)

## SA4E-291 — SA4E-289.2 – PiAgent Executor single turn

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-291 |
| Title | SA4E-289.2 – PiAgent Executor single turn |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-291.docx |
| Related FSD | FSD-v1.0-SA4E-291.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 3 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 4 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Execute single turn no tool use

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, Story 1 AC1 |
| **Preconditions** | Pi SDK installed, valid sessionId, messages non-empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call executeTurn with ticketKey=SA4E-291, sessionId=pi_sess_123, agentId=ba-agent, messages=[{role:user,content:hello}] | |
| 2 | Wait for result | Executor returns messages updated, toolCalls=[], streamChunks emitted, error=null |

**Test Data:** ticketKey=SA4E-291, sessionId=pi_sess_123, agentId=ba-agent, messages valid
**Postconditions:** State unchanged except messages

---

### TC-002: Execute single turn with tool_use handling

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, Story 1 AC2 |
| **Preconditions** | Pi SDK returns tool_use event |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call executeTurn with tools provided | |
| 2 | Receive tool_use chunk | Tool call captured and normalized tool_use_id returned |

**Test Data:** agent requests tool search_document
**Postconditions:** toolCalls array contains normalized object

---

### TC-003: Streaming chunks emission

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, Story 1 AC3 |
| **Preconditions** | Long response scenario |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with streaming enabled | |
| 2 | Consume stream chunks | Chunks emitted sequentially, can be consumed via SSE/NDJSON |

**Test Data:** messages trigger long output
**Postconditions:** streamChunks array populated

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: No tool_use alternative flow

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1 |
| **Preconditions** | Valid input, Pi SDK returns no tool_use |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn | Skip normalization, return messages directly |

**Test Data:** simple query
**Postconditions:** toolCalls empty

---

### TC-102: Streaming disabled

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-2 |
| **Preconditions** | Streaming disabled flag |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with streaming off | Full response returned after completion |

**Test Data:** valid input
**Postconditions:** streamChunks empty, messages complete

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Pi SDK timeout with retry

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-1, Error PI_TIMEOUT |
| **Preconditions** | Mock Pi SDK timeout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn | Retry once then return error code PI_TIMEOUT |

**Test Data:** timeout mock
**Postconditions:** Error object returned

---

### TC-202: Invalid tool_use format

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-2 |
| **Preconditions** | Pi SDK returns malformed tool_use |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn | Log warning and skip tool call |

**Test Data:** malformed tool_use
**Postconditions:** toolCalls does not contain invalid entry

---

### TC-203: Streaming disconnect partial result

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-3 |
| **Preconditions** | Network disconnect during stream |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn and disconnect | Return partial result with flag |

**Test Data:** disconnect mock
**Postconditions:** Partial messages returned

---

## 4. Business Rule Validation

### TC-301: ticketKey pattern validation

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-001 |
| **Preconditions** | Input with invalid ticketKey |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with ticketKey=invalid | Reject with INVALID_INPUT |

**Test Data:** ticketKey=abc-123
**Postconditions:** Error returned

---

### TC-302: sessionId non-empty validation

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-002 |
| **Preconditions** | sessionId empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with sessionId='' | Reject with INVALID_INPUT |

**Test Data:** empty sessionId
**Postconditions:** Error returned

---

### TC-303: messages non-empty validation

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-003 |
| **Preconditions** | messages empty array |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with messages=[] | Reject with INVALID_INPUT |

**Test Data:** empty messages
**Postconditions:** Error returned

---

### TC-304: Latency <2s for non-tool turn

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-004 |
| **Preconditions** | Performance test env |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute 100 non-tool turns | p95 latency <2s |

**Test Data:** valid inputs
**Postconditions:** Metrics collected

---

## 5. Boundary & Negative Testing

### TC-401: ticketKey boundary pattern

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-001 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | ticketKey='A-1' | Accepted |
| 2 | ticketKey='SA4E-291' | Accepted |
| 3 | ticketKey='sa4e-291' | Rejected |

**Test Data:** various patterns
**Postconditions:** Validation enforced

---

### TC-402: messages with very long content

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | Data specifications |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with 10k chars message | Handled without error |

**Test Data:** long message
**Postconditions:** Result returned

---

### TC-403: Null tools array

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | Input specs |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn with tools=null | Treated as empty, no error |

**Test Data:** tools null
**Postconditions:** Execution succeeds

---

## 6. Non-Functional Testing

### TC-601: Performance latency non-tool turn

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | SIT env |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run 100 executions | p95 <2s |

**Acceptance Criteria:** Latency <2s p95

---

### TC-602: Concurrent sessions scalability

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional Scalability |
| **Requirement** | NFR Scalability |
| **Preconditions** | Load test setup |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate 100 concurrent sessions | No errors, throughput stable |

**Acceptance Criteria:** Support 100 concurrent sessions

---

## 7. Integration Testing

### TC-701: State compatibility mapping

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-002, Story 2 |
| **Preconditions** | State Adapter available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn and map output | StateAdapter converts to PipelineState with piSessionId, currentAgentId, toolCallCount |

**Test Data:** valid execution result
**Postconditions:** RemoteCheckpointer can persist

---

### TC-702: RemoteCheckpointer persistence after turn

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.2 |
| **Preconditions** | RemoteCheckpointer mock |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute turn | State persisted with retry policy |

**Test Data:** valid state
**Postconditions:** State stored

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 | FSD 3.1 | TC-001, TC-002, TC-003, TC-101, TC-102, TC-201, TC-202, TC-203 | Covered |
| UC-002 | FSD 3.2 | TC-701, TC-702 | Covered |
| BR-001 | FSD 3.1.3 | TC-301, TC-401 | Covered |
| BR-002 | FSD 3.1.3 | TC-302 | Covered |
| BR-003 | FSD 3.1.3 | TC-303 | Covered |
| BR-004 | FSD 3.1.3 | TC-304, TC-601 | Covered |
| Story 1 AC1 | BRD 2.3 | TC-001 | Covered |
| Story 1 AC2 | BRD 2.3 | TC-002 | Covered |
| Story 1 AC3 | BRD 2.3 | TC-003 | Covered |
| Story 1 AC4 | BRD 2.3 | TC-201 | Covered |
| Story 1 AC5 | BRD 2.3 | TC-701 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 4 | 4 | 100% |
| Acceptance Criteria | 5 | 5 | 100% |
| **Overall** | **11** | **11** | **100%** |

---

## 11. Appendix

### Test Data Setup

Test data files located at `documents/SA4E-291/testdata/`
