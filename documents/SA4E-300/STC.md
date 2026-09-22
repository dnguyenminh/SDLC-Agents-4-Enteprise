# Software Test Cases (STC)

## SA4E-300 — [Extension/Backend] Cải thiện error detail trong luồng ingest source code vào KB

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-300 |
| Title | [Extension/Backend] Cải thiện error detail trong luồng ingest source code vào KB |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-17 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-300.md |
| Related FSD | FSD-v1.0-SA4E-300.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-17 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 3 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 6 | High |
| Business Rule Validation | TC-300 to TC-399 | 5 | High |
| Integration Testing | TC-700 to TC-799 | 4 | High |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Backend indexError returns enriched error shape

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-1 |
| **Preconditions** | Backend running, valid token, X-Project-Id present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/source with invalid payload trigger 500 | Response status 500 |
| 2 | Verify response body | Contains `error`, `details`, `action` fields |
| 3 | Check error message | Not equal to generic "Internal error" |

**Test Data:** testdata/error-scenarios.csv row `backend-500`
**Postconditions:** Error logged with details

---

### TC-002: httpPostWithDetail forwards err.body details/action

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-2 |
| **Preconditions** | Extension http client initialized |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock backend response 500 with body {error:"DB error",details:"ENOSPC",action:"Free disk"} | |
| 2 | Call httpPostWithDetail | Returns { ok:false, error:"DB error", details:"ENOSPC", action:"Free disk", status:500 } |
| 3 | Verify no silent catch | Details propagated not swallowed |

**Test Data:** testdata/client-forward.csv
**Postconditions:** Error object contains details/action

---

### TC-003: Per-file rejectedReasons returned for source ingest

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-4 |
| **Preconditions** | Backend with files causing EACCES |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/source with mixed valid/invalid files | Response 200 |
| 2 | Check response field rejectedReasons | Array non-empty |
| 3 | Verify each item has file, code, message | code="EACCES", message contains permission denied |

**Test Data:** testdata/per-file-reject.csv
**Postconditions:** Client can display per-file errors

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Successful ingest returns 200 without error fields

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-1 |
| **Preconditions** | Valid files |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/source with valid files | Status 200 |
| 2 | Verify response | Contains written, skipped, rejected, no error field |

**Test Data:** testdata/valid-files.csv

---

### TC-102: Ingest docs returns failedFiles array

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-2, BR-5 |
| **Preconditions** | Temp folder has docs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/ingest-docs | Status 200 |
| 2 | Verify response failedFiles | Array with file and reason |
| 3 | Check reason contains error code | e.g., ENOSPC |

**Test Data:** testdata/ingest-docs.csv

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Backend 401 Unauthorized surfaces action re-authenticate

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1, Error Code 401 |
| **Preconditions** | Expired token |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/source with expired token | Status 401 |
| 2 | Verify body | error="Unauthorized", action contains re-authenticate |

**Test Data:** testdata/error-scenarios.csv row `auth-401`

---

### TC-202: Backend 429 Too Many Requests surfaced

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1 |
| **Preconditions** | Concurrency limit exceeded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fire 4 concurrent index requests | One returns 429 |
| 2 | Verify response | error="Server busy", details present, retryAfter |

**Test Data:** testdata/concurrency.csv

---

### TC-203: ENOSPC disk full error surfaced with details

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-1, Error ENOSPC |
| **Preconditions** | Mock write fails with ENOSPC |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger write to full disk path | Backend returns 500 |
| 2 | Verify details contains "ENOSPC" | details includes disk full |
| 3 | Verify action suggests free space | action non-empty |

**Test Data:** testdata/error-scenarios.csv

---

### TC-204: EACCES permission denied surfaced

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-1, Error EACCES |
| **Preconditions** | File path without permission |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest file with EACCES | rejectedReasons contains code EACCES |
| 2 | Verify message | Contains permission denied |

**Test Data:** testdata/per-file-reject.csv

---

### TC-205: Network ECONNREFUSED logged to Output channel not console.debug

| Field | Value |
|-------|-------|
| **ID** | TC-205 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-2, BR-6 |
| **Preconditions** | Backend down |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger ingest with backend unreachable | |
| 2 | Check Output channel log | Contains URL + error message |
| 3 | Verify no console.debug output | console.debug not used |

**Test Data:** testdata/network-error.csv

---

### TC-206: triggerDocumentIngest propagates error not silent

| Field | Value |
|-------|-------|
| **ID** | TC-206 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-3 |
| **Preconditions** | Backend returns 500 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call triggerDocumentIngest | Returns error not null |
| 2 | Verify warning shown in Output channel | Warning displayed |
| 3 | Verify no fake success toast | Success not shown |

**Test Data:** testdata/client-forward.csv

---

## 4. Business Rule Validation

### TC-301: indexError always includes error field non-empty

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | Any error scenario |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger various errors | All responses have error string non-empty |

---

### TC-302: httpPostWithDetail reads err.body?.details and action

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | Backend returns details/action |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock response with details/action | Client object contains both |
| 2 | Mock response without details | details undefined, no crash |

---

### TC-303: No silent catch in triggerDocumentIngest

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | Code reviewed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search source for `catch { /* silent */ }` in IndexingService | Not found |
| 2 | Verify result.ok check exists | Check present |

---

### TC-304: rejectedReasons format correct

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | Write fails |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger reject | Each item has file, code, message |

---

### TC-305: failedFiles format for ingest-docs

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | Ingest docs fails |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger ingest-docs with errors | failedFiles array items have file and reason |

---

## 5. Integration Testing

### TC-701: Full error propagation chain Backend→Extension→Output

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-1 |
| **Preconditions** | End-to-end environment |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger ingest via Extension UI | Backend returns enriched error |
| 2 | Verify Output channel shows error/details/action | Message visible |
| 3 | Verify toast shows error summary | Toast displayed |

---

### TC-702: Console debug replaced by Output channel

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | BR-6 |
| **Preconditions** | Codebase |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep for console.debug/console.warn in IndexerHttpClient | Zero matches |
| 2 | Verify appendLine calls exist | Output channel used |

---

### TC-703: Error codes surfaced correctly

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-1 |
| **Preconditions** | Multiple errors |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger ENOSPC, EACCES, 429, 401 | Each error details contain code |
| 2 | Verify developer can distinguish | Different messages |

---

### TC-704: Per-file failure displayed in UI

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-2 |
| **Preconditions** | Mixed files |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ingest batch with 2 good, 1 bad | Response contains rejectedReasons |
| 2 | Verify UI lists file names with reasons | Displayed |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-1 | FSD 3.1 | TC-001, TC-002, TC-201, TC-202, TC-203, TC-701 | ✅ |
| UC-2 | FSD 3.2 | TC-003, TC-102, TC-304, TC-305, TC-704 | ✅ |
| UC-3 | FSD 3.3 | TC-205, TC-702 | ✅ |
| BR-1 | FSD 3.1.3 | TC-001, TC-203, TC-301, TC-703 | ✅ |
| BR-2 | FSD 3.1.3 | TC-002, TC-302 | ✅ |
| BR-3 | FSD 3.1.3 | TC-206, TC-303 | ✅ |
| BR-4 | FSD 3.2.3 | TC-003, TC-304 | ✅ |
| BR-5 | FSD 3.2.3 | TC-102, TC-305 | ✅ |
| BR-6 | FSD 3.3.2 | TC-205, TC-702 | ✅ |
| Story 1 AC-1 | BRD 2.3 | TC-001, TC-002 | ✅ |
| Story 2 AC-1 | BRD 2.3 | TC-003, TC-102 | ✅ |
| Story 3 AC-1 | BRD 2.3 | TC-205, TC-702 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 6 | 6 | 100% |
| Acceptance Criteria | 3 | 3 | 100% |
| **Overall** | **12** | **12** | **100%** |

---

## 11. Appendix

### Test Data Setup

CSV files in `documents/SA4E-300/testdata/`

**End of STC**
