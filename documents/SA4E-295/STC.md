# Software Test Cases (STC)

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
| Related STP | STP.md |
| Related FSD | FSD.md |

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
| Functional — Alternative Flows | TC-100 to TC-199 | 1 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 4 | High |
| Business Rule Validation | TC-300 to TC-399 | 5 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 2 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Normalize tool_use_id round-trip

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-295-01, BR-295-03, Story 1 AC 2 |
| **Preconditions** | Pi session active, adapter initialized |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call normalizeId(piToolUseId='pi_abc123', sessionId='sess_789', ticketKey='SA4E-295') | Returns extensionToolId like 'ext_...' |
| 2 | Call extensionToPiId(extensionToolId) | Returns original 'pi_abc123' |

**Test Data:** pi_abc123, sess_789, SA4E-295
**Postconditions:** Mapping stored in session map

---

### TC-002: Request approval success approved

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-295-02, Story 2 AC 2 |
| **Preconditions** | ToolApprovalGate returns approved |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call requestApproval(toolCall with piToolUseId='pi_001') | Adapter normalizes id |
| 2 | Adapter calls ToolApprovalGate.evaluate() | Gate returns approved |
| 3 | Adapter translates to Pi toolResult | toolResult.isApproved = true, auditRef present |

**Test Data:** pi_001, session sess_001
**Postconditions:** Approval decision logged

---

### TC-003: Request approval success rejected

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-295-02 |
| **Preconditions** | Gate policy rejects tool |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call requestApproval with disallowed tool | Gate returns rejected |
| 2 | Adapter returns PiToolResult | isApproved = false, error path triggered |

**Test Data:** pi_reject_01
**Postconditions:** Rejection logged

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Duplicate mapping overwrite

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-295-01 AF-1 |
| **Preconditions** | Mapping for session:pi exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call normalizeId same piToolUseId again | Mapping overwritten with latest |
| 2 | Check log | Warning 'Duplicate mapping' logged |

**Test Data:** pi_dup, sess_dup
**Postconditions:** Map contains latest entry

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Missing tool_use_id ADAPTER-001

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception |
| **Requirement** | UC-295-01 EF-1, Error ADAPTER-001 |
| **Preconditions** | Adapter initialized |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call normalizeId with empty piToolUseId | Throws AdapterError ADAPTER-001 |
| 2 | Check log | Warning logged |

**Test Data:** piToolUseId=''
**Postconditions:** No mapping created

---

### TC-202: Invalid session ADAPTER-002

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception |
| **Requirement** | BR-295-02 |
| **Preconditions** | Session not active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call normalizeId with sessionId='sess_invalid' | Returns error ADAPTER-002 |
| 2 | Verify | No mapping persisted |

**Test Data:** sess_invalid
**Postconditions:** Error logged

---

### TC-203: Gate timeout retry then fail open

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception |
| **Requirement** | UC-295-02 EF-1, ADAPTER-003 |
| **Preconditions** | Gate delay >5s |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call requestApproval | First attempt times out |
| 2 | Adapter retries once | Second attempt times out |
| 3 | Adapter fails open with audit log | PiToolResult with isApproved=false and auditRef |

**Test Data:** pi_timeout
**Postconditions:** Timeout logged

---

### TC-204: Mapping failure ADAPTER-004

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | Medium |
| **Type** | Functional — Exception |
| **Requirement** | ADAPTER-004 |
| **Preconditions** | Id normalization error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate crypto.randomUUID failure | Adapter logs error |
| 2 | Returns error to executor | Error propagated |

**Test Data:** N/A
**Postconditions:** Error logged

---

## 4. Business Rule Validation

### TC-301: BR-295-01 tool_use_id non-empty

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-295-01 |
| **Preconditions** | Adapter ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pass empty string | Rejected with ADAPTER-001 |
| 2 | Pass whitespace | Rejected |

**Test Data:** '', '   '
**Postconditions:** Validation enforced

---

### TC-302: BR-295-02 sessionId matches active session

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-295-02 |
| **Preconditions** | Active sessions list known |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide valid sessionId | Mapping succeeds |
| 2 | Provide invalid sessionId | Error ADAPTER-002 |

**Test Data:** sess_valid, sess_invalid
**Postconditions:** Session check enforced

---

### TC-303: BR-295-03 round-trip conversion

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-295-03 |
| **Preconditions** | Mapping created |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | pi→extension→pi | Original pi id returned |
| 2 | 100 random ids | All round-trip correctly |

**Test Data:** Multiple pi ids
**Postconditions:** Idempotency verified

---

### TC-304: BR-295-04 adapter does not modify ToolApprovalGate

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-295-04 |
| **Preconditions** | ToolApprovalGate source unchanged |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Review ToolApprovalGate source | No changes made |
| 2 | Run existing gate tests | All pass |

**Test Data:** N/A
**Postconditions:** Gate integrity preserved

---

### TC-305: BR-295-05 approved result in Pi SDK format

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-295-05 |
| **Preconditions** | Approval granted |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Request approval approved | toolResult conforms to Pi SDK schema |
| 2 | Validate fields | content, isApproved, auditRef present |

**Test Data:** pi_valid
**Postconditions:** Format correct

---

## 5. Boundary & Negative Testing

### TC-401: Empty piToolUseId boundary

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | Adapter ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input '' | ADAPTER-001 |
| 2 | Input null | Error handled gracefully |

**Test Data:** '', null
**Postconditions:** No crash

---

### TC-402: Very long tool_use_id

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | Data validation |
| **Preconditions** | Adapter ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input 10KB string | Handled within latency <10ms or rejected gracefully |

**Test Data:** Long string
**Postconditions:** System stable

---

## 6. Non-Functional Testing

### TC-601: Adapter latency <10ms

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | Test harness |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure 1000 normalizeId calls | Average <10ms |
| 2 | Measure 1000 requestApproval calls with mock gate | Average <10ms |

**Acceptance Criteria:** <10ms per call

---

### TC-602: Concurrent sessions 100+

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional Scalability |
| **Requirement** | NFR Scalability |
| **Preconditions** | Test harness |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Spawn 150 parallel sessions | No collision, mappings correct |
| 2 | Verify memory usage bounded | No leak |

**Acceptance Criteria:** Support 100+ parallel sessions

---

## 7. Integration Testing

### TC-701: Integration with ToolApprovalGate

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Gate available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapter calls Gate.evaluate with normalized id | Gate processes correctly |
| 2 | Verify data exchange fields | extensionToolId, sessionId sent |

**Test Data:** pi_int_01
**Postconditions:** Integration works

---

### TC-702: Persistence via Checkpointer Adapter

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Checkpointer available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create mapping | Checkpointer persists mapping |
| 2 | Restart session | Mapping restored |

**Test Data:** pi_persist
**Postconditions:** Audit trail preserved

---

## 8. Regression Testing

### TC-801: ToolApprovalGate unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-295-04 |
| **Preconditions** | Existing gate tests |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run existing ToolApprovalGate test suite | All tests pass |
| 2 | Verify no side effects | Gate behavior unchanged |

**Test Data:** N/A
**Postconditions:** No regression

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-295-01 Normalize tool_use_id | FSD 3.1 | TC-001, TC-101, TC-201, TC-301, TC-303 | ✅ |
| UC-295-02 Integrate ToolApprovalGate | FSD 3.2 | TC-002, TC-003, TC-203, TC-305, TC-701 | ✅ |
| BR-295-01 tool_use_id non-empty | FSD 3.1.3 | TC-301, TC-401 | ✅ |
| BR-295-02 sessionId match | FSD 3.1.3 | TC-302, TC-202 | ✅ |
| BR-295-03 round-trip | FSD 3.1.3 | TC-303 | ✅ |
| BR-295-04 no modify gate | FSD 3.2.3 | TC-304, TC-801 | ✅ |
| BR-295-05 Pi format | FSD 3.2.3 | TC-305 | ✅ |
| ADAPTER-001 Missing id | FSD 9 | TC-201, TC-301 | ✅ |
| ADAPTER-003 Gate timeout | FSD 9 | TC-203 | ✅ |
| NFR Latency <10ms | FSD 8 | TC-601 | ✅ |
| NFR 100+ sessions | FSD 8 | TC-602 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 5 | 5 | 100% |
| Acceptance Criteria | 6 | 6 | 100% |
| Error Codes | 4 | 4 | 100% |
| **Overall** | **17** | **17** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts
Pre-seeded users/sessions CSV will be created under documents/SA4E-295/testdata/

**End of STC**
