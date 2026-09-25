# Software Test Cases (STC)

## SA4E-251 — Jira MCP tool description layout broken on update

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-251 |
| Title | Jira MCP tool description layout broken on update |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-06 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-251.docx |
| Related FSD | FSD-v1.0-SA4E-251.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-06 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 8 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 7 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 4 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 3 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 4 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Update issue with H2 heading preserves rendering

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-02, Story 1 AC-1 |
| **Preconditions** | Test issue SA4E-TEST-001 exists, MCP server running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with issue_key SA4E-TEST-001 and fields.description "## Example" | API returns success |
| 2 | Open issue in Jira UI | Description renders as H2 |
| 3 | Compare with manual paste of same markdown | Rendering matches |

**Test Data:** description="## Example"
**Postconditions:** Issue description updated with H2 heading

---

### TC-002: Update issue with H1 heading preserves rendering

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-02, Story 1 AC-2 |
| **Preconditions** | Test issue SA4E-TEST-002 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with description "# Title" | API returns success |
| 2 | Verify rendering in Jira UI | Renders as H1 |

**Test Data:** description="# Title"
**Postconditions:** Issue description updated

---

### TC-003: Update issue with H3 heading preserves rendering

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-02 |
| **Preconditions** | Test issue SA4E-TEST-003 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with description "### Subsection" | Success |
| 2 | Verify in Jira UI | Renders as H3 |

**Test Data:** description="### Subsection"

---

### TC-004: Nested list 2 levels preserved

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-04, Story 2 AC-1 |
| **Preconditions** | Test issue SA4E-TEST-004 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with description "- Parent item\n  - Child item\n  - Child item with link to SA4E-123" | Success |
| 2 | Open issue in Jira UI | Nested indentation visible, 2 levels |

**Test Data:** description with nested list
**Postconditions:** Issue description updated

---

### TC-005: Nested list 3 levels preserved

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-04 |
| **Preconditions** | Test issue SA4E-TEST-005 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with 3-level nested list | Success |
| 2 | Verify indentation | 3 levels rendered correctly |

---

### TC-006: Smart link SA4E-250 converted

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-06, Story 3 AC-1 |
| **Preconditions** | Test issue SA4E-TEST-006 exists, SA4E-250 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with description "Reference issue SA4E-250" | Success |
| 2 | Open issue in Jira UI | SA4E-250 appears as clickable smart link |

**Test Data:** description="Reference issue SA4E-250"

---

### TC-007: Multiple smart links converted

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-06 |
| **Preconditions** | Test issues exist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with "See SA4E-250 and SA4E-123" | Success |
| 2 | Verify both links clickable | Both navigate correctly |

---

### TC-008: Combined headings, nested list, smart links

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, UC-02, UC-03 |
| **Preconditions** | Test issue SA4E-TEST-008 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with combined markdown | Success |
| 2 | Verify rendering matches manual paste | Headings, list, links all correct |

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Update description with additional fields present

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF |
| **Preconditions** | Test issue exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with fields containing description + summary | Description updated, summary unchanged if not provided |
| 2 | Verify description | Preserved |

**Test Data:** fields.description + fields.summary

---

### TC-102: Update with empty description

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF |
| **Preconditions** | Test issue exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with description "" | Success, description cleared |

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Invalid issue key format

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-01 EF, Validation Error |
| **Preconditions** | MCP server running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with issue_key "invalid_key" | Validation error returned, 400 |
| 2 | Verify error message | Issue key format invalid |

**Test Data:** issue_key="invalid_key"

---

### TC-202: Jira API returns 404 for non-existent issue

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD §9 |
| **Preconditions** | Test issue SA4E-99999 does not exist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with non-existent issue_key | Error propagated from Jira API |

---

### TC-203: Description payload not string

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | Validation |
| **Preconditions** | MCP server running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue with description as number | Validation error |

---

## 4. Business Rule Validation

### TC-301: BR-01 Heading hierarchy preserved

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01 |
| **Preconditions** | Test issue exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with "# H1\n## H2\n### H3" | Hierarchy rendered correctly |

---

### TC-302: BR-02 Heading mapping

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with "#", "##", "###" | Maps to H1, H2, H3 |

---

### TC-303: BR-03 Render matches manual paste

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-03 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update via MCP and manually paste same markdown | Visual rendering identical |

---

### TC-304: BR-04 Nested lists retain indentation

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-04 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with 2+ level nested list | Indentation retained |

---

### TC-305: BR-05 Lists not flattened

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-05 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with nested list | Not flattened to single level |

---

### TC-306: BR-06 SA4E-XXX converted to smart links

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-06 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with "SA4E-250" | Converted to smart link |

---

### TC-307: BR-07 Links navigate correctly

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-07 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click smart link in Jira UI | Navigates to referenced issue |

---

## 5. Boundary & Negative Testing

### TC-401: Empty description

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | Test issue exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with empty string | Accepted or cleared |

---

### TC-402: Very long description > 32KB

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | Jira limit |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with very long markdown | Success or Jira error handled |

---

### TC-403: Description with special characters

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | UTF-8 validation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with emojis, unicode | Preserved correctly |

---

### TC-404: Description with markdown code block

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | Markdown preservation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with ```code``` block | Renders as code block |

---

## 6. UI/UX Testing

### TC-501: Verify heading styles in Jira UI

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD UI Spec |
| **Preconditions** | Issue updated via MCP |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open issue in Jira UI | Headings displayed with correct font size |

---

### TC-502: Verify nested list indentation visual

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD UI Spec |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open issue | Nested list indented visually |

---

### TC-503: Verify smart link styling

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD UI Spec |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open issue | Smart link appears blue and underlined |

---

## 7. Non-Functional Testing

### TC-601: Update latency parity

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | MCP server running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure time for jira_update_issue call | Latency ≤ existing baseline |

---

### TC-602: Data integrity — no transformation

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | NFR Security |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send description with markdown | Payload sent unchanged to Jira API |

---

## 8. Integration Testing

### TC-701: E2E-API heading update flow

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 |
| **Preconditions** | MCP server + Jira test instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_update_issue via fetch | 200 success and description updated |

---

### TC-702: E2E-API nested list update flow

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with nested list | Success |

---

### TC-703: E2E-API smart link update flow

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with SA4E-XXX | Success |

---

### TC-704: Validation error propagated

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §9 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send invalid issue key | Validation error returned |

---

## 9. Regression Testing

### TC-801: Existing jira_update_issue still works for plain text

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update with plain text description | Works as before |

---

### TC-802: Update other fields not affected

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update summary field | Works correctly |

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-01 | FSD 3.1 | TC-001, TC-002, TC-003, TC-101, TC-201, TC-301, TC-302, TC-303 | Covered |
| UC-02 | FSD 3.2 | TC-004, TC-005, TC-304, TC-305 | Covered |
| UC-03 | FSD 3.3 | TC-006, TC-007, TC-306, TC-307 | Covered |
| BR-01 to BR-07 | FSD 3.1.3 | TC-301 to TC-307 | Covered |
| Story 1 AC-1 | BRD 2.3 | TC-001 | Covered |
| Story 1 AC-2 | BRD 2.3 | TC-002 | Covered |
| Story 2 AC-1 | BRD 2.3 | TC-004 | Covered |
| Story 3 AC-1 | BRD 2.3 | TC-006 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 7 | 7 | 100% |
| Acceptance Criteria | 4 | 4 | 100% |
| **Overall** | **14** | **14** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts

Test data prepared in `documents/SA4E-251/test-data/` CSV files.

### Environment Configuration

MCP server running at http://localhost:3000, Jira test project SA4E.
