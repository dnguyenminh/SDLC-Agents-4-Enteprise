# Software Test Cases (STC)

## SA4E-294 — Checkpointer Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-294 |
| Title | Checkpointer Adapter |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-294.docx |
| Related FSD | FSD.md |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 2 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 1 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 4 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Manual SIT | SIT-01 to SIT-04 | 4 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Save Pi state via Checkpointer Adapter — Happy Path

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional / E2E-API |
| **Requirement** | UC-001, FSD 3.1.2 Main Flow |
| **Preconditions** | Thread exists with valid UUID v4, PiAgent active, Knowledge Service reachable |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call PUT /api/v1/threads/{threadId}/checkpoint with valid PiInternalState payload | Request accepted |
| 2 | Verify StateAdapter converts to PipelineState | Mapping correct |
| 3 | Verify RemoteCheckpointer persists checkpoint | Version incremented |
| 4 | Verify response contains version and lastUpdatedAt | Version > previous |

**Test Data:** threadId=pre-seeded-uuid-001, piSessionId=pi-sess-001, pipelineState with ticketKey=SA4E-294
**Postconditions:** Checkpoint saved with version+1

### TC-002: Retrieve checkpoint — Happy Path

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional / E2E-API |
| **Requirement** | UC-001, TDD 3.1 GET |
| **Preconditions** | Checkpoint exists for threadId |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call GET /api/v1/threads/{threadId}/checkpoint | 200 OK |
| 2 | Verify checkpoint contains piSessionId, chatHistory | Data matches saved |
| 3 | Verify version matches last saved | Consistency |

**Test Data:** threadId=pre-seeded-uuid-001
**Postconditions:** Checkpoint retrieved correctly

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: State serialization error handling

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1 |
| **Preconditions** | PiInternalState contains circular reference |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call PUT checkpoint with non-serializable state | Adapter returns serialization error |
| 2 | Verify error logged, checkpoint not saved | No partial write |

**Test Data:** piState with circular reference
**Postconditions:** System stable

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Invalid UUID format

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception |
| **Requirement** | UC-001, BR-002, FSD 3.1.5 |
| **Preconditions** | Knowledge Service reachable |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call PUT with threadId=invalid-uuid | 404 THREAD_NOT_FOUND |
| 2 | Verify error message matches | Thread not found |

**Test Data:** threadId=not-a-uuid

### TC-202: KB unreachable with retries

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional — Exception |
| **Requirement** | UC-001 EF-1, BR-001 |
| **Preconditions** | Knowledge Service down |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call PUT checkpoint | 3 retry attempts |
| 2 | After retries exhausted | 503 KB_UNREACHABLE |

**Test Data:** valid threadId

### TC-203: Payload too large >10MB

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception |
| **Requirement** | FSD 3.1.5 Business Error |
| **Preconditions** | Large Pi state |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call PUT with 11MB payload | 413 PAYLOAD_TOO_LARGE |
| 2 | Verify checkpoint not saved | Rejection |

**Test Data:** payload size 11MB

---

## 4. Business Rule Validation

### TC-301: BR-001 Version monotonic increase

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-001 |
| **Preconditions** | Thread has existing version 5 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save checkpoint 3 times | Versions 6,7,8 sequential |
| 2 | Verify no version reuse | Monotonic |

### TC-302: BR-002 threadId UUID v4 format validation

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-002 |
| **Preconditions** | None |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save with valid UUID v4 | Success |
| 2 | Save with UUID v1 | Rejected |

### TC-303: BR-003 Workspace binding via JWT/X-Project-Id

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Security |
| **Requirement** | BR-003 |
| **Preconditions** | Thread belongs to workspace A |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with JWT wid=workspace A and X-Project-Id matching | Success |
| 2 | Call with JWT wid=workspace B | 404 THREAD_NOT_FOUND |

### TC-304: BR-004 Checkpoint body never logged

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | Medium |
| **Type** | Security / Audit |
| **Requirement** | BR-004 |
| **Preconditions** | Logging enabled |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save checkpoint with sensitive data | Logs contain thread_id/version only |
| 2 | Verify checkpoint body absent from logs | No leakage |

---

## 5. Boundary & Negative Testing

### TC-401: ThreadId boundary — empty string

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data Spec threadId |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | PUT with threadId="" | 400 validation error |

### TC-402: Checkpoint size boundary 9.9MB vs 10MB vs 10.1MB

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | FSD 3.1.4 size limit |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 9.9MB payload | Success |
| 2 | 10MB payload | Success |
| 3 | 10.1MB payload | 413 |

### TC-403: Chat history empty array

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Low |
| **Type** | Negative |
| **Requirement** | Serialization |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save with chatHistory=[] | Success, no error |

---

## 6. Non-Functional Testing

### TC-601: Checkpoint save latency p95 <500ms

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional Performance |
| **Requirement** | FSD 8 Performance |
| **Preconditions** | Load test environment |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute 100 saves sequentially | p95 latency <500ms |

### TC-602: Concurrent threads 1000

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional Scalability |
| **Requirement** | FSD 8 Scalability |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate 1000 concurrent threads saving | No errors, version correct |

---

## 7. Integration Testing

### TC-701: RemoteCheckpointer integration PUT/GET

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save via CheckpointerAdapter | Knowledge Service DB updated |
| 2 | Query DB directly | Checkpoint row exists |

### TC-702: StateAdapter mapping integrity

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 2.2 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Convert PiInternalState → PipelineState → PiInternalState | Round-trip equals original |

---

## 8. Manual SIT

### SIT-01: Manual exploratory save with browser extension
### SIT-02: Verify audit log entries
### SIT-03: Workspace binding edge case with missing header
### SIT-04: Visual verification of error messages

---

## 9. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 | FSD 3.1.2 | TC-001, TC-002, TC-101, TC-201, TC-202, TC-203 | ✅ |
| BR-001 | FSD 3.1.3 | TC-301 | ✅ |
| BR-002 | FSD 3.1.3 | TC-302, TC-201 | ✅ |
| BR-003 | FSD 3.1.3 | TC-303 | ✅ |
| BR-004 | FSD 3.1.3 | TC-304 | ✅ |
| Performance <500ms | FSD 8 | TC-601 | ✅ |
| Error KB_UNREACHABLE | FSD 9.1 | TC-202 | ✅ |
| Error SERIALIZATION | FSD 9.1 | TC-101 | ✅ |

**Coverage Summary:** 100% of FSD Use Cases and Business Rules covered.

---

## 10. Appendix

Test data CSVs located at documents/SA4E-294/testdata/
