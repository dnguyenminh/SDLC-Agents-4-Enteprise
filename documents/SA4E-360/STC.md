# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-360: Multi-Resolution Context Supply for Pi Harness — P1: Code Skeletonization + Agentic Context Loading

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-360 |
| Title | Multi-Resolution Context Supply for Pi Harness — P1: Code Skeletonization + Agentic Context Loading (wire dormant foundation) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-14 |
| Status | Draft — pending BA review (Review Gate) |
| Related STP | documents/SA4E-360/STP.md (v1.0) |
| Related FSD | documents/SA4E-360/FSD.md (v1.2) |
| Related TDD | documents/SA4E-360/TDD.md (v1.1 — checklist T1–T9) |
| Security Review | documents/SA4E-360/SECURITY-REVIEW.md (SEC-360-01..08) |
| Test Data | documents/SA4E-360/testdata/*.csv (11 files — Appendix A) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | QA Agent | Initiate document — 78 test cases across 6 levels (PBT 10 / UT 34 / IT 12 / E2E-API 12 / E2E-UI 2 / SIT 8); RTM 48/48 requirements (100%); traceable to BRD v1.1, FSD v1.2 (incl. TC-360-01..22, 12 error scenarios, C-360-* contracts), TDD v1.1 T1–T9, SECURITY-REVIEW SEC-360-01..08. |

---

## Test Case Summary

| Level | ID Range | Count | Automated | Manual | Priority |
|-------|----------|-------|-----------|--------|----------|
| PBT — Property-Based | PBT-01..PBT-10 | 10 | 10 | 0 | High |
| UT — Unit | UT-01..UT-34 | 34 | 34 | 0 | High/Medium |
| IT — Integration | IT-01..IT-12 | 12 | 12 | 0 | High |
| E2E-API — Real server | E2E-API-01..E2E-API-12 | 12 | 12 | 0 | High/Medium |
| E2E-UI — Playwright | E2E-UI-01..E2E-UI-02 | 2 | 2 | 0 | Medium |
| SIT — Manual | SIT-01..SIT-08 | 8 | 0 | 8 | High/Medium |
| **Total** | — | **78** | **70 (89.7%)** | **8 (10.3%)** | — |

**Redundancy contract (STP §2.3):** budget arithmetic formula → PBT only; truncation mechanics → UT only; loop invariants → PBT only; chain wiring → IT only; SQL/engine semantics on the real server → E2E-API only; human-judgment / LLM-quality / cross-process evidence → SIT only. No expected result is asserted at two levels for the same mechanism.

---

## 1. Property-Based Tests (PBT)

**Framework:** vitest + fast-check. **Location:** extension/src/pi-workflow/skeleton/__tests__/*.property.test.ts.
**Oracles are resolver-true (DISC-7):** @32k margin 2,622 / usable 28,098 / staticBudget 19,668 / cap 13,767; @65k 5,243 / 58,245 / 40,771 / 28,539.

### PBT-01: Budget resolver oracle — qwen 32k (n_ctx 32,768)

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property-Based — Budget Arithmetic |
| **Requirement** | BR-01/BR-02/BR-03 (inherited), UC-360-01 Step 1, M6; FSD §3.1.4 table; FSD TC-360-02 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/budget-arithmetic.property.test.ts |
| **Preconditions** | resolveContextBudget importable (context-budget-resolver.ts); SAFETY_MARGIN_RATIO=0.08, STATIC_BUDGET_RATIO=0.70 unchanged |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call resolveContextBudget(nCtx=32768, reserveOutput=2048) | safetyMargin = ceil(32768 × 0.08) = **2622** (32768×0.08 = 2621.44 → ceil) |
| 2 | Read usable | usable = 32768 − 2048 − 2622 = **28098** |
| 3 | Read staticBudget | staticBudget = floor(28098 × 0.70) = **19668** |
| 4 | Read skeleton cap = floor(0.70 × staticBudget) | **13767** (~13.8K — BR-360-01) |
| 5 | Compute historyBudget = usable − staticBudget | **8430** |

**Test Data:** budget-scenarios-testdata.csv row BUD-01.
**Postconditions:** none. Any deviation from these exact numbers = Critical defect (doc/resolver drift — DISC-7 class).

---

### PBT-02: Budget resolver oracle — 65k window (secondary target)

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based — Budget Arithmetic |
| **Requirement** | UC-360-01 AF-3; FSD §3.1.4 table |
| **File** | same as PBT-01 |
| **Preconditions** | as PBT-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call resolveContextBudget(nCtx=65536, reserveOutput=2048) | margin = ceil(65536×0.08) = **5243** (5242.88) |
| 2 | Read usable | **58245** |
| 3 | Read staticBudget | **40771** |
| 4 | Read skeleton cap | **28539** |
| 5 | historyBudget | **17474** |

**Test Data:** budget-scenarios-testdata.csv row BUD-02.
**Postconditions:** none.

---

### PBT-03: Budget formula invariants over arbitrary n_ctx

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Property-Based — Budget Arithmetic |
| **Requirement** | BR-01 (nCtx > 0, default-8192 chain), BR-02, BR-03 |
| **File** | same as PBT-01 |
| **Preconditions** | fast-check configured (≥ 1,000 runs) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: arbitrary nCtx ∈ [1, 1048576], reserveOutput ∈ [0, nCtx) | margin === Math.ceil(nCtx × 0.08) |
| 2 | Same inputs | usable === nCtx − reserveOutput − margin; usable ≥ 0 (clamped, never negative) |
| 3 | Same inputs | staticBudget === Math.floor(usable × 0.70); cap === Math.floor(0.70 × staticBudget) |
| 4 | Ordering invariant | cap ≤ staticBudget ≤ usable ≤ nCtx (strict whenever usable > 0) |
| 5 | Unknown provider (no meta.n_ctx) | nCtx resolves via ModelRegistry → 8192 default; NEVER 0/undefined (BR-01) |
| 6 | Boundary nCtx=1, reserveOutput=0 | margin 1, usable 0 → DEGRADED path; no NaN/division-by-zero |

**Test Data:** budget-scenarios-testdata.csv rows BUD-03..BUD-06.
**Postconditions:** none.

---

### PBT-04: Truncation loop strict-shrink invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Type** | Property-Based — Truncation Invariant |
| **Requirement** | UC-360-01 AF-1; FSD §6.1 pseudocode; SEC-360-02 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-truncator.property.test.ts |
| **Preconditions** | SkeletonTruncator implemented (TDD task T1) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: arbitrary parts array (1..200 parts, random token sizes 1..30,000, random module priorities), total over cap | Each while-iteration removes EXACTLY one part: parts.length strictly decreases by 1 per iteration |
| 2 | Same run | parts never grows; no dropped element re-added |
| 3 | Same run | measured token total is monotonically non-increasing across iterations |

**Test Data:** truncation-scenarios-testdata.csv row TRC-06 (random generator spec).
**Postconditions:** none.

---

### PBT-05: Truncation loop termination

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | High |
| **Type** | Property-Based — Truncation Invariant |
| **Requirement** | SEC-360-02 (loop must terminate — no infinite loop / session-assembly hang) |
| **File** | same as PBT-04 |
| **Preconditions** | as PBT-04 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: arbitrary inputs incl. all-parts-oversized and empty priority list | Loop terminates in ≤ initial parts.length iterations (break when victim === undefined) |
| 2 | Stress: 10,000 runs with per-test 5 s timeout | No timeout, no counterexample |

**Test Data:** truncation-scenarios-testdata.csv row TRC-07.
**Postconditions:** none.

---

### PBT-06: Post-truncation budget post-condition

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Priority** | High |
| **Type** | Property-Based — BR-360-01 |
| **Requirement** | BR-360-01, BR-360-02; FSD TC-360-02 |
| **File** | same as PBT-04 |
| **Preconditions** | as PBT-04 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: arbitrary parts + cap | Final state satisfies: (skeletonTokens ≤ cap) XOR (gateDecision === 'REJECT') — no third state |
| 2 | Same run | gateDecision ∈ {PASS, TRUNCATED_PASS, REJECT, DEGRADED_NO_SKELETON} exactly |

**Test Data:** truncation-scenarios-testdata.csv row TRC-08.
**Postconditions:** none.

---

### PBT-07: usagePercent ≤ 0.70 invariant (M6)

| Field | Value |
|-------|-------|
| **ID** | PBT-07 |
| **Priority** | High |
| **Type** | Property-Based — BR-360-01 / M6 |
| **Requirement** | BR-360-01, M6; FSD TC-360-02 |
| **File** | same as PBT-04 |
| **Preconditions** | as PBT-04 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: whenever gateDecision ∈ {PASS, TRUNCATED_PASS} | skeletonTokens / staticBudget ≤ 0.70 (float tolerance < 1e-9) |
| 2 | Same run | truncationApplied === true ⟺ at least one part dropped |

**Test Data:** truncation-scenarios-testdata.csv row TRC-09.
**Postconditions:** none.

---

### PBT-08: Signature normalization invariant (≤ 120 chars, whitespace collapsed)

| Field | Value |
|-------|-------|
| **ID** | PBT-08 |
| **Priority** | Medium |
| **Type** | Property-Based — Render Format |
| **Requirement** | FSD §3.1.4 render format; C-360-S1 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-render.property.test.ts |
| **Preconditions** | SymbolOutlineExtractor.extractOutline importable; >120-char signature fixture (pre-seeded-index-fixtures.csv FIX-01) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: arbitrary signature strings (0..5,000 chars; whitespace mixes of space/tab/newline) through trimSignature/render | Rendered signature length ≤ 120 chars |
| 2 | Same run | Whitespace collapsed to single spaces — no tab/newline survives |
| 3 | Signatures > 120 chars | First 117 chars + '...' exactly |
| 4 | Signatures ≤ 120 chars | Unchanged apart from whitespace collapse |

**Test Data:** pre-seeded-index-fixtures.csv row FIX-01.
**Postconditions:** none.

---

### PBT-09: redactSecretLike completeness property (SEC-360-01)

| Field | Value |
|-------|-------|
| **ID** | PBT-09 |
| **Priority** | High |
| **Type** | Property-Based — Security (SEC-360-01) |
| **Requirement** | SEC-360-01 remediation #1 — redactSecretLike applied BEFORE trimSignature and inside trimToTokenBudget (RAW_HEAD) |
| **File** | extension/src/pi-workflow/skeleton/__tests__/secret-redaction.property.test.ts |
| **Preconditions** | redactSecretLike helper implemented (TDD T1/T6 security remediation) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: arbitrary strings spliced with secret-like tokens — sk-[A-Za-z0-9]{16,}, AKIA[0-9A-Z]{16}, ghp_/gho_, xox[bap]-, BEGIN … PRIVATE KEY, (?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^"']{8,} | Output contains ZERO matches of the deny-list regexes |
| 2 | Same run | Every redacted occurrence replaced by the literal marker [REDACTED] |
| 3 | Non-secret control strings (normal identifiers, generic words) | Preserved byte-identical — no over-redaction |
| 4 | Idempotence | redactSecretLike(redactSecretLike(x)) === redactSecretLike(x) |

**Test Data:** secret-redaction-testdata.csv rows SEC-A..SEC-F, SEC-L.
**Postconditions:** none.

---

### PBT-10: Global incremental budget bound + O(parts) accounting (SEC-360-02)

| Field | Value |
|-------|-------|
| **ID** | PBT-10 |
| **Priority** | High |
| **Type** | Property-Based — Security (SEC-360-02) / Performance |
| **Requirement** | SEC-360-02 remediation #1/#2 — global incremental budget (maxTokens = cap − measuredSoFar), O(parts) token accounting, hard iteration cap ≤ 500 drops |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-truncator.property.test.ts |
| **Preconditions** | SkeletonTruncator with incremental accounting implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.assert: render arbitrary file lists (1..300 files, random sizes up to per-file cap) passing remaining-global-budget | measuredSoFar NEVER exceeds cap at any file boundary — no intermediate over-budget state |
| 2 | Same run | estimateTokenCount invocations ≤ 2 × parts.length + 1 (O(parts) — no full re-join per drop) |
| 3 | Same run | Truncation drops ≤ 500 (hard cap); exceeding → REJECT per BR-360-02, never unbounded work |
| 4 | Wall-clock guard (TRC-12: 150 RAW_HEAD-class parts) | Truncator completes < 1 s in-process (headroom inside the ≤ 2 s p95 skeleton-build NFR) |

**Test Data:** truncation-scenarios-testdata.csv rows TRC-10, TRC-12.
**Postconditions:** none.

---

## 2. Unit Tests (UT)

**Framework:** vitest. **Locations:** extension/src/pi-workflow/skeleton/__tests__/ (extension modules); backend/src/engine/tools/__tests__/ (backend tools — see E2E-API section for their real-server counterparts). All external services (index, filesystem, MCP bridge) use in-memory fakes per TDD §6.2 DI seams — this is a UT, not an IT.

### 2.1 SkeletonTruncator (TDD task T1)

### UT-01: Cap enforcement — oversized skeleton truncated to ≤ cap

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | BR-360-01; UC-360-01 AF-1; FSD TC-360-02 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-truncator.test.ts |
| **Preconditions** | staticBudget = 19,668 (@32k) → cap 13,767; modulePriorityOrder [engine, extension, backend] |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Build 6 parts totaling ~18,000 tokens (fixture TRC-01) | Input exceeds cap 13,767 |
| 2 | Run truncator.truncate(parts, cap, priority) | truncationApplied = true; result skeletonTokens ≤ 13,767 |
| 3 | Inspect remaining parts | Lowest-priority module parts removed first; retained parts intact (content unchanged, only dropped) |

**Test Data:** truncation-scenarios-testdata.csv row TRC-01.
**Postconditions:** none.

---

### UT-02: Module-priority drop order (lowest priority first, then file-level)

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | UC-360-01 AF-1 (truncation by module priority — ModuleSummarizer metrics) |
| **File** | same as UT-01 |
| **Preconditions** | as UT-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 5 parts tagged engine/extension/backend, total 20,000 tokens (TRC-02) | Overflow 6,233 tokens vs cap |
| 2 | Run truncator | First dropped part belongs to 'backend' (lowest priority); then 'extension'; 'engine' retained last |
| 3 | Force deeper truncation | Within a module, lowest-priority FILE dropped before the module header part |

**Test Data:** truncation-scenarios-testdata.csv row TRC-02.
**Postconditions:** none.

---

### UT-03: Re-measure after EVERY drop + PI_SKELETON_TRUNCATED payload

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | Medium |
| **Type** | Unit — Functional / Telemetry |
| **Requirement** | C-360-S3 (PI_SKELETON_TRUNCATED); FSD §6.1 Step 8 |
| **File** | same as UT-01 |
| **Preconditions** | Telemetry sink stub captures events |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 4 parts, total 16,000 tokens (TRC-03); run truncator | After each drop the running total is re-measured (no stale estimate drives the next decision) |
| 2 | Inspect emitted events | Exactly one PI_SKELETON_TRUNCATED (info): { skeletonTokensBefore: 16000, skeletonTokensAfter ≤ 13767, modulesDropped: [...], staticBudget: 19668 } |

**Test Data:** truncation-scenarios-testdata.csv row TRC-03.
**Postconditions:** none.

---

### UT-04: Defect-forced persisting overflow → REJECT

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | BR-360-02 / BR-09 (fail-safe, never fail-open); FSD TC-360-03; FSD §9.1 ES-1 |
| **File** | same as UT-01 |
| **Preconditions** | Forced-harness condition: single part larger than cap that cannot be dropped (empty priority resolution) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 1 part of 25,000 tokens, cap 13,767, no droppable victim (TRC-04) | gateDecision = 'REJECT' |
| 2 | Inspect result | No partial content returned for injection; error telemetry PI_CONTEXT_BUDGET_EXCEEDED-shaped payload { skeletonTokens, staticBudget } available for the assembly boundary |
| 3 | Confirm semantics | The truncator never returns an over-cap artifact marked PASS/TRUNCATED_PASS |

**Test Data:** truncation-scenarios-testdata.csv row TRC-04.
**Postconditions:** none.

---

### UT-05: All parts dropped → DEGRADED_NO_SKELETON

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | Medium |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-01 EF-5 (empty content NEVER triggers REJECT); FSD §6.1 parts.length===0 branch |
| **File** | same as UT-01 |
| **Preconditions** | as UT-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 3 small parts + cap small enough that all are dropped (TRC-05) | parts.length === 0 after loop |
| 2 | Inspect decision | gateDecision = 'DEGRADED_NO_SKELETON' (NOT REJECT — session proceeds with agentic steering) |

**Test Data:** truncation-scenarios-testdata.csv row TRC-05.
**Postconditions:** none.

---

### 2.2 IndexFreshnessChecker (TDD task T2)

### UT-06: Fresh hot path — exactly 1 stat per file, no hash, no re-index

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Unit — Functional / Performance |
| **Requirement** | FSD §5.4 freshness model (light check); TDD §5.5 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/index-freshness-checker.test.ts |
| **Preconditions** | Fake fs: file mtime unchanged vs lastKnownGoodMtime (fixture FRS-01) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | sweep(root, indexedFiles) on 5 unchanged files | Result FRESH for all 5 |
| 2 | Count fs calls | Exactly 5 stat calls, 0 hash computations, 0 reindex delegate calls |

**Test Data:** index-freshness-testdata.csv row FRS-01.
**Postconditions:** lastKnownGoodMtime refreshed.

---

### UT-07: Touch-only change (mtime moved, hash equal) → FRESH without re-index

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | FSD §5.4 step 3-4 (hash ONLY the changed file; touch-only → no reindex) |
| **File** | same as UT-06 |
| **Preconditions** | Fake fs: mtime changed, content hash identical to files.content_hash (FRS-02) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | sweep with 1 touched file + 4 untouched | Touched file: 1 stat → mtime differs → 1 hash confirm → hash equal → FRESH |
| 2 | Count calls | 0 reindex delegate calls; cached mtime refreshed for the touched file only |

**Test Data:** index-freshness-testdata.csv row FRS-02.
**Postconditions:** mtime cache updated.

---

### UT-08: Content-changed (stale) → re-index changed files only → retry resolution ONCE → FRESH

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | UC-360-01 EF-2 / UC-360-02 AF-2; FSD TC-360-05; FSD §9.1 ES-3 |
| **File** | same as UT-06 |
| **Preconditions** | Fake fs: 1 file mtime + hash differ (FRS-03); reindex delegate stub succeeds |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | sweep | STALE detected for the changed file; PI_SKELETON_INDEX_STALE (warn) { staleFiles: 1, action: 'reindex' } |
| 2 | Observe delegate | Reindex invoked ONCE (backend checksum-skip makes it changed-files-only); NOT whole-workspace |
| 3 | Retry resolution | Resolution retried exactly once → FRESH after re-index |

**Test Data:** index-freshness-testdata.csv row FRS-03.
**Postconditions:** cache reset + refreshed.

---

### UT-09: Re-index failure → DEGRADED (action 'degrade'), no second retry

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-01 EF-2 terminal branch; BR-09 spirit (never silently oversize) |
| **File** | same as UT-06 |
| **Preconditions** | reindex delegate stub returns false/throws (FRS-04) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | sweep with stale file + failing delegate | Report action 'degrade'; freshness status DEGRADED |
| 2 | Count delegate calls | Exactly 1 (retry-once policy — never a retry loop) |
| 3 | Downstream contract | Caller proceeds WITHOUT skeleton (DEGRADED_NO_SKELETON) — never REJECT, never oversize |

**Test Data:** index-freshness-testdata.csv row FRS-04.
**Postconditions:** none.

---

### UT-10: Re-index cooldown (SEC-360-03 remediation)

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | Medium |
| **Type** | Unit — Security (SEC-360-03) |
| **Requirement** | SEC-360-03 remediation #2 — cooldown ≥ 30 s on the reindex delegate (distinct-args calls must not bypass the guard) |
| **File** | same as UT-06 |
| **Preconditions** | Checker constructed with cooldown 30,000 ms; fake clock |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger stale → reindex at t=0 (FRS-05) | 1 delegate call |
| 2 | Trigger 5 more stale events with DIFFERENT files/args at t=+1s..+29s | 0 additional delegate calls (cooldown blocks) |
| 3 | Advance clock to t=+31s, trigger stale again | 1 new delegate call allowed |

**Test Data:** index-freshness-testdata.csv row FRS-05.
**Postconditions:** none.

---

### 2.3 SkeletonProvider (TDD task T6)

### UT-11: Batched corpus render — format per FSD §3.1.4

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | C-360-S1; FSD §3.1.4 render format; UC-360-01 Step 3 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-provider.test.ts |
| **Preconditions** | Fake locator returns fixture corpus (FIX-01, FIX-02); freshness FRESH |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | provider.getSections(root, 19668, [extension, backend]) | ONE batched corpus query (not per-file) — assert locator.fetchSymbolCorpus called once |
| 2 | Inspect skeletonContent | Per file: line 1 = '// symbol-outline-extractor.ts'; then 'class SymbolOutlineExtractor', 'method extractOutline(filePath, symbols, maxTokens)' — kind + name + signature lines, no method bodies |
| 3 | Signature normalization | Whitespace collapsed; >120-char signature trimmed to 117 + '...' |

**Test Data:** pre-seeded-index-fixtures.csv rows FIX-01, FIX-02.
**Postconditions:** none.

---

### UT-12: Per-file token bound equals the whole-skeleton cap

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | High |
| **Type** | Unit — Boundary |
| **Requirement** | FSD C-360-S1 note (per-file bound = cap — no single file consumes the full budget); SEC-360-02 context |
| **File** | same as UT-11 |
| **Preconditions** | Fixture file with 400 symbols (FIX-03) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render FIX-03 alone with cap 13,767 | extractOutline receives maxTokens = floor(0.70 × 19668) = 13767 |
| 2 | Inspect output | File contribution ≤ 13,767 tokens — incremental enforcement stops rendering at the overflowing symbol |

**Test Data:** pre-seeded-index-fixtures.csv row FIX-03.
**Postconditions:** none.

---

### UT-13: Fallback ladder GRAMMAR → REGEX_SIGNATURES → RAW_HEAD → SKIPPED

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | High |
| **Type** | Unit — Functional / Exception |
| **Requirement** | BR-360-03; UC-360-04 Main/AF-1/EF-1; C-360-F1; FSD TC-360-12/13; FSD §9.1 ES-9 |
| **File** | same as UT-11 |
| **Preconditions** | Fake locator: extractSignatures returns per-file results; FsContentReader real against fixture dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | File app.ts (grammar available, FIX/FB-02) | fallbackMode GRAMMAR — AST symbols rendered |
| 2 | File WorkspaceWidget.svelte (no grammar, regex hits, FB-01) | fallbackMode REGEX_SIGNATURES; signatures from code_extract_signatures rendered with REAL line numbers (1 ≤ line ≤ fileLines) |
| 3 | File with grammar-less language, regex yields [] (FB-03) | Straight to RAW_HEAD (skip doomed regex pass) — readHead content ≤ 1 MB, token-trimmed |
| 4 | File whose regex extraction throws (FB-04) | fallbackMode SKIPPED; PI_SKELETON_FILE_SKIPPED (warn) |
| 5 | All four files in one workspace | Session build NEVER blocked (BR-360-03); fallbackFiles count = 3 (regex+rawhead+skipped per telemetry contract) |

**Test Data:** skeleton-fallback-testdata.csv rows FB-01..FB-04.
**Postconditions:** none.

---

### UT-14: Single-file extraction failure → skip + warn, others continue (EF-3)

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-01 EF-3; FSD TC-360-06; error code FILE_UNREADABLE |
| **File** | same as UT-11 |
| **Preconditions** | One unparseable/unreadable file in the workspace (FB-05) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Build skeleton for workspace with 1 bad + 4 good files | PI_SKELETON_FILE_SKIPPED (warn) { filePath: bad file, reason } — never fatal |
| 2 | Inspect skeleton | All 4 good files rendered; skippedFiles count = 1; build completes normally |

**Test Data:** skeleton-fallback-testdata.csv row FB-05.
**Postconditions:** none.

---

### UT-15: Empty index → skeletonTokens 0 → DEGRADED_NO_SKELETON (EF-5)

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-01 EF-5; FSD §6.1 (missing content NEVER triggers REJECT) |
| **File** | same as UT-11 |
| **Preconditions** | Corpus query returns [] (empty workspace index, FB-06/FIX-13) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | getSections on empty corpus | skeletonTokens = 0; gateDecision = 'DEGRADED_NO_SKELETON' |
| 2 | Downstream contract | Session proceeds; steering to get_workspace_info + read_method; NO REJECT, NO provider block |

**Test Data:** skeleton-fallback-testdata.csv row FB-06; pre-seeded-index-fixtures.csv row FIX-13.
**Postconditions:** none.

---

### UT-16: OI-2 freshness-keyed cache — reuse on unchanged fingerprint, rebuild on change

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Priority** | Medium |
| **Type** | Unit — Functional |
| **Requirement** | TDD §3 OI-2 (tie reuse to index freshness — no TTL); INV-1 preserved |
| **File** | same as UT-11 |
| **Preconditions** | Fingerprint = sorted [relativePath, mtimeMs] pairs (FIX-04) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call getSections twice with unchanged fingerprint | Second call serves the cached artifact — extractor NOT re-invoked (assert call count) |
| 2 | Mutate one file's mtime+content → fingerprint differs | Rebuild triggered; new artifact cached |
| 3 | Call provider.invalidate(root) | Next getSections forces rebuild regardless of fingerprint |

**Test Data:** pre-seeded-index-fixtures.csv row FIX-04.
**Postconditions:** cache state per scenario.

---

### 2.4 ReadMethodTool (TDD task T4)

### UT-17: INVALID_ARGS envelope — validation never throws

| Field | Value |
|-------|-------|
| **ID** | UT-17 |
| **Priority** | High |
| **Type** | Unit — Validation |
| **Requirement** | C-360-R1 (TypeBox minLength 1); C-360-R2 error code INVALID_ARGS; FSD §9.1 ES-6; FSD TC-360-xx (§6.2 Step 1) |
| **File** | extension/src/pi-workflow/skeleton/__tests__/read-method-tool.test.ts |
| **Preconditions** | createReadMethodTool with stub locator + stub freshness |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute with class='' (empty) | Tool result status INVALID_ARGS — actionable validation text + usage hint; execute() does NOT throw |
| 2 | execute with method='   ' (whitespace only) | INVALID_ARGS (non-empty AFTER trim — FSD §3.2.4) |
| 3 | execute with method missing / non-string | INVALID_ARGS; turn-continuation contract holds (envelope, not exception) |

**Test Data:** read-method-testdata.csv rows RM-01..RM-03.
**Postconditions:** none.

---

### UT-18: ok envelope — exact slice matches symbols row

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | UC-360-02 Main Flow; BRD Story 2 AC 1; C-360-R2; FSD TC-360-07 |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator returns fixture row extractOutline @ symbol-outline-extractor.ts lines 35..48 (FIX-02); file exists in fixture workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute { class: 'SymbolOutlineExtractor', method: 'extractOutline' } | status 'ok' |
| 2 | Inspect envelope fields | filePath = extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts; symbolKind 'method'; name 'extractOutline'; signature as indexed; startLine 35; endLine 48 |
| 3 | Compare sourceSlice | EXACTLY source lines 35..48 of the fixture file (byte-equal) |
| 4 | Contract shape | content[0].text = JSON envelope; details = same parsed envelope (C-360-R2) |

**Test Data:** read-method-testdata.csv row RM-04.
**Postconditions:** PI_READ_METHOD_RESULT (info) { status: 'ok', durationMs, sliceLines: 14 } emitted.

---

### UT-19: AMBIGUOUS envelope — overloads return candidates, NO arbitrary pick (AF-1)

| Field | Value |
|-------|-------|
| **ID** | UT-19 |
| **Priority** | High |
| **Type** | Unit — Alternative Flow |
| **Requirement** | UC-360-02 AF-1; FSD TC-360-10; FSD §9.1 ES-5; C-360-R2 AMBIGUOUS |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator returns 2 rows for (Parser, parse) in different files / (BudgetCalculator, calculate) overloads in one file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute { class: 'Parser', method: 'parse' } (RM-05) | status 'ambiguous'; candidates = 2 entries { name, kind, filePath, startLine } |
| 2 | execute { class: 'BudgetCalculator', method: 'calculate' } (RM-06 — same class, differing kinds) | status 'ambiguous' — overloads ambiguous EVEN when kinds differ |
| 3 | Assert no arbitrary pick | Envelope contains NO sourceSlice / single filePath choice |

**Test Data:** read-method-testdata.csv rows RM-05, RM-06.
**Postconditions:** none.

---

### UT-20: not_found envelope + AF-4 classMethods enrichment

| Field | Value |
|-------|-------|
| **ID** | UT-20 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-02 EF-1 + AF-4; BRD Story 2 AC 4; C-360-R2 NOT_FOUND; FSD §9.1 ES-4 |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator: 0 rows; class fixture exposes ≥ 10 indexed methods |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute { class: 'SymbolOutlineExtractor', method: 'nonexistentMethod' } (RM-07) | status 'not_found'; suggestions = ['get_workspace_info', 'find_tools', 'code_search'] |
| 2 | AF-4 enrichment | classMethods array present — top 10 indexed method names of the matched class |
| 3 | execute { class: 'NonexistentClass', method: 'foo' } (RM-08) | status 'not_found' WITHOUT classMethods (no class match); turn continues, no throw |

**Test Data:** read-method-testdata.csv rows RM-07, RM-08.
**Postconditions:** none.

---

### UT-21: Corrupt line bounds → INDEX_STALE path, never a wrong slice (EF-4)

| Field | Value |
|-------|-------|
| **ID** | UT-21 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-02 EF-4; FSD §9.1 ES-7; C-360-R2 INDEX_STALE; TDD §5.4 bounds-check invariant |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator row with endLine < startLine, and a second row with endLine > lineCount (RM-09) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute on row with endLine=10, startLine=20 | Result routes to freshness path (INDEX_STALE) — bounds checked from INDEX data BEFORE any file read |
| 2 | execute on row with endLine=500 > lineCount=120 | Same INDEX_STALE handling — never a silently wrong slice |
| 3 | After reindex+retry succeeds | Normal ok envelope; after retry fails → not_found guidance |

**Test Data:** read-method-testdata.csv row RM-09.
**Postconditions:** none.

---

### UT-22: FILE_UNREADABLE — actionable error inside the result (EF-2)

| Field | Value |
|-------|-------|
| **ID** | UT-22 |
| **Priority** | Medium |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-02 EF-2; FSD §9.1 ES-8; C-360-R2 FILE_UNREADABLE |
| **File** | same as UT-17 |
| **Preconditions** | Contained path whose fs read fails (permissions/IO) in fixture workspace (RM-10) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute targeting unreadable file | status envelope FILE_UNREADABLE with actionable error TEXT inside the tool result |
| 2 | Assert turn-continuation | execute() does NOT throw; no crash event |

**Test Data:** read-method-testdata.csv row RM-10.
**Postconditions:** none.

---

### UT-23: INDEX_UNAVAILABLE — locator timeout/throw → steering envelope (EF-3)

| Field | Value |
|-------|-------|
| **ID** | UT-23 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-02 EF-3; C-360-R2 INDEX_UNAVAILABLE; §7.4 degradation summary |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator rejects with timeout after 2 attempts (2s timeout + 1 retry, backoff 200ms) (RM-11) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute with failing locator | status envelope INDEX_UNAVAILABLE; message steers LLM to get_workspace_info layout |
| 2 | Retry semantics | Exactly 2 attempts (1 original + 1 retry) then give up — no nested retry (TDD §7.4) |
| 3 | Turn continues | No throw |

**Test Data:** read-method-testdata.csv row RM-11; index-freshness-testdata.csv rows FRS-07/FRS-08.
**Postconditions:** none.

---

### UT-24: Extension-side path containment — index-derived path outside workspace rejected before read (SEC-325-D1)

| Field | Value |
|-------|-------|
| **ID** | UT-24 |
| **Priority** | High |
| **Type** | Unit — Security |
| **Requirement** | SEC-360-08 #1 (containment reuse); FSD §6.2 note (readLinesInWorkspace resolves through path-containment.ts); FSD §7.3 |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator returns row whose filePath resolves OUTSIDE workspace root via symlink or absolute escape (RM-12) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute with escape-row (symlink → outside root) | resolveContainedPath rejects BEFORE any file read — 0 bytes of outside content read |
| 2 | Same for absolute path outside root | Rejected; actionable error envelope; no slice returned |
| 3 | Control: contained path | Succeeds normally (no false positive) |

**Test Data:** read-method-testdata.csv row RM-12; backend-security-testdata.csv rows BV-01, BV-02.
**Postconditions:** none.

---

### UT-25: MAX_SLICE cap (SEC-360-06 remediation)

| Field | Value |
|-------|-------|
| **ID** | UT-25 |
| **Priority** | Medium |
| **Type** | Unit — Security (SEC-360-06) |
| **Requirement** | SEC-360-06 — MAX_SLICE_LINES (2,000) / MAX_SLICE_BYTES (256 KB); oversized slice → ok envelope truncated with sliceTruncated: true + totalLines |
| **File** | same as UT-17 |
| **Preconditions** | Stub locator row spanning 5,000 lines (RM-13) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute on huge-span symbol | status 'ok' with sourceSlice ≤ 2,000 lines / ≤ 256 KB |
| 2 | Envelope flags | sliceTruncated === true; totalLines === 5000 |
| 3 | Read bound | fs read stops at the cap — never reads the full 5,000 lines into memory |

**Test Data:** read-method-testdata.csv row RM-13.
**Postconditions:** none.

---

### 2.5 FunctionalMapProvider (TDD task T7)

### UT-26: Map shape + 1,500-token section cap + 60s TTL fields

| Field | Value |
|-------|-------|
| **ID** | UT-26 |
| **Priority** | High |
| **Type** | Unit — Functional |
| **Requirement** | C-360-M1; UC-360-03 Main; FSD TC-360-15; BR-360-05 (SummaryTreeBuilder consumed as-is) |
| **File** | extension/src/pi-workflow/skeleton/__tests__/functional-map-provider.test.ts |
| **Preconditions** | SummaryTreeBuilder real against fixture modules (FM-01..03); corpus stub for keySymbols |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | buildSection(root) | Returns { functionalMap: [{module, summary, keySymbols}], mapTokens, cacheTtlSeconds: 60 } |
| 2 | Validate entries | Every module = REAL indexed path (extension/src/pi-agent, extension/src/pi-workflow, backend/src/engine); every keySymbol exists in the symbols corpus — no fabricated modules |
| 3 | Token bound | mapTokens ≤ 1500 (builder default maxTokens ?? 1500 consumed as-is) |
| 4 | Text composition | text = layoutText + '\n\n' + functionalMapSection; layout portion byte-identical to pre-change format |

**Test Data:** functional-map-testdata.csv rows FM-01..FM-03.
**Postconditions:** none.

---

### UT-27: Whole-result ≤ 16,000 chars — cap pressure trims by module priority (AF-1)

| Field | Value |
|-------|-------|
| **ID** | UT-27 |
| **Priority** | Medium |
| **Type** | Unit — Boundary |
| **Requirement** | C-360-M1 cap table (MAX_TOOL_RESULT_CHARS = 16,000); UC-360-03 AF-1; FSD TC-360-17 |
| **File** | same as UT-26 |
| **Preconditions** | 40-module map forcing > 16,000 chars (FM-04) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | buildSection on oversized map | Entries trimmed by module priority (lowest first) until text ≤ 16,000 chars |
| 2 | Re-measure | mapTokens re-measured AFTER trimming; result text length ≤ 16,000 |

**Test Data:** functional-map-testdata.csv row FM-04.
**Postconditions:** none.

---

### UT-28: EF-1 — one module fails → entry omitted, rest served

| Field | Value |
|-------|-------|
| **ID** | UT-28 |
| **Priority** | Medium |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-03 EF-1 (per-module omission, debug log — NOT the PI_FUNCTIONAL_MAP_UNAVAILABLE event) |
| **File** | same as UT-26 |
| **Preconditions** | Builder stub fails for exactly 1 module (FM-05) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | buildSection with 1 failing module of 3 | functionalMap contains the 2 healthy modules only; failing entry omitted |
| 2 | Log level | Per-module omission logged at debug — NO PI_FUNCTIONAL_MAP_UNAVAILABLE event |

**Test Data:** functional-map-testdata.csv row FM-05.
**Postconditions:** none.

---

### UT-29: EF-2 — total map failure → layout only + PI_FUNCTIONAL_MAP_UNAVAILABLE (warn)

| Field | Value |
|-------|-------|
| **ID** | UT-29 |
| **Priority** | High |
| **Type** | Unit — Exception Flow |
| **Requirement** | UC-360-03 EF-2; FSD TC-360-18; FSD §9.1 ES-11; C-360-M1 event contract |
| **File** | same as UT-26 |
| **Preconditions** | SummaryTreeBuilder.build throws for the whole root (FM-06) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | buildSection with throwing builder | Result = layout ONLY (existing behavior, byte-identical layout text) |
| 2 | Event | PI_FUNCTIONAL_MAP_UNAVAILABLE (warn) { workspaceRoot, reason } emitted exactly once |
| 3 | Steering preserved | Tool result still usable — reviewer keeps read_method / find_tools steering |

**Test Data:** functional-map-testdata.csv row FM-06.
**Postconditions:** none.

---

### 2.6 Security remediation UTs (SEC-360-01 / SEC-360-07)

### UT-30: redactSecretLike — every deny-list family → [REDACTED]

| Field | Value |
|-------|-------|
| **ID** | UT-30 |
| **Priority** | High |
| **Type** | Unit — Security (SEC-360-01) |
| **Requirement** | SEC-360-01 remediation #1 (deny-list: sk-, AKIA, ghp_/gho_, xox[bap]-, BEGIN…PRIVATE KEY, password/passwd/secret/token/api-key assignments) |
| **File** | extension/src/pi-workflow/skeleton/__tests__/secret-redaction.test.ts |
| **Preconditions** | redactSecretLike implemented; samples from secret-redaction-testdata.csv |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply to combined sample containing ALL families (SEC-G) | Every occurrence replaced with [REDACTED]; zero deny-list matches remain |
| 2 | Case-insensitivity check | 'Password:' / 'API_KEY =' variants also redacted ((?i) flag family) |
| 3 | Structure preserved | Non-secret parts of the line (identifiers, braces) unchanged — signature stays parseable |

**Test Data:** secret-redaction-testdata.csv rows SEC-A..SEC-G.
**Postconditions:** none.

---

### UT-31: Secret-file name exclusion from skeleton corpus walk

| Field | Value |
|-------|-------|
| **ID** | UT-31 |
| **Priority** | High |
| **Type** | Unit — Security (SEC-360-01) |
| **Requirement** | SEC-360-01 remediation #2 — secret-file name exclusion (.env*, *.pem, *.key, id_rsa*, credentials*, *secret*), separate from EXCLUDED_DIRS |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-provider.test.ts |
| **Preconditions** | Fixture workspace containing .env, .env.local, server.pem, id_rsa, credentials.json, api-secret.ts + normal files (SEC-H) |

**Test Steps:**

| Step | Action | Expected Result |
|-------|--------|-----------------|
| 1 | Run corpus walk for skeleton build | Secret-named files NEVER enter the corpus (never sent to code_extract_signatures) |
| 2 | Confirm no regression | EXCLUDED_DIRS (.git/node_modules/out/dist) still excluded; normal files unaffected |
| 3 | Control | .env-style content never appears in skeleton output even indirectly |

**Test Data:** secret-redaction-testdata.csv row SEC-H.
**Postconditions:** none.

---

### UT-32: Secret in a signature line → [REDACTED] in skeleton (SEC-360-01 STP-recommended test)

| Field | Value |
|-------|-------|
| **ID** | UT-32 |
| **Priority** | High |
| **Type** | Unit — Security (SEC-360-01) |
| **Requirement** | SECURITY-REVIEW §SEC-360-01 recommendation #4 — config/keys.ts with const API_KEY = "sk-…" → skeleton must contain [REDACTED] |
| **File** | same as UT-11 |
| **Preconditions** | Fixture file config/keys.ts indexed with secret-bearing signature (SEC-I) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render skeleton including keys.ts | Rendered line contains [REDACTED]; the literal 'sk-…' value ABSENT |
| 2 | Redaction ordering | Redaction applied BEFORE trimSignature (secret prefix cannot survive the 120-char window) |

**Test Data:** secret-redaction-testdata.csv row SEC-I.
**Postconditions:** none.

---

### UT-33: Secret in RAW_HEAD content → [REDACTED] (redaction inside trimToTokenBudget)

| Field | Value |
|-------|-------|
| **ID** | UT-33 |
| **Priority** | High |
| **Type** | Unit — Security (SEC-360-01) |
| **Requirement** | SEC-360-01 vector 2 (RAW_HEAD head-of-file secrets) — redaction inside trimToTokenBudget |
| **File** | same as UT-11 |
| **Preconditions** | Grammar-less fixture file whose head-of-file declares a hardcoded secret (SEC-J) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Force RAW_HEAD fallback for the file | RAW_HEAD contribution contains [REDACTED]; secret literal absent |
| 2 | Token trim interplay | trimToTokenBudget applies AFTER redaction — no partial secret survives at a trim boundary |

**Test Data:** secret-redaction-testdata.csv row SEC-J.
**Postconditions:** none.

---

### UT-34: Control-character / zero-width strip (SEC-360-07)

| Field | Value |
|-------|-------|
| **ID** | UT-34 |
| **Priority** | Medium |
| **Type** | Unit — Security (SEC-360-07) |
| **Requirement** | SEC-360-07 remediation — strip control chars/zero-width (U+200B, U+202E RTL override, \x00-\x08) in trimSignature and trimToTokenBudget |
| **File** | same as UT-30 |
| **Preconditions** | Samples with hidden zero-width + control characters (SEC-K) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render signature containing U+200B + U+202E + \x00-\x08 | Output contains NONE of these characters |
| 2 | RAW_HEAD path | Same strip applied — no invisible payload reaches system context |
| 3 | Legitimate content | Normal ASCII/Unicode identifiers unaffected |

**Test Data:** secret-redaction-testdata.csv row SEC-K.
**Postconditions:** none.

---

## 3. Integration Tests (IT)

**Framework:** vitest with REAL components: createHost + shipped gates (session-budget-gate, intra-turn-budget-gate, transcript-compaction, TurnBudgetGuard) + in-process Hono backend app (app.request()) serving the real QueryLayer over a fixture SQLite index. ONLY the LLM provider is a scripted fake (CI has no llama-server). Any IT that mocks the DB/Hono/createHost chain instead of using real instances = Major defect (STP §8.3 quality gate).
**Location:** extension/src/pi-workflow/skeleton/__tests__/skeleton-wiring.integration.test.ts (+ read-method-chain.integration.test.ts).

### IT-01: createHost wiring — gate #2 measure == inject (byte-identical)

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration — Wiring (C-360-S2 / INV-2) |
| **Requirement** | C-360-S2; TDD §4.1 binding measurement semantics; FSD TC-360-01 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/skeleton-wiring.integration.test.ts |
| **Preconditions** | T8 wiring merged; fixture workspace indexed (FIX-01/02); budget @32k (BUD-07) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | createHost with instrumented gate (capture loadFiles entries) + captured agentsFilesOverride output | Skeleton + functional-map sections enter gate #2 as context-file entries measured by measureStaticAssembly with estimateTokenCount |
| 2 | Compare strings | Gate-entry content (measured) === injected virtual agentsFile '.pi/workspace-skeleton.md' content — BYTE-IDENTICAL (measure == inject) |
| 3 | Token accounting | skeletonTokens from gate measurement matches estimateTokenCount(injected string) exactly |

**Test Data:** budget-scenarios-testdata.csv row BUD-07; pre-seeded-index-fixtures.csv FIX-01/02.
**Postconditions:** session created normally.

---

### IT-02: Gate order — skeleton measured BEFORE createAgentSession

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration — Wiring (BR-360-01) |
| **Requirement** | BR-360-01 (measure BEFORE createAgentSession); FSD TC-360-04; TDD §2.2 wire sequence |
| **File** | same as IT-01 |
| **Preconditions** | Instrumented call-order log (resolveSessionGovernance → build → measure → createAgentSession) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | createHost on fixture workspace | Call order: resolveSessionGovernance → SkeletonProvider.getSections → runSessionBudgetGate (measureStaticAssembly) → SessionConfigurator.createAgentSession |
| 2 | Assert ordering | measurement timestamp/sequence index < createAgentSession index — no provider call precedes measurement |
| 3 | Telemetry | PI_GATE_DECISION enriched { skeletonTokens, usagePercent, truncationApplied, measurementPoint: 'turn-start gate #2, before createAgentSession' } (OI-5) |

**Test Data:** budget-scenarios-testdata.csv row BUD-08.
**Postconditions:** none.

---

### IT-03: Forced oversized skeleton → REJECT; provider NEVER called

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration — Exception Flow (BR-360-02 / BR-09) |
| **Requirement** | UC-360-01 EF-1; FSD TC-360-03; FSD §9.1 ES-1; UC-360-05 AC 3 |
| **File** | same as IT-01 |
| **Preconditions** | Test harness forces skeleton content > staticBudget AFTER truncation (TRC-11); scripted fake provider records every invocation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | createHost with forced 30,000-token skeleton (cap 13,767) | PiContextBudgetExceededError thrown by the shipped gate path; PI_CONTEXT_BUDGET_EXCEEDED logged { staticTokens, staticBudget, nCtx } — shape unchanged |
| 2 | Inspect fake provider invocation log | 0 calls — the provider is NEVER invoked with an oversized prompt (BR-09 fail-safe dominance) |
| 3 | BR-08 ladder check | Escalation attempts (compress → drop steering → min loadout) logged BEFORE the REJECT |

**Test Data:** truncation-scenarios-testdata.csv row TRC-11.
**Postconditions:** no session created; no partial state.

---

### IT-04: read_method → code_symbol_locate chain over in-process backend (real QueryLayer)

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Integration — Tool Chain |
| **Requirement** | UC-360-02 Main Flow; C-360-R1/R2; DISC-1 (code_symbol_locate); FSD TC-360-07 |
| **File** | extension/src/pi-workflow/skeleton/__tests__/read-method-chain.integration.test.ts |
| **Preconditions** | In-process Hono app with registered tools + fixture SQLite index (FIX-11); McpSymbolLocator pointed at the in-process app |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | execute read_method { class: 'ReadMethodTool', method: 'create' } end-to-end through the real chain (tool → McpSymbolLocator → JSON-RPC tools/call code_symbol_locate → QueryLayer.locateSymbol SQL → files JOIN) | status 'ok' |
| 2 | Validate envelope against index | filePath/startLine/endLine/lineCount match FIX-11 exactly; sourceSlice = lines 40..88 of the fixture file |
| 3 | Loopback contract | Request carries X-Session-Nonce header; wrapper URL loopback-validated |

**Test Data:** read-method-testdata.csv row RM-14; pre-seeded-index-fixtures.csv FIX-11.
**Postconditions:** none.

---

### IT-05: Gate #3 absorption — read_method results compactable (BR-360-04)

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Type** | Integration — Governance Interaction |
| **Requirement** | BR-360-04; UC-360-02 Step 7; UC-360-05 AC 4; FSD TC-360-20; FSD §9.1 ES-2 |
| **File** | same as IT-01 |
| **Preconditions** | Transcript seeded with pinned newest user message + multiple read_method tool units; forced incompressible tool result (RM-15) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stream next request through Agent.streamFn with oversized accumulated tool results | governIntraTurnRequest measures → COMPACT: trim-oldest tool-unit ATOMIC drop (assistant toolCall + its toolResult together) |
| 2 | Pinned user rule | Newest user message preserved (userReserveTokens) after compaction |
| 3 | REJECT boundary | REJECT (PiContextBudgetExceededError) raised ONLY when the pinned user query itself cannot fit; provider never sees the oversized request |
| 4 | Tool-unit atomicity | No orphaned toolCall-without-result / result-without-call in the compacted transcript |

**Test Data:** read-method-testdata.csv row RM-15.
**Postconditions:** transcript compacted; turn continues (or REJECT in the pinned-query case).

---

### IT-06: TurnBudgetGuard interplay — 4× identical read_method → steer → abort (BR-11)

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High |
| **Type** | Integration — Governance Interaction |
| **Requirement** | UC-360-02 AF-3; FSD TC-360-11; FSD §9.1 ES-12; BR-11 (no NEW loop protection — shipped guard only) |
| **File** | same as IT-01 |
| **Preconditions** | Fake agent loop emitting identical (read_method, args) calls; DEFAULT_MAX_SAME_TOOL_REPEATS = 4 (RM-16) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Repeat read_method { class: X, method: Y } 3× | No steer — identical count 3 < 4 |
| 2 | 4th identical call | Steer correction injected (guard fires at 4) |
| 3 | Persistent repetition | Abort — turn ends with actionable guard event |
| 4 | Control: 4 calls with DIFFERENT args | No steer (guard counts identical tool+args signatures only) — proves no new/parallel loop logic was added |

**Test Data:** read-method-testdata.csv row RM-16.
**Postconditions:** none.

---

### IT-07: Escalation ladder BR-08 exercised over skeleton content

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | Medium |
| **Type** | Integration — Governance Interaction |
| **Requirement** | BR-08 (compress → drop steering → min loadout → error); UC-360-05; TDD §2.2 step 6 |
| **File** | same as IT-01 |
| **Preconditions** | Progressive oversized static-content scenarios (BUD-08 ladder harness) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Total static slightly over budget | Ladder step 1: compressPrompt applied to static content (incl. skeleton) — session proceeds if it fits |
| 2 | Still over | Step 2: steering dropped; Step 3: min tool loadout |
| 3 | Still over | REJECT PiContextBudgetExceededError — ladder order strictly respected, no step skipped |

**Test Data:** budget-scenarios-testdata.csv row BUD-08.
**Postconditions:** per scenario.

---

### IT-08: Multi-root cache isolation (OI-3)

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | Medium |
| **Type** | Integration — Isolation |
| **Requirement** | TDD §3 OI-3 (single-active-root; per-root isolation safe by construction); SECURITY-REVIEW SEC-360-08 #11 |
| **File** | same as IT-01 |
| **Preconditions** | Two fixture roots A and B with different files (FIX-05, FIX-06) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Build skeleton + map for root A, then root B | Each root gets its own cache/host entry — no cross-root pollution |
| 2 | Invalidate/mutate root A artifact | Root B artifact unchanged (skeleton content of B does not contain A files) |
| 3 | layoutCache keys | Two distinct entries keyed by workspaceRoot; clearLayoutCache() clears BOTH |

**Test Data:** pre-seeded-index-fixtures.csv rows FIX-05, FIX-06.
**Postconditions:** none.

---

### IT-09: Bridge-absent degradation — fail-safe, never crash

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | High |
| **Type** | Integration — Exception Flow |
| **Requirement** | TDD §4.6 (optional DI; absent ⇒ DEGRADED_NO_SKELETON + INDEX_UNAVAILABLE steering); UC-360-01 EF-2 / UC-360-02 EF-3 |
| **File** | same as IT-01 |
| **Preconditions** | SessionHostOptions WITHOUT mcpBridge (FRS-06; FIX-07) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | createHost without mcpBridge | gateDecision = 'DEGRADED_NO_SKELETON'; session STILL created (no throw) |
| 2 | Functional map | Layout-only section (map omitted, no crash) |
| 3 | read_method call | INDEX_UNAVAILABLE steering envelope; turn continues |
| 4 | Backend unreachable variant (server stopped) | Wrapper fails FAST (no retry loop, TDD §7.4) → same degradation |

**Test Data:** index-freshness-testdata.csv row FRS-06; pre-seeded-index-fixtures.csv FIX-07.
**Postconditions:** session active in degraded mode.

---

### IT-10: Shared sections build — one SummaryTreeBuilder build per 60s TTL window (C-360-M2 AF-3)

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | Medium |
| **Type** | Integration — Cache Contract |
| **Requirement** | C-360-M2; UC-360-03 AF-2/AF-3; BRD Story 3 AC 2 (60s cache preserved); FSD TC-360-16 |
| **File** | same as IT-01 |
| **Preconditions** | Assembly path + tool path wired to the SAME shared sections function (FM-07) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | createHost (assembly) then immediate get_workspace_info call | SummaryTreeBuilder.build invoked ONCE for both paths (assert call count = 1) |
| 2 | Second tool call within 60s | Served from layoutCache — mapTokens identical, no rebuild |
| 3 | Layout regression check | Layout text byte-identical to the pre-SA4E-360 format (existing callers unaffected) |

**Test Data:** functional-map-testdata.csv row FM-07.
**Postconditions:** cache entry { at, text, map } present.

---

### IT-11: Golden query set hit-rate ≥ 80% top-5 (M2)

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Priority** | High |
| **Type** | Integration — Metric M2 |
| **Requirement** | M2 (≥ 80% top-5); UC-360-02; FSD TC-360-09; OI-4 scope (indexed symbols only) |
| **File** | same as IT-04 |
| **Preconditions** | Golden query set frozen (golden-query-set.csv — 12 queries incl. 1 negative control); fixture index populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute all 12 golden queries through ReadMethodTool with the REAL locator chain | Per-query status recorded (ok / ambiguous / not_found) |
| 2 | Compute hit-rate | ok-status ratio ≥ 80% (with 11/12 resolvable + 1 designed miss = 91.7%) |
| 3 | Negative control (GQ-12) | Returns not_found WITH suggestions — counted as miss; proves the set discriminates |

**Test Data:** golden-query-set.csv rows GQ-01..GQ-12.
**Postconditions:** PI_READ_METHOD_RESULT events recorded for M2 evidence.

---

### IT-12: Skeleton coverage ≥ 95% of exported symbols (M1)

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Priority** | High |
| **Type** | Integration — Metric M1 |
| **Requirement** | M1 (≥ 95%); BRD Story 1 AC 5; FSD TC-360-14; fallback share reported separately |
| **File** | same as IT-01 |
| **Preconditions** | Fixture workspace with two modules totalling 20 indexed exported symbols (FIX-08, FIX-09) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Build skeleton; extract rendered symbol names | Coverage = rendered exported symbols / symbols-table exported symbols ≥ 95% (≥ 19/20) |
| 2 | Fallback accounting | fallback share (REGEX_SIGNATURES/RAW_HEAD files) reported separately in PI_SKELETON_FALLBACK count + PI_SKELETON_BUILT.fallbackFiles |
| 3 | Scope note | Fallback-extracted symbols are TRANSIENT (OI-4) — not counted against M2, only against M1 coverage |

**Test Data:** pre-seeded-index-fixtures.csv rows FIX-08, FIX-09.
**Postconditions:** none.

---

## 4. E2E-API Tests (Real Backend Server)

**Framework:** vitest + fetch against the REAL loopback backend MCP server (JSON-RPC POST /mcp) — NO mock-all. Real QueryLayer over fixture indexes on BOTH engines (SQLite SCHEMA_V1 + symbols_fts; PostgreSQL adapter). Location: backend/tests/e2e/sa4e-360-tools.e2e.test.ts (pattern follows existing backend/tests/e2e/mcp-api.e2e.test.ts).
**Quality gate:** any E2E-API test that mocks QueryLayer/HTTP/DB = Major defect.

### E2E-API-01: /mcp tools/list — new tools registered, existing surface unchanged

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | E2E-API — Registration Lifecycle |
| **Requirement** | TDD §4.2/§4.3 (code_symbol_locate, code_extract_signatures in register-tools.ts); DISC-1/DISC-2 |
| **File** | backend/tests/e2e/sa4e-360-tools.e2e.test.ts |
| **Preconditions** | Backend server booted on loopback with SQLite fixture index (FIX-10) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp JSON-RPC tools/list | Response includes code_symbol_locate and code_extract_signatures |
| 2 | Validate schemas | locate: { class: string min 1, method: string min 1, limit?: number default 25, __projectId?: string }; extract: { files: array(max 50) of { path, language }, __projectId? } |
| 3 | Regression | Pre-existing tools (code_symbols, code_search, code_index_status) still listed with unchanged schemas |

**Test Data:** pre-seeded-index-fixtures.csv row FIX-10.
**Postconditions:** none.

---

### E2E-API-02: code_symbol_locate exact match on real QueryLayer (SQLite)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | E2E-API — Query Lifecycle |
| **Requirement** | TDD §4.2 (locateSymbol SQL); UC-360-02; FSD TC-360-07 |
| **File** | same as E2E-API-01 |
| **Preconditions** | Fixture symbol createReadMethodTool @ read-method-tool.ts lines 40..88, line_count 120 (FIX-11) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | tools/call code_symbol_locate { class: 'ReadMethodTool', method: 'create' } | Compact JSON array with EXACTLY 1 row |
| 2 | Validate row | { name: 'create', kind: 'method', signature, filePath, startLine: 40, endLine: 88, lineCount: 120, parentSymbol: 'ReadMethodTool' } |
| 3 | Lifecycle completeness | Create fixture → index → locate → assert → cleanup re-index; full cycle on the real server |

**Test Data:** read-method-testdata.csv row RM-17; FIX-11.
**Postconditions:** none.

---

### E2E-API-03: code_symbol_locate ambiguous / not_found + classMethods enrichment

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | E2E-API — Query Lifecycle |
| **Requirement** | UC-360-02 AF-1/AF-4/EF-1; TDD §4.2 (classMethods in ONE call) |
| **File** | same as E2E-API-01 |
| **Preconditions** | Fixture with 2 overload rows for (Parser, parse); class SymbolOutlineExtractor with ≥ 10 methods |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | locate { class: 'Parser', method: 'parse' } (RM-18) | 2 rows (ambiguous at tool level — extension renders the AMBIGUOUS envelope) |
| 2 | locate { class: 'SymbolOutlineExtractor', method: 'missingMethod' } (RM-19) | 0 symbol rows + classMethods array (top 10 indexed methods of the class) |
| 3 | locate { class: 'Ghost', method: 'x' } | 0 rows, NO classMethods key |

**Test Data:** read-method-testdata.csv rows RM-18, RM-19.
**Postconditions:** none.

---

### E2E-API-04: Dual-engine parity — PostgreSQL adapter returns identical rows

| Field | Value |
|-------|-------|
| **ID** | E2E-API-04 |
| **Priority** | Medium |
| **Type** | E2E-API — Compatibility (DISC-6 / P-8) |
| **Requirement** | FSD §1.3 dual-engine; TDD P-8 (engine-agnostic QueryLayer); FSD §5.1 |
| **File** | same as E2E-API-01 |
| **Preconditions** | Second server instance on PostgreSQL with the SAME fixture set (FIX-12) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the E2E-API-02/03 query set against the PostgreSQL instance | Row-for-row identical results (same filePath/startLine/endLine/lineCount/parentSymbol) |
| 2 | ILIKE fallback path | No FTS5-specific SQL executed — all queries via QueryLayer/DialectHelper (no raw FTS5 in results path) |

**Test Data:** read-method-testdata.csv row RM-20; pre-seeded-index-fixtures.csv FIX-12.
**Postconditions:** none.

---

### E2E-API-05: code_extract_signatures happy path — parseSearchText-compatible output

| Field | Value |
|-------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | E2E-API — Fallback Extraction (C-360-F1) |
| **Requirement** | UC-360-04; BR-360-03; TDD §4.3; FSD TC-360-12 |
| **File** | same as E2E-API-01 |
| **Preconditions** | Fixture Svelte file with extractable signatures (FB-07) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | tools/call code_extract_signatures { files: [{ path: 'Component.svelte', language: 'svelte' }] } | Text in code_search style: '[function] load' / 'File: Component.svelte:12' / 'Sig: export function load(...)' |
| 2 | Parse with the EXISTING parseSearchText | Yields SearchCandidate[] with REAL line numbers (1 ≤ line ≤ fileLines); source 'code_search' |
| 3 | Empty pattern set variant | Language with no patterns → '[]' result → extension goes straight to RAW_HEAD |

**Test Data:** skeleton-fallback-testdata.csv row FB-07.
**Postconditions:** none.

---

### E2E-API-06: code_extract_signatures fail-soft batch + 1 MB server-side cap

| Field | Value |
|-------|-------|
| **ID** | E2E-API-06 |
| **Priority** | Medium |
| **Type** | E2E-API — Resilience |
| **Requirement** | TDD §4.3 (≤ 50 files/batch, fail-soft, 1 MB read cap, skipped[]); FSD TC-360-13 |
| **File** | same as E2E-API-01 |
| **Preconditions** | Batch of 3: 1 healthy grammar-less file, 1 unreadable, 1 > 1 MB (FB-08) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Single call with the 3-file batch | Healthy file extracted; unreadable + oversized in skipped[] |
| 2 | Assert batch semantics | HTTP 200 (never 5xx); response contains per-file skip reasons |
| 3 | Oversized file read bound | Server-side read stops at 1,048,576 bytes (SEC-325-D3 server twin) — no full multi-GB read |

**Test Data:** skeleton-fallback-testdata.csv row FB-08.
**Postconditions:** none.

---

### E2E-API-07: Backend containment twin — 4 attack vectors rejected (SEC-360-04)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | E2E-API — Security (SEC-360-04) |
| **Requirement** | SEC-360-04 remediation — backend MUST port all 4 layers of path-containment.ts: null-byte, UNC, lexical isWithin (dotdot), realpath symlink-follow-within |
| **File** | same as E2E-API-01 |
| **Preconditions** | Fixture workspace + hostile path list (backend-security-testdata.csv BV-03..BV-07) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | files: [{ path: 'C:\\projects\\secrets.txt', language: 'ts' }] (absolute outside root) | File in skipped[] — ZERO signature lines returned; no read performed |
| 2 | path containing null byte ('fixture\\0.txt') | Rejected (null-byte check) — in skipped[] |
| 3 | UNC path ('\\\\server\\share\\file.ts') | Rejected (UNC check) — in skipped[] |
| 4 | dotdot traversal ('..\\..\\secrets.txt') | Rejected (lexical isWithin after resolve) — in skipped[] |
| 5 | Symlink inside root pointing outside | Rejected (realpathSync follow-within check) — in skipped[] |
| 6 | Control: legitimate contained file | Extracted normally (no false positive) |

**Test Data:** backend-security-testdata.csv rows BV-03..BV-07.
**Postconditions:** none. Any outside-root content in a response = Critical security defect.

---

### E2E-API-08: Loopback wrapper timeout / retry semantics

| Field | Value |
|-------|-------|
| **ID** | E2E-API-08 |
| **Priority** | Medium |
| **Type** | E2E-API — Resilience (§7.4) |
| **Requirement** | FSD §5.4 (searchTimeoutMs 2,000; 1 retry after 200ms backoff); TDD §7.4; UC-360-02 EF-3 |
| **File** | same as E2E-API-01 |
| **Preconditions** | Loopback stub endpoint on 127.0.0.1 that delays 3 s before responding (real HTTP server — simulates network conditions, not a mock of the SUT) (FRS-07/FRS-08) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call locate via wrapper pointing at the 3s-delay stub | withRetry fires: exactly 2 attempts (1 original + 1 retry) then give up |
| 2 | Terminal state | INDEX_UNAVAILABLE steering result (extension side); no hang beyond ~2s×2 + backoff |
| 3 | Connection-refused variant (backend stopped) | Fail FAST — no retry loop; degradation per §7.4 |

**Test Data:** index-freshness-testdata.csv rows FRS-07, FRS-08.
**Postconditions:** none.

---

### E2E-API-09: Tenant isolation — __projectId scope on real server (SA4E-41)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-09 |
| **Priority** | Medium |
| **Type** | E2E-API — Security (Tenant Isolation) |
| **Requirement** | TDD §4.2 input schema (__projectId injected); SECURITY-REVIEW SEC-360-08 #12; code-symbols.ts L18 pattern |
| **File** | same as E2E-API-01 |
| **Preconditions** | Fixture index with symbols under project A and project B (BV-08) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | locate { class, method } with __projectId = 'A' where the symbol exists only in B | 0 rows — no cross-tenant leak |
| 2 | Same query with __projectId = 'B' | 1 row (correct tenant) |

**Test Data:** backend-security-testdata.csv row BV-08.
**Postconditions:** none.

---

### E2E-API-10: Rate limit on /mcp (SEC-360-03 remediation)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-10 |
| **Priority** | Medium |
| **Type** | E2E-API — Security (SEC-360-03) |
| **Requirement** | SEC-360-03 remediation #1 — rateLimiter attached to /mcp/* (pattern reused from server/middleware/rate-limiter.ts) |
| **File** | same as E2E-API-01 |
| **Preconditions** | Server with /mcp rate limit configured (threshold from middleware config); fixture index (BV-09/BV-10) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fire 60 rapid tools/list calls in a burst | Calls beyond the configured threshold receive 429 (or middleware-blocked response) |
| 2 | After the rate-limit window passes | Legitimate call succeeds again (200) — limiter recovers, no permanent lockout |

**Test Data:** backend-security-testdata.csv rows BV-09, BV-10.
**Postconditions:** none.

---

### E2E-API-11: LIKE wildcard sanitization in findSymbols (SEC-360-05)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-11 |
| **Priority** | Medium |
| **Type** | E2E-API — Security (SEC-360-05) |
| **Requirement** | SEC-360-05 remediation — sanitizeLikeQuery applied to findSymbols/listModulesWithPatterns; locateSymbol is equality-based (clean by design) |
| **File** | same as E2E-API-01 |
| **Preconditions** | Fixture symbols named alpha_method, beta_method (FIX-14); no symbol named '%' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | code_symbols { name: '%' } | Sanitized to a LITERAL '%'-prefix match → 0 rows returned (NOT a full-table enumeration) |
| 2 | code_symbols { name: 'alpha_method' } | Exact-prefix behavior preserved — 1 row |
| 3 | code_symbols { name: 'alpha_method' } with injected '%' ('alpha_method%') | Treated literally → 0 rows (no wildcard escalation) |

**Test Data:** backend-security-testdata.csv rows BV-11, BV-12; pre-seeded-index-fixtures.csv FIX-14.
**Postconditions:** none.

---

### E2E-API-12: Locate latency benchmark — p95 ≤ 300 ms (M4)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-12 |
| **Priority** | High |
| **Type** | E2E-API — Performance (M4) |
| **Requirement** | M4 (p95 FTS5 ≤ 300 ms); UC-360-02; FSD §8; FSD TC-360-08 |
| **File** | same as E2E-API-01 |
| **Preconditions** | Golden query set (12 queries); warm index; 20 iterations per query |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute 12 golden queries × 20 iterations against the real server | 240 measured latencies (fetch round-trip; consistent with PI_READ_METHOD_RESULT.durationMs) |
| 2 | Compute p95 | p95 ≤ 300 ms |
| 3 | Record distribution | Latency table stored as evidence for the TEST-REPORT |

**Test Data:** golden-query-set.csv (test_case_id 'IT-11;E2E-API-12').
**Postconditions:** none. Hybrid ≤ 1.5 s target NOT measured (P2 scope — BRD §2.5).

---

## 5. E2E-UI Tests (Playwright — minimal by design)

**"No UI changes" invariant (FSD §3.x.6):** SA4E-360 adds no screens, dialogs, or controls. The only user-visible effects are behavioral (chat:error REJECT message — covered manually in SIT-05) and tool activity in the existing transcript. E2E-UI therefore verifies NON-regression only.
**Location:** tests/e2e/sa4e-360-ui.e2e.test.ts (Playwright). Reuses existing chat-panel helpers where available.

### E2E-UI-01: SA4E-355 context-usage indicators — zero regression with skeleton injected

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | Medium |
| **Type** | E2E-UI — Regression / UI |
| **Requirement** | FSD §3.1.6 (no UI changes); BRD Story 5 AC 1; UC-360-05 |
| **File** | tests/e2e/sa4e-360-ui.e2e.test.ts |
| **Scenario** | "context-usage indicators render unchanged when a skeleton session is active" |
| **Preconditions** | Extension webview open; skeleton session created against fixture workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open chat panel with an active skeleton session | SA4E-355 context-usage indicator elements render (same selectors/visibility as baseline snapshot) |
| 2 | Send one review turn | Indicator updates as before — no layout shift, no new controls, no missing elements |
| 3 | Snapshot diff | DOM snapshot of the indicator region matches the SA4E-355 baseline (allowed diff: none) |

**Postconditions:** none. **Reuses:** existing chat-panel page helpers.

---

### E2E-UI-02: read_method / get_workspace_info appear as ordinary transcript tool activity

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-02 |
| **Priority** | Medium |
| **Type** | E2E-UI — Regression / UI |
| **Requirement** | FSD §3.2.6 / §3.3.6 (tool results visible only in the existing transcript); BR-360-04 |
| **File** | tests/e2e/sa4e-360-ui.e2e.test.ts |
| **Scenario** | "agent tool activity renders in the existing transcript with no new UI surfaces" |
| **Preconditions** | Session active; scripted agent performs one get_workspace_info + one read_method call |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger the tool calls in the session | Transcript shows ordinary tool-result entries for both tools (existing tool-entry rendering) |
| 2 | Assert absence of new surfaces | No new panels, dialogs, buttons, or tabs appear after SA4E-360 wiring |
| 3 | read_method rendering | Slice content rendered as a normal tool result (truncation at MAX_TOOL_RESULT_CHARS if applicable) |

**Postconditions:** none. **Reuses:** existing transcript helpers.

---

## 6. System Integration Tests (SIT — Manual)

**Environment:** Windows dev machine — VS Code + SA4E extension build; llama-server qwen 32k (contextWindow 32,768 / maxOutput 2,048); code-intel backend loopback, index fresh on a representative workspace (≥ 200 files incl. Svelte/grammar-less + config/keys.ts fixture). Execution checklist + evidence paths: testdata/sit-checklist-testdata.csv. Evidence stored in documents/SA4E-360/evidence/.

### SIT-01: Skeleton injection visible in system context (turn-1, qwen 32k)

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual SIT — Functional Demo (M5/M6 evidence) |
| **Requirement** | UC-360-01 Main; BRD Story 1 AC 1/2; FSD TC-360-01; M6 |
| **Preconditions** | All automated levels green; llama-server up; backend indexed; STC checklist loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a turn-1 workspace-review request ("Review the architecture of this workspace") | Session creates; reviewer answers architecture-level questions WITHOUT whole-file reads |
| 2 | Inspect extension log | PI_SKELETON_BUILT (info) with { workspaceRoot, files, symbols, skeletonTokens, staticBudget, fallbackFiles, skippedFiles, gateDecision, durationMs } |
| 3 | Verify budget oracle | skeletonTokens ≤ 13,767 and staticBudget = 19,668 (@32k resolver-true); PI_GATE_DECISION enriched payload shows usagePercent ≤ 0.70 (M6) |
| 4 | Verify M5 baseline | 0 × exceed_context_size_error in the run log |

**Evidence:** evidence/SIT-01-skeleton-injection.png + log excerpt. **Postconditions:** session active.

---

### SIT-02: Functional map served inside get_workspace_info (chat exploration)

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual SIT — Functional Demo |
| **Requirement** | UC-360-03 Main; BRD Story 3 AC 1; FSD TC-360-15; C-360-M1 |
| **Preconditions** | SIT-01 session active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask the reviewer to call get_workspace_info ("Map the workspace before reviewing") | Tool result contains the existing layout PLUS a functional-map section (module → summary → keySymbols) |
| 2 | Validate entries | Modules are real workspace paths; keySymbols are real symbols the reviewer can then target via read_method |
| 3 | Check bounds | Map section ≤ 1,500 tokens; whole tool result ≤ 16,000 chars |
| 4 | Repeat call within 60s | Second call served from cache (no rebuild — faster, identical content) |

**Evidence:** evidence/SIT-02-functional-map.png. **Postconditions:** none.

---

### SIT-03: Degraded mode — stale index recovery and re-index failure fallback

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | Manual SIT — Exception Demo |
| **Requirement** | UC-360-01 EF-2; UC-360-02 AF-2; FSD TC-360-05; FSD §9.1 ES-3 |
| **Preconditions** | Session host freshly creatable; ability to touch/edit workspace files (FRS-09) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edit a source file (content change), then start a NEW session | PI_SKELETON_INDEX_STALE (warn) { staleFiles ≥ 1, action: 'reindex' }; on-demand re-index runs (changed files only); session builds a CORRECT skeleton (updated symbols included) |
| 2 | read_method on the changed file | Fresh slice reflecting the new content (recovery worked end-to-end) |
| 3 | Force re-index failure (stop backend before recovery), start another session | Session proceeds WITHOUT skeleton (DEGRADED_NO_SKELETON); reviewer steered to get_workspace_info + read_method; NEVER a silent oversize or REJECT for missing content |

**Evidence:** evidence/SIT-03-degraded-mode.png + log excerpt. **Postconditions:** backend restarted.

---

### SIT-04: Multi-turn review session on qwen 32k — 0 × exceed_context_size_error

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | High |
| **Type** | Manual SIT — Governance Regression Demo (M5) |
| **Requirement** | UC-360-05 AC 2/AC 4; M5; FSD TC-360-19/20; BR-09 |
| **Preconditions** | SIT-01 workspace; ≥ 10-turn review script mixing read_method + get_workspace_info + follow-ups |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run a 10-turn review session (skeleton static context + growing tool traffic) | 0 × exceed_context_size_error end-to-end |
| 2 | Inspect log for gate #3 activity | When tool traffic grows: PI_LEGACY_HISTORY_COMPACTED / transcript compaction events with atomic tool-unit drops; pinned user messages preserved |
| 3 | Skeleton stability | Skeleton telemetry unchanged across turns (static context never grows — INV-1) |

**Evidence:** evidence/SIT-04-multiturn-32k.png + full run log. **Postconditions:** none.

---

### SIT-05: REJECT surface — chat:error + provider never called (cross-process proof)

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | High |
| **Type** | Manual SIT — Exception Demo (BR-09 user-visible path) |
| **Requirement** | UC-360-01 EF-1; BR-360-02/BR-09; FSD TC-360-03; FSD §9.2 |
| **Preconditions** | Debug harness able to force an oversized skeleton in the real extension session; llama-server request log accessible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger a session with a forced oversized skeleton | User sees the existing actionable chat:error message PI_CONTEXT_BUDGET_EXCEEDED (BR-09 shape) |
| 2 | Inspect llama-server request log | ZERO inference requests for the rejected turn — provider never called oversized |
| 3 | Recovery path | User narrows review scope → next session creates normally |

**Evidence:** evidence/SIT-05-reject-surface.png + llama-server log excerpt. **Postconditions:** none.

---

### SIT-06: Findings parity — skeleton + targeted reads vs full-context baseline (M3)

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | High |
| **Type** | Manual SIT — Metric M3 |
| **Requirement** | M3 (≥ 80%); BRD §2.5; FSD TC-360-21 |
| **Preconditions** | Fixed 10-file subset agreed and frozen; two review passes (A: skeleton + read_method; B: full-context baseline) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pass A: review the 10-file subset in a skeleton session (targeted reads only) | Findings list recorded (file + issue) |
| 2 | Pass B: same subset with full-file context (baseline) | Findings list recorded |
| 3 | Compare | Matched findings / baseline findings ≥ 80%; unmatched A-findings reviewed for false positives |
| 4 | Record | Parity value + methodology note stored in TEST-REPORT |

**Evidence:** evidence/SIT-06-findings-parity.png + parity worksheet. **Postconditions:** none.

---

### SIT-07: Skeleton observability — PI_SKELETON_* family + fallback share (UC-360-04 telemetry)

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Priority** | Medium |
| **Type** | Manual SIT — Observability |
| **Requirement** | C-360-S3; BRD §6 observability NFR; UC-360-04 AC 2 (fallback share visible); FSD TC-360-14 |
| **Preconditions** | Workspace includes grammar-less (Svelte) files (FB-09) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Review a workspace containing Svelte files; inspect extension log | PI_SKELETON_FALLBACK per fallback file { filePath, language, fallbackMode }; fallbackFiles count in PI_SKELETON_BUILT |
| 2 | Confirm degradation events | PI_SKELETON_FILE_SKIPPED (warn) entries for skipped files with reasons |
| 3 | Privacy check | Log payloads contain counts/decisions ONLY — no code bodies, no secrets (SEC-360-01 hygiene) |

**Evidence:** evidence/SIT-07-telemetry-fallback.png. **Postconditions:** none.

---

### SIT-08: Code standards compliance spot-check (TDD §12 DoD)

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Priority** | Medium |
| **Type** | Manual SIT — Compliance |
| **Requirement** | UC-360-05 AC 5 + DEV constraint; FSD TC-360-22; BR-360-05/BR-11 (no new engine/router/estimator/dependency) |
| **Preconditions** | DEV T1–T9 merged |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure new modules (8 skeleton files + 2 backend tools) | Every file ≤ 200 lines; every exported function ≤ 20 lines |
| 2 | TSDoc check | Every export documented |
| 3 | Dependency + reuse audit | package.json diff = NO new dependencies; skeleton reuses SymbolOutlineExtractor / signature-extractor / SummaryTreeBuilder / existing estimator (no parallel token math) |

**Evidence:** evidence/SIT-08-code-standards.png + audit table. **Postconditions:** none.

---

## 7. Requirements Traceability Matrix (RTM)

### 7.1 Use Cases (BRD Stories 1–5 ↔ FSD UC-360-01..05)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-360-01 Skeleton injection | FSD §3.1 / BRD Story 1 | PBT-01..07, UT-01..05, UT-11..16, IT-01..03, IT-12, SIT-01, SIT-04 | ✅ |
| UC-360-02 read_method | FSD §3.2 / BRD Story 2 | UT-17..25, IT-04..06, IT-11, E2E-API-02..04, E2E-API-09, E2E-API-12, E2E-UI-02 | ✅ |
| UC-360-03 Functional map | FSD §3.3 / BRD Story 3 | UT-26..29, IT-10, SIT-02, E2E-UI-02 | ✅ |
| UC-360-04 Regex fallback | FSD §3.4 / BRD Story 4 | UT-13, UT-14, E2E-API-05, E2E-API-06, SIT-07 | ✅ |
| UC-360-05 Governance regression | FSD §3.5 / BRD Story 5 | IT-03, IT-05..07, IT-09, SIT-04, SIT-05, E2E-UI-01 | ✅ |

### 7.2 Business Rules — New (BR-360-01..05)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| BR-360-01 ≤ 70% staticBudget, measured before createAgentSession | FSD §3.1.3 | PBT-01..03, PBT-06, PBT-07, UT-01, IT-02 | ✅ |
| BR-360-02 Fail-safe REJECT after truncation | FSD §3.1.3 | PBT-05, PBT-06, UT-04, IT-03, SIT-05 | ✅ |
| BR-360-03 Grammar-less fallback never blocks | FSD §3.4.3 | UT-13, UT-14, E2E-API-05, E2E-API-06, SIT-07 | ✅ |
| BR-360-04 read_method = ordinary tool result (gate #3 + compaction) | FSD §3.2.3 | IT-05, IT-06, E2E-UI-02 | ✅ |
| BR-360-05 Reuse existing modules — no new engine/router/estimator | FSD §3.1.3 | IT-01 (single estimator), IT-09, SIT-08 | ✅ |

### 7.3 Business Rules — Inherited (SA4E-355)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| BR-01 nCtx > 0 fallback chain | SA4E-355 FSD §3.8 | PBT-03 (step 5) | ✅ |
| BR-02 margin = ceil(nCtx × 0.08) | SA4E-355 FSD §3.8 | PBT-01..03 | ✅ |
| BR-09 provider NEVER called oversized | SA4E-355 FSD §3.8 | IT-03, IT-05, SIT-05 | ✅ |
| BR-11 wire-only; shipped TurnBudgetGuard only | SA4E-355 FSD §3.8 | IT-06 (step 4), SIT-08 | ✅ |

### 7.4 API Contracts (FSD §3.x.5)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| C-360-S1 Skeleton build service | FSD §3.1.5 | UT-11, UT-12, IT-01 | ✅ |
| C-360-S2 Measure + inject ordering | FSD §3.1.5 | IT-01, IT-02 | ✅ |
| C-360-S3 Telemetry events (PI_SKELETON_*) | FSD §3.1.5 | UT-03, UT-14, SIT-07 | ✅ |
| C-360-R1 read_method registration/schema | FSD §3.2.5 | UT-17, IT-04, E2E-API-01 | ✅ |
| C-360-R2 Execution contract + envelopes | FSD §3.2.5 | UT-18..23, IT-04, E2E-API-02/03 | ✅ |
| C-360-M1 Extended get_workspace_info + caps | FSD §3.3.5 | UT-26, UT-27, SIT-02 | ✅ |
| C-360-M2 Shared cache (60s TTL) | FSD §3.3.5 | UT-26, IT-10 | ✅ |
| C-360-F1 Fallback invocation path | FSD §3.4.5 | UT-13, E2E-API-05, E2E-API-06 | ✅ |

### 7.5 Security Requirements (SECURITY-REVIEW SEC-360-01..08)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| SEC-360-01 Secret redaction + file exclusion | SECURITY-REVIEW §SEC-360-01 | PBT-09, UT-30, UT-31, UT-32, UT-33 | ✅ |
| SEC-360-02 Global budget bound + O(parts) truncator + termination | SECURITY-REVIEW §SEC-360-02 | PBT-04, PBT-05, PBT-10, UT-01..05 | ✅ |
| SEC-360-03 Rate limit /mcp + reindex cooldown | SECURITY-REVIEW §SEC-360-03 | UT-10, E2E-API-08, E2E-API-10 | ✅ |
| SEC-360-04 Backend containment twin — 4 vectors | SECURITY-REVIEW §SEC-360-04 | UT-24, E2E-API-07 | ✅ |
| SEC-360-05 LIKE wildcard sanitization | SECURITY-REVIEW §SEC-360-05 | E2E-API-11 | ✅ |
| SEC-360-06 MAX_SLICE cap for read_method | SECURITY-REVIEW §SEC-360-06 | UT-25 | ✅ |
| SEC-360-07 Control-char strip (defense-in-depth) | SECURITY-REVIEW §SEC-360-07 | UT-34 | ✅ |
| SEC-360-08 Inherited controls re-verified | SECURITY-REVIEW §SEC-360-08 | UT-24, IT-03, IT-08, E2E-API-07, E2E-API-09 | ✅ |

### 7.6 Success Metrics (BRD §2.5 — M1–M6)

| Requirement | Target | Test Cases | Status |
|-------------|--------|------------|--------|
| M1 Skeleton coverage | ≥ 95% | IT-12, SIT-07 (fallback share) | ✅ |
| M2 read_method hit-rate | ≥ 80% top-5 | IT-11 | ✅ |
| M3 Findings parity | ≥ 80% | SIT-06 | ✅ |
| M4 Retrieval p95 latency | FTS5 ≤ 300 ms | E2E-API-12 | ✅ |
| M5 Zero context overflow | 0 × exceed | IT-03, IT-05, SIT-04 | ✅ |
| M6 Skeleton token share | ≤ 70% staticBudget | PBT-07, IT-02, SIT-01 | ✅ |

### 7.7 Error Scenarios (FSD §9.1 — 12 scenarios)

| # | Scenario | Test Cases | Status |
|---|----------|------------|--------|
| 1 | Skeleton overflow persisting after truncation | UT-04, IT-03, SIT-05 | ✅ |
| 2 | Intra-turn pinned query cannot fit (gate #3) | IT-05, SIT-04 | ✅ |
| 3 | Index stale | UT-08, UT-09, SIT-03 | ✅ |
| 4 | read_method: symbol not found | UT-20, E2E-API-03 | ✅ |
| 5 | read_method: ambiguous symbol | UT-19, E2E-API-03 | ✅ |
| 6 | read_method: invalid arguments | UT-17 | ✅ |
| 7 | read_method: corrupt line bounds | UT-21 | ✅ |
| 8 | read_method: unreadable file | UT-22 | ✅ |
| 9 | Grammar miss (fallback ladder) | UT-13, E2E-API-05, SIT-07 | ✅ |
| 10 | Skeleton overflow first pass (truncation) | UT-01, UT-03, PBT-06 | ✅ |
| 11 | Map build fails | UT-28, UT-29 | ✅ |
| 12 | Tool-call loop (TurnBudgetGuard) | IT-06 | ✅ |

### 7.8 Coverage Summary

| Category | Total | Covered | Coverage % |
|----------|-------|---------|-----------|
| Use Cases (UC-360-01..05) | 5 | 5 | 100% |
| Business Rules — New (BR-360-01..05) | 5 | 5 | 100% |
| Business Rules — Inherited (BR-01/02/09/11) | 4 | 4 | 100% |
| API Contracts (C-360-*) | 8 | 8 | 100% |
| Security Requirements (SEC-360-01..08) | 8 | 8 | 100% |
| Success Metrics (M1–M6) | 6 | 6 | 100% |
| Error Scenarios (FSD §9.1) | 12 | 12 | 100% |
| **Overall** | **48** | **48** | **100%** |

---

## 8. Appendix A — Test Data Index (documents/SA4E-360/testdata/)

| # | File | Rows | Covers |
|---|------|------|--------|
| 1 | pre-seeded-index-fixtures.csv | 14 | PBT-08, UT-11/12/16, IT-08/09/12, E2E-API-01/02/04, FIX-13 empty-index (UT-15) |
| 2 | index-freshness-testdata.csv | 9 | UT-06..10, IT-09, E2E-API-08, SIT-03 |
| 3 | budget-scenarios-testdata.csv | 8 | PBT-01..03, IT-01, IT-02, IT-07 |
| 4 | truncation-scenarios-testdata.csv | 12 | PBT-04..07, PBT-10, UT-01..05, IT-03 |
| 5 | read-method-testdata.csv | 20 | UT-17..25, IT-04/05/06, E2E-API-02/03/04 |
| 6 | skeleton-fallback-testdata.csv | 9 | UT-13/14/15, E2E-API-05/06, SIT-07 |
| 7 | secret-redaction-testdata.csv | 12 | PBT-09, UT-30..34 |
| 8 | backend-security-testdata.csv | 12 | UT-24, E2E-API-07/09/10/11 |
| 9 | golden-query-set.csv | 12 | IT-11, IT-12, E2E-API-12 |
| 10 | functional-map-testdata.csv | 8 | UT-26..29, IT-10, SIT-02 |
| 11 | sit-checklist-testdata.csv | 10 | SIT-01..08, E2E-UI-01/02 |
| — | **Total** | **126** | All 78 STC IDs referenced ≥ once |

## 9. Appendix B — FSD §10.1 Scenario Mapping (TC-360-01..22 → STC IDs)

| FSD Scenario | STC Test Cases |
|--------------|----------------|
| TC-360-01 Happy-path injection @32k | IT-01, IT-02, SIT-01 |
| TC-360-02 70% cap enforcement | PBT-06, PBT-07, UT-01 |
| TC-360-03 REJECT fail-safe | IT-03, SIT-05 |
| TC-360-04 Measurement before session creation | IT-02 |
| TC-360-05 Stale index recovery | UT-08, SIT-03 |
| TC-360-06 Single-file extraction failure | UT-14 |
| TC-360-07 read_method exact slice | UT-18, IT-04, E2E-API-02 |
| TC-360-08 read_method latency | E2E-API-12 |
| TC-360-09 read_method hit-rate | IT-11 |
| TC-360-10 Ambiguous symbol | UT-19, E2E-API-03 |
| TC-360-11 read_method loop guard | IT-06 |
| TC-360-12 Grammar-miss fallback | UT-13, E2E-API-05 |
| TC-360-13 RAW_HEAD degradation | UT-13 (step 3), E2E-API-06 |
| TC-360-14 Fallback coverage accounting | IT-12, SIT-07 |
| TC-360-15 Functional map served | UT-26, SIT-02 |
| TC-360-16 60s cache preservation | IT-10, SIT-02 (step 4) |
| TC-360-17 Map cap trimming | UT-27 |
| TC-360-18 Map total failure | UT-29 |
| TC-360-19 Governance regression (full suite) | IT-03, IT-05, IT-07 + STP exit gate (baseline 2,748 green) |
| TC-360-20 Intra-turn growth absorption | IT-05, SIT-04 |
| TC-360-21 Findings parity | SIT-06 |
| TC-360-22 Code standards compliance | SIT-08 |

## 10. Appendix C — Golden Query Set & Metric Scopes

**Golden set (golden-query-set.csv, 12 queries):** drawn from real indexed symbols across ≥ 5 modules (extension/pi-agent, extension/pi-workflow, backend/engine, backend/database). Includes 1 negative control (GQ-12 GhostClass.ghostMethod → not_found). Hit-rate (M2) = ok / total ≥ 80%; scope limited to INDEXED symbols per OI-4 — fallback-extracted (transient) symbols are out of M2 scope and keep the read/grep path.

**M3 parity subset:** 10 files frozen at planning (5 extension TS + 2 backend TS + 1 Svelte + 1 Kotlin + 1 config) — stored in the TEST-REPORT worksheet; changes require SM approval.

**M4 latency:** p95 over 12 × 20 = 240 real-server round-trips (E2E-API-12). Hybrid ≤ 1.5 s deferred to P2 (BRD §2.5).

---

*End of STC — SA4E-360 v1.0. 78 test cases (PBT 10 / UT 34 / IT 12 / E2E-API 12 / E2E-UI 2 / SIT 8); automated 70 (89.7%); RTM 48/48 (100%). Pending: BA review gate (business-coverage review) → then XLSX/DOCX export + Jira attachment by SM.*
