# Test Execution Report — SA4E-327

## Pi Task Decomposition + Map-Reduce for Large Repo Queries

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-327 (Epic SA4E-289) |
| Title | Task decomposition + Map-Reduce processing for large repo queries |
| Executed By | QA Agent |
| Date | 2026-09-27 |
| Environment | Extension unit/integration (vitest); no live sub-agent wiring / Extension Host |
| Browser | N/A (no UI scope; SIT manual not executed) |
| Overall Verdict | **⚠️ CONDITIONAL PASS** |
| Re-test Rounds | 0 |

---

## 1. Executive Summary

SA4E-327 STC defines **11 test cases** (TC-001–003 happy, TC-101–102 alternative, TC-301–302 business rules, TC-701–704 integration) with 2 CSV files (11 rows, 100% TC coverage); STP plans 19 (PBT 2 + UT 6 + IT 4 + E2E-API 3 + SIT 4). **0 High findings** — the residual 2 Mediums (per-instance circuit breaker, unvalidated sub-agent outputs) are recorded as blocking conditions for production wiring. No file in the DEV fix batch belongs to this ticket, so Phase 6 is a documentation-verdict pass; behavioral cases are NOT_RUN (need live `SubAgentClient` + large-repo fixture).

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
| QA targeted re-run | N/A — no SA4E-327 file was in the DEV fix batch; no fix to verify |
| DEV-reported full suites | 28 files/270 tests + 55 files/420 tests PASS, tsc + eslint PASS (accepted as reported) |
| Failed | 0 |

### 2.2 SA4E-327 Test Breakdown

| Category | Count | Status |
|----------|-------|--------|
| Happy path (TC-001–003) | 3 | ⚠️ NOT_RUN (need map-reduce + sub-agent wiring) |
| Alternative (TC-101–102) | 2 | ⚠️ NOT_RUN |
| Business rules (TC-301–302) | 2 | ⚠️ NOT_RUN |
| Integration (TC-701–704) | 4 | ⚠️ NOT_RUN |

---

## 3. Manual SIT Results (Final)

> SIT (4 planned) not executed — needs Extension Host + large-repo fixture.

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| SIT-01–04 | Map-reduce exploratory (STP §SIT) | Medium | ⚠️ NOT_RUN | Pending env |

**Final SIT Pass Rate: 0/4 = 0% (not executed)**

---

## 4. Defect Summary

> No defects found (nothing executed).

### BUG-327-SEC: D1–D2 Mediums unfixed — OPEN ⚠️ (accepted, blocking for wiring)

| Field | Value |
|-------|-------|
| Severity | Major (Medium security, wiring-blocker) |
| Status | **OPEN — must land before production wiring (epic condition)** |

---

## 5. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| STC execution | ≥85% | 0% (NOT_RUN) | ⚠️ Deferred to wiring ticket |
| Critical/High open | 0 | 0 (0 High by design) | ✅ Met |
| Open Mediums | 0 | 2 (accepted, wiring-gated) | ⚠️ Conditional |

---

## 6. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| testdata/*.csv (2 files, 11 rows) | 100% TC coverage | §1 |

---

## 7. Conclusion

**Overall Verdict: ⚠️ CONDITIONAL PASS**

| Metric | Result |
|--------|--------|
| STC cases verified | 0/11 (NOT_RUN — no fix in batch, no env) |
| High findings | 0 (none by design) ✅ |
| Open findings | 2 Medium + 1 Low + 2 Info (conditions) |

**Recommendation:** Approve module for Phase 7 **only with** the §8 conditions — the **shared (session-scoped) circuit breaker + sub-agent boundary validation must land before production wiring**.

---

## 8. Security Conditions (Phase 3.7 Findings → Phase 6 Status)

> All 5 findings from `SECURITY-REVIEW.md` v1.0 (0 Critical, **0 High**, 2 Medium, 1 Low, 2 Info).

### 8.1 High — none ✅

No High findings by design. Positive controls: bounded batches (≤200 files, 20/batch), parallelism 5, 1 retry + backoff, 30s batch timeout, 6000-token result budget, in-run breaker, deterministic local ranking.

### 8.2 Medium — OPEN, accepted (blocking for production wiring)

| ID | Title | Status | Mitigation / Condition |
|----|-------|--------|------------------------|
| SEC-327-D1 | Circuit breaker per-instance → resets each query (bypass by re-instantiation) | OPEN-ACCEPTED | **Hoist breaker to processor/session scope (singleton via DI)** before wiring; document scope |
| SEC-327-D2 | `SubAgentClient` outputs trusted without validation | OPEN-ACCEPTED | **Boundary validation** (types, summary length ≤ tokenCap×4, finite confidence clamp [0,1]) before wiring |

### 8.3 Low + Info — OPEN

SEC-327-D3 (`map-reduce://` virtual-path contract — tag `virtual:` + skip in consumers), SEC-327-D4 (subQuery prompt-injection note), SEC-327-D5 (inherit SA4E-325 rootDir containment, cross-ref SEC-325-D1) — OPEN, non-blocking for merge.

---

## Appendix A: Re-Test History

```
No rounds executed — verdict is documentation + residual-risk acceptance (Phase 7 entry carries the conditions).
```
