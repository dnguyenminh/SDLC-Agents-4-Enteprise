# Software Test Cases (STC)

## SA4E-242 — KB Scope Auto-Detection based on VCS presence and branch for Extension ingest

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-242 |
| Title | KB Scope Auto-Detection based on VCS presence and branch for Extension ingest |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md v1.1 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | QA Agent | Auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 4 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 4 | High |
| Business Rule Validation | TC-300 to TC-399 | 8 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 5 | Medium |
| Non-Functional | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 4 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: detectKbScope returns WORKSPACE when .git absent

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-1, US-1 AC1 |
| **Preconditions** | Workspace path exists without .git folder |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope('/tmp/no-git-ws') | Returns {scope: 'WORKSPACE', reason: 'no VCS', source: 'detected'} |
| 2 | Verify cache entry created | Cache hit on second call |

**Test Data:** workspacePath = /tmp/no-git-ws, no .git
**Postconditions:** Scope correctly assigned WORKSPACE

---

### TC-002: detectKbScope returns WORKSPACE on feature branch

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-2, US-1 AC2 |
| **Preconditions** | Git repo initialized, current branch = feature/login |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope('/tmp/git-feature') | Returns scope WORKSPACE |
| 2 | Verify reason contains 'branch=feature/login' | Reason correct |

**Test Data:** branch feature/login
**Postconditions:** KB entry would be stored WORKSPACE

---

### TC-003: detectKbScope returns PROJECT on main branch

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-4, US-2 AC1 |
| **Preconditions** | Git repo with branch main |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope('/tmp/git-main') | Returns scope PROJECT |
| 2 | Verify reason = 'branch=main' | Correct |

**Test Data:** branch main

---

### TC-004: detectKbScope returns PROJECT on master branch

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-5, US-2 AC2 |
| **Preconditions** | Git repo with branch master |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope('/tmp/git-master') | Returns scope PROJECT |
| 2 | Verify reason contains 'branch=master' | Correct |

**Test Data:** branch master

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Scope override option returns overridden scope

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | API 5.1 options.scopeOverride |
| **Preconditions** | Any workspace |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope(path, {scopeOverride:'PROJECT'}) | Returns scope PROJECT, reason 'override' |
| 2 | Verify source = 'detected' | Override bypasses cache detection |

**Test Data:** override PROJECT

---

### TC-101: Cache hit returns cached scope

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FSD 2.3 caching |
| **Preconditions** | detectKbScope called previously for path |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope same path again | source = 'cache', scope same as before |
| 2 | Measure latency | <5ms |

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Git command fails → fallback WORKSPACE

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1, Error SCOPE_DETECT_GIT_ERROR |
| **Preconditions** | .git present but git binary missing / permission denied |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope with mocked exec error | Returns scope WORKSPACE, reason 'git error' |
| 2 | Verify WARN log emitted | Log contains workspacePath and error |

---

### TC-201: Git timeout → fallback WORKSPACE

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 5.1 Error Handling timeout |
| **Preconditions** | Git command hangs |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope with exec timeout | Returns scope WORKSPACE, reason 'git timeout' |

---

### TC-202: Permission denied on .git access

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | Error SCOPE_DETECT_IO_ERROR |
| **Preconditions** | Workspace path inaccessible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope on inaccessible path | Returns scope WORKSPACE, reason 'access denied', ERROR log |

---

### TC-203: forceRefresh bypasses cache

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | API 5.1 options.forceRefresh |
| **Preconditions** | Cached entry exists |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detectKbScope with forceRefresh=true | source='detected' not 'cache' |

---

## 4. Business Rule Validation

### TC-300: BR-1 WORKSPACE when .git absent
| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
**Test Steps:** Call detectKbScope on no-git → scope WORKSPACE

### TC-301: BR-2 WORKSPACE when branch != main/master
| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
**Test Steps:** Branch develop → scope WORKSPACE

### TC-302: BR-4 PROJECT when branch main
| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |

### TC-303: BR-5 PROJECT when branch master
| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |

### TC-304: BR-3 Services use detected scope
| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
**Test Steps:** Trigger PegaSchemaIndexer ingest → payload.scope matches detector

### TC-305: BR-6 JiraProjectIndexer uses detected scope
| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-6 |

### TC-306: BR-9 Migration idempotent
| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-9 |
**Test Steps:** Run ingest twice → no duplicate KB entries

### TC-307: BR-10 Logging scope decision
| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-10 |
**Test Steps:** Verify log contains {ticket, detectedScope, reason}

---

## 5. Boundary & Negative Testing

### TC-400: Branch name empty string
| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | detectKbScope |
**Test Steps:** Mock git returns empty → fallback WORKSPACE

### TC-401: Branch name with leading/trailing spaces
| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
**Test Steps:** Branch ' main ' trimmed → still WORKSPACE? Expect WORKSPACE

### TC-402: Workspace path is root '/'
| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Low |
| **Type** | Boundary / Negative |
**Test Steps:** Call detectKbScope('/') → no crash, returns WORKSPACE

### TC-403: .git folder nested deep
| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
**Test Steps:** findUp finds .git two levels up → correct detection

### TC-404: Cache TTL expiry
| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
**Test Steps:** Wait >5min → cache miss, re-detect

---

## 6. Non-Functional Testing

### TC-600: Detector latency p95 <50ms
| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance |
**Test Steps:** Run 100 detections → measure p95 latency

### TC-601: Security — no credentials exposed
| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
**Test Steps:** Inspect logs/exec calls → no git credentials printed

---

## 7. Integration Testing

### TC-700: BaseNode.kbIngest defaults to detector
| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD 3.2 |
**Test Steps:** Call BaseNode.kbIngest without scope → payload.scope set by detector

### TC-701: indexer-http receives scope payload
| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
**Test Steps:** POST to /api/v1/kb/ingest with scope → response echoes scope

### TC-702: IsolationLayer receives correct scope
| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
**Test Steps:** Ingest on main → IsolationLayer stores under PROJECT

### TC-703: Services integration
| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
**Test Steps:** Trigger PegaSchemaIndexer, AttachmentFetcher, KbEntryBuilder → all use detected scope

---

## 8. Regression Testing

### TC-800: Existing PROJECT ingest on main unaffected
| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
**Test Steps:** Ingest on main before and after → same scope PROJECT, no duplicate

### TC-801: Existing WORKSPACE entries remain
| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
**Test Steps:** Verify pre-existing WORKSPACE entries not moved

---

## 9. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-1 | FSD 3.1 | TC-001, TC-002, TC-100, TC-200, TC-300, TC-301 | ✅ |
| UC-2 | FSD 3.2 | TC-003, TC-004, TC-302, TC-303 | ✅ |
| UC-3 | FSD 3.3 | TC-306, TC-307, TC-801 | ✅ |
| BR-1 | FSD 3.1.3 | TC-300 | ✅ |
| BR-2 | FSD 3.1.3 | TC-301 | ✅ |
| BR-3 | FSD 3.1.3 | TC-304 | ✅ |
| BR-4 | FSD 3.2.3 | TC-302 | ✅ |
| BR-5 | FSD 3.2.3 | TC-303 | ✅ |
| BR-6 | FSD 3.2.3 | TC-305 | ✅ |
| BR-7 | FSD 3.3.3 | TC-801 | ✅ |
| BR-8 | FSD 3.3.3 | TC-702 | ✅ |
| BR-9 | FSD 3.3.3 | TC-306 | ✅ |
| BR-10 | FSD 3.3.3 | TC-307 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 10 | 10 | 100% |
| Acceptance Criteria | 9 | 9 | 100% |
| **Overall** | **22** | **22** | **100%** |

---

## Appendix

### Test Data Setup
Test data located in documents/SA4E-242/testdata/
- pre-seeded-workspaces.csv
- detect-testdata.csv
