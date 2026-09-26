# Software Test Cases (STC)

## Pi Coding Agent Extension — SA4E-313: Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace')

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-313 |
| Title | Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace') |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 5 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 1 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 2 | High |
| Business Rule Validation | TC-300 to TC-399 | 7 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 2 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Valid workspace detection and session creation

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-1, BR-2 |
| **Preconditions** | VS Code opened with workspace folder C:\Users\ASUS\testproj |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code with test workspace | workspaceFolders populated |
| 2 | Activate Pi extension | Extension loads |
| 3 | Initiate chat session | createAgentSession called |

**Test Data:** workspaceFolders[0].uri.fsPath = C:\Users\ASUS\testproj
**Postconditions:** Session initialized with cwd = C:\Users\ASUS\testproj

---

### TC-002: SessionManager constructed with same cwd

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-2, UC-1 |
| **Preconditions** | TC-001 passed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect session initialization | SessionManager.inMemory(cwd) used |
| 2 | Verify cwd parameter | cwd equals workspace root |

**Test Data:** N/A
**Postconditions:** SessionManager uses correct cwd

---

### TC-003: Built-in tools resolve against workspace root

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-3, UC-1 |
| **Preconditions** | Session created with valid cwd |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute ls command with relative path | Files listed from cwd |
| 2 | Execute read file with relative path | File content returned |

**Test Data:** test file ./README.md exists in workspace
**Postconditions:** Tools operate in workspace

---

### TC-004: AGENTS.md auto-loaded from workspace root

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-5, UC-1 |
| **Preconditions** | Workspace contains AGENTS.md |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session with cwd | DefaultResourceLoader walks up from cwd |
| 2 | Check loaded context files | AGENTS.md detected |

**Test Data:** AGENTS.md at workspace root
**Postconditions:** Context files loaded

---

### TC-005: Chatbox does not prompt for workspace path

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional/UI |
| **Requirement** | BR-4, AC-4 |
| **Preconditions** | Valid workspace active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Pi chatbox | No workspace path prompt shown |
| 2 | Send query | Agent responds without asking path |

**Test Data:** N/A
**Postconditions:** User not prompted

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Fallback when workspaceFolders undefined

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-1 |
| **Preconditions** | VS Code opened without workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Activate extension with no workspace | Warning logged |
| 2 | Session created | Fallback to process.cwd() |
| 3 | User notified | Message "Workspace not detected, using fallback" |

**Test Data:** workspaceFolders = undefined
**Postconditions:** Session created with fallback cwd

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Invalid path handling

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1 |
| **Preconditions** | cwd set to relative path |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt session creation with relative cwd | Error surfaced to user |
| 2 | Verify session not created | No session object |

**Test Data:** cwd = "relative/path"
**Postconditions:** Error displayed

---

### TC-201: Empty workspaceFolders array

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | workspaceFolders = [] |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Activate extension | Warning logged |
| 2 | Session created | Fallback to process.cwd() |

**Test Data:** empty array
**Postconditions:** Fallback used

---

## 4. Business Rule Validation

### TC-301: BR-1 cwd = active IDE workspace root

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | Workspace active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get workspace root | cwd equals workspaceFolders[0].uri.fsPath |

**Test Data:** N/A

---

### TC-302: BR-2 SessionManager with same cwd

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | Session init |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect SessionManager | Created via SessionManager.inMemory(cwd) |

---

### TC-303: BR-3 Built-in tools resolve against workspace root

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | Session active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run ls . | Returns workspace files |

---

### TC-304: BR-4 Chatbox no workspace prompt

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | Valid cwd set |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open chat | No prompt |

---

### TC-305: BR-5 AGENTS.md auto-loaded

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | AGENTS.md exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session | AGENTS.md loaded |

---

### TC-306: BR-6 cwd must be absolute

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-6 |
| **Preconditions** | Path validation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide relative path | Validation fails |

---

### TC-307: BR-7 workspaceFolders exists

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-7 |
| **Preconditions** | Extension activation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check workspaceFolders length | >=1 |

---

## 5. Boundary & Negative Testing

### TC-401: Path with spaces

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | Data validation |
| **Preconditions** | Workspace path contains spaces |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session | Session created successfully |

---

### TC-402: Special characters in path

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | Data validation |
| **Preconditions** | Path with unicode |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session | Handled gracefully |

---

### TC-403: Very long path

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | Data validation |
| **Preconditions** | Path > 200 chars |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session | Works or error handled |

---

## 6. UI/UX Testing

### TC-500: Chatbox input visible

| Field | Value |
|-------|-------|
| **ID** | TC-500 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Extension loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open chat panel | Input field visible |

---

### TC-501: Agent responses no workspace prompt

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Session active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check responses | No path prompt |

---

## 7. Non-Functional Testing

### TC-600: Performance cwd resolution <50ms

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | Extension active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure workspace detection time | <50ms |

---

### TC-601: Path sanitization

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional Security |
| **Requirement** | NFR Security |
| **Preconditions** | N/A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt path traversal | Blocked/validated |

---

## 8. Integration Testing

### TC-700: Integration with VS Code Workspace API

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | VS Code running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Extension calls workspaceFolders | Correct path returned |

---

### TC-701: Integration with Pi SDK createAgentSession

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.2 |
| **Preconditions** | cwd valid |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call createAgentSession | Session created with cwd |

---

## 9. Regression Testing

### TC-800: Existing built-in tools still work

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing functionality |
| **Preconditions** | Session active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute grep/find | Works as before |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-1 | FSD 3.1 | TC-001, TC-002, TC-003, TC-004, TC-005, TC-100, TC-200, TC-201 | Covered |
| BR-1 | FSD 3.1.3 | TC-301 | Covered |
| BR-2 | FSD 3.1.3 | TC-302 | Covered |
| BR-3 | FSD 3.1.3 | TC-303 | Covered |
| BR-4 | FSD 3.1.3 | TC-304 | Covered |
| BR-5 | FSD 3.1.3 | TC-305 | Covered |
| BR-6 | FSD 3.1.3 | TC-306 | Covered |
| BR-7 | FSD 3.1.3 | TC-307 | Covered |
| AC-1 | BRD 2.3 | TC-001 | Covered |
| AC-2 | BRD 2.3 | TC-002 | Covered |
| AC-3 | BRD 2.3 | TC-003 | Covered |
| AC-4 | BRD 2.3 | TC-005 | Covered |
| AC-5 | BRD 2.3 | TC-004 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 1 | 1 | 100% |
| Business Rules | 7 | 7 | 100% |
| Acceptance Criteria | 5 | 5 | 100% |
| **Overall** | **13** | **13** | **100%** |

---

## 11. Appendix

### Test Data Setup

- Test workspace folder with AGENTS.md
- Mock workspaceFolders object
- Pi SDK in-memory session

### Environment Configuration

- VS Code Insiders build
- Pi Coding Agent extension dev build
