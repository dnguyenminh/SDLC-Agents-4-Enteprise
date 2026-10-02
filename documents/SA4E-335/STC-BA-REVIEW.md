# BA Review — Test Cases (STC/STP) — SA4E-335 (Re-review)

## Review Metadata

| Field | Value |
|-------|-------|
| Ticket | SA4E-335 — Review backend Dockerfile/docker-compose and create CI to build Docker image |
| Reviewer | BA Agent (Business coverage gate) |
| Phase | 4 — Test Planning (re-review after CHANGES_REQUESTED) |
| Documents reviewed | STC.md (v1.1, 43 functional + 7 doc = 50 cases), STP.md (v1.1, RTM) against BRD v1.0 (4 stories, 17 ACs) and FSD v1.1 (UC-01..UC-04, BR-01..BR-23) |
| Date | 2026-10-01 |
| **Verdict** | **APPROVED** |

---

## 1. Scope of this review

As BA I review the test cases for **business coverage only** — not test tooling, automation feasibility, or technical correctness. The checks are:

1. Every User Story / Acceptance Criterion in the BRD has at least one corresponding test case.
2. Every Business Rule (BR-) in the FSD is exercised by at least one test case.
3. Expected results reflect the intended business behavior.
4. Important exception / alternative flows (UC EF/AF) are covered.
5. Nothing critical is missing; nothing is out of scope.

This is the second review. The first review (recorded in revision history of STC/STP v1.1) returned **CHANGES_REQUESTED** with three required findings (BR-03, BR-07, UC-03 EF-2) and two recommended findings (UC-02 EF-3, UC-03 EF-3).

---

## 2. Acceptance Criteria coverage (BRD) — PASS

All 17 acceptance criteria map to at least one test case. The STP RTM §7 was re-verified row-by-row against the STC; every referenced case exists and tests the stated behavior.

| Story | ACs | Covered | Status |
|-------|-----|---------|--------|
| Story 1 — Gap review & decisions | 4 | 4/4 | PASS |
| Story 2 — Production compose | 5 | 5/5 | PASS |
| Story 3 — CI build & push | 5 | 5/5 | PASS |
| Story 4 — Documentation | 3 | 3/3 | PASS |
| **Total** | **17** | **17/17** | **100% AC coverage** |

Expected results remain business-correct: TC-INT-05 asserts fail-fast with a named missing secret and no plaintext default fallback (UC-02 EF-1 / BR-08); TC-CI-06 asserts red pipeline + no image pushed (BR-19); TC-CI-07 asserts PR = build-only, no push, no secret step (BR-18/BR-19).

---

## 3. Business Rule coverage (FSD) — PASS (all gaps closed)

All 23 business rules (BR-01..BR-23) are now exercised by at least one test case. The three previously blocking findings are resolved:

| BR | Rule (FSD) | Prior status | Now | Closing case |
|----|------------|--------------|-----|--------------|
| BR-03 | `tree-sitter-jsp` stripped for hermetic build; decision documented. | ❌ Not tested | ✅ Covered | **TC-CFG-08** — asserts a recorded decision (adopt/adapt/defer with rationale) and, when adopt/adapt, asserts the strip step is present and the dep absent from the `production` image; defer branch requires only the recorded decision. Backed by test data CFG-17..CFG-19. |
| BR-07 | Decisions MUST NOT be fabricated; unavailable baseline → blocked & escalated (UC-01 EF-1). | ❌ Not tested | ✅ Covered | **TC-DOC-07** — asserts that when the SA4E-44 baseline is unavailable the review is recorded as blocked/escalated and no decisions are fabricated. Backed by test data CFG-20. |
| BR-17 (auth-failure path, UC-03 EF-2) | Registry auth failure → red, credential not printed. | ⚠️ Partial | ✅ Covered | **TC-CI-08** — invalid credential → login/push fails red, no image pushed, credential value never printed (masked). |

---

## 4. Exception / alternative flow coverage — PASS

| UC flow | Prior | Now | Test case |
|---------|-------|-----|-----------|
| UC-01 EF-1 (baseline unavailable → block) | ❌ | ✅ | TC-DOC-07 |
| UC-02 EF-1 (missing secret → fail fast) | ✅ | ✅ | TC-INT-05 |
| UC-02 EF-3 (named volume missing/unmountable → fail visibly, no ephemeral fallback) | ❌ | ✅ | TC-INT-07 |
| UC-03 EF-1 (build fail → red, no push) | ✅ | ✅ | TC-CI-06 |
| UC-03 EF-2 (registry auth fail → red, no secret printed) | ❌ | ✅ | TC-CI-08 |
| UC-03 EF-3 (push fail → red, no partial success) | ⚠️ | ✅ | TC-CI-09 |
| UC-04 EF-1 (registry choice pending → withhold pull instructions) | ✅ | ✅ | TC-DOC-05/06 |

Both recommended items (UC-02 EF-3, UC-03 EF-3) were also added, so the deliverable exceeds the minimum required.

---

## 5. Scope check — PASS

No out-of-scope test cases. All 50 cases stay within the BRD §1.2 boundary (no deploy/orchestration, no extension packaging, no app-feature tests). Documentation-verification cases (TC-DOC-01..07) correctly map to Story 4 and Story 1 decision records.

---

## 6. Resolution of prior findings

| # | Prior required/recommended item | Status |
|---|---------------------------------|--------|
| 1 | TC for BR-03 (tree-sitter-jsp strip + recorded decision) | ✅ Resolved — TC-CFG-08 |
| 2 | TC for BR-07 / UC-01 EF-1 (blocked & escalated baseline) | ✅ Resolved — TC-DOC-07 |
| 3 | TC for UC-03 EF-2 (auth failure → red, no credential printed) | ✅ Resolved — TC-CI-08 |
| 4 | (Recommended) TC for UC-02 EF-3 (missing volume fails visibly) | ✅ Resolved — TC-INT-07 |
| 5 | (Recommended) TC for UC-03 EF-3 (push failure → red, no partial success) | ✅ Resolved — TC-CI-09 |

RTM (STP §7) was updated to reference all five new cases; test data CSV (`testdata/test-data-config-validation.csv`) was extended with rows CFG-17..CFG-20 that back TC-CFG-08 and TC-DOC-07.

---

## 7. Verdict

**APPROVED.** Business coverage is complete: 100% of BRD acceptance criteria (17/17) are covered, all 23 FSD business rules (BR-01..BR-23) are tested, all critical exception flows have dedicated cases, expected results reflect the intended business behavior, and no case is out of scope. The three blocking findings from the prior review (BR-03, BR-07, UC-03 EF-2) and both recommended items (UC-02 EF-3, UC-03 EF-3) are resolved. The qa-agent's test planning is approved from a business perspective.

---

## Re-review — STC v1.2 amendment (TC-INT-06), 2026-10-02

### Metadata

| Field | Value |
|-------|-------|
| Ticket | SA4E-335 |
| Reviewer | BA Agent (business coverage gate) |
| Phase | UAT gate — re-ack of the single change made since BA approval of STC v1.1 (2026-10-01) |
| Trigger | qa-agent bumped **STC v1.1 → v1.2** (TC-INT-06 steps 1/3 only), flagged for BA re-review in TEST-REPORT §4A.3 and UAT-READINESS §7(c) |
| Documents read | STC.md v1.2 (Document Information, Revision History, TC-INT-06), FSD.md §12.5 environment-contract row (`ONNX_RUNTIME_URL`), TEST-REPORT.md §1/§2/§4A/§4A.3, STP.md §7 RTM, UAT-READINESS.md §4/§6/§7, RUN-LOG.md #25–#29, PENTEST-REPORT.md (C-13) |
| Verdict | **APPROVED** |

### 1. Scope of this re-review

This is a **targeted re-ack**, not a repeat of the Phase 4 review: only the v1.2 amendment (TC-INT-06 steps 1/3 rewritten to the two-file overlay invocation) is re-assessed. The Phase 4 APPROVED verdict on STC v1.1 (sections 1–7 above) stands unchanged; nothing else in STC v1.2 was declared changed by qa-agent.

### 2. What I checked

**2.1 Rationale — technically sound and traceable — PASS**

- **Contract re-read:** FSD §12.5 row requires `environment.ONNX_RUNTIME_URL` = `http://onnx-runtime:8080` to be **"present only when `embeddings` profile active"**, rule tag **"AF-1 dev-only"**.
- **Rationale soundness:** The v1.2 revision history states that on Docker Compose v5.2.0 profiles gate **services only** — `--profile` is invisible to `${...}` interpolation and cannot switch a service-level `environment` entry on/off — so the v1.1 single-file wording `docker compose --profile embeddings up -d` was **not implementable as written**. This matches Compose semantics (profile activation selects project services; it does not mutate another service's `environment` map at render time) and is empirically corroborated by three independent artifacts: RUN-LOG #26 (DEV verified both modes), TEST-REPORT §4A evidence (`ONNX_RUNTIME_URL=http://onnx-runtime:8080` with the overlay; `ONNX=[]` + `SIDECAR_PRESENT=NO` on the base-only run), and PENTEST-REPORT C-13 (overlay `config` exit 0 while base hardening — `read_only`, `cap_drop=ALL`, `no-new-privileges`, `NODE_ENV=production`, secrets mounts — is preserved).
- **AF-1 dev-only contract preserved:** the base compose file carries no `ONNX_RUNTIME_URL`; the key exists only in `docker-compose.embeddings.yml`, which is only ever combined with `--profile embeddings`. The FSD §12.5 condition therefore holds **literally in both states** — present in the profile run, absent in the production default run. The overlay is the mechanism that makes the contract implementable, not a relaxation of it.
- **Traceability:** revision history v1.2 cites the rationale inline and TEST-REPORT §4A.3 records the same scope and the pre-amendment wording — consistent story across artifacts.

**2.2 Business test intent for S2-AC5 / BR-13 — PASS (preserved)**

- **Expected Result text is unchanged:** "Profile adds the sidecar on demand; default production run excludes it and is unaffected." — the business propositions under test are identical before and after the amendment.
- **Step 2 unchanged:** sidecar runs **and** `ONNX_RUNTIME_URL` is set for backend → still verifies the "dev embeddings profile is available" half of S2-AC5.
- **Step 3 unchanged in its assertion:** it still ends in a base-only run asserting `onnx-runtime` absent and production config unchanged → still verifies the "without weakening production" half of S2-AC5 / BR-13. The added explicit two-file teardown (driven by OBS-006: a plain `down` leaves the profile-disabled sidecar behind) makes the absence assertion **deterministic** instead of letting residue contaminate it — this strengthens the test, it does not weaken or redirect it.
- **Net:** only the mechanism changed (how the tester reaches the two end states); the two business claims verified are the same, and both were independently re-executed and PASSED (TEST-REPORT §4A, DEF-003 CLOSED).

**2.3 Diff-sense check — what I could and could not mechanically diff**

- **Could NOT do a mechanical diff.** Explicitly verified: `git status` shows `documents/SA4E-335/STC.md` as **untracked** (`??`), `git log -- documents/SA4E-335/STC.md` returns **no history**, and no v1.1 backup/snapshot of STC.md exists in the workspace (the only SA4E-335 STC-related files are `STC.md`, `STC-BA-REVIEW.md`, `stc-review.json`). A byte-level v1.1↔v1.2 `git diff` was therefore **not possible**.
- **Did instead (indirect verification) — all PASS:**
  1. **Declared scope agrees across artifacts:** the v1.2 revision-history row and TEST-REPORT §4A.3 both scope the change to TC-INT-06 steps 1/3 with expected-result semantics unchanged.
  2. **Structural re-count of the current file:** 49 enumerated TC IDs (L1 10 / L2 5 / L3 7 / L4 5 / L5 9 / L6 6 / Doc 7 — composition matches TEST-REPORT §2); all five v1.1 gap-closing cases I required (TC-CFG-08, TC-DOC-07, TC-CI-08, TC-INT-07, TC-CI-09) are present; every case still carries a `Traces` back-link (49/49); the level-summary table and totals are unchanged from v1.1.
  3. **Wording scan:** the only remaining single-file `--profile` occurrence outside the amendment is TC-CFG-07 step 3 (`docker compose --profile embeddings config`) — correct under the same Compose semantics, because profiles *do* gate service rendering; no contradiction introduced by the new rationale.
  4. **Cross-references agree:** STATUS.json (`stcAmendment: "TC-INT-06 v1.2"`), TEST-REPORT header, UAT-READINESS §6 item 9 all describe the same single-case amendment.
- **Residual risk:** a silent edit outside TC-INT-06 cannot be 100% excluded without a v1.1 snapshot; assessed **LOW** and non-blocking given the four independent cross-checks above.

**2.4 RTM integrity — PASS**

- STC TC-INT-06 `Traces` = **S2-AC5, BR-13** — unchanged by the amendment.
- STP §7 S2-AC5 → `TC-CFG-07, TC-INT-06` cites **case IDs only** (no step text), so the qa-agent's claim that no RTM edit was needed is correct — the RTM remains accurate as written.
- **17/17 AC coverage claim intact:** all 17 RTM rows (S1×4, S2×5, S3×5, S4×3) are present and every TC ID they reference exists in the current STC enumeration; TEST-REPORT §9 restates 17/17 (≥1 case executed or explicitly BLOCKED per AC) and UAT-READINESS §4 provides 17/17 AC verify steps.

### 3. Findings

| # | Severity | Finding |
|---|----------|---------|
| — | — | **No blocking findings.** |
| R1 | Low (non-blocking, **pre-existing** — not introduced by v1.2) | STC headline "50 cases (43 functional + 7 doc)" vs 49 enumerated IDs. Already logged by qa-agent as **OBS-002** (TEST-REPORT §2, "cosmetic documentation slip"); RTM coverage unaffected. Recorded here only for completeness; no action required for UAT. |
| R2 | Low (non-blocking, **pre-existing**) | TC-CFG-07 step 3 does not state the working directory / `-f` form for the profile render check. Outside the declared v1.2 amendment scope; optional future tidy-up, not required for UAT. |

### 4. Verdict

**APPROVED.** The v1.2 amendment is a legitimate, well-justified correction of a step that was not executable as written, while the Expected Result — and therefore the business test intent for S2-AC5 / BR-13 — is unchanged. The FSD §12.5 AF-1 dev-only contract for `ONNX_RUNTIME_URL` is preserved (and is in fact only satisfiable via the overlay mechanism), RTM integrity is intact (TC-INT-06 → S2-AC5/BR-13, 17/17 AC coverage), and no other change to the test set could be identified within the limits of the diff-sense check described in §2.3. STC **v1.2 is BA-acknowledged**; the qa-agent's Phase 4 approval (v1.1) and this re-ack (v1.2) together constitute business sign-off of the test cases.

### 5. UAT-gate business recommendation

**UAT READINESS (business): READY** — All 17 BRD ACs have verification steps with 39 PASS / 0 FAIL / 0 open defects (4/4 DEFs closed) and a clean pentest (0 Critical / 0 High, risk LOW); the 10 remaining BLOCKED cases are GitHub-runner-only environmental evidence tracked in UAT-READINESS §7(b), not a gap in business verification.

*The final UAT verdict remains with the human / PO — this is a business recommendation only. Non-BA open items stay as listed in UAT-READINESS §7 (commit the Phase-6 fix set, CI dry-run, Jira transition only after UAT pass).*
