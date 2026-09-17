# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-292: SA4E-289.3 – Phase Router

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-292 |
| Title | SA4E-289.3 – Phase Router |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional Happy Path | TC-001 to TC-099 | 3 | High |
| Functional Alternative | TC-100 to TC-199 | 1 | High |
| Functional Exception | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 4 | High |
| Boundary Negative | TC-400 to TC-499 | 2 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration | TC-700 to TC-799 | 3 | High |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Valid intent leads to next phase

| Field | Value |
|-------|-------|
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-001, Story 1 |
| Preconditions | PipelineState exists with currentPhase=requirements, PiAgent Executor available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call routePhase with currentState ticketKey=SA4E-292, currentPhase=requirements, intent={action:transition,target:specification} | |
| 2 | Verify nextPhase returned | nextPhase = specification |
| 3 | Verify state persisted | RemoteCheckpointer updated |

**Test Data:** ticketKey=SA4E-292, currentPhase=requirements, intent valid
**Postconditions:** State updated to specification

### TC-002: Intent classification returns validated intent

| Field | Value |
|-------|-------|
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-002 |
| Preconditions | Input text available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Classify inputText "Move to specification phase" | |
| 2 | Validate Zod schema | classifiedIntent valid |
| 3 | Return intent | intent.type=phase_change, target=specification |

**Test Data:** inputText="Move to specification phase"
**Postconditions:** classifiedIntent produced

### TC-003: Phase router integrates with PiAgent Executor

| Field | Value |
|-------|-------|
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | Feature 3.3 |
| Preconditions | State Adapter ready |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Route phase to specification | Agent assigned |
| 2 | Execute agent turn via PiAgent Executor | Turn completes |
| 3 | Persist state | RemoteCheckpointer updated |

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Low confidence intent fallback to rule-based

| Field | Value |
|-------|-------|
| ID | TC-101 |
| Priority | High |
| Type | Functional Alternative |
| Requirement | UC-001 AF-1 |
| Preconditions | Intent classification confidence low |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Classifier returns low confidence | |
| 2 | Router uses rule-based default transition | Next phase per default rule |

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Invalid intent schema

| Field | Value |
|-------|-------|
| ID | TC-201 |
| Priority | High |
| Type | Exception |
| Requirement | UC-001 EF-1 |
| Preconditions | Intent malformed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call routePhase with intent missing target | |
| 2 | Zod validation fails | |
| 3 | Router returns current phase unchanged, logs error | nextPhase = currentPhase |

### TC-202: Unknown phase handling

| Field | Value |
|-------|-------|
| ID | TC-202 |
| Priority | High |
| Type | Exception |
| Requirement | UC-001 EF-2 |
| Preconditions | currentPhase=invalid |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Route with unknown phase | |
| 2 | Log error | Manual review flag set |

### TC-203: LLM timeout fallback

| Field | Value |
|-------|-------|
| ID | TC-203 |
| Priority | Medium |
| Type | Exception |
| Requirement | UC-001 EF-3 |
| Preconditions | Pi SDK timeout simulated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Classify intent triggers timeout | |
| 2 | Fallback to rule-based default | Next phase determined by rule |

---

## 4. Business Rule Validation

### TC-301: Intent passes Zod validation before routing

| Field | Value |
|-------|-------|
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-001 |
| Preconditions | Intent object present |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide valid intent | Validation passes |
| 2 | Provide invalid intent | Validation fails, routing paused |

### TC-302: currentPhase must be valid

| Field | Value |
|-------|-------|
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-002 |
| Preconditions | PipelineState loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | currentPhase=requirements | Accepted |
| 2 | currentPhase=unknown | Rejected, manual review |

### TC-303: nextPhase valid successor

| Field | Value |
|-------|-------|
| ID | TC-303 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-003 |
| Preconditions | Routing rules loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Transition requirements->specification | Allowed |
| 2 | Transition requirements->deployment | Rejected |

### TC-304: Transitions deterministic and traceable

| Field | Value |
|-------|-------|
| ID | TC-304 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-004 |
| Preconditions | Audit log enabled |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute same input twice | Same nextPhase both times |
| 2 | Check audit log | ticketKey, currentPhase, nextPhase, intent logged |

---

## 5. Boundary & Negative Testing

### TC-401: Empty ticketKey

| Field | Value |
|-------|-------|
| ID | TC-401 |
| Priority | Medium |
| Type | Boundary |
| Requirement | Data spec |
| Preconditions | |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call routePhase with ticketKey="" | Validation error returned |

### TC-402: Null intent

| Field | Value |
|-------|-------|
| ID | TC-402 |
| Priority | Medium |
| Type | Negative |
| Requirement | Data spec |
| Preconditions | |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with intent=null | Error, current phase unchanged |

---

## 7. Non-Functional Testing

### TC-601: Phase routing latency

| Field | Value |
|-------|-------|
| ID | TC-601 |
| Priority | Medium |
| Type | Non-Functional Performance |
| Requirement | NFR Performance <500ms p95 |
| Preconditions | SIT environment |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute 100 routing calls | p95 latency <500ms |

### TC-602: Audit trail retention

| Field | Value |
|-------|-------|
| ID | TC-602 |
| Priority | Medium |
| Type | Non-Functional Security |
| Requirement | Section 7.3 |
| Preconditions | |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform phase transition | Log contains ticketKey, phases, intent |
| 2 | Verify retention policy | Logs retained 90 days |

---

## 8. Integration Testing

### TC-701: State Adapter mapping

| Field | Value |
|-------|-------|
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Feature 3.3 |
| Preconditions | |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Convert PipelineState to Pi SDK state | Mapping correct |
| 2 | Convert back | Data preserved |

### TC-702: RemoteCheckpointer persistence

| Field | Value |
|-------|-------|
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | Section 5.2 |
| Preconditions | |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Route phase and persist | State saved |
| 2 | Reload state | Phase matches |

### TC-703: Pi SDK LLM classification

| Field | Value |
|-------|-------|
| ID | TC-703 |
| Priority | High |
| Type | Integration |
| Requirement | Section 5.1 |
| Preconditions | Mock Pi provider |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send inputText to Pi SDK | Response received |
| 2 | Validate with Zod | Passes |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 | FSD 3.1 | TC-001, TC-101, TC-201, TC-202, TC-203 | Covered |
| UC-002 | FSD 3.2 | TC-002 | Covered |
| BR-001 | FSD 3.1.3 | TC-301 | Covered |
| BR-002 | FSD 3.1.3 | TC-302 | Covered |
| BR-003 | FSD 3.1.3 | TC-303 | Covered |
| BR-004 | FSD 3.1.3 | TC-304 | Covered |

**Coverage Summary:** 100% of use cases and business rules covered.

---

## 11. Appendix

Test data setup scripts in testdata folder.
