# Software Test Cases (STC)

## Code Intelligence Indexer — SA4E-261: Indexer skips non-Java source files (JSP/XML/SQL/config) - index all supported source artifacts

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-261 |
| Title | Indexer skips non-Java source files |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-11 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 4 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 4 | High |
| Business Rule Validation | TC-300 to TC-399 | 4 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| Non-Functional | TC-600 to TC-699 | 3 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Index JSP file via API and verify Tier B storage

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-01, BR-02, BRD AC 1 |
| **Preconditions** | Backend running, JWT valid, projectId 97c72f0c2366 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/source with file_path WEB-INF/views/adminHome.jsp, file_extension jsp, content "<html>...</html>" | 200 OK |
| 2 | Check response written count =1, rejected empty | File accepted |
| 3 | Query KB for node with path WEB-INF/views/adminHome.jsp | Node exists with tier=B |

**Test Data:** testdata/jsp-sample.csv
**Postconditions:** KB contains Tier B node for JSP

---

### TC-002: Index XML file via API and verify Tier B storage

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-01 |
| **Preconditions** | Same as TC-001 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/index/source with pom.xml content | 200 OK |
| 2 | Verify written=1 | |
| 3 | Search KB for "spring-boot-starter" | Result includes pom.xml with snippet |

**Test Data:** testdata/xml-sample.csv
**Postconditions:** Full-text searchable

---

### TC-003: Index SQL file via API and verify Tier B storage

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01 |
| **Preconditions** | Backend running |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST file schema.sql | 200 OK |
| 2 | Verify tier=B | |
**Test Data:** testdata/sql-sample.csv

---

### TC-004: Index properties and yml files

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01 |
**Test Steps:** Upload application.properties and application.yml, verify Tier B
**Test Data:** testdata/config-sample.csv

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Index grammar-backed file → Tier A

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional Alternative |
| **Requirement** | UC-01 AF not applicable, Tier A path |
**Test Steps:** POST Java file, verify tier=A and symbols created

### TC-101: Parse error fallback to Tier B

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional Alternative |
| **Requirement** | UC-01 EF-1 |
**Test Steps:** POST corrupted java file causing tree-sitter parse error, verify stored as Tier B full-text

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Unsupported extension rejected

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Exception |
| **Requirement** | BR-03, UC-01 AF-1 |
**Test Steps:** POST file with extension .exe, expect rejected array contains path, log entry created

### TC-201: Path traversal rejected

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Security |
| **Requirement** | TDD §12 path safety |
**Test Steps:** POST file_path ../etc/passwd, expect rejected

### TC-202: Missing JWT → 401

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Security |
**Test Steps:** POST without Authorization header, expect 401

### TC-203: Missing X-Project-Id → 400

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Exception |
**Test Steps:** POST with JWT but no X-Project-Id, expect 400

---

## 4. Business Rule Validation

### TC-300: BR-01 Extension glob includes required extensions

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01 |
**Test Steps:** Read extension/src/services/IndexerHttpClient.ts glob pattern, assert contains jsp,xml,sql,properties,yml,html,css,js

### TC-301: BR-02 Extension list identical between extension and backend

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02 |
**Test Steps:** Run contract test, verify no divergence, test fails if lists differ

### TC-302: BR-03 Unsupported extension rejected with log

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
**Test Steps:** Upload .bin, verify not silently dropped, log contains rejection

### TC-303: BR-04 Non-grammar files full-text searchable

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-04 |
**Test Steps:** Search KB for unique string from pom.xml, verify result returned with path and snippet

---

## 5. Boundary & Negative Testing

### TC-400: Empty content

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
**Test Steps:** POST file with empty content, expect accepted but stored empty

### TC-401: Large file >5MB

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
**Test Steps:** Upload 6MB xml, verify either rejected by config or accepted but with warning

### TC-402: Duplicate file upload

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
**Test Steps:** Upload same path twice, verify overwrite or versioned

---

## 6. Non-Functional Testing

### TC-600: Indexing time increase <20%

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Performance |
| **Requirement** | NFR Performance |
**Test Steps:** Measure indexing time for projectId 97c72f0c2366 before and after, assert increase <20%

### TC-601: API response p95 <500ms

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
**Test Steps:** Load test POST /api/index/source with 50 requests, measure p95

### TC-602: Search snippet present

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
**Test Steps:** Search for term in Tier B file, verify snippet returned

---

## 7. Integration Testing

### TC-700: Extension ↔ Backend unified list contract test

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
**Test Steps:** Run contract test suite, assert extension glob regex extraction equals FALLBACK_EXTENSIONS

### TC-701: Tier B mem_ingest integration

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
**Test Steps:** Upload .css, verify mem_ingest called with tags code,source,css

---

## 8. Regression Testing

### TC-800: Java file still Tier A

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
**Test Steps:** Index Java file, verify tier A symbols

### TC-801: Existing search still works

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
**Test Steps:** Search existing Java symbol, verify result

---

## 9. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 | FSD 3.1 | TC-001, TC-002, TC-003, TC-004, TC-100, TC-101, TC-200, TC-201 | ✅ |
| UC-02 | FSD 3.2 | TC-002, TC-303, TC-602 | ✅ |
| BR-01 | FSD 3.1.3 | TC-300 | ✅ |
| BR-02 | FSD 3.1.3 | TC-301, TC-700 | ✅ |
| BR-03 | FSD 3.1.3 | TC-200, TC-302 | ✅ |
| BR-04 | FSD 3.2.3 | TC-303 | ✅ |
| NFR Performance | FSD 8 | TC-600, TC-601 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 4 | 4 | 100% |
| Acceptance Criteria | 3 | 3 | 100% |
| **Overall** | **9** | **9** | **100%** |

---

## Appendix

### Test Data Setup

CSV files in `testdata/`:
- pre-seeded-users.csv
- create-file-testdata.csv

Example test data CSV:
test_case_id,file_path,file_extension,content,expected_tier,expected_http_code
TC-001,WEB-INF/views/adminHome.jsp,jsp,<html>...</html>,B,200
TC-002,pom.xml,xml,<project>...</project>,B,200
