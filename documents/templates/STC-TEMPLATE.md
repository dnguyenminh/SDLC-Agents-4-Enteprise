# Software Test Cases (STC)

## {SYSTEM_NAME} — {TICKET_KEY}: {TICKET_SUMMARY}

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET_KEY} |
| Title | {TICKET_SUMMARY} |
| Author | QA Agent |
| Version | 1.0 |
| Date | {CURRENT_DATE} |
| Status | Draft |
| Related STP | STP-v{VERSION}-{TICKET-KEY}.docx |
| Related FSD | FSD-v{VERSION}-{TICKET-KEY}.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {CURRENT_DATE} | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | {count} | High |
| Functional — Alternative Flows | TC-100 to TC-199 | {count} | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | {count} | High |
| Business Rule Validation | TC-300 to TC-399 | {count} | High |
| Boundary & Negative Testing | TC-400 to TC-499 | {count} | Medium |
| UI/UX Testing | TC-500 to TC-599 | {count} | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | {count} | Medium |
| Integration Testing | TC-700 to TC-799 | {count} | High |
| Regression Testing | TC-800 to TC-899 | {count} | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: {Test Case Title}

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | {UC-x, BR-y, Story z} |
| **Preconditions** | {Preconditions — e.g., User is logged in, test data exists} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Specific action to perform} | {Expected outcome} |
| 2 | {Next action} | {Expected outcome} |
| 3 | {Next action} | {Expected outcome} |

**Test Data:** {Specific test data values to use}
**Postconditions:** {System state after test completes}

---

### TC-002: {Test Case Title}

{Repeat same format}

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: {Test Case Title — AF-x}

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | {UC-x AF-y} |
| **Preconditions** | {Preconditions} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Action} | {Expected} |

**Test Data:** {Test data}
**Postconditions:** {State after test}

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: {Test Case Title — EF-x}

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | {UC-x EF-y, Error Code NG-xxx} |
| **Preconditions** | {Preconditions to trigger error} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Action that triggers error} | {Expected error message matching FSD error code} |

**Test Data:** {Data that causes the error}
**Postconditions:** {System state — should be stable, no data corruption}

---

## 4. Business Rule Validation

### TC-300: {Business Rule BR-x Validation}

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | {BR-x from FSD} |
| **Preconditions** | {Preconditions} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Action to test the business rule} | {Expected behavior per BR-x} |

**Test Data:** {Data that validates the rule}

---

## 5. Boundary & Negative Testing

### TC-400: {Boundary/Negative Test Title}

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | {Data field from FSD} |
| **Preconditions** | {Preconditions} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Enter boundary value — min, max, empty, null, special chars} | {Expected validation message or behavior} |

**Test Data:** {Boundary values: min-1, min, min+1, max-1, max, max+1, empty, null, special characters}

---

## 6. UI/UX Testing

### TC-500: {UI Element Verification}

| Field | Value |
|-------|-------|
| **ID** | TC-500 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | {FSD UI Specification table reference} |
| **Preconditions** | {Screen is loaded} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Verify element presence/style/behavior} | {Expected per FSD UI spec} |

---

## 7. Non-Functional Testing

### TC-600: {Performance/Security Test}

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — {Performance/Security} |
| **Requirement** | {FSD Section 8 NFR reference} |
| **Preconditions** | {Environment setup, load tool configured} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Action — e.g., Load 50 concurrent users} | {Expected — e.g., Response time ≤ 5 seconds} |

**Acceptance Criteria:** {Measurable target from FSD}

---

## 8. Integration Testing

### TC-700: {Integration Test Title}

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | {FSD Section 5 Integration reference} |
| **Preconditions** | {External system available or mocked} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Trigger integration} | {Expected data exchange} |

---

## 9. Regression Testing

### TC-800: {Regression Test Title}

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | {Existing feature that must still work} |
| **Preconditions** | {Preconditions} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | {Verify existing feature still works} | {Expected — same as before the change} |

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| {UC-1} | {FSD 3.1} | {TC-001, TC-002, TC-101, TC-201} | {Covered / Partial / Not Covered} |
| {BR-1} | {FSD 3.1.3} | {TC-301} | {Covered} |
| {Story 1 AC-1} | {BRD 2.3} | {TC-001} | {Covered} |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | {count} | {count} | {%} |
| Business Rules | {count} | {count} | {%} |
| Acceptance Criteria | {count} | {count} | {%} |
| Error Codes | {count} | {count} | {%} |
| **Overall** | **{total}** | **{covered}** | **{%}** |

---

## 11. Appendix

### Test Data Setup Scripts

{SQL scripts or API calls to prepare test data}

### Environment Configuration

{Any special configuration needed for testing}
