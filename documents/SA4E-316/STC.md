# Software Test Cases (STC)

## Pi Extensions — SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-316 |
| Title | Register custom tools via Pi Extensions (bridge MCP wrapper tools) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-316.md |
| Related FSD | FSD-v1.0-SA4E-316.md |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 3 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 4 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 2 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 2 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 3 | High |
| **Total** | | **21** | |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Register custom tools via Pi Extension

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, Story 1 AC 1-2 |
| **Preconditions** | MCP wrapper running on 9181, extension file exists, Pi SDK available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load Pi session with extension path configured | Extension discovered |
| 2 | Execute extension default function | pi.registerTool called for jira_*, mem_search, code_search, execute_dynamic_tool |
| 3 | Call session.getActiveToolNames() | All registered tool names returned |

**Test Data:** Extension with 4 tools registered
**Postconditions:** Tools active in session

### TC-002: Invoke registered tool and receive result from MCP

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, Story 1 AC 3 |
| **Preconditions** | Tools registered per TC-001 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke jira_get_issue with issue_key='SA4E-316' | Execute handler calls MCP wrapper 9181 |
| 2 | Verify response | Result returned as content array with type 'text' |

**Test Data:** Valid issue_key
**Postconditions:** Result propagated to Pi agent

### TC-003: Tools visible in session tool list

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, Story 2 AC 1 |
| **Preconditions** | Extensions loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call session.getActiveToolNames() | List contains registered custom tools |
| 2 | Retrieve tool metadata | Label and description accessible |

**Test Data:** N/A
**Postconditions:** Tool list accurate

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Schema validation fails, do not call MCP

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-1, BR-2 |
| **Preconditions** | Tool registered with TypeBox/Zod schema |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool with invalid parameter type | Validation error returned |
| 2 | Verify MCP not called | No network request to 9181 |

**Test Data:** issue_key as number instead of string
**Postconditions:** Error returned to agent

### TC-102: MCP unreachable returns structured error

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-2 |
| **Preconditions** | Tool registered |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop MCP wrapper or block port 9181 | |
| 2 | Invoke registered tool | Structured error returned with cause |
| 3 | Verify error not swallowed | Error message includes tool name |

**Test Data:** Valid params
**Postconditions:** Error propagated

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Duplicate tool name registration rejected

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1, BR-1 |
| **Preconditions** | Tool 'jira_get_issue' already registered |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to register tool with same name | Registration rejected |
| 2 | Check logs | Error logged: Tool name already exists |

**Test Data:** Duplicate name
**Postconditions:** Original tool remains active

### TC-202: Exception in execute handler caught and returned

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | Tool registered with handler that throws |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool that throws | Exception caught |
| 2 | Verify response | Error message returned, no crash |

**Test Data:** N/A
**Postconditions:** Session stable

### TC-203: MCP wrapper unavailable error message

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 9.1 MCP unreachable |
| **Preconditions** | MCP down |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool | User message 'MCP wrapper unavailable' returned |

**Test Data:** Valid params
**Postconditions:** Error clear

---

## 4. Business Rule Validation

### TC-301: Tool name must be unique

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | Session active |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Register two tools with same name | Second registration rejected |

**Test Data:** Duplicate name
**Postconditions:** Uniqueness enforced

### TC-302: Parameters schema validated before execution

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | Tool with schema |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke with invalid params | Validation error, MCP not called |

**Test Data:** Invalid schema
**Postconditions:** Validation enforced

### TC-303: Execute handler returns content array with type text

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | Tool invoked |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool successfully | Response has content[0].type='text' |

**Test Data:** Valid params
**Postconditions:** Format correct

### TC-304: Errors propagated not swallowed

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4, UC-3 |
| **Preconditions** | MCP returns error |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool causing MCP error | Error message returned with tool name and original error |

**Test Data:** Valid params
**Postconditions:** Clear error

---

## 5. Boundary & Negative Testing

### TC-401: Tool label max length

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data spec label max 100 chars |
| **Preconditions** | Extension registration |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Register tool with label 101 chars | Registration rejected or truncated per spec |

**Test Data:** 101 char label
**Postconditions:** Validation enforced

### TC-402: Empty parameters object

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Schema validation |
| **Preconditions** | Tool requires params |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool with empty params | Validation error returned |

**Test Data:** {}
**Postconditions:** Error clear

---

## 6. UI/UX Testing

### TC-501: Tool list displays correctly

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | UC-2 |
| **Preconditions** | Pi session UI open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open tools panel | Registered tools visible with label/description |

**Test Data:** N/A
**Postconditions:** UI accurate

### TC-502: Error message readability

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | UC-3 |
| **Preconditions** | Tool invocation error |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger error | Human readable message shown with cause |

**Test Data:** N/A
**Postconditions:** Message clear

---

## 7. Non-Functional Testing

### TC-601: Tool invocation latency <2s

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | MCP responsive |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure time for tool invocation roundtrip | Latency <2s |

**Test Data:** Valid params
**Acceptance Criteria:** <2s

### TC-602: Support >50 tools per session

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Scalability |
| **Requirement** | NFR Scalability |
| **Preconditions** | Extension can register many tools |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Register 51 tools | All tools active, no performance degradation |

**Test Data:** 51 dummy tools
**Acceptance Criteria:** Session stable

---

## 8. Integration Testing

### TC-701: Extension loader discovers extension from path

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1, SA4E-315 |
| **Preconditions** | Extension placed in configured path |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start Pi session | Extension loaded automatically |

**Test Data:** N/A
**Postconditions:** Tools registered

### TC-702: Proxy call to MCP wrapper 9181

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Tool registered |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke tool | JSON-RPC request sent to 9181 |

**Test Data:** Valid params
**Postconditions:** Correct exchange

### TC-703: Health check before registration

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | Risk mitigation |
| **Preconditions** | MCP down |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start session with MCP down | Registration succeeds but invocation errors gracefully |

**Test Data:** N/A
**Postconditions:** Graceful error

---

## 9. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-1 | FSD 3.1 | TC-001, TC-002, TC-101, TC-102, TC-201, TC-202 | ✅ |
| UC-2 | FSD 3.2 | TC-003, TC-501 | ✅ |
| UC-3 | FSD 3.3 | TC-304, TC-502, TC-203 | ✅ |
| BR-1 | FSD 3.1.3 | TC-301, TC-201 | ✅ |
| BR-2 | FSD 3.1.3 | TC-302, TC-101 | ✅ |
| BR-3 | FSD 3.1.3 | TC-303 | ✅ |
| BR-4 | FSD 3.1.3 | TC-304, TC-102 | ✅ |
| NFR Performance | FSD 8 | TC-601 | ✅ |
| NFR Scalability | FSD 8 | TC-602 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 4 | 4 | 100% |
| Acceptance Criteria | 5 | 5 | 100% |
| **Overall** | **12** | **12** | **100%** |

---

## 11. Appendix

### Test Data Setup
Extension file example provided in TDD. MCP wrapper must be running on port 9181.

