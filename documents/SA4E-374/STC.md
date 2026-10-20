# Software Test Cases (STC)

## Code-Intel / SA4E-374: Single Responsibility Violation Pega workspace indexing

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-374 |
| Title | Single Responsibility Violation Pega workspace indexing |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-20 |
| Status | Final |
| Related STP | STP-v1.0-SA4E-374.md |

---

## Test Case Summary

| Level | Prefix | Count |
|-------|--------|-------|
| PBT | PBT-XX | 3 |
| UT | UT-XX | 8 |
| IT | IT-XX | 6 |
| E2E-API | E2E-API-XX | 7 |
| E2E-UI | E2E-UI-XX | 3 |
| SIT | SIT-XX | 4 |

---

## 1. Property Based Tests

### PBT-01: shouldExclude never allows .pega extension
| ID | PBT-01 |
| Priority | High |
| Type | Property-Based |
| Requirement | BR-007, UC-002 |
| Preconditions | Random file paths |
**Steps:** Generate random paths ending .pega → shouldExclude true

### PBT-02: Exclude patterns cover sub-paths
| ID | PBT-02 |
| Requirement | BR-002, BR-005 |
**Steps:** Random paths under rules/** or .pega-cache/** → excluded

### PBT-03: Manifest validation rejects SRP violating paths
| ID | PBT-03 |
| Requirement | BR-008 |
**Steps:** Random manifests with violating paths → rejected

---

## 2. Unit Tests

### UT-01: file-scanner shouldExclude .pega
| ID | UT-01 |
| Requirement | BR-007 |
**Steps:** shouldExclude('file.pega') → true; shouldExclude('file.ts') → false

### UT-02: file-scanner shouldExclude rules/
| ID | UT-02 |
| Requirement | BR-005 |
**Steps:** shouldExclude('rules/Rule-1') → true

### UT-03: file-scanner shouldExclude .pega-cache
| ID | UT-03 |
| Requirement | BR-005 |
**Steps:** shouldExclude('.pega-cache/data.json') → true

### UT-04: detectLanguage returns null for .pega
| ID | UT-04 |
| Requirement | BR-006 |
**Steps:** detectLanguage('a.pega') → null

### UT-05: Config validation rejects .pega whitelist
| ID | UT-05 |
| Requirement | BR-006 |
**Steps:** Load config with .pega in UNIFIED_EXTENSIONS_WITH_DOT → throws

### UT-06: SRP guard rejects manifest with violating path
| ID | UT-06 |
| Requirement | BR-008 |
**Steps:** Validate manifest containing rules/ path → PEGA-005

### UT-07: Extension SRP_EXCLUDES applied
| ID | UT-07 |
| Requirement | BR-002 |
**Steps:** Extension filter removes .pega, rules/, .pega-cache

### UT-08: Manifest builder limits to 10k rules
| ID | UT-08 |
| Requirement | FSD 3.1.4 |
**Steps:** Build manifest with 10k+ rules → truncated / error

---

## 3. Integration Tests

### IT-01: Backend rejects manifest with .pega path
| ID | IT-01 |
| Requirement | BR-003 |
**Steps:** POST manifest with path *.pega → 400 PEGA-005

### IT-02: Backend accepts clean manifest
| ID | IT-02 |
| Requirement | UC-001 |
**Steps:** POST valid manifest → 202 Accepted, manifestId returned

### IT-03: File scanner skips rules/
| ID | IT-03 |
| Requirement | UC-002 |
**Steps:** Index workspace containing rules/ → no files indexed

### IT-04: File scanner skips .pega-cache
| ID | IT-04 |
| Requirement | UC-002 |
**Steps:** Index workspace containing .pega-cache → no files indexed

### IT-05: GET index-status returns job status
| ID | IT-05 |
| Requirement | TDD 3 |
**Steps:** GET /api/v1/pega/index-status/{jobId} → status

### IT-06: Config DEFAULT_EXCLUDE includes .pega
| ID | IT-06 |
| Requirement | BR-005 |
**Steps:** Load config → DEFAULT_EXCLUDE contains .pega, rules, .pega-cache

---

## 4. E2E-API Tests

### E2E-API-01: Full manifest flow happy path
| ID | E2E-API-01 |
| Priority | High |
| Type | Automated vitest + fetch |
| File | tests/e2e/pega-manifest.e2e.test.ts |
| Traces To | UC-001, BR-001 |
**Steps:** POST /api/v1/pega/index-manifest with valid data → 202, manifestId, jobId; GET status → completed

### E2E-API-02: Reject PEGA-001 invalid schema
| ID | E2E-API-02 |
**Steps:** POST manifest missing projectId → 400 PEGA-001

### E2E-API-03: Reject PEGA-002 unauthorized
| ID | E2E-API-03 |
**Steps:** POST with invalid JWT → 401 PEGA-002

### E2E-API-04: Reject PEGA-003 too large
| ID | E2E-API-04 |
**Steps:** POST >10MB → 413 PEGA-003

### E2E-API-05: Reject PEGA-005 SRP violation
| ID | E2E-API-05 |
**Steps:** POST manifest with rules/ path → 400 PEGA-005

### E2E-API-06: Backend never indexes .pega via direct scan
| ID | E2E-API-06 |
**Steps:** Trigger generic index → response excludes .pega files

### E2E-API-07: Indexing via extension flow
| ID | E2E-API-07 |
**Steps:** Simulate extension flow → backend receives pre-filtered manifest only

---

## 5. E2E-UI Tests

### E2E-UI-01: Extension UI shows indexing progress
| ID | E2E-UI-01 |
| Type | Playwright |
**Steps:** Open extension UI → trigger index → progress shown

### E2E-UI-02: Extension filters Pega files before send
| ID | E2E-UI-02 |
**Steps:** Workspace with .pega → extension logs filtered count

### E2E-UI-03: Error toast on manifest rejection
| ID | E2E-UI-03 |
**Steps:** Force PEGA-005 → error toast displayed

---

## 6. SIT Tests

### SIT-01: Manual verify backend excludes .pega
| ID | SIT-01 |
| Type | Manual |
**Steps:** Review index output → no .pega files

### SIT-02: Manual verify rules/ excluded
| ID | SIT-02 |
**Steps:** Review logs → rules/ not scanned

### SIT-03: Manual verify extension flow
| ID | SIT-03 |
**Steps:** Check extension logs → manifest POSTed, no direct backend scan

### SIT-04: Visual verification of exclusion patterns
| ID | SIT-04 |
**Steps:** Inspect config → DEFAULT_EXCLUDE contains patterns

---

## 7. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Backend excludes .pega | BRD Story2 AC1 | UT-01, UT-04, IT-03, E2E-API-06, SIT-01 | ✅ |
| Backend excludes rules/ | BRD Story2 AC2 | UT-02, IT-03, E2E-API-06, SIT-02 | ✅ |
| Backend excludes .pega-cache | BRD Story2 AC3 | UT-03, IT-04, SIT-01 | ✅ |
| Indexing via extension | BRD Story1 AC1-4 | E2E-API-01, E2E-API-07, E2E-UI-01/02, SIT-03 | ✅ |
| API POST manifest | FSD 3.1.5 | E2E-API-01, IT-02 | ✅ |
| API GET status | TDD 3 | IT-05, E2E-API-01 | ✅ |
| Error PEGA-001 | FSD 9 | E2E-API-02 | ✅ |
| Error PEGA-002 | FSD 9 | E2E-API-03 | ✅ |
| Error PEGA-003 | FSD 9 | E2E-API-04 | ✅ |
| Error PEGA-005 | FSD 9 | UT-06, IT-01, E2E-API-05 | ✅ |
| BR-001..BR-008 | FSD 3.1.3/3.2.3 | UT-05..UT-07, IT-06 | ✅ |

**Coverage Summary:** 100% BRD/FSD requirements covered.

---

## Appendix: Test Data

CSV files in documents/SA4E-374/testdata/
- pre-seeded-workspace.csv
- create-index-testdata.csv
- auth-testdata.csv
