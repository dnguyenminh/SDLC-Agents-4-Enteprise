# Software Test Cases (STC)

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
| Related STP | STP-v1-SA4E-293 |
| Related FSD | FSD-v1-SA4E-293 |

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
| Functional — Exception/Error Flows | TC-200 to TC-299 | 2 | High |
| Business Rule Validation | TC-300 to TC-399 | 3 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 4 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 0 | N/A |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 3 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 0 | N/A |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Round-trip conversion of valid PipelineState

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, BR-003, Story 1 AC 4 |
| **Preconditions** | Valid PipelineState fixture exists with ticketKey, threadId, currentPhase, pipelineStatus, chatHistory, agentOutputs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call StateAdapter.toPiState(pipelineState) | PiInternalState returned with all core fields mapped |
| 2 | Call StateAdapter.fromPiState(piState) | PipelineState reconstructed |
| 3 | Compare original and reconstructed core fields | All core fields equal, no data loss |

**Test Data:** ticketKey=SA4E-293, threadId=123e4567, currentPhase=phase-2-specification, pipelineStatus=running, chatHistory=[...], agentOutputs={...}
**Postconditions:** State unchanged, round-trip successful

---

### TC-002: toPiState injects Pi-specific defaults

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001 AF-1, Story 2 AC 2 |
| **Preconditions** | PipelineState without piSessionId, currentAgentId, toolCallCount |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call toPiState with state missing Pi fields | piSessionId generated UUID, currentAgentId=null, toolCallCount=0 |
| 2 | Verify fields populated | Values present and correct type |

**Test Data:** PipelineState with only required fields
**Postconditions:** PiInternalState contains injected defaults

---

### TC-003: fromPiState preserves backward compatible fields

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001 |
| **Preconditions** | PiInternalState with Pi fields populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call fromPiState(piState) | PipelineState returned |
| 2 | Verify ticketKey, threadId, currentPhase, pipelineStatus, chatHistory, agentOutputs, errors | All fields preserved exactly |

**Test Data:** PiInternalState with sample data
**Postconditions:** Backward compatible state produced

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Missing optional Pi fields initialized with defaults

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1 |
| **Preconditions** | State with piSessionId undefined |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | toPiState invoked | piSessionId auto-generated, toolCallCount defaults to 0 |
| 2 | Subsequent call with existing piSessionId | Same piSessionId retained, not regenerated |

**Test Data:** State without Pi fields
**Postconditions:** Defaults applied once per state lifecycle

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Missing required field ticketKey throws StateMappingError

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-1, Error Scenario Missing required field |
| **Preconditions** | PipelineState with ticketKey missing |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call toPiState with invalid state | StateMappingError thrown |
| 2 | Verify log contains error | Error logged via Pino |

**Test Data:** PipelineState = { threadId:'x' }
**Postconditions:** Error state, no corruption

---

### TC-201: Serialization failure returns original state with warning

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-002 EF-1 |
| **Preconditions** | Mock RemoteCheckpointer to throw on save |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save PipelineState via checkpointer | Warning logged, original state returned, no persistence |
| 2 | Verify state unchanged | No data loss |

**Test Data:** Valid PipelineState
**Postconditions:** System stable

---

## 4. Business Rule Validation

### TC-300: ticketKey matches pattern [A-Z]+-\d+

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-001 |
| **Preconditions** | State with valid ticketKey |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Validate ticketKey | Pass for SA4E-293, fail for sa4e-293, SA4E, SA4E- |
| 2 | Attempt mapping with invalid key | Validation error |

**Test Data:** Valid and invalid ticketKeys
**Postconditions:** Rule enforced

---

### TC-301: toolCallCount >= 0 integer

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-002 |
| **Preconditions** | State with toolCallCount |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | toPiState with toolCallCount = 3 | Accepted |
| 2 | toPiState with toolCallCount = -1 | Rejected / coerced to 0 with warning |
| 3 | toPiState with toolCallCount = 1.5 | Rejected |

**Test Data:** 3, -1, 1.5
**Postconditions:** Non-negative integer enforced

---

### TC-302: Round-trip lossless for core fields

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-003 |
| **Preconditions** | Diverse PipelineState fixtures |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Convert toPiState then fromPiState | Core fields deep equal |
| 2 | Run property test with 100 random states | 100% pass |

**Test Data:** Random valid states
**Postconditions:** Lossless guarantee

---

## 5. Boundary & Negative Testing

### TC-400: toolCallCount boundary values

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data field toolCallCount |
| **Preconditions** | State adapter available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set toolCallCount = 0 | Accepted |
| 2 | Set toolCallCount = Number.MAX_SAFE_INTEGER | Accepted |
| 3 | Set toolCallCount = -1 | Rejected |

**Test Data:** 0, MAX_SAFE_INTEGER, -1
**Postconditions:** Validation correct

---

### TC-401: ticketKey boundary pattern

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data field ticketKey |
| **Preconditions** | - |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | ticketKey = A-1 | Accepted |
| 2 | ticketKey = ABCDEFGHIJKLMNOPQRSTUVWXYZ-999999 | Accepted |
| 3 | ticketKey = aBc-123 | Rejected |

**Test Data:** Minimal, maximal, invalid case
**Postconditions:** Pattern enforced

---

### TC-402: Empty chatHistory and agentOutputs

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data specifications |
| **Preconditions** | - |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | State with chatHistory = [] | Mapping succeeds |
| 2 | State with agentOutputs = {} | Mapping succeeds |

**Test Data:** Empty collections
**Postconditions:** No errors

---

### TC-403: Null optional fields

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data specifications |
| **Preconditions** | - |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | State with piSessionId = null | Defaults to generated UUID |
| 2 | State with currentAgentId = null | Preserved as null |

**Test Data:** Null optional fields
**Postconditions:** Graceful handling

---

## 6. Non-Functional Testing

### TC-600: Mapping latency <5ms p95

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | FSD 8 Performance |
| **Preconditions** | Typical state ~100KB |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure 1000 conversions | p95 <5ms |
| 2 | Record distribution | Mean <2ms |

**Acceptance Criteria:** p95 <5ms per conversion

---

### TC-601: 5MB state mapping performance

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | FSD 8 Scalability |
| **Preconditions** | 5MB state fixture |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Convert 5MB state toPiState | Success <50ms |
| 2 | Convert back | Success <50ms |

**Acceptance Criteria:** Mapping completes without OOM

---

### TC-602: Reliability 99.9% success rate

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Availability |
| **Requirement** | FSD 8 Availability |
| **Preconditions** | 1000 random states |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run round-trip 1000 times | ≥999 successes |
| 2 | Count failures | ≤1 |

**Acceptance Criteria:** Success rate ≥99.9%

---

## 7. Integration Testing

### TC-700: RemoteCheckpointer save/load preserves Pi fields

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.2 |
| **Preconditions** | Test DB available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save PipelineState via checkpointer | Success |
| 2 | Load state back | Pi fields intact |
| 3 | Verify round-trip | Data identical |

**Test Data:** State with Pi fields
**Postconditions:** Persistence verified

---

### TC-701: Type compatibility with Pi SDK

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Pi SDK types installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compile TypeScript with adapter | No type errors |
| 2 | toPiState output assignable to PiInternalState | Type check passes |

**Test Data:** Sample state
**Postconditions:** Type compatibility confirmed

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 Bidirectional mapping | FSD 3.1 | TC-001, TC-002, TC-003, TC-100, TC-200, TC-302 | ✅ |
| UC-002 Pi-specific fields | FSD 3.2 | TC-002, TC-100, TC-201, TC-700 | ✅ |
| BR-001 ticketKey pattern | FSD 3.1.3 | TC-300, TC-401 | ✅ |
| BR-002 toolCallCount >=0 | FSD 3.1.3 | TC-301, TC-400 | ✅ |
| BR-003 Round-trip lossless | FSD 3.1.3 | TC-001, TC-302, TC-602 | ✅ |
| Story 1 AC 1-6 | BRD 2.3 | TC-001, TC-002, TC-003, TC-200, TC-302 | ✅ |
| Story 2 AC 1-4 | BRD 2.3 | TC-002, TC-100, TC-700 | ✅ |
| NFR Performance <5ms | FSD 8 | TC-600, TC-601 | ✅ |
| NFR Scalability 5MB | FSD 8 | TC-601 | ✅ |
| Error Scenario StateMappingError | FSD 9 | TC-200 | ✅ |
| Error Scenario Serialization failure | FSD 9 | TC-201 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 3 | 3 | 100% |
| Acceptance Criteria | 10 | 10 | 100% |
| Error Codes | 2 | 2 | 100% |
| **Overall** | **17** | **17** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts
Fixtures located in `documents/SA4E-293/testdata/`:
- valid-pipeline-state.json
- state-missing-pi-fields.json
- large-state-5mb.json
- invalid-ticketkey.json

### Environment Configuration
Node 20+, TypeScript 5+, vitest, fast-check, SQLite test container
