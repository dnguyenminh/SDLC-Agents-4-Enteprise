# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-350: Pega CodeIntelligence @baseclass appliesTo stripped → 0 results; short insKey 404

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-350 |
| Title | Pega CodeIntelligence: rules/query strips '@baseclass' appliesTo → 0 results; short insKey 404 on custom service |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-11 |
| Status | Draft |
| Related STP | STP-v1-SA4E-350.docx |
| Related TEST-REPORT | TEST-REPORT-v1-SA4E-350.docx |
| Fix Commit | 96cc3b3 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-11 | QA Agent | Initiate STC for bugfix SA4E-350 — 15 test cases across 6 levels, RTM trace to root cause probes |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Probe A1/A2 — appliesTo behavior | TC-001 to TC-004 | 4 | P1 (Critical) |
| Probe B1/B2 — insKey behavior | TC-005 to TC-008 | 4 | P1 (Critical) |
| Handle-row follow-up | TC-009 to TC-011 | 3 | P1 (Critical) |
| Edge cases & regression | TC-012 to TC-015 | 4 | P2 (High) |

---

## Test Level Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| UT | 6 | 6 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 4 | 4 | 0 |
| Regression | 1 | 1 | 0 |
| Smoke | 1 | 1 | 0 |
| SIT | 3 | 0 | 3 |
| **Total** | **19** | **16 (84%)** | **3 (16%)** |

---

## 1. Probe A1/A2 — appliesTo Behavior

### TC-001: Probe A1 — appliesTo=empty returns 0 results

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | Critical (P1) |
| **Type** | Functional — Exception Flow |
| **Requirement** | Root Cause Probe A1 |
| **Preconditions** | PegaRuleReadClient instantiated; mock HTTP returns 200 with empty results for appliesTo=empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `client.getObject({ pyClassName: 'pzBulkActions', appliesTo: '' })` | Query sent to `/api/CodeIntelligence/v1/rules/query` with `appliesTo=""` |
| 2 | Verify HTTP request body | `appliesTo` field is empty string in request |
| 3 | Verify response | Returns empty results array (0 results) |
| 4 | Verify no compat retry triggered | `queryByTripleWithCompatRetry` NOT called with empty appliesTo (original was not @baseclass) |

**Test Data:** `testdata/probe-a1.csv` (appliesTo=empty, expectedResults=0)
**Postconditions:** Client returns empty result, no error thrown

---

### TC-002: Probe A2 — appliesTo=@baseclass returns 1 result (rule found)

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | Critical (P1) |
| **Type** | Functional — Happy Path |
| **Requirement** | Root Cause Probe A2 |
| **Preconditions** | PegaRuleReadClient instantiated; mock HTTP returns 200 with 1 handle-only row for appliesTo=@baseclass |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `client.getObject({ pyClassName: 'pzBulkActions', appliesTo: '@baseclass' })` | Query sent with `appliesTo="@baseclass"` verbatim |
| 2 | Verify HTTP request body | `appliesTo` field equals `"@baseclass"` exactly |
| 3 | Verify response | Returns 1 handle-only row with pzInsKey |
| 4 | Verify handle-row follow-up triggered | `fetchFullRuleIfHandleRow` called with the row's pzInsKey |

**Test Data:** `testdata/probe-a2.csv` (appliesTo=@baseclass, expectedResults=1, pzInsKey=RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT)
**Postconditions:** Full rule JSON returned after instance follow-up

---

### TC-003: Verbatim @baseclass passthrough in getObject()

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | Critical (P1) |
| **Type** | Business Rule Validation |
| **Requirement** | Fix: getObject() keeps @baseclass verbatim in triple query |
| **Preconditions** | PegaRuleReadClient instantiated; spy on internal query method |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `client.getObject({ pyClassName: 'pzModalButtonsConfiguration', appliesTo: '@baseclass' })` | Internal triple query receives `appliesTo: "@baseclass"` |
| 2 | Verify no pre-stripping | `appliesTo` is NOT transformed to empty string before query |
| 3 | Verify exact match attempted first | First query uses `@baseclass`, NOT empty |

**Test Data:** `testdata/probe-a2.csv` (appliesTo=@baseclass)
**Postconditions:** Query executed with verbatim @baseclass

---

### TC-004: Compat retry with empty appliesTo ONLY on exact miss + original @baseclass

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | Critical (P1) |
| **Type** | Business Rule Validation |
| **Requirement** | Fix: queryByTripleWithCompatRetry retries with empty appliesTo ONLY when exact query misses AND original was @baseclass |
| **Preconditions** | PegaRuleReadClient instantiated; mock first query returns 0 results for @baseclass, second query (empty) returns 1 result |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `client.getObject({ pyClassName: 'TestRule', appliesTo: '@baseclass' })` with mock: first call 0 results, second call 1 result | First query: appliesTo="@baseclass" → 0 results |
| 2 | Verify compat retry triggered | Second query: appliesTo="" (empty) → 1 result |
| 3 | Verify final result returned | Returns the result from retry (empty appliesTo) |
| 4 | Verify NO retry when original NOT @baseclass | Call with appliesTo="Work-" → 0 results → NO retry with empty |

**Test Data:** `testdata/compat-retry.csv` (scenario: exact-miss-then-retry)
**Postconditions:** Retry logic works only for @baseclass origin

---

## 2. Probe B1/B2 — insKey Behavior

### TC-005: Probe B1 — /rules/instance with SHORT insKey (no #) returns 404

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | Critical (P1) |
| **Type** | Functional — Exception Flow |
| **Requirement** | Root Cause Probe B1 |
| **Preconditions** | Mock HTTP for `/rules/instance` returns 404 for short insKey |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call internal `fetchFullRuleIfHandleRow()` with handle row containing short pzInsKey (no #) | Follow-up to `/rules/instance` with short key |
| 2 | Verify HTTP request | URL contains short insKey (no #timestamp) |
| 3 | Verify response | HTTP 404 returned |
| 4 | Verify soft fallback | Method returns original handle row (no throw) |

**Test Data:** `testdata/probe-b1.csv` (shortInsKey=RULE-HTML-SECTION @BASECLASS PZBULKACTIONS, expectedHttpCode=404)
**Postconditions:** Handle row returned as fallback, no error propagated

---

### TC-006: Probe B2 — /rules/instance with FULL pzInsKey (with #) returns 200 + full rule JSON

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | Critical (P1) |
| **Type** | Functional — Happy Path |
| **Requirement** | Root Cause Probe B2 |
| **Preconditions** | Mock HTTP for `/rules/instance` returns 200 with full rule JSON (20KB) for full pzInsKey |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `fetchFullRuleIfHandleRow()` with handle row containing full pzInsKey (with #timestamp) | Follow-up to `/rules/instance` with full key |
| 2 | Verify HTTP request | URL contains full pzInsKey including `#20180713T134741.673 GMT` |
| 3 | Verify response | HTTP 200 + full rule JSON (contains content properties) |
| 4 | Verify full rule returned | Method returns full rule JSON, not handle row |

**Test Data:** `testdata/probe-b2.csv` (fullInsKey=RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT, expectedHttpCode=200, expectedSize=20451)
**Postconditions:** Full rule JSON with content returned for KB indexing

---

### TC-007: Short pzInsKey in handle row → fallback (not 404 error to caller)

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | Critical (P1) |
| **Type** | Boundary / Negative |
| **Requirement** | Fix: short insKey in handle row → soft fallback to handle row |
| **Preconditions** | Handle row with pzInsKey missing #timestamp; mock /rules/instance returns 404 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getObject()` for rule where query returns handle row with short pzInsKey | Query → handle row → instance follow-up with short key → 404 |
| 2 | Verify no error thrown to caller | `getObject()` returns handle row (fallback) |
| 3 | Verify fallback logged | Warning logged: "Instance fetch failed, falling back to handle row" |

**Test Data:** `testdata/short-inskey-fallback.csv`
**Postconditions:** Caller receives handle row, no exception

---

### TC-008: pzInsKey without # in handle row detected correctly

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High (P2) |
| **Type** | Boundary / Negative |
| **Requirement** | Fix: detect short insKey (no #) before instance call |
| **Preconditions** | Handle row with various pzInsKey formats |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test `isFullInsKey()` helper with `RULE-HTML-SECTION @BASECLASS PZBULKACTIONS` (no #) | Returns `false` |
| 2 | Test with `RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT` | Returns `true` |
| 3 | Test with empty string | Returns `false` |
| 4 | Test with malformed key (multiple #) | Returns `false` (only first # counts) |

**Test Data:** `testdata/inskey-format.csv`
**Postconditions:** Format detection works for all variants

---

## 3. Handle-Row Follow-Up

### TC-009: Handle-only row (all keys ⊆ HANDLE_FIELDS + has pzInsKey) triggers instance follow-up

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | Critical (P1) |
| **Type** | Functional — Happy Path |
| **Requirement** | Fix: fetchFullRuleIfHandleRow() — handle-only row → /rules/instance follow-up with full pzInsKey |
| **Preconditions** | Query returns row with exactly 10 HANDLE_FIELDS keys + pzInsKey with # |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getObject()` with mock query returning handle-only row | `fetchFullRuleIfHandleRow()` invoked |
| 2 | Verify detection | Row keys match HANDLE_FIELDS set exactly |
| 3 | Verify instance call | `/rules/instance` called with row's full pzInsKey |
| 4 | Verify full rule returned | Full rule JSON returned to caller |

**Test Data:** `testdata/handle-row.csv` (10 fields + full pzInsKey)
**Postconditions:** Full rule fetched and returned

---

### TC-010: /rules/instance failure → soft fallback to handle row

| Field | Value |
|-------|-------|
| **ID** | TC-010 |
| **Priority** | High (P2) |
| **Type** | Functional — Exception Flow |
| **Requirement** | Fix: instance follow-up fails → soft fallback to handle row |
| **Preconditions** | Handle row with full pzInsKey; mock `/rules/instance` returns 500 or network error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getObject()` with handle row; mock instance endpoint throws 500 | Instance follow-up attempted |
| 2 | Verify error caught | 500 caught internally, not thrown |
| 3 | Verify fallback | Original handle row returned to caller |
| 4 | Verify warning logged | "Instance fetch failed (500), falling back to handle row" |

**Test Data:** `testdata/instance-fail-fallback.csv` (instanceHttpCode=500)
**Postconditions:** Handle row returned, no exception to caller

---

### TC-011: Full rule body in query response → NO instance follow-up

| Field | Value |
|-------|-------|
| **ID** | TC-011 |
| **Priority** | High (P2) |
| **Type** | Business Rule Validation |
| **Requirement** | Fix: query returns full rule body → skip instance follow-up (optimization) |
| **Preconditions** | Mock query returns row with content fields (beyond HANDLE_FIELDS) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getObject()` with mock query returning row containing `pyRuleHTML` or other content field | `fetchFullRuleIfHandleRow()` NOT called |
| 2 | Verify no instance HTTP call | Zero calls to `/rules/instance` |
| 3 | Verify full rule returned directly | Query response returned as-is |

**Test Data:** `testdata/full-rule-query.csv` (row has content fields)
**Postconditions:** No extra HTTP call, full rule returned immediately

---

## 4. Edge Cases & Regression

### TC-012: Non-@baseclass appliesTo (Work-, Data-) → no compat retry

| Field | Value |
|-------|-------|
| **ID** | TC-012 |
| **Priority** | High (P2) |
| **Type** | Regression |
| **Requirement** | Fix: non-@baseclass appliesTo works without retry |
| **Preconditions** | Mock query returns 0 results for appliesTo="Work-" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `client.getObject({ pyClassName: 'MyRule', appliesTo: 'Work-' })` | Query sent with `appliesTo="Work-"` |
| 2 | Verify NO compat retry | Second query with empty appliesTo NOT made |
| 3 | Verify empty result returned | Returns 0 results (no fallback) |

**Test Data:** `testdata/non-baseclass.csv` (appliesTo=Work-, expectedResults=0)
**Postconditions:** No retry, normal behavior for non-@baseclass

---

### TC-013: 401 Unauthorized on query → fail-loud rethrow (no silent retry)

| Field | Value |
|-------|-------|
| **ID** | TC-013 |
| **Priority** | High (P2) |
| **Type** | Security / Error Handling |
| **Requirement** | Fix: auth/5xx rethrow fail-loud |
| **Preconditions** | Mock query returns 401 Unauthorized |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `client.getObject()` with mock returning 401 | HTTP 401 received |
| 2 | Verify immediate rethrow | Error thrown to caller immediately |
| 3 | Verify NO compat retry | Empty appliesTo retry NOT attempted |
| 4 | Verify error type | Throws `AuthenticationError` or similar |

**Test Data:** `testdata/auth-error.csv` (httpCode=401)
**Postconditions:** Error propagated, no silent retry

---

### TC-014: Regression — pxIsMobileDevice resolves (non-@baseclass rule)

| Field | Value |
|-------|-------|
| **ID** | TC-014 |
| **Priority** | Critical (P1) |
| **Type** | Regression |
| **Requirement** | Runtime verify: pxIsMobileDevice regression PASS |
| **Preconditions** | Real Pega Academy server reachable; rule pxIsMobileDevice exists (appliesTo != @baseclass) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call real `client.getObject({ pyClassName: 'pxIsMobileDevice' })` against academy server | Query sent with correct appliesTo (derived from rule) |
| 2 | Verify rule found | Returns rule (handle or full) |
| 3 | Verify no regression | Behavior unchanged from before fix |

**Test Data:** `testdata/runtime-pxIsMobileDevice.csv` (real server)
**Postconditions:** Non-@baseclass rule still resolves correctly

---

### TC-015: Runtime — pzBulkActions full rule resolved via @baseclass + instance follow-up

| Field | Value |
|-------|-------|
| **ID** | TC-015 |
| **Priority** | Critical (P1) |
| **Type** | E2E-API — Real Server |
| **Requirement** | Runtime verify: pzBulkActions @baseclass → full rule resolved |
| **Preconditions** | Real Pega Academy server; credentials in env; rule pzBulkActions @baseclass exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call real `client.getObject({ pyClassName: 'pzBulkActions' })` | Query sent with appliesTo="@baseclass" |
| 2 | Verify query returns handle row | 1 handle-only row with full pzInsKey |
| 3 | Verify instance follow-up | `/rules/instance` called with full pzInsKey |
| 4 | Verify full rule returned | Full rule JSON (20KB) with HTML content returned |

**Test Data:** `testdata/runtime-pzBulkActions.csv` (real server, full flow)
**Postconditions:** Full rule content available for KB indexing

---

### TC-016: Runtime — pzModalButtonsConfiguration full rule resolved (user-reported)

| Field | Value |
|-------|-------|
| **ID** | TC-016 |
| **Priority** | Critical (P1) |
| **Type** | E2E-API — Real Server |
| **Requirement** | Runtime verify: pzModalButtonsConfiguration @baseclass → full rule resolved |
| **Preconditions** | Real Pega Academy server; rule pzModalButtonsConfiguration @baseclass exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call real `client.getObject({ pyClassName: 'pzModalButtonsConfiguration' })` | Query sent with appliesTo="@baseclass" |
| 2 | Verify full rule returned | Full rule JSON with content returned |

**Test Data:** `testdata/runtime-pzModalButtonsConfiguration.csv` (real server)
**Postconditions:** User-reported rule now works

---

### TC-017: Empty pzInsKey in handle row → no instance follow-up

| Field | Value |
|-------|-------|
| **ID** | TC-017 |
| **Priority** | Medium (P3) |
| **Type** | Boundary / Negative |
| **Requirement** | Fix: handle row missing pzInsKey → no follow-up attempted |
| **Preconditions** | Handle row with empty/missing pzInsKey |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `fetchFullRuleIfHandleRow()` with handle row missing pzInsKey | Instance follow-up SKIPPED |
| 2 | Verify no HTTP call to /rules/instance | Zero instance calls |
| 3 | Verify handle row returned | Original row returned as-is |

**Test Data:** `testdata/empty-inskey.csv`
**Postconditions:** No instance call, handle row returned

---

### TC-018: Instance full rule includes extra fields not in handle row

| Field | Value |
|-------|-------|
| **ID** | TC-018 |
| **Priority** | Medium (P3) |
| **Type** | Functional — Happy Path |
| **Requirement** | Fix: full rule body includes properties not in handle row |
| **Preconditions** | Mock instance returns full rule with pyRuleHTML, pyRuleJSON, etc. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `fetchFullRuleIfHandleRow()` with handle row; mock instance returns full rule with content fields | Full rule returned |
| 2 | Verify content fields present | `pyRuleHTML`, `pyRuleJSON`, `pyJavaScript` etc. in response |
| 3 | Verify handle fields preserved | Original 10 handle fields still present in merged result |

**Test Data:** `testdata/full-rule-with-extras.csv`
**Postconditions:** Full rule with all content fields returned

---

### TC-019: SIT — UAT: Index Source Code finds @baseclass rules in Kiro

| Field | Value |
|-------|-------|
| **ID** | TC-019 |
| **Priority** | Critical (P1) |
| **Type** | SIT — Manual UAT |
| **Requirement** | TEST-REPORT §4 UAT Checklist #1 |
| **Preconditions** | Extension 1.48.0 installed in Kiro; user logged in; Pega connection configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Kiro, reload window (Ctrl+Shift+P → Reload Window) | Extension loaded |
| 2 | Run "Index Source Code" command | Indexing starts |
| 3 | Wait for completion | Indexing finishes without "❌ Not found" for @baseclass rules |
| 4 | Verify pzBulkActions indexed | Rule appears in KB with content |
| 5 | Verify pzModalButtonsConfiguration indexed | Rule appears in KB with content |

**Test Data:** Real Kiro + Extension + Pega Academy
**Postconditions:** @baseclass rules download successfully

---

### TC-020: SIT — UAT: KB entries have full rule content (not handle-only)

| Field | Value |
|-------|-------|
| **ID** | TC-020 |
| **Priority** | Critical (P1) |
| **Type** | SIT — Manual UAT |
| **Requirement** | TEST-REPORT §4 UAT Checklist #2 |
| **Preconditions** | TC-019 passed; KB populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open KB entry for pzBulkActions | Full rule content visible (HTML/JSON) |
| 2 | Verify not handle-only | Content fields present, not just 10 metadata fields |
| 3 | Verify pzModalButtonsConfiguration content | Full content available |

**Test Data:** Real Kiro KB
**Postconditions:** KB entries contain full rule bodies

---

### TC-021: SIT — UAT: Non-@baseclass rules still resolve (regression)

| Field | Value |
|-------|-------|
| **ID** | TC-021 |
| **Priority** | High (P2) |
| **Type** | SIT — Manual UAT |
| **Requirement** | TEST-REPORT §4 UAT Checklist #3 |
| **Preconditions** | Extension 1.48.0 installed; KB has non-@baseclass rules |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run "Index Source Code" | Indexing completes |
| 2 | Verify pxIsMobileDevice indexed | Rule found and content downloaded |
| 3 | Verify other Work- / Data- rules | Non-@baseclass rules still work |

**Test Data:** Real Kiro KB
**Postconditions:** No regression on non-@baseclass rules

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Probe A1: appliesTo=empty → 0 results | TEST-REPORT §1 | TC-001 | ✅ |
| Probe A2: appliesTo=@baseclass → 1 result | TEST-REPORT §1 | TC-002, TC-003 | ✅ |
| Probe B1: short insKey → 404 | TEST-REPORT §1 | TC-005, TC-007 | ✅ |
| Probe B2: full insKey → 200 full rule | TEST-REPORT §1 | TC-006 | ✅ |
| Fix: @baseclass verbatim passthrough | STATUS.json fixes.passthrough | TC-003 | ✅ |
| Fix: compat retry only on exact miss + @baseclass | STATUS.json fixes.passthrough | TC-004 | ✅ |
| Fix: handle-row → instance follow-up | STATUS.json fixes.fullContent | TC-009 | ✅ |
| Fix: instance fail → soft fallback | STATUS.json fixes.fullContent | TC-010 | ✅ |
| Fix: full body → no follow-up | STATUS.json fixes.fullContent | TC-011 | ✅ |
| Fix: short insKey fallback | STATUS.json fixes.fullContent | TC-007, TC-008 | ✅ |
| Fix: 401/5xx fail-loud | STATUS.json fixes.passthrough | TC-013 | ✅ |
| Regression: non-@baseclass no retry | STATUS.json runtimeVerify | TC-012 | ✅ |
| Runtime: pxIsMobileDevice | STATUS.json runtimeVerify | TC-014 | ✅ |
| Runtime: pzBulkActions | STATUS.json runtimeVerify | TC-015 | ✅ |
| Runtime: pzModalButtonsConfiguration | STATUS.json runtimeVerify | TC-016 | ✅ |
| UAT: Index finds @baseclass rules | TEST-REPORT §4 | TC-019 | ✅ |
| UAT: KB full content | TEST-REPORT §4 | TC-020 | ✅ |
| UAT: Non-@baseclass regression | TEST-REPORT §4 | TC-021 | ✅ |
| Edge: empty pzInsKey | Implied by fix | TC-017 | ✅ |
| Edge: full rule extra fields | Implied by fix | TC-018 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Root Cause Probes | 4 | 4 | 100% |
| Fix Requirements | 6 | 6 | 100% |
| Regression Scenarios | 3 | 3 | 100% |
| Runtime Verify | 3 | 3 | 100% |
| UAT Checklist | 3 | 3 | 100% |
| Edge Cases | 3 | 3 | 100% |
| **Overall** | **22** | **22** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts

```typescript
// Test data files in documents/SA4E-350/testdata/
// probe-a1.csv, probe-a2.csv, probe-b1.csv, probe-b2.csv
// compat-retry.csv, handle-row.csv, short-inskey-fallback.csv
// inskey-format.csv, instance-fail-fallback.csv, full-rule-query.csv
// non-baseclass.csv, auth-error.csv, runtime-*.csv
// empty-inskey.csv, full-rule-with-extras.csv
```

### Environment Configuration

```bash
# Required env vars for E2E-API / Smoke / Runtime tests
export PEGA_BASE_URL="https://8b99ujcj.pegaacademy.net/prweb"
export PEGA_OPERATOR="SSA@TGB"
export PEGA_PASSWORD="<from secret store>"
```

### Test Execution Commands

```bash
# Unit tests
npm test -- extension/src/__tests__/pega-rule-read-client.test.ts

# Integration tests
npm test -- extension/src/__tests__/pega-rule-read-client.integration.test.ts

# E2E-API (real server)
npm run test:e2e -- pega-rule-read-client.e2e.test.ts

# Full regression suite
npm test

# Smoke (temp suite, deleted after)
npx vitest run extension/src/__tests__/pega-runtime-verify.test.ts
```

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Matrix | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |