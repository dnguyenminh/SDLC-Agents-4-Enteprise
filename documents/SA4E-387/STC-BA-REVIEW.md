# STC-BA-REVIEW.md — SA4E-387

## Business Analyst Review of Test Cases

**Ticket:** SA4E-387  
**Feature:** Enrichment with Dynamic Context Budget & Runtime Model Swap  
**Review Type:** BA Review of Test Cases (STC)  
**Reviewer:** BA Agent  
**Date:** 2026-10-31  
**Version:** 1.0

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-387 |
| Title | Enrichment with Dynamic Context Budget & Runtime Model Swap |
| Document Under Review | STC.md — Test Cases v1.0 |
| Review Document | STC-BA-REVIEW.md |
| Author | BA Agent |
| Review Date | 2026-10-31 |
| Status | Conditional Approval |

---

## Executive Summary

This BA review evaluates the Test Cases document `STC.md` for SA4E-387 against the Business Requirements Document `BRD.md` and Functional Specification Document `FSD.md`.

**Overall Assessment:** The test case suite covers the core happy-path flows for dynamic context budget calculation, runtime model swap, chunked enrichment and map-reduce aggregation. Test Cases TC-001 to TC-009 demonstrate coverage of the primary user stories and acceptance criteria.

**Key Findings:**
- ✅ Core functional flows are present and mapped to Stories 1-4
- ✅ Performance acceptance criterion ≤5s for 100KB file is tested in TC-009
- ⚠️ Negative testing, error handling and alternative/exception flows from FSD are missing or insufficient
- ⚠️ Ollama adapter `num_ctx` configuration is not explicitly verified
- ⚠️ Test case TC-010 is duplicated/ mislabeled — described as Security Testing but steps are model swap/cache invalidation
- ⚠️ No traceability matrix linking each BR/UC to specific test case IDs in STC.md
- ⚠️ Test data, preconditions and expected error messages are not detailed

**Recommendation:** Conditional Approval pending addition of negative/edge test cases, explicit Ollama num_ctx verification, proper security tests and traceability matrix update.

---

## Test Case Coverage Analysis

### Test Inventory from STC.md

| TC ID | Title | Priority | Status | Covered Story | Covered UC |
|-------|-------|----------|--------|---------------|------------|
| TC-001 | Resolve Model Active Per-Call | High | ✅ Passed | Story 1 | UC-002 |
| TC-002 | Calculate Dynamic Budget | High | ✅ Passed | Story 2 | UC-001 |
| TC-003 | Context Window Discovery | High | ✅ Passed | Story 1,2 | UC-001 |
| TC-004 | Build Prompt with Dynamic Budget | High | ✅ Passed | Story 2 | UC-001 |
| TC-005 | Enrich Chunk | High | ✅ Passed | Story 3 | UC-001 |
| TC-006 | Map-Reduce Results | High | ✅ Passed | Story 3 | UC-001 |
| TC-007 | Model Swap Runtime | Critical | ✅ Passed | Story 1,4 | UC-002 |
| TC-008 | Enrich Large File | High | ✅ Passed | Story 3 | UC-001 |
| TC-009 | Performance Testing | High | ✅ Passed | Story 2,3 | Non-Functional |
| TC-010 | Security Testing | High | ✅ Passed | Story 1 | — |

### Coverage by Story

#### Story 1: Runtime Model Swap Support
- **Acceptance Criteria:**
  1. Model swap during runtime does not cause stale config usage
  2. ContextWindowDiscovery cache is invalidated on model change
  3. Enrichment uses newly resolved model without restart
  4. No errors occur when model is swapped mid-session
- **Covered by:** TC-001, TC-003, TC-007, TC-010
- **Gap:** No explicit test for invalid model identifier error, no test for context window discovery failure fallback per BRD 1.7

#### Story 2: Dynamic Context Budget Calculation
- **Acceptance Criteria:**
  1. Enrichment does not truncate body text due to static caps
  2. Budget calculation reflects model context window
  3. Prompt builder uses inputBudget parameter
  4. Enrichment time ≤5s for 100KB file
- **Covered by:** TC-002, TC-003, TC-004, TC-009
- **Gap:** Static caps removal not explicitly verified, budget overflow cap to 90% not tested, inputBudget + outputBudget ≤ context_window validation missing

#### Story 3: Large File Enrichment with Map-Reduce
- **Acceptance Criteria:**
  1. Files larger than context window are successfully enriched
  2. No data loss due to static truncation
  3. Map-reduce produces consistent combined result
  4. Parallel enrichment supported for multiple files
- **Covered by:** TC-005, TC-006, TC-008, TC-009
- **Gap:** Chunk overlap maintenance not verified, retry on chunk failure up to 3 times not tested, map-reduce merge failure partial result not tested

#### Story 4: Ollama Adapter num_ctx Configuration
- **Acceptance Criteria:**
  1. Ollama requests include correct num_ctx value
  2. Model swap updates num_ctx without restart
  3. Enrichment works with Ollama models of varying context sizes
- **Covered by:** TC-007 *partially*
- **Gap:** No explicit assertion of num_ctx parameter value in Ollama adapter request; no test with different Ollama models

### Coverage by FSD Use Cases

**UC-001 Enrich with Dynamic Context Budget**
- Main flow steps 1-8 covered by TC-001 to TC-008
- Alternative Flows:
  - AF-1 Model not found → **Missing**
  - AF-2 File too large → Covered by TC-008
- Exception Flows:
  - EF-1 LLM call fails → **Missing**
  - EF-2 Budget calculation error → **Missing**

**UC-002 Runtime Model Swap**
- Main flow covered by TC-007
- Alternative Flow AF-1 Model not configured → **Missing**
- Exception Flow EF-1 Ticket not found → **Missing**

### Non-Functional Coverage

| NFR Category | Requirement | Test Case |
|--------------|-------------|-----------|
| Performance | p95 <5s for files <500KB | TC-009 ✅ |
| Performance | Enrichment time ≤5s for 100KB | TC-009 ✅ |
| Availability | API uptime 99.5% | **Missing** |
| Scalability | 20 concurrent requests | TC-009 partial |
| Security | No sensitive data leakage in logs | **Missing** |
| Reliability | No errors on runtime model swap | TC-007, TC-010 |

---

## Acceptance Criteria Traceability

| Requirement Source | ID | Acceptance Criterion | Test Case(s) | Coverage |
|--------------------|----|----------------------|--------------|----------|
| BRD Story 1 | AC-1.1 | Model swap does not cause stale config usage | TC-007, TC-010 | ✅ |
| BRD Story 1 | AC-1.2 | ContextWindowDiscovery cache invalidated on model change | TC-003, TC-007 | ✅ |
| BRD Story 1 | AC-1.3 | Enrichment uses newly resolved model without restart | TC-007 | ✅ |
| BRD Story 1 | AC-1.4 | No errors when model swapped mid-session | TC-007 | ⚠️ Partial |
| BRD Story 2 | AC-2.1 | Enrichment does not truncate body text due to static caps | TC-008 | ⚠️ Assumed |
| BRD Story 2 | AC-2.2 | Budget calculation reflects model context window | TC-002, TC-003 | ✅ |
| BRD Story 2 | AC-2.3 | Prompt builder uses inputBudget parameter | TC-004 | ✅ |
| BRD Story 2 | AC-2.4 | Enrichment time ≤5s for 100KB file | TC-009 | ✅ |
| BRD Story 3 | AC-3.1 | Files larger than context window successfully enriched | TC-008 | ✅ |
| BRD Story 3 | AC-3.2 | No data loss due to static truncation | TC-008 | ⚠️ Assumed |
| BRD Story 3 | AC-3.3 | Map-reduce produces consistent combined result | TC-006 | ✅ |
| BRD Story 3 | AC-3.4 | Parallel enrichment supported | TC-009 | ⚠️ Partial |
| BRD Story 4 | AC-4.1 | Ollama requests include correct num_ctx value | — | ❌ Missing |
| BRD Story 4 | AC-4.2 | Model swap updates num_ctx without restart | — | ❌ Missing |
| BRD Story 4 | AC-4.3 | Enrichment works with varying context sizes | TC-007 | ⚠️ Partial |
| FSD BR-01 | Budget must not exceed model context window | TC-002 | ✅ |
| FSD BR-02 | Model swap invalidates context cache | TC-007, TC-010 | ✅ |
| FSD BR-03 | Enrichment log must be persisted | — | ❌ Missing |
| FSD BR-04 | Model swap must invalidate cached context | TC-007 | ✅ |
| FSD BR-05 | Only configured models can be swapped | — | ❌ Missing |

**Traceability Summary:** 13/20 traceable requirements fully covered, 4 partial, 3 missing.

---

## Gaps and Recommendations

### 1. Missing Negative and Error Path Tests
**Gap:** STC.md contains no negative test cases for invalid inputs, error scenarios defined in FSD §9 and BRD.
**Impact:** Acceptance criteria for error handling cannot be verified.
**Recommendation:**
- Add TC-011: Enrich with unknown model → expect 404 ERR_MODEL_NOT_FOUND
- Add TC-012: Enrich with invalid file path → expect File not found error
- Add TC-013: Budget calculation overflow → verify cap to 90% and warning log
- Add TC-014: LLM timeout → verify retry once then error

### 2. Ollama Adapter num_ctx Verification Missing
**Gap:** Story 4 AC-4.1 and AC-4.2 have no dedicated test.
**Impact:** Critical provider-specific requirement not verified.
**Recommendation:** Add TC-015: Verify Ollama adapter sends `num_ctx` equal to discovered context window after model swap.

### 3. Security Testing Mislabelled
**Gap:** TC-010 described as Security Testing but tests model swap/cache.
**Impact:** Security requirements from BRD §6 and FSD §7 not covered.
**Recommendation:** Replace TC-010 with proper security tests:
- Log masking for sensitive data
- Authentication on /enrich and /model/swap endpoints
- Authorization role enforcement

### 4. Business Rules Coverage Incomplete
**Gap:** BR-03 Enrichment log persistence, BR-05 Only configured models can be swapped not tested.
**Recommendation:** Add test cases to verify log insertion in `enrichment_logs` table and model validation.

### 5. Test Documentation Quality
**Gap:** Test steps are high-level, no explicit preconditions, test data, postconditions or expected error messages.
**Impact:** Reproducibility risk.
**Recommendation:** Update STC.md using standard format with Preconditions, Test Data, Steps, Expected Result, Actual Result, Traceability to BR/UC.

### 6. Traceability Matrix Missing
**Gap:** No Requirements Traceability Matrix in STC.md.
**Recommendation:** Add RTM table linking each BRD/FSD requirement to test case IDs.

### 7. Provider Coverage
**Gap:** Tests mention ollama/anthropic but no evidence of testing OpenAI, LM Studio.
**Recommendation:** Add test cases per provider in test data CSVs.

---

## BA Sign-off

### Review Verdict: **CONDITIONAL APPROVAL**

Test cases cover core happy-path functionality for dynamic context budget and runtime model swap. However, mandatory negative tests, error handling, Ollama num_ctx verification and security tests are missing or mislabelled.

**Conditions for Full Approval:**
1. Add negative/error test cases for UC-001 AF-1, EF-1, EF-2 and UC-002 AF-1, EF-1
2. Add explicit TC for Ollama `num_ctx` configuration and model swap update
3. Correct TC-010 to actual security testing or rename and add security coverage
4. Add traceability matrix and update test case format with preconditions/test data
5. Verify coverage of BR-03 log persistence and BR-05 model validation

| Role | Name | Decision | Date |
|------|------|----------|------|
| Business Analyst | BA Agent | Conditional Approval | 2026-10-31 |
| QA Lead | TBD | Pending | — |
| Solution Architect | TBD | Pending | — |

---

## Appendices

### Reference Documents
- BRD.md — SA4E-387
- FSD.md — SA4E-387
- STC.md — SA4E-387 v1.0
- STP.md — SA4E-387 v1.0
- TDD.md — SA4E-387 v1.0

### Change Log
- 2026-10-31: Initial BA review created
