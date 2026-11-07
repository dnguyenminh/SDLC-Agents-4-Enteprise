# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-393: Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-393 |
| Title | Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-31 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-393.docx |
| Related FSD | FSD-v1.0-SA4E-393.docx |

---

## Test Case Summary

| Level | Count |
|-------|-------|
| PBT | 4 |
| UT | 12 |
| IT | 8 |
| E2E-API | 8 |
| E2E-UI | 4 |
| SIT | 12 |
| **Total** | **48** |

---

## 1. Property-Based Tests

### PBT-01: Load detector accepts valid detectionMode values

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | UC-001, BR-01 |
| **Preconditions** | Node runtime available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random detectionMode from enum {static,rendered,both} | Acceptable values pass validation |
| 2 | Call load API with generated mode | loadStatus success for all valid enums |

**Test Data:** detectionMode ∈ {static,rendered,both}
**Automation:** fast-check

### PBT-02: Static detection fileCount monotonic with source size

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | UC-002, BR-04 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random file lists size A,B where A<B | fileCount A ≤ fileCount B |

**Test Data:** Random file paths
**Automation:** fast-check

### PBT-03: Rendered fetch never throws for invalid URL format

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-03 |
| **Priority** | Medium |
| **Type** | Property-Based |
| **Requirement** | UC-003, BR-07 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random localhostUrl strings | Invalid format returns fetchStatus failed, no crash |

### PBT-04: Score threshold decision is monotonic

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | UC-004, BR-11 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random score ∈ [0,1], threshold ∈ [0,1] | pass=true iff score ≥ threshold |

---

## 2. Unit Tests

### UT-01: ImpeccableSkillLoader loads skill successfully

| Attribute | Value |
|-----------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-001, BR-01 |
| **Preconditions** | Skill package present |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call loadSkill() | Returns SkillAPI, isLoaded true |

**Test Data:** N/A
**Automation:** vitest

### UT-02: ImpeccableSkillLoader reports package not found

| Attribute | Value |
|-----------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-001 EF-2 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call loadSkill with missing package | Throws error, message "package not found" |

### UT-03: WasmDetectorRuntime loads WASM binary

| Attribute | Value |
|-----------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-001 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | loadWasm(buffer) | Returns Detector instance |

### UT-04: WasmDetectorRuntime analyze static returns findings with severity

| Attribute | Value |
|-----------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-002, BR-05 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | analyze(content, mode='static') | findings array with file, severity, message |

### UT-05: FileSystemAdapter respects maxFiles limit

| Attribute | Value |
|-----------|-------|
| **ID** | UT-05 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | UC-002 AF-1 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | List files with maxFiles=100 | Returns ≤100 files |

### UT-06: LocalhostFetcher retries once on failure

| Attribute | Value |
|-----------|-------|
| **ID** | UT-06 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | UC-003 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fetch unreachable URL | Retries once, then returns error |

### UT-07: ReportGenerator calculates pass/fail correctly

| Attribute | Value |
|-----------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-004, BR-11 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate report with score 0.85 threshold 0.8 | pass=true |
| 2 | Generate report with score 0.75 threshold 0.8 | pass=false |

### UT-08: ReportGenerator handles score calculation failure

| Attribute | Value |
|-----------|-------|
| **ID** | UT-08 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | UC-004 EF-1 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide NaN score | Report inconclusive, fail-open if configured |

### UT-09: DetectionCache returns cached result within TTL

| Attribute | Value |
|-----------|-------|
| **ID** | UT-09 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | UC-002 AF-2 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run static detection twice within 5 min | Second run cacheHit=true |

### UT-10: Static detection timeout returns partial findings

| Attribute | Value |
|-----------|-------|
| **ID** | UT-10 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-002 EF-2 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Detector exceeds 30s | Returns partial findings with warning |

### UT-11: detectionMode validation rejects invalid enum

| Attribute | Value |
|-----------|-------|
| **ID** | UT-11 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | BR-01 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call load with mode='invalid' | Returns error 400 |

### UT-12: threshold validation clamps 0-1

| Attribute | Value |
|-----------|-------|
| **ID** | UT-12 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | BR-01 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide threshold 1.5 | Rejected or clamped to 1 |

---

## 3. Integration Tests

### IT-01: Load detector integration success

| Attribute | Value |
|-----------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-001 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /pipeline/design-gate/load with valid payload | 200 loadStatus success |

### IT-02: Load detector integration WASM incompatible

| Attribute | Value |
|-----------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-001 EF-1 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load with incompatible WASM | 500 error message |

### IT-03: Static detect integration with valid source

| Attribute | Value |
|-----------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-002 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /pipeline/design-gate/static-detect with sourcePath | 200 findings returned |

### IT-04: Static detect integration invalid path

| Attribute | Value |
|-----------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-002 EF-1 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST with non-existent sourcePath | 400 Invalid Path |

### IT-05: Rendered detect integration server up

| Attribute | Value |
|-----------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-003 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /pipeline/design-gate/rendered-detect with localhostUrl up | 200 fetchStatus success |

### IT-06: Rendered detect integration server down

| Attribute | Value |
|-----------|-------|
| **ID** | IT-06 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | UC-003 AF-1 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST with unreachable localhost | 503 Dev server unreachable, static only |

### IT-07: Report retrieval integration

| Attribute | Value |
|-----------|-------|
| **ID** | IT-07 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-004 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /pipeline/design-gate/report/{runId} | 200 report with totalIssues, score, pass |

### IT-08: Full flow load→static→report

| Attribute | Value |
|-----------|-------|
| **ID** | IT-08 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-001,UC-002,UC-004 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load detector | success |
| 2 | Static detect | findings returned |
| 3 | Get report | pass/fail matches threshold |

---

## 4. E2E-API Tests

### E2E-API-01: End-to-end load detector via real server

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated |
| **File** | tests/e2e/design-gate-load.e2e.test.ts |
| **Traces To** | BRD Req 1 AC1-3 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start extension host | Running |
| 2 | POST load | loadStatus success |

### E2E-API-02: Static detection E2E with fixture

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated |
| **File** | tests/e2e/static-detect.e2e.test.ts |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST static-detect with testdata/source-fixture | findings returned within 30s |

### E2E-API-03: Rendered detection E2E with mock server

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | Medium |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start mock localhost server | Up |
| 2 | POST rendered-detect | fetchStatus success, renderedFindings present |

### E2E-API-04: Quality gate pass scenario

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run detection with threshold 0.5 | pass=true when score ≥threshold |

### E2E-API-05: Quality gate fail scenario

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run detection with threshold 0.9 | pass=false when score <threshold |

### E2E-API-06: Cache reuse

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | Medium |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Second static detect within 5 min | cacheHit=true |

### E2E-API-07: Report persistence

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Complete detection run | JSON file created at /.code-intel/design-gate/{runId}.json |

### E2E-API-08: Error handling package not found

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-08 |
| **Priority** | High |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Remove skill package, call load | 404 PACKAGE_NOT_FOUND |

---

## 5. E2E-UI Tests

### E2E-UI-01: Command palette triggers design gate

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | Medium |
| **Type** | Automated |
| **Feature File** | tests/e2e/design-gate.ui.e2e.test.ts |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open VS Code command palette | Palette visible |
| 2 | Run sdctl design-gate run | Command executes, output shows load success |

### E2E-UI-02: Output channel shows findings

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-02 |
| **Priority** | Medium |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute design gate | Output channel displays findings count and score |

### E2E-UI-03: Report file link opens

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-03 |
| **Priority** | Low |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click report link in output | File opens in editor |

### E2E-UI-04: Error notification on WASM failure

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-04 |
| **Priority** | Medium |
| **Type** | Automated |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger load with bad WASM | Notification shows error message |

---

## 6. SIT Manual Tests

### SIT-01: Manual load detector verification

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual |
| **Requirement** | UC-001 |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start extension, run command | Skill loads without error in logs |
| 2 | Check output | No external dependencies required |

### SIT-02: Static detection on real project

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select source folder with known issues | Findings listed with file location and severity |

### SIT-03: Rendered detection with dev server down

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-03 |
| **Priority** | Medium |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Disable localhost server, run rendered mode | Warning logged, static detection continues |

### SIT-04: Quality gate report audit

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-04 |
| **Priority** | High |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run detection, open report JSON | Contains totalIssues, severityBreakdown, score, pass, timestamp |

### SIT-05: Performance check static <30s

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-05 |
| **Priority** | Medium |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run static on 100 files | Duration <30s |

### SIT-06: Fail-open mode behavior

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-06 |
| **Priority** | Medium |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enable fail-open, cause detection error | Pipeline continues with warning |

### SIT-07: Multiple projects isolation

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-07 |
| **Priority** | Low |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run detection on two projects concurrently | Instances isolated, no cross-contamination |

### SIT-08: Cache hit verification

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-08 |
| **Priority** | Medium |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run static twice within 5 min | Second run faster, cache hit indicated |

### SIT-09: Threshold boundary 0.8

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-09 |
| **Priority** | High |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set threshold 0.8, score 0.800 | pass=true |

### SIT-10: Error message clarity

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-10 |
| **Priority** | Medium |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger WASM incompatible error | User message clear and actionable |

### SIT-11: Report persistence after restart

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-11 |
| **Priority** | Low |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Restart VS Code, open previous report | Report file still accessible |

### SIT-12: Visual output readability

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-12 |
| **Priority** | Low |
| **Type** | Manual |
**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View output channel | Findings formatted clearly |

---

## 7. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 | FSD 3.1 | PBT-01, UT-01, UT-02, UT-03, IT-01, IT-02, E2E-API-01, E2E-API-08, SIT-01 | ✅ |
| UC-002 | FSD 3.2 | PBT-02, UT-04, UT-05, UT-09, UT-10, IT-03, IT-04, IT-08, E2E-API-02, E2E-API-06, SIT-02, SIT-08 | ✅ |
| UC-003 | FSD 3.3 | PBT-03, UT-06, IT-05, IT-06, E2E-API-03, SIT-03 | ✅ |
| UC-004 | FSD 3.4 | PBT-04, UT-07, UT-08, IT-07, IT-08, E2E-API-04, E2E-API-05, E2E-API-07, SIT-04 | ✅ |
| BR-01 | FSD 3.1.3 | UT-01, UT-11, IT-01 | ✅ |
| BR-02 | FSD 3.1.3 | SIT-01 | ✅ |
| BR-03 | FSD 3.1.3 | E2E-API-01 | ✅ |
| BR-04 | FSD 3.2.3 | UT-04, IT-03 | ✅ |
| BR-05 | FSD 3.2.3 | UT-04 | ✅ |
| BR-06 | FSD 3.2.3 | SIT-05 | ✅ |
| BR-07 | FSD 3.3.3 | IT-05 | ✅ |
| BR-08 | FSD 3.3.3 | E2E-API-03 | ✅ |
| BR-09 | FSD 3.3.3 | IT-06 | ✅ |
| BR-10 | FSD 3.4.3 | IT-07 | ✅ |
| BR-11 | FSD 3.4.3 | PBT-04, UT-07 | ✅ |
| BR-12 | FSD 3.4.3 | E2E-API-07 | ✅ |
| Story1 AC1 | BRD 2.3 | UT-01 | ✅ |
| Story1 AC2 | BRD 2.3 | UT-03 | ✅ |
| Story1 AC3 | BRD 2.3 | E2E-API-01 | ✅ |
| Story1 AC4 | BRD 2.3 | SIT-01 | ✅ |
| Story2 AC1 | BRD 2.3 | IT-03 | ✅ |
| Story2 AC2 | BRD 2.3 | UT-04 | ✅ |
| Story2 AC3 | BRD 2.3 | SIT-05 | ✅ |
| Story3 AC1 | BRD 2.3 | IT-05 | ✅ |
| Story3 AC2 | BRD 2.3 | E2E-API-03 | ✅ |
| Story3 AC3 | BRD 2.3 | IT-06 | ✅ |
| Story4 AC1 | BRD 2.3 | IT-07 | ✅ |
| Story4 AC2 | BRD 2.3 | UT-07 | ✅ |
| Story4 AC3 | BRD 2.3 | E2E-API-07 | ✅ |

**Coverage Summary:** 100% of Use Cases, Business Rules, and Acceptance Criteria covered.

---

## 8. Appendix

Test data CSV files located at `documents/SA4E-393/testdata/`.

