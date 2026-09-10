# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-244: Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-244 |
| Title | Admin Project Scope dropdown shows IDs instead of workspace/project names |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-244.docx |
| Related FSD | FSD-v1.0-SA4E-244.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 5 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 2 | High |
| Business Rule Validation | TC-300 to TC-399 | 6 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 2 | Medium |
| Non-Functional | TC-600 to TC-699 | 1 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Dropdown displays display_name when present

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-1, BRD Story 1 AC-1 |
| **Preconditions** | Admin logged in, project_registry contains row with project_id='3e268111b055', display_name='Pega Workspace Alpha', workspace_path='/workspaces/pega-alpha' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open http://localhost:48721/admin | Admin page loads |
| 2 | Wait for Project Scope dropdown to populate | Dropdown shows options |
| 3 | Locate option with value '3e268111b055' | Option label text is 'Pega Workspace Alpha' |

**Test Data:** pre-seeded-projects.csv row TC-001
**Postconditions:** Dropdown shows human-readable name

---

### TC-002: Tooltip shows project_id and workspace_path

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-5 |
| **Preconditions** | Same as TC-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover over dropdown option with value '3e268111b055' | Browser tooltip appears |
| 2 | Read tooltip content | Tooltip contains '3e268111b055' and '/workspaces/pega-alpha' |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** Identifier visible for verification

---

### TC-003: 'All (Shared)' option unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-4 |
| **Preconditions** | Admin logged in |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open admin page | Dropdown loads |
| 2 | Check first option | Option value='' and label='All (Shared)' |

**Test Data:** N/A
**Postconditions:** Static option preserved

---

### TC-004: Selection behavior unchanged - value is project_id

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-3 |
| **Preconditions** | Dropdown populated with names |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select option labeled 'Pega Workspace Alpha' | Dropdown value changes |
| 2 | Inspect selected value via UI state / network | Value submitted is '3e268111b055' |
| 3 | Verify admin views filter | Views update according to project_id |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** Filtering works as before

---

### TC-005: Dropdown loads within performance target

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | FSD 8.1 Performance |
| **Preconditions** | Admin logged in, project_registry has 50 rows |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open admin page and measure time from page load to dropdown render | Time ≤ 200ms p95 |

**Test Data:** performance seed
**Postconditions:** Performance target met

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Fallback to workspace_path basename when display_name empty

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional - Alternative Flow |
| **Requirement** | UC-1 AF-1, BR-2 |
| **Preconditions** | project_registry row with project_id='a68914cd9c49', display_name='', workspace_path='/workspaces/team-b' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open admin page | Dropdown loads |
| 2 | Locate option value 'a68914cd9c49' | Label is 'team-b' (basename of workspace_path) |

**Test Data:** pre-seeded-projects.csv row TC-100
**Postconditions:** Fallback used

---

### TC-101: Fallback to project_id slice when both empty

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional - Alternative Flow |
| **Requirement** | UC-1 AF-1, BR-2 |
| **Preconditions** | project_registry row with project_id='22b039993db3', display_name='', workspace_path='' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open admin page | Dropdown loads |
| 2 | Locate option value '22b039993db3' | Label is '22b039993db' (first 10 chars) |

**Test Data:** pre-seeded-projects.csv row TC-101
**Postconditions:** No blank option

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: API fetch fails - error handled gracefully

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Requirement** | UC-1 EF-1 |
| **Preconditions** | Backend API returns __error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate API failure for GET /api/admin/projects | UI shows toast "Unable to load project scopes" |
| 2 | Verify previous selection retained | Selection unchanged |

**Test Data:** N/A
**Postconditions:** UI stable

---

### TC-201: Empty name string treated as missing

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | display_name='  ' whitespace only |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load dropdown | Label falls back to workspace basename or ID |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** No blank label

---

## 4. Business Rule Validation

### TC-300: BR-1 Project Scope dropdown must display project_scope_name as primary label

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | display_name present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render dropdown | Primary text is display_name, not ID |

**Test Data:** TC-001
**Postconditions:** Rule satisfied

---

### TC-301: BR-2 Fallback to project_scope_id when name missing

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | display_name empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render option | Label uses workspace basename then ID slice |

**Test Data:** TC-100, TC-101
**Postconditions:** No empty option

---

### TC-302: BR-3 Selection behavior unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | Dropdown populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select by label | Value submitted remains project_id |

**Test Data:** TC-004
**Postconditions:** Filtering correct

---

### TC-303: BR-4 'All (Shared)' option remains unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | Admin page loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check first option | Label exactly 'All (Shared)' |

**Test Data:** TC-003
**Postconditions:** Unchanged

---

### TC-304: BR-5 Identifier visible via tooltip

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | Option rendered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover | Tooltip shows project_id and workspace_path |

**Test Data:** TC-002
**Postconditions:** Verification possible

---

### TC-305: BR-6 Identifier display does not hinder readability

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-6 |
| **Preconditions** | Dropdown rendered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View dropdown | Name readable, ID only in tooltip |

**Test Data:** N/A
**Postconditions:** Usability maintained

---

## 5. Boundary & Negative Testing

### TC-400: display_name whitespace only

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | display_name='   ' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load dropdown | Fallback used, no blank label |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** Stable

---

### TC-401: display_name very long >200 chars

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | UI rendering |
| **Preconditions** | display_name length 250 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render dropdown | Text truncates gracefully, no overflow break |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** UI intact

---

### TC-402: project_id empty

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | Data integrity |
| **Preconditions** | Invalid row |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load dropdown | Invalid row skipped or shows fallback |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** No crash

---

## 6. UI/UX Testing

### TC-500: Option label format correct

| Field | Value |
|-------|-------|
| **ID** | TC-500 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec |
| **Preconditions** | Dropdown visible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect option element | Label text matches display_name or fallback |
| 2 | Check title attribute | Contains project_id and workspace_path |

**Test Data:** TC-001
**Postconditions:** UI spec met

---

### TC-501: Dropdown renders on page load

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Admin page |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open admin page | Dropdown visible within 1s |

**Test Data:** N/A
**Postconditions:** Ready for use

---

## 7. Non-Functional Testing

### TC-600: Performance dropdown load <200ms

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional - Performance |
| **Requirement** | FSD 8.1 |
| **Preconditions** | 100 projects in registry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure time from API request start to render complete | p95 <200ms |

**Acceptance Criteria:** p95 <200ms
**Test Data:** performance seed
**Postconditions:** NFR met

---

## 8. Integration Testing

### TC-700: GET /api/admin/projects returns correct schema

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 3.2 |
| **Preconditions** | Admin token valid |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/admin/projects with Authorization header | 200 OK |
| 2 | Validate JSON body | Contains projects array with project_id, display_name, workspace_path, last_seen |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** API contract met

---

### TC-701: RBAC filter for non-admin users

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 7.2 |
| **Preconditions** | Non-admin user token |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/admin/projects as non-admin | Returns only rows where created_by matches user |

**Test Data:** pre-seeded-projects.csv
**Postconditions:** Authorization enforced

---

## 9. Regression Testing

### TC-800: Existing admin filtering still works after name change

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-3 |
| **Preconditions** | Admin page with existing functionality |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select project by name label | Views filter correctly as before |
| 2 | Change project | URL param projectId updates, localStorage persists |

**Test Data:** TC-004
**Postconditions:** No regression

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-1 | FSD 3.1 | TC-001, TC-100, TC-101, TC-200, TC-201 | Covered |
| UC-2 | FSD 3.2 | TC-002, TC-304 | Covered |
| BR-1 | FSD 3.1.3 | TC-300, TC-001 | Covered |
| BR-2 | FSD 3.1.3 | TC-301, TC-100, TC-101 | Covered |
| BR-3 | FSD 3.1.3 | TC-302, TC-004, TC-800 | Covered |
| BR-4 | FSD 3.1.3 | TC-303, TC-003 | Covered |
| BR-5 | FSD 3.2.3 | TC-304, TC-002 | Covered |
| BR-6 | FSD 3.2.3 | TC-305 | Covered |
| Performance <200ms | FSD 8.1 | TC-600, TC-005 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 6 | 6 | 100% |
| Acceptance Criteria | 4 | 4 | 100% |
| **Overall** | **12** | **12** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts

Pre-seeded projects CSV location: documents/SA4E-244/testdata/pre-seeded-projects.csv

Sample rows:
- project_id=3e268111b055, display_name='Pega Workspace Alpha', workspace_path='/workspaces/pega-alpha'
- project_id=a68914cd9c49, display_name='', workspace_path='/workspaces/team-b'
- project_id=22b039993db3, display_name='', workspace_path=''

### Environment Configuration

Admin URL: http://localhost:48721/admin
API base: /api/admin
Auth required: JWT Bearer token
