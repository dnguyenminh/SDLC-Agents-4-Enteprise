# Test Execution Report — SA4E-329

## Pi Model Routing and Fallback (small → large)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-329 (Epic SA4E-289) |
| Title | Model routing with small-first strategy and fallback to large model |
| Executed By | QA Agent |
| Date | 2026-09-27 |
| Environment | Extension unit/integration (vitest); no live model invocation / Extension Host |
| Browser | N/A (no UI scope; SIT manual not executed) |
| Overall Verdict | **⚠️ CONDITIONAL PASS** |
| Re-test Rounds | 0 |

---

## 1. Executive Summary

SA4E-329 STC defines **11 test cases** (TC-001–003 happy, TC-101–102 alternative, TC-301–302 business rules, TC-701–704 integration) with 3 CSV files (11 rows, 100% TC coverage); STP plans 19 (PBT 2 + UT 6 + IT 4 + E2E-API 3 + SIT 4). **0 High findings** — the single Medium (confidence self-certification making the escalation gate near-inert) is the ticket's central control-effectiveness risk and is recorded as blocking for production wiring. No file in the DEV fix batch belongs to this ticket, so Phase 6 is a documentation-verdict pass; behavioral cases are NOT_RUN (need live models + routing wiring).

| Level (STP plan) | Total | Passed | Failed | NOT_RUN |
|------------------|-------|--------|--------|---------|
| PBT | 2 | 0 | 0 | 2 |
| UT | 6 | 0 | 0 | 6 |
| IT | 4 | 0 | 0 | 4 |
| E2E-API | 3 | 0 | 0 | 3 |
| SIT | 4 | 0 | 0 | 4 |
| **Total** | **19** | **0** | **0** | **19** |

STC-defined cases: 11 (all NOT_RUN behaviorally; 0 failures observed — nothing executed).

---

## 2. Automated Test Results

### 2.1 Execution

| Metric | Result |
|--------|--------|
| QA targeted re-run | N/A — no SA4E-329 file was in the DEV fix batch; no fix to verify |
| DEV-reported full suites | 28 files/270 tests + 55 files/420 tests PASS, tsc + eslint PASS (accepted as reported) |
| Failed | 0 |

### 2.2 SA4E-329 Test Breakdown

| Category | Count | Status |
|----------|-------|--------|
| Happy path (TC-001–003) | 3 | ⚠️ NOT_RUN (need router + model wiring) |
| Alternative (TC-101–102) | 2 | ⚠️ NOT_RUN |
| Business rules (TC-301–302) | 2 | ⚠️ NOT_RUN |
| Integration (TC-701–704) | 4 | ⚠️ NOT_RUN |

---

## 3. Manual SIT Results (Final)

> SIT (4 planned) not executed — needs Extension Host + live small/large models.

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| SIT-01–04 | Routing/fallback exploratory (STP §SIT) | Medium | ⚠️ NOT_RUN | Pending env |

**Final SIT Pass Rate: 0/4 = 0% (not executed)**

---

## 4. Defect Summary

> No defects found (nothing executed).

### BUG-329-SEC: D1 Medium unfixed — OPEN ⚠️ (accepted, blocking for wiring)

| Field | Value |
|-------|-------|
| Severity | Major (control-effectiveness — the gate this ticket exists to provide is near-inert) |
| Status | **OPEN — redesign confidence source before the gate is relied on in production** |

---

## 5. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| STC execution | ≥85% | 0% (NOT_RUN) | ⚠️ Deferred to wiring ticket |
| Critical/High open | 0 | 0 (0 High by design) | ✅ Met |
| Open Mediums | 0 | 1 (accepted, wiring-gated) | ⚠️ Conditional |

---

## 6. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| testdata/*.csv (3 files, 11 rows) | 100% TC coverage | §1 |

---

## 7. Conclusion

**Overall Verdict: ⚠️ CONDITIONAL PASS**

| Metric | Result |
|--------|--------|
| STC cases verified | 0/11 (NOT_RUN — no fix in batch, no env) |
| High findings | 0 (none by design) ✅ |
| Open findings | 1 Medium + 3 Low + 2 Info (conditions) |

**Recommendation:** Approve module for Phase 7 **only with** the §8 conditions — **redesign the confidence source** (or raise threshold above the 0.8 default heuristic) before the routing gate is relied on; otherwise remove the gate rather than ship false assurance.

---

## 8. Security Conditions (Phase 3.7 Findings → Phase 6 Status)

> All 6 findings from `SECURITY-REVIEW.md` v1.0 (0 Critical, **0 High**, 1 Medium, 3 Low, 2 Info).

### 8.1 High — none ✅

No High findings by design. Positive controls: escalation budget (max 1/session), +30% cost ceiling concept, diagnostics trail, `query.length`-only logging, bounded retries (maxRetries 1).

### 8.2 Medium — OPEN, accepted (blocking for production wiring)

| ID | Title | Status | Mitigation / Condition |
|----|-------|--------|------------------------|
| SEC-329-D1 | Confidence self-certification + lenient default (0.8 > 0.75) → escalation gate never triggers | OPEN-ACCEPTED | Decouple signal from graded artifact (structured metadata side-channel or SA4E-328 faithfulness score); short-term: threshold > default heuristic (e.g. 0.85 > 0.8) |

### 8.3 Low + Info — OPEN

SEC-329-D2 (model-id sanitization in logs), SEC-329-D3 (fail-closed cost ceiling for unregistered from-models), SEC-329-D4 (classifyTier default docs), SEC-329-D5 (wire or remove `routingTimeoutMs`) — OPEN, non-blocking for merge.

---

## Appendix A: Re-Test History

```
No rounds executed — verdict is documentation + residual-risk acceptance (Phase 7 entry carries the conditions).
```
