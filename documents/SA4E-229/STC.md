# Software Test Cases (STC)

## JiraAssist Extension — SA4E-229: Implement jira_download_attachment tool to fix 403 error when fetching attachments

---
## Document Information
| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-229 |
| Title | Implement jira_download_attachment tool to fix 403 error when fetching attachments |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-08-28 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-229 |
| Related FSD | N/A |

## Test Case Summary
| Category | ID Range | Count |
|----------|----------|-------|
| Functional Happy Path | TC-001 to TC-099 | 3 |
| Alternative Flows | TC-100 to TC-199 | 2 |
| Exception/Error Flows | TC-200 to TC-299 | 4 |
| Business Rule Validation | TC-300 to TC-399 | 3 |
| Boundary & Negative | TC-400 to TC-499 | 3 |
| Non-Functional | TC-600 to TC-699 | 2 |
| Integration | TC-700 to TC-799 | 1 |
| Regression | TC-800 to TC-899 | 1 |

## 1. Functional Test Cases — Happy Path

### TC-001: Download attachment by valid ID
| Field | Value |
|-------|-------|
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | Story 2, BRD AC 1 |
| Preconditions | Authenticated session active, attachment_id exists |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_download_attachment with attachment_id=VALID_ID | Returns content with HTTP 200 |
| 2 | Verify response | No 403 error, mime_type present, filename present |

**Test Data:** attachment_id=ATT-001 from pre-seeded-users.csv
**Postconditions:** Content returned

### TC-002: Download attachment by valid URL
| Field | Value |
|-------|-------|
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | Story 3 |
| Preconditions | Authenticated session active |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call jira_download_attachment with attachment_url=VALID_URL | Returns content with HTTP 200 |
| 2 | Verify content | Content matches attachment |

**Test Data:** attachment_url=https://jira.example.com/secure/attachment/123/file.pdf

### TC-003: Verify metadata returned
| Field | Value |
|-------|-------|
| ID | TC-003 |
| Priority | Medium |
| Type | Functional |
| Requirement | TDD API Design |
| Preconditions | Valid download |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Download attachment | Returns content_base64, mime_type, size_bytes, filename |

## 2. Alternative Flows

### TC-100: ID resolves to URL internally
| Field | Value |
|-------|-------|
| ID | TC-100 |
| Priority | High |
| Type | Alternative Flow |
| Requirement | Story 2 |
...
## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Invalid attachment ID
| Field | Value |
|-------|-------|
| ID | TC-200 |
| Priority | High |
| Type | Exception |
| Requirement | Story 2 AC 2 |
| Preconditions | Auth active |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with attachment_id=INVALID | Returns clear error message, not 403 |

### TC-201: Attachment not found 404
| Field | Value |
|-------|-------|
| ID | TC-201 |
| Priority | High |
| Type | Exception |
| Requirement | Error handling |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with non-existent ID | Returns 404 error |

### TC-202: 403 fix verification
| Field | Value |
|-------|-------|
| ID | TC-202 |
| Priority | High |
| Type | Functional |
| Requirement | Story 1 AC 2 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Download using tool | No 403 Forbidden, uses auth headers |

### TC-203: Invalid URL format
| Field | Value |
|-------|-------|
| ID | TC-203 |
| Priority | Medium |
| Type | Exception |
...
## 4. Business Rule Validation

### TC-300: Authenticated session used
| Field | Value |
|-------|-------|
| ID | TC-300 |
| Priority | High |
| Type | Business Rule |
| Requirement | BRD 1.1 |
...
## 5. Boundary & Negative
### TC-400: Empty ID
...
## 6. Non-Functional
### TC-600: Performance <5s for <10MB
...
### TC-601: Large file handling
...
## 7. Integration
### TC-700: Integration with jira_get_attachments
...
## 8. Regression
### TC-800: Existing jira_get_attachments still works
...

## 10. Requirements Traceability Matrix
| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| Story 1 | BRD 2.3 | TC-001, TC-202 | Covered |
| Story 2 | BRD 2.3 | TC-001, TC-100, TC-200 | Covered |
| Story 3 | BRD 2.3 | TC-002 | Covered |
