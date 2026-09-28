# Software Test Cases (STC)

## Pi Chat 3-pane Layout Redesign — SA4E-305: SA4E-289.9 - Pi Chat 3-pane Layout Redesign

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-305 |
| Title | SA4E-289.9 - Pi Chat 3-pane Layout Redesign |
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
| Functional — Alternative Flows | TC-100 to TC-199 | 0 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 1 | High |
| Business Rule Validation | TC-300 to TC-399 | 3 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 2 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 4 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Open Pi Chat displays 3-pane layout

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BRD Story 1 |
| **Preconditions** | Pi Chat webview closed, runtime model-resolution fixed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Pi Chat webview in VS Code extension | Webview loads |
| 2 | Wait for layout render | Toolbar, Left Pane, Center Pane, Right Pane, Input, Status Bar visible |

**Test Data:** N/A
**Postconditions:** 3-pane layout rendered with data bound

---

### TC-002: Data fetched via extension-webview bridge

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-3 |
| **Preconditions** | 3-pane layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify bridge message exchange | Chat messages appear in Center Pane |
| 2 | Send user input | Message sent via bridge to extension host |

**Test Data:** Mock chat message payload
**Postconditions:** Data synchronized between extension and webview

---

### TC-003: Approval Panel visible in Right Pane

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, FSD 3.2 |
| **Preconditions** | 3-pane layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Approval Panel | Panel renders in Right Pane |
| 2 | Verify panel content | Approval workflow UI displayed |

**Test Data:** Mock approval items
**Postconditions:** Approval Panel accessible

---

### TC-004: Worklist tab integration

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02 |
| **Preconditions** | 3-pane layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Worklist tab | Tab switches to Worklist view |
| 2 | Verify content | Worklist items displayed in appropriate pane |

**Test Data:** Mock worklist items
**Postconditions:** Worklist accessible within layout

---

## 2. Functional Test Cases — Alternative Flows

*No alternative flows defined in FSD.*

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Bridge timeout shows error state

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-01 EF-1, FSD 9 |
| **Preconditions** | 3-pane layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate bridge timeout | Error state shown |
| 2 | Verify retry behavior | Auto retry attempted, warning message "Data unavailable, retrying" |

**Test Data:** Bridge unresponsive mock
**Postconditions:** System remains stable, no data corruption

---

## 4. Business Rule Validation

### TC-301: No hardcoded session/provider/model

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1, SEC-289-11 |
| **Preconditions** | Source code accessible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect source for hardcoded session/provider/model | No hardcoded values found |
| 2 | Verify dynamic resolution used | Runtime resolution works |

**Test Data:** N/A

---

### TC-302: Reuse existing Svelte components/stores

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | Code review |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check imports | Existing components/stores reused |
| 2 | Verify no duplication | No new duplicate components |

**Test Data:** N/A

---

### TC-303: Real data via extension-webview bridge

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger data refresh | Data comes from bridge, not mock |
| 2 | Verify message format | JSON messages used |

**Test Data:** Real bridge messages

---

## 5. Boundary & Negative Testing

### TC-401: Layout with empty store state

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | UC-01 |
| **Preconditions** | Store empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Pi Chat with empty stores | Empty state rendered, no crash |

**Test Data:** Empty stores

---

### TC-402: Rapid tab switching

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | UC-02 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rapidly switch Worklist tab | UI remains responsive, no errors |

**Test Data:** N/A

---

## 6. UI/UX Testing

### TC-501: Toolbar presence and behavior

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec 1 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify Toolbar at top | Visible, correct actions present |

---

### TC-502: Left Pane navigation context

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec 2 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect Left Pane | Navigation/context displayed |

---

### TC-503: Center Pane main chat area

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec 3 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify Center Pane | Main chat/workflow area visible |

---

### TC-504: Status Bar information

| Field | Value |
|-------|-------|
| **ID** | TC-504 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec 6 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify Status Bar at bottom | Status information displayed |

---

## 7. Non-Functional Testing

### TC-601: Page load performance

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | FSD 8 Performance |
| **Preconditions** | SIT environment |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure time from open to render | Page loads < 2s |

**Acceptance Criteria:** Response time ≤ 2 seconds

---

### TC-602: Security - no hardcoded credentials

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | FSD 8 Security, SEC-289-11 |
| **Preconditions** | Code scan |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan source for secrets | No hardcoded credentials found |

---

## 8. Integration Testing

### TC-701: Extension-webview message passing

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Extension host running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send message from webview to extension | Message received correctly |
| 2 | Send message from extension to webview | UI updates correctly |

---

### TC-702: Store state persistence across panes

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 3.1 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update state in one pane | State reflected in other panes |

---

## 9. Regression Testing

### TC-801: Existing Pi Chat chat functionality

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send/receive chat messages | Works as before redesign |

---

### TC-802: Existing stores behavior

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-2 |
| **Preconditions** | Layout loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Interact with stores | Behavior unchanged |

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-01 | FSD 3.1 | TC-001, TC-002, TC-201, TC-301, TC-302, TC-303, TC-401, TC-501, TC-502, TC-503, TC-504, TC-601, TC-701, TC-702 | Covered |
| UC-02 | FSD 3.2 | TC-003, TC-004, TC-402, TC-801 | Covered |
| BR-1 | FSD 3.1.3 | TC-301, TC-602 | Covered |
| BR-2 | FSD 3.1.3 | TC-302, TC-802 | Covered |
| BR-3 | FSD 3.1.3 | TC-002, TC-303, TC-701 | Covered |
| Story 1 | BRD 2.3 | TC-001, TC-002 | Covered |
| Story 2 | BRD 2.3 | TC-003, TC-004 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 3 | 3 | 100% |
| Acceptance Criteria | 2 | 2 | 100% |
| Error Codes | 1 | 1 | 100% |
| **Overall** | **8** | **8** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts

- Use existing Svelte stores seed data
- Mock extension-webview bridge messages via test harness

### Environment Configuration

- VS Code extension webview enabled
- Frontend-structure steering followed
