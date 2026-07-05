# Test Execution Report — {TICKET-KEY}

## {Feature Title}

<!--
╔══════════════════════════════════════════════════════════════════════╗
║  TEST EXECUTION REPORT TEMPLATE                                     ║
║                                                                      ║
║  STRUCTURE PRINCIPLES:                                               ║
║  1. Sections 1-7 show FINAL results only — no intermediate states    ║
║  2. Re-test history is in Appendix A (audit trail, not main content) ║
║  3. Defect section shows final status only (CLOSED/OPEN)             ║
║  4. No duplication between main sections and appendix                ║
║  5. A reader of Sections 1-7 gets the complete, current picture      ║
║                                                                      ║
║  HOW TO USE:                                                         ║
║  - Replace all {PLACEHOLDERS} with actual values                     ║
║  - Delete sections marked [CONDITIONAL] if not applicable            ║
║  - Delete <!--comments--> before finalizing                          ║
║  - Keep Appendix A even if no re-tests (note "No re-tests needed")  ║
╚══════════════════════════════════════════════════════════════════════╝
-->

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET-KEY} |
| Title | {Feature Title} |
| Executed By | {Name / QA Agent} |
| Date | {YYYY-MM-DD} |
| Environment | {e.g., localhost:3000 (Vite) → localhost:8080 (Ktor backend)} |
| Browser | {e.g., Playwright Chromium / Chrome 120 / Firefox 121} |
| Overall Verdict | **{✅ PASS — Ready for Release / ❌ FAIL — Blocked / ⚠️ CONDITIONAL PASS}** |
| Re-test Rounds | {N} ({summary, e.g., "all bugs resolved" or "1 open bug remaining"}) |

<!-- VERDICT GUIDE:
  ✅ PASS — Ready for Release    : All tests pass, no open defects
  ⚠️ CONDITIONAL PASS            : All tests pass, but with known limitations/workarounds
  ❌ FAIL — Blocked              : Open Critical/Major defects remain
-->

---

## 1. Executive Summary

<!-- 2-3 sentences: what was tested, key findings, final outcome. -->

{Brief summary of test execution scope, key findings, and final verdict.}

| Level | Total | Passed | Failed | Pass Rate |
|-------|-------|--------|--------|-----------|
| Automated (PBT + UT + IT) | {N} | {N} | {N} | {N}% |
| Manual SIT | {N} | {N} | {N} | {N}% |
| **Total** | **{N}** | **{N}** | **{N}** | **{N}%** |

<!-- [OPTIONAL] Add notes about excluded/out-of-scope test failures -->

---

## 2. Automated Test Results

### 2.1 Execution

```
{command used to run tests, e.g., ./gradlew :shared:jvmTest :server:jvmTest}
```

| Metric | Result |
|--------|--------|
| Total tests | {N} |
| Passed | {N} |
| Failed | {N} |
| Duration | {time} |

### 2.2 {TICKET-KEY} Test Breakdown

| Category | Count | Status |
|----------|-------|--------|
| Property-Based Tests (PBT-01 to PBT-{NN}) | {N} properties × {N}+ iterations | {✅ All pass / ❌ N failures} |
| Unit Tests (UT-01 to UT-{NN}) | {N} | {✅ All pass / ❌ N failures} |
| Integration Tests (IT-01 to IT-{NN}) | {N} | {✅ All pass / ❌ N failures} |

<!-- [CONDITIONAL] Include this section only if there are test failures outside ticket scope -->
### 2.3 Non-{TICKET-KEY} Failures (Excluded)

| Test | File | Reason |
|------|------|--------|
| {test name} | {file} | {why this is not a {TICKET-KEY} defect} |

---

## 3. Manual SIT Results (Final)

> **These are the FINAL results after all re-test rounds are complete.** For re-test history, see [Appendix A](#appendix-a-re-test-history).

### 3.1 Environment

| Component | URL | Status |
|-----------|-----|--------|
| Backend | {URL} | {✅ Healthy / ❌ Down} |
| Frontend | {URL} | {✅ Running / ❌ Down} |
| Login | {credentials hint} | {✅ Authenticated} |

### 3.2 Results Summary

<!--
RULES:
- This table shows FINAL status only (after all re-test rounds)
- If a bug was found and fixed, show ✅ PASS with a note linking to the bug
- NEVER show intermediate FAIL results here — those belong in Appendix A
-->

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| SIT-01 | {title} | {High/Medium/Low} | {✅ PASS / ❌ FAIL / ⚠️ BLOCKED} | {blank or "Bug found → fixed → verified ([BUG-NNN](#bug-nnn))"} |
| SIT-02 | {title} | {priority} | {result} | {notes} |
<!-- Add rows for each SIT test case -->

**Final SIT Pass Rate: {N}/{N} = {N}%**

### 3.3 Detailed Test Execution

<!--
RULES:
- Write the FINAL observed behavior (post-fix if a bug was found and fixed)
- Each SIT case gets a subsection with bullet points describing steps and observations
- Keep it factual: what you did, what happened, pass/fail
-->

#### SIT-01: {Title} {✅ PASS / ❌ FAIL}
- {Step 1 — action taken and result observed}
- {Step 2 — action taken and result observed}
- {Final observation confirming pass/fail}

#### SIT-02: {Title} {✅ PASS / ❌ FAIL}
- {Step 1}
- {Step 2}

<!-- Repeat for each SIT test case -->

---

## 4. Defect Summary

<!--
RULES:
- Show FINAL status of each defect (CLOSED or OPEN)
- Include: severity, priority, test case, component, found/verified rounds
- Root cause and fix description should be concise (3-5 lines max)
- Link to Appendix A for detailed re-test steps
- If no defects found, replace this section with:
  "No defects found during test execution."
-->

> {All defects are **CLOSED**. No open issues remain. / N open defects remain — see details below.}

<!-- [CONDITIONAL] Remove if no defects found -->

<a id="bug-001"></a>
### BUG-001: {Bug Title} — {CLOSED ✅ / OPEN ❌}

| Field | Value |
|-------|-------|
| Severity | {Critical / Major / Minor / Trivial} |
| Priority | {P1 / P2 / P3 / P4} |
| Test Case | {SIT-NN} |
| Component | {file or module} |
| Status | **{CLOSED — FIXED / OPEN}** |
| Found | {Round N (date)} |
| Verified | {Round N (date) / Not yet verified} |

**Description:** {What was wrong — 1-2 sentences}

**Root Cause:** {Why it happened — 1 sentence}

**Fix:** {What was changed — 1-2 sentences with file names}

---

<!-- Repeat BUG-NNN block for each defect -->

## 5. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| PBT Coverage | {N}/{N} properties | {N}/{N} | {✅ Met / ❌ Not met} |
| PBT Iterations | ≥{N} per property | {N}+ | {✅ Met / ❌ Not met} |
| UT Pass Rate | ≥{N}% | {N}% ({N}/{N}) | {✅ Met / ❌ Not met} |
| IT Pass Rate | {N}% | {N}% ({N}/{N}) | {✅ Met / ❌ Not met} |
| SIT Pass Rate | ≥{N}% | {N}% ({N}/{N}) | {✅ Met / ❌ Not met} |
| Critical Defects | 0 | {N} | {✅ Met / ❌ Not met} |
| Major Defects | 0 | {N} | {✅ Met / ❌ Not met} |
| Open Defects | 0 | {N} | {✅ Met / ❌ Not met} |

---

## 6. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| evidence/{filename}.png | {description} | {SIT-NN / BUG-NNN} |
<!-- Add rows for each evidence file -->

---

## 7. Conclusion

**Overall Verdict: {✅ PASS — Ready for Release / ❌ FAIL — Not Ready / ⚠️ CONDITIONAL PASS}**

{1-2 sentences summarizing what works and what was verified.}

| Metric | Result |
|--------|--------|
| Automated tests (PBT + UT + IT) | {N}/{N} PASS ({N}%) |
| Manual SIT tests | {N}/{N} PASS ({N}%) |
| Bugs found | {N} {severity} |
| Bugs resolved | {N}/{N} ({N}%) |
| Re-test rounds | {N} rounds → {outcome} |
| Critical/Major defects | {N} |

**Recommendation:** {Approve for release / Block release until BUG-NNN resolved / Approve with known limitations}

---
---

## Appendix A: Re-Test History

<!--
╔══════════════════════════════════════════════════════════════════════╗
║  PURPOSE: Audit trail for process compliance and traceability.      ║
║  This appendix does NOT affect the final results in Sections 1-7.   ║
║                                                                      ║
║  RULES:                                                              ║
║  - Each round gets a timeline entry and collapsible details          ║
║  - Use <details> tags so the appendix stays compact by default       ║
║  - Include evidence file references within each round                ║
║  - If no re-tests were needed, write: "No re-test rounds required." ║
╚══════════════════════════════════════════════════════════════════════╝
-->

> **The final results in [Section 3](#3-manual-sit-results-final) supersede all intermediate results below.** This appendix is preserved for traceability and audit purposes only.

### Timeline Overview

<!--
Use a simple text timeline showing progression across rounds.
Format: Round N (date) → summary of what happened
-->

```
Round 1 (Initial)       → {N}/{N} PASS, {N} bugs found ({BUG-IDs})
Round 2 ({YYYY-MM-DD})  → {BUG-NNN FIXED ✅ / BUG-NNN still open}
Round 3 ({YYYY-MM-DD})  → {BUG-NNN FIXED ✅ — all bugs resolved}
```

<!-- Bug progression table — one row per bug showing status at each round -->

| Bug | Round 1 | Round 2 | Round 3 | Final |
|-----|---------|---------|---------|-------|
| {BUG-001} ({SIT-NN}) | ⚠️ Found | {❌ Not fixed / ✅ Fixed} | {✅ Fixed / —} | {CLOSED / OPEN} |
<!-- Add rows for each bug -->

---

### Round {N} — {YYYY-MM-DD}

**Scope:** Re-test {SIT-NN (BUG-NNN), SIT-NN (BUG-NNN)}

<!-- [CONDITIONAL] Include fix description if a fix was applied before this round -->
**Fix applied:** {Description of code changes applied before this re-test round. Files changed.}

<details>
<summary>{SIT-NN} re-test: {Title} — {✅ PASS / ❌ FAIL} ({BUG-NNN} {fixed / not yet fixed})</summary>

1. {Step and observation}
2. {Step and observation}
3. {Step and observation}

**Evidence:** {filename1.png, filename2.png}

</details>

<!-- Repeat <details> block for each SIT case re-tested in this round -->

**Round {N} Result:** {N}/{N} PASS ({N}%)

---

<!-- Repeat "Round N" section for each re-test round -->
