# Software Test Cases (STC)

## SA4E-289.10 — SA4E-306: SA4E-289.10 - Pi Packages Config Page + Pre-install 7 Packages

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-306 |
| Title | SA4E-289.10 - Pi Packages Config Page + Pre-install 7 Packages |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-25 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 4 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 8 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 2 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 4 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 3 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: View Packages List

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-4, Story 1 AC-2 |
| **Preconditions** | User authenticated as Admin, Pi extension host initialized, packages pre-seeded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings panel → Packages tab | Packages config page loads |
| 2 | View package list | List shows 7 pre-install packages with name, version, enabled, status |

**Test Data:** pre-seeded-data.csv with 7 packages
**Postconditions:** Page displays correctly

### TC-002: Toggle Enable/Disable Persists

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, Story 1 AC-3/4 |
| **Preconditions** | User logged in, packages list visible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle enable switch for pi-mcp-adapter | State changes to disabled |
| 2 | Reload page | Enabled state remains disabled |
| 3 | Toggle back to enabled | State changes to enabled |

**Test Data:** packageId=pi-mcp-adapter
**Postconditions:** Config persisted

### TC-003: Pre-install on First Run

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-8, Story 2 AC-1/2 |
| **Preconditions** | Fresh install marker not set |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate system startup first run | Pre-install orchestrator triggers |
| 2 | Check installed packages | All 7 packages installed and enabled |
| 3 | Verify install log | Status logged |

**Test Data:** pre-seeded-data.csv
**Postconditions:** Packages available

### TC-004: Packages Config Page Accessible

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, Story 1 AC-1 |
| **Preconditions** | User authenticated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings panel | Packages tab visible |
| 2 | Click Packages tab | Page loads with list |

**Test Data:** N/A
**Postconditions:** Page accessible

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Extension Host Unavailable Warning

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-1, BR-5 |
| **Preconditions** | Pi extension host not initialized |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Packages tab | Warning "Pi extension host required" shown |
| 2 | Check toggles | Toggles disabled |

**Test Data:** host unavailable state
**Postconditions:** UI safe

### TC-102: Package Not Installed Show Install Button

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-2 |
| **Preconditions** | Package status = not installed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View package with status not installed | Install button visible |
| 2 | Click Install | Install flow triggers |

**Test Data:** package status pending
**Postconditions:** Install initiated

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Persist Failure Error Toast

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1 |
| **Preconditions** | Config store write fails |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle package enable | Error toast "Failed to save settings" shown |
| 2 | Verify UI state | UI reverts to previous state |

**Test Data:** simulate DB write failure
**Postconditions:** No data corruption

### TC-202: Host Call Fails Retry

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | Host call error |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle package | Error toast with retry option shown |

**Test Data:** host error
**Postconditions:** User can retry

### TC-203: Install Timeout Retry 3 Times

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-2 EF-1, BR-7 |
| **Preconditions** | Network failure simulated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger pre-install | Retry up to 3 times |
| 2 | After 3 failures | Marked as error |

**Test Data:** network timeout
**Postconditions:** Error logged

---

## 4. Business Rule Validation

### TC-301: BR-1 Packages Tab Named Packages

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | Settings panel open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings | Tab labeled "Packages" exists |

**Test Data:** N/A

### TC-302: BR-2 PackageId Non-Empty

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | API call |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send packageId empty | Validation error 400 |

**Test Data:** packageId=""

### TC-303: BR-3 Enabled Boolean

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | API call |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send enabled="yes" | Validation error |

**Test Data:** enabled non-boolean

### TC-304: BR-4 All 7 Pre-install Packages Listed

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | Packages page open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check list | All 7 packages present |

**Test Data:** pi-mcp-adapter, pi-web-access, @juicesharp/rpiv-todo, @juicesharp/rpiv-ask-user-question, pi-lens, context-mode, pi-subagents

### TC-305: BR-5 Extension Host Mandatory

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | Bare agent mode |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt load packages | Warning shown, cannot load |

**Test Data:** N/A

### TC-306: BR-6 Package Names Match Registry

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-6 |
| **Preconditions** | Pre-install |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check installed names | Exact match to registry identifiers |

**Test Data:** registry identifiers

### TC-307: BR-7 Retry Install Up To 3 Times

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-7 |
| **Preconditions** | Timeout simulated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger install | 3 retry attempts logged |

**Test Data:** timeout

### TC-308: BR-8 Packages Enabled By Default After Install

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-8 |
| **Preconditions** | After pre-install |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check enabled flag | All 7 packages enabled=true |

**Test Data:** N/A

---

## 5. Boundary & Negative Testing

### TC-401: Toggle With Invalid PackageId

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | API validation |
| **Preconditions** | API endpoint |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST toggle with invalid id | 404 error |

**Test Data:** packageId="invalid-id"

### TC-402: Empty PackageId Validation

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | BR-2 |
| **Preconditions** | API call |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit empty packageId | Validation error "PackageId must be non-empty" |

**Test Data:** packageId=""

---

## 6. UI/UX Testing

### TC-501: Packages Tab Presence

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec |
| **Preconditions** | Settings panel open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify Settings tabs | Packages tab visible |

**Test Data:** N/A

### TC-502: Package List Table Columns

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Packages page open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check columns | Name, Version, Enabled, Status present |

**Test Data:** N/A

### TC-503: Enable Toggle Switch Works

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Packages page open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click toggle | Switch animates and state updates |

**Test Data:** N/A

### TC-504: Status Indicator Shows

| Field | Value |
|-------|-------|
| **ID** | TC-504 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Packages page open |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View status label | Shows installed/pending/error |

**Test Data:** N/A

---

## 7. Non-Functional Testing

### TC-601: Packages List Loads Within 2 Seconds

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | FSD 8 Performance |
| **Preconditions** | 50 packages loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Packages tab | Load time ≤ 2 seconds |

**Acceptance Criteria:** Response time ≤ 2s

### TC-602: Authentication Required

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | FSD 7.1, 8 Security |
| **Preconditions** | Unauthenticated user |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Access Packages tab without login | Redirect to login / 401 |

**Acceptance Criteria:** Access control enforced

---

## 8. Integration Testing

### TC-701: GET /api/packages/list Returns Data

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 3.1.6 API Contract |
| **Preconditions** | Server running, auth token valid |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/packages/list | 200 OK with package list JSON |

**Test Data:** valid JWT

### TC-702: Package Service To Pi Extension Host

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Host available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle enable via API | Host receives enable command and returns status |

**Test Data:** packageId valid

### TC-703: Pre-install Orchestrator Integration

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 6.1 |
| **Preconditions** | First run |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger pre-install | Packages installed via Pi Registry and enabled via host |

**Test Data:** required package list

---

## 9. Regression Testing

### TC-801: Existing Settings Panel Not Broken

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |
| **Preconditions** | Settings panel accessible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate other Settings tabs | Functionality unchanged |

**Test Data:** N/A

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-1 | FSD 3.1 | TC-001, TC-002, TC-004, TC-101, TC-102, TC-201, TC-202, TC-301, TC-305 | Covered |
| UC-2 | FSD 3.2 | TC-003, TC-203, TC-306, TC-307, TC-308 | Covered |
| BR-1 | FSD 3.1.3 | TC-301 | Covered |
| BR-2 | FSD 3.1.3 | TC-302, TC-402 | Covered |
| BR-3 | FSD 3.1.3 | TC-303 | Covered |
| BR-4 | FSD 3.1.3 | TC-001, TC-304 | Covered |
| BR-5 | FSD 3.1.3 | TC-101, TC-305 | Covered |
| BR-6 | FSD 3.2.3 | TC-306 | Covered |
| BR-7 | FSD 3.2.3 | TC-203, TC-307 | Covered |
| BR-8 | FSD 3.2.3 | TC-003, TC-308 | Covered |
| Story 1 AC-1 | BRD 2.3 | TC-004 | Covered |
| Story 1 AC-2 | BRD 2.3 | TC-001 | Covered |
| Story 1 AC-3 | BRD 2.3 | TC-002 | Covered |
| Story 1 AC-4 | BRD 2.3 | TC-002 | Covered |
| Story 2 AC-1 | BRD 2.3 | TC-003 | Covered |
| Story 2 AC-2 | BRD 2.3 | TC-003, TC-308 | Covered |
| Story 2 AC-3 | BRD 2.3 | TC-003 | Covered |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 8 | 8 | 100% |
| Acceptance Criteria | 7 | 7 | 100% |
| Error Codes | 3 | 3 | 100% |
| **Overall** | **20** | **20** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts
Pre-seeded packages via CSV. Auth tokens generated via /api/auth/login.

### Environment Configuration
Pi extension host must be initialized before UI tests. Mock Pi Registry for SIT.
