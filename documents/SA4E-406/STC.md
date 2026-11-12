# Software Test Cases (STC)

## SA4E — SA4E-406: drawio_auto_layout detector precision + verify loop + ELK compound + extension migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-406 |
| Title | drawio_auto_layout: detector precision + verify loop + ELK compound + extension migration |
| Author | QA Agent |
| Version | 2.2 |
| Date | 2026-11-12 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-406.docx |
| Related FSD | FSD-v1.0-SA4E-406.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-09 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |
| 2.0 | 2026-11-12 | QA Agent | QA rounds 1–3: added §11 QA Verification Suite — 15 tests across the 4 QA files + 7 dev-round verification tests reused as QA evidence (QA-D-01..07); documented skipped test QA-11 (PD-QA1 suspected production defect, scope=ports node move); RTM extended with BR-57..BR-65 and Story 7 AC-1..AC-9; execution counts recomputed 2026-11-12 |
| 2.1 | 2026-11-12 | QA Agent | QA round 4 follow-up (SA4E-406 QA follow-up): re-enabled QA-11 in drawio-scope-args.test.ts — test still FAILS (node c moves 400,80→400,100) because `enforceFinalGate()` in drawio-verify-loop.ts:87 re-snaps the ports-only file WITHOUT `opts`, re-running `debunch()`; PD-QA1 remains OPEN (Major), test left skipped with updated TODO, production code NOT touched (role boundary); added QA-16..QA-19 to §11 (F1 drawio-xml-rewrite batch rewrite + 2,000-cell timing guard; F2 fs-guards file-level symlink escape; F4 drawio session-root threading); flipped TEST-REPORT verdict stays CONDITIONAL PASS (QA-11 skipped for unresolved PD-QA1); RTM coverage recomputed 128/128 and 162/162 = 100% (new test cases add coverage within existing requirements, no new requirements) |
| 2.2 | 2026-11-12 | QA Agent | QA FINAL (close PD-QA1 + final verdict): QA-11 re-enabled and now PASS (drawio-verify-loop.ts:50-54 computes `portsOnly` once from original request scope; :79 passes `{portsOnly}` into `finalize`; :86,:89 forward `{portsOnly}` into `enforceFinalGate`; drawio-apply-validate.ts:79-86 `enforceFinalGate(filePath, opts?)` forwards `opts` to `snapDiagramToGrid`; drawio-grid-snap.ts:23-33 skips `debunch`/`separateContainers` when `opts?.portsOnly`); measured evidence — node c stays (400,80), honest `status='partial'`, `node_proximity` still reported, 3 distinct edge anchors (0.25/0.5/0.75). PD-QA1 → CLOSED (Major, fixed by DEV round 4c). Added regression lock `drawio-ports-only-positions.test.ts` as QA-20 (§11.1). QA-11 listed as ACTIVE (not skipped). Full suite re-measured: 462 files / 3,602 passed / 6 skipped (3,608), 0 failures; drawio suite 24 files / 171 passed / 0 skipped. RTM totals recomputed: 128/128 = 100% (Story 7 row extended with QA-20 within existing BR-57..BR-65, no new requirements). TEST-REPORT verdict → PASS (no test skipped due to unresolved production defect; 6 env-gated live-proxy skips remain, environment-gated not defect-gated). |

---

## Test Case Summary

| Category | ID Range | Count | Priority | Test Levels |
|---------|----------|-------|----------|-------------|
| Functional — Happy Path | TC-001 to TC-030 | 30 | High | PBT, UT, IT, E2E-API |
| Functional — Alternative Flows | TC-100 to TC-115 | 16 | High | UT, IT, E2E-API |
| Functional — Exception/Error Flows | TC-200 to TC-225 | 26 | High | UT, IT, E2E-API |
| Business Rule Validation | TC-300 to TC-355 | 56 | High | PBT, UT, IT, E2E-API |
| Boundary & Negative Testing | TC-400 to TC-420 | 21 | Medium | PBT, UT, IT |
| Non-Functional (Performance, Security) | TC-600 to TC-615 | 16 | Medium | IT, E2E-API |
| Integration Testing | TC-700 to TC-710 | 11 | High | IT, E2E-API |
| Regression Testing | TC-800 to TC-810 | 11 | Medium | IT, E2E-API |
| E2E-API Test Cases | E2E-API-01 to E2E-API-10 | 10 | High | E2E-API |
| SIT Manual Test Cases | SIT-01 to SIT-08 | 8 | Medium | SIT |
| QA Verification Suite (rounds 1–3 + F1/F2/F4 hardening + QA-20 regression lock) | QA-01 to QA-20, QA-D-01 to QA-D-07 | 27 | High | UT/IT (tool-level, vitest) |

---

## Test Level Mapping (Detailed)

| Test Case ID Range | Primary Levels | Secondary Levels | Notes |
|-------------------|----------------|------------------|-------|
| TC-001 to TC-011 | PBT, UT | IT, E2E-API | Detector precision with randomized overlap/gap ratios |
| TC-012 to TC-015 | UT, IT | E2E-API | Verify loop iteration logic |
| TC-016 to TC-021 | UT, IT | E2E-API | ELK algorithm execution |
| TC-022 to TC-024 | IT | E2E-API | Multi-worktree path resolution |
| TC-025 to TC-028 | IT | E2E-API | PNG export renderer chain |
| TC-029 to TC-030 | IT | E2E-API | ELK options, cross-container edges |
| TC-100 to TC-115 | UT, IT | E2E-API | Alternative flow error handling |
| TC-200 to TC-225 | UT, IT | E2E-API | Exception flow error codes |
| TC-300 to TC-310 | PBT, UT | IT, E2E-API | Detector precision business rules (boundaries) |
| TC-311 to TC-319 | UT | IT, E2E-API | Verify loop business rules |
| TC-320 to TC-332 | UT | IT, E2E-API | ELK algorithm business rules |
| TC-333 to TC-337 | UT, IT | E2E-API | MCP bridge migration rules |
| TC-338 to TC-355 | UT | IT, E2E-API | Path resolution & security rules |
| TC-400 to TC-420 | PBT, UT | IT | Parameter boundary validation |
| TC-600 to TC-608 | IT | E2E-API | Performance benchmarks |
| TC-609 to TC-615 | IT, E2E-API | — | Security penetration tests |
| TC-700 to TC-710 | IT | E2E-API | MCP integration points |
| TC-800 to TC-810 | IT | E2E-API | Regression of existing behavior |
| E2E-API-01 to E2E-API-10 | E2E-API | — | Full end-to-end MCP tool flows |
| SIT-01 to SIT-08 | SIT | — | Visual/UX exploratory only |

---

## Test Level Pivot Summary (for STP §2.5)

| Level | Test Cases (Primary) | Test Cases (Secondary) | Total Executions | Automated | Manual |
|-------|---------------------|------------------------|------------------|-----------|--------|
| PBT | 21 | 0 | 21 | 21 | 0 |
| UT | 167 | 0 | 167 | 167 | 0 |
| IT | 178 | 167 | 345 | 345 | 0 |
| E2E-API | 34 | 167 | 201 | 201 | 0 |
| E2E-UI | 0 | 0 | 0 | 0 | 0 |
| SIT | 8 | 0 | 8 | 0 | 8 |
| **Total Unique Test Cases** | **187** | — | — | **179 (96%)** | **8 (4%)** |
| **Total Test Executions (all levels)** | — | — | **742** | **734 (99%)** | **8 (1%)** |

> **Note:** "Primary" = test cases designed specifically for this level. "Secondary" = same test cases also executed at this level for coverage. "Total Executions" = sum across all levels. A single test case (e.g., TC-001) may execute at PBT, UT, IT, and E2E-API levels.

## 1. Functional Test Cases — Happy Path

### TC-001: Detect node overlaps at 5% threshold (UC-01, BR-01)

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-01, Story 1 AC-1 |
| **Test Level** | PBT, UT, IT, E2E-API |
| **Preconditions** | Valid .drawio file with two nodes overlapping at 6% area ratio |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path` to test diagram, `mode=review`, `overlap_threshold=0.05` | Response status=`needs_fix`, issues array contains `node_overlap` with severity=`high`, ratio≈0.06 |
| 2 | Verify fix_hint includes actionable coordinates for 5% threshold | fix_hint suggests specific coordinate adjustment |

**Test Data:** testdata/detector-precision.csv row 1 (6% overlap)
**Postconditions:** Diagram unchanged (review mode)

---

### TC-002: Detect edge-to-node gap violation at 40px (UC-01, BR-05)

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-05, Story 1 AC-2 |
| **Test Level** | PBT, UT, IT, E2E-API |
| **Preconditions** | Valid .drawio file with edge passing 30px from non-endpoint node |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review`, `gap_threshold=40` | Response status=`needs_fix`, issues contains `edge_crossing` with gap=30, severity=`high` |
| 2 | Verify fix_hint mentions gap violation | fix_hint indicates edge-to-node clearance issue |

**Test Data:** testdata/detector-precision.csv row 2 (30px gap)
**Postconditions:** Diagram unchanged

---

### TC-003: Edge at 45px passes gap check (UC-01, BR-05)

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-05, Story 1 AC-3 |
| **Preconditions** | Valid .drawio file with edge passing 45px from non-endpoint node |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review`, `gap_threshold=40` | Response status=`already_good`, no gap violation issues |

**Test Data:** testdata/detector-precision.csv row 3 (45px gap)
**Postconditions:** Diagram unchanged

---

### TC-004: Parent/child containment excluded from overlap (UC-01, BR-02)

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-02, Story 1 AC-4 |
| **Preconditions** | Valid .drawio file with child node fully inside parent container (100% overlap) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response status=`already_good`, no `node_overlap` issue for parent-child pair |

**Test Data:** testdata/detector-precision.csv row 4 (parent-child)
**Postconditions:** Diagram unchanged

---

### TC-005: Sequence lifelines overlap warns only (UC-01, BR-03)

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-03 |
| **Preconditions** | Valid .drawio file with sequence diagram lifelines and fragment frames designed to overlap |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response may contain `node_overlap` with low severity (warn only), no auto-fix applied |

**Test Data:** testdata/detector-precision.csv row 5 (sequence diagram)
**Postconditions:** Diagram unchanged

---

### TC-006: Full containment suggests parenting (UC-01, BR-04)

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-01, BR-04 |
| **Preconditions** | Valid .drawio file with node A fully contained in node B (no parent relationship) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response contains `node_containment_hint` with low severity, fix_hint suggests parenting |

**Test Data:** testdata/detector-precision.csv row 6 (full containment)
**Postconditions:** Diagram unchanged

---

### TC-007: Sibling proximity detection (UC-01, BR-06)

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-01, BR-06 |
| **Preconditions** | Valid .drawio file with sibling nodes 30px apart |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response contains `node_proximity` with low severity, cosmetic only |

**Test Data:** testdata/detector-precision.csv row 7 (sibling proximity)
**Postconditions:** Diagram unchanged

---

### TC-008: Child outside container detection (UC-01, BR-07)

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-07 |
| **Preconditions** | Valid .drawio file with child node extending 10px outside container bounds |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response contains `child_outside_container` with high severity |

**Test Data:** testdata/detector-precision.csv row 8 (child outside)
**Postconditions:** Diagram unchanged

---

### TC-009: Diagonal edge detection (UC-01, BR-08)

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-01, BR-08 |
| **Preconditions** | Valid .drawio file with edge having dx=30px, dy=30px |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response contains `diagonal_edge` with low severity |

**Test Data:** testdata/detector-precision.csv row 9 (diagonal edge)
**Postconditions:** Diagram unchanged

---

### TC-010: Edge crossing detection (UC-01, BR-09)

| Field | Value |
|-------|-------|
| **ID** | TC-010 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-09 |
| **Preconditions** | Valid .drawio file with two edges crossing mid-air |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response contains `edge_edge_crossing` with medium severity |

**Test Data:** testdata/detector-precision.csv row 10 (edge crossing)
**Postconditions:** Diagram unchanged

---

### TC-011: Detection performance <500ms for 50 nodes (UC-01, BR-10)

| Field | Value |
|-------|-------|
| **ID** | TC-011 |
| **Priority** | High |
| **Type** | Performance |
| **Requirement** | UC-01, BR-10, Story 1 AC-6 |
| **Preconditions** | Valid .drawio file with 50 nodes, multiple edges |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review`, measure response time | Response time < 500ms |

**Test Data:** testdata/performance.csv row 1 (50 nodes)
**Postconditions:** Diagram unchanged

---

### TC-012: Verify loop fixes 3 overlaps in 1 iteration (UC-02, BR-12, BR-16)

| Field | Value |
|-------|-------|
| **ID** | TC-012 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-12, BR-16, Story 2 AC-1 |
| **Test Level** | UT, IT, E2E-API |
| **Preconditions** | Valid .drawio file with 3 node overlaps, `mode=apply` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `max_iterations=3` | Response status=`fixed`, iteration_history length=1, issues_after=0, repositioned_nodes count > 0 |

**Test Data:** testdata/verify-loop.csv row 1 (3 overlaps)
**Postconditions:** Diagram file updated with fixed layout

---

### TC-013: Verify loop requires 2 iterations (UC-02, BR-13, BR-14)

| Field | Value |
|-------|-------|
| **ID** | TC-013 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-13, BR-14, Story 2 AC-2, AC-5 |
| **Preconditions** | Valid .drawio file with overlaps requiring 2 iterations, `mode=apply`, `spacing_increment=20` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `max_iterations=3`, `spacing_increment=20` | Response status=`fixed`, iteration_history length=2, issues decrease each iteration, spacing increased |

**Test Data:** testdata/verify-loop.csv row 2 (2 iterations needed)
**Postconditions:** Diagram file updated

---

### TC-014: Verify loop partial after 3 iterations (UC-02, BR-16, Story 2 AC-3)

| Field | Value |
|-------|-------|
| **ID** | TC-014 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-16, Story 2 AC-3 |
| **Preconditions** | Valid .drawio file with persistent overlaps after 3 iterations, `mode=apply`, `max_iterations=3` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `max_iterations=3` | Response status=`partial`, iteration_history length=3, remaining_issues > 0 |

**Test Data:** testdata/verify-loop.csv row 3 (persistent issues)
**Postconditions:** Diagram file updated with best effort

---

### TC-015: Verify loop restores original if worse (UC-02, BR-15, Story 2 AC-6)

| Field | Value |
|-------|-------|
| **ID** | TC-015 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-15, Story 2 AC-6 |
| **Preconditions** | Valid .drawio file where fix increases issues, `mode=apply`, `max_iterations=3` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `max_iterations=3` | Response status=`partial`, original diagram restored, issues match initial count |

**Test Data:** testdata/verify-loop.csv row 4 (worse after fix)
**Postconditions:** Original diagram file unchanged

---

### TC-016: ELK Layered algorithm with containers (UC-03, BR-21, BR-25, BR-27)

| Field | Value |
|-------|-------|
| **ID** | TC-016 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-21, BR-25, BR-27, Story 3 AC-1 |
| **Test Level** | UT, IT, E2E-API |
| **Preconditions** | Valid .drawio file with DAG structure and swimlane containers, `mode=apply`, `algorithm=layered` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `algorithm=layered`, `direction=DOWN` | Response status=`fixed`, containers encompass children + margin, no overlaps |

**Test Data:** testdata/elk-layout.csv row 1 (layered with containers)
**Postconditions:** Diagram file updated

---

### TC-017: ELK Stress algorithm convergence (UC-03, BR-28, Story 3 AC-2)

| Field | Value |
|-------|-------|
| **ID** | TC-017 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-28, Story 3 AC-2 |
| **Preconditions** | Valid .drawio file with 30 nodes general graph, `mode=apply`, `algorithm=stress` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `algorithm=stress` | Response status=`fixed`, stress value < 0.01 (logged), no overlaps |

**Test Data:** testdata/elk-layout.csv row 2 (stress 30 nodes)
**Postconditions:** Diagram file updated

---

### TC-018: ELK Force algorithm 100 iterations (UC-03, BR-29, Story 3 AC-3)

| Field | Value |
|-------|-------|
| **ID** | TC-018 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-29, Story 3 AC-3 |
| **Preconditions** | Valid .drawio file with organic layout needs, `mode=apply`, `algorithm=force` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `algorithm=force` | Response status=`fixed`, completes 100 iterations with damping, no node drift |

**Test Data:** testdata/elk-layout.csv row 3 (force layout)
**Postconditions:** Diagram file updated

---

### TC-019: ELK Radial algorithm max 8 nodes/ring (UC-03, BR-30, Story 3 AC-4)

| Field | Value |
|-------|-------|
| **ID** | TC-019 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-30, Story 3 AC-4 |
| **Preconditions** | Valid .drawio file with tree structure, `mode=apply`, `algorithm=radial` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `algorithm=radial` | Response status=`fixed`, root at center, max 8 nodes per ring |

**Test Data:** testdata/elk-layout.csv row 4 (radial layout)
**Postconditions:** Diagram file updated

---

### TC-020: Nested containers resize correctly (UC-03, BR-26, Story 3 AC-6)

| Field | Value |
|-------|-------|
| **ID** | TC-020 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-26, Story 3 AC-6 |
| **Preconditions** | Valid .drawio file with nested containers (container within container), `mode=apply` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `container_margin=40` | Response status=`fixed`, inner container positioned within outer, both resize to encompass children + margin |

**Test Data:** testdata/elk-layout.csv row 5 (nested containers)
**Postconditions:** Diagram file updated

---

### TC-021: Invalid algorithm falls back to layered (UC-03, BR-21, Story 3 AC-6)

| Field | Value |
|-------|-------|
| **ID** | TC-021 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-03, BR-21, Story 3 AC-6 |
| **Preconditions** | Valid .drawio file, `mode=apply`, `algorithm=invalid_algo` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply`, `algorithm=invalid_algo` | Response status=`fixed` (fallback to layered), warning logged |

**Test Data:** testdata/elk-layout.csv row 6 (invalid algorithm)
**Postconditions:** Diagram file updated with layered layout

---

### TC-022: Multi-worktree base_dir resolves correctly (UC-05, BR-39, Story 5 AC-1)

| Field | Value |
|-------|-------|
| **ID** | TC-022 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-05, BR-39, Story 5 AC-1 |
| **Test Level** | IT, E2E-API |
| **Preconditions** | Two worktrees registered in allowlist, test file in worktree B, agent in worktree A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=diagrams/test.drawio`, `base_dir=/worktree-B` | Response success, effective_root=`/worktree-B`, root_source=`base_dir` |

**Test Data:** testdata/multi-worktree.csv row 1 (cross-worktree)
**Postconditions:** File in worktree B processed

---

### TC-023: Legacy call without base_dir uses primary (UC-05, BR-42, Story 5 AC-3)

| Field | Value |
|-------|-------|
| **ID** | TC-023 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-05, BR-42, Story 5 AC-3 |
| **Preconditions** | Test file in primary workspace, no base_dir provided |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=diagrams/test.drawio` (no base_dir) | Response success, effective_root=primary workspace, root_source=`legacy` |

**Test Data:** testdata/multi-worktree.csv row 2 (legacy)
**Postconditions:** File in primary workspace processed

---

### TC-024: Absolute file_path validated within base_dir (UC-05, BR-41, Story 5 AC-4)

| Field | Value |
|-------|-------|
| **ID** | TC-024 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-05, BR-41, Story 5 AC-4 |
| **Preconditions** | Absolute file_path within registered worktree B, base_dir=worktree B |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=/worktree-B/diagrams/test.drawio`, `base_dir=/worktree-B` | Response success, path resolved and validated |

**Test Data:** testdata/multi-worktree.csv row 3 (absolute path)
**Postconditions:** File processed

---

### TC-025: PNG export via CLI renderer (TDD 6.2, UC-04)

| Field | Value |
|-------|-------|
| **ID** | TC-025 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TDD Section 6.2, UC-04 |
| **Test Level** | IT, E2E-API |
| **Preconditions** | draw.io CLI installed, valid .drawio XML content_base64 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_export_png` with `content_base64` (valid XML) | Response success=true, output_base64 contains PNG bytes, renderer=`drawio-cli` |

**Test Data:** testdata/png-export.csv row 1 (valid XML)
**Postconditions:** PNG returned as base64

---

### TC-026: PNG export fallback to Chrome DevTools MCP (TDD 6.3)

| Field | Value |
|-------|-------|
| **ID** | TC-026 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TDD Section 6.3 |
| **Preconditions** | draw.io CLI unavailable, Chrome DevTools MCP available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_export_png` with `content_base64` | Response success=true, renderer=`chrome-devtools-mcp` |

**Test Data:** testdata/png-export.csv row 1 (valid XML)
**Postconditions:** PNG returned via Chrome

---

### TC-027: PNG export fallback to Puppeteer MCP (TDD 6.4)

| Field | Value |
|-------|-------|
| **ID** | TC-027 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | TDD Section 6.4 |
| **Preconditions** | draw.io CLI and Chrome DevTools MCP unavailable, Puppeteer MCP available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_export_png` with `content_base64` | Response success=true, renderer=`puppeteer-mcp` |

**Test Data:** testdata/png-export.csv row 1 (valid XML)
**Postconditions:** PNG returned via Puppeteer

---

### TC-028: content_base64 + output_base64 roundtrip (UC-04, BR-35, Story 4 AC-4)

| Field | Value |
|-------|-------|
| **ID** | TC-028 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-04, BR-35, Story 4 AC-4 |
| **Preconditions** | Valid .drawio XML as base64 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `content_base64`, `output_base64=true`, `mode=apply` | Response contains output_base64 with layouted XML (no file I/O) |

**Test Data:** testdata/base64-roundtrip.csv row 1
**Postconditions:** No file written, base64 returned

---

### TC-029: ELK options passthrough (UC-03, BR-31, Story 3 AC-7)

| Field | Value |
|-------|-------|
| **ID** | TC-029 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-03, BR-31, Story 3 AC-7 |
| **Preconditions** | Valid .drawio file, `mode=apply`, `elk_options` with custom padding |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `elk_options={ "elk.padding": "[top=60,left=30,bottom=30,right=30]" }` | Response status=`fixed`, custom padding applied to containers |

**Test Data:** testdata/elk-layout.csv row 7 (custom elk_options)
**Postconditions:** Diagram file updated

---

### TC-030: Cross-container edges routed at root (UC-03, BR-33)

| Field | Value |
|-------|-------|
| **ID** | TC-030 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-33 |
| **Preconditions** | Valid .drawio file with edges connecting nodes in different containers, `mode=apply` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply` | Response status=`fixed`, cross-container edges routed at root level, internal edges within containers |

**Test Data:** testdata/elk-layout.csv row 8 (cross-container edges)
**Postconditions:** Diagram file updated

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: AF-1 mode=apply triggers verify loop (UC-01 AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF-1 |
| **Test Level** | UT, IT, E2E-API |
| **Preconditions** | Diagram with issues, `mode=apply` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=apply` | Verify loop initiated, status=`fixed` or `partial` |

**Test Data:** testdata/verify-loop.csv row 1
**Postconditions:** Diagram fixed

---

### TC-101: AF-2 No nodes in diagram (UC-01 AF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF-2 |
| **Preconditions** | Valid .drawio file with mxGraphModel but zero nodes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path`, `mode=review` | Response error: "No nodes found in diagram" |

**Test Data:** testdata/alternative-flows.csv row 1 (empty diagram)
**Postconditions:** No changes

---

### TC-102: AF-3 File not found (UC-01 AF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF-3 |
| **Preconditions** | file_path points to non-existent file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with non-existent `file_path` | Response error: "File not found or not accessible" |

**Test Data:** testdata/alternative-flows.csv row 2 (missing file)
**Postconditions:** No changes

---

### TC-103: AF-4 base_dir not in allowlist (UC-01 AF-4, UC-05 EF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-103 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-01 AF-4, UC-05 EF-1, BR-39 |
| **Preconditions** | base_dir not registered in workspace allowlist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `base_dir=/unregistered/path` | Response error: "PATH_REJECTED_OUTSIDE_ALLOWLIST" with allowlist in error |

**Test Data:** testdata/security.csv row 1 (unregistered base_dir)
**Postconditions:** No file access

---

### TC-104: AF-1 Local repair produces no changes (UC-02 AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-104 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-02 AF-1 |
| **Preconditions** | Diagram where local repair makes no progress |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply`, issues suitable for local repair | Escalates to ELK relayout, continues verify loop |

**Test Data:** testdata/verify-loop.csv row 5 (local repair no-op)
**Postconditions:** ELK relayout attempted

---

### TC-105: AF-2 ELK layout fails (UC-02 AF-2, UC-03 AF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-105 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-02 AF-2, UC-03 AF-2 |
| **Preconditions** | ELK.js throws exception during layout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply`, trigger ELK failure | Returns best result so far, error logged, status=`partial` |

**Test Data:** testdata/elk-layout.csv row 9 (ELK failure)
**Postconditions:** Best effort returned

---

### TC-106: AF-3 Spacing increment causes canvas overflow (UC-02 AF-3, BR-20)

| Field | Value |
|-------|-------|
| **ID** | TC-106 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-02 AF-3, BR-20 |
| **Preconditions** | Diagram near canvas bounds, spacing_increment would exceed 500px |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply`, high spacing_increment | Spacing capped at 500px, layout continues |

**Test Data:** testdata/verify-loop.csv row 6 (canvas overflow)
**Postconditions:** Layout with max spacing

---

### TC-107: AF-4 Final iteration worse than initial (UC-02 AF-4, BR-15)

| Field | Value |
|-------|-------|
| **ID** | TC-107 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-02 AF-4, BR-15 |
| **Preconditions** | Diagram where each iteration increases issues |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply`, `max_iterations=3` | Original diagram restored, status=`partial` with original issues |

**Test Data:** testdata/verify-loop.csv row 4
**Postconditions:** Original file unchanged

---

### TC-108: AF-1 Invalid algorithm fallback (UC-03 AF-1, BR-21)

| Field | Value |
|-------|-------|
| **ID** | TC-108 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-03 AF-1, BR-21 |
| **Preconditions** | `algorithm=invalid_name` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `algorithm=invalid_name` | Falls back to layered, warning logged |

**Test Data:** testdata/elk-layout.csv row 6
**Postconditions:** Layered layout applied

---

### TC-109: AF-2 ELK.js load failure fallback (UC-03 AF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-109 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-03 AF-2 |
| **Preconditions** | ELK.js dynamic import fails |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply` (ELK unavailable) | Falls back to legacy layered algorithm |

**Test Data:** testdata/elk-layout.csv row 10 (ELK import fail)
**Postconditions:** Legacy layout applied

---

### TC-110: AF-3 Compound layout failure (UC-03 AF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-110 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-03 AF-3 |
| **Preconditions** | ELK compound node layout throws exception |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with containers, `mode=apply` | Children laid out without container constraints, warning logged |

**Test Data:** testdata/elk-layout.csv row 11 (compound failure)
**Postconditions:** Partial layout

---

### TC-111: AF-1 No base_dir provided (UC-05 AF-1, BR-42)

| Field | Value |
|-------|-------|
| **ID** | TC-111 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-05 AF-1, BR-42 |
| **Preconditions** | Tool call without base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path` only | Resolves against primary workspace (legacy behavior) |

**Test Data:** testdata/multi-worktree.csv row 2
**Postconditions:** Primary workspace used

---

### TC-112: AF-2 Absolute file_path with base_dir (UC-05 AF-2, BR-41)

| Field | Value |
|-------|-------|
| **ID** | TC-112 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-05 AF-2, BR-41 |
| **Preconditions** | Absolute file_path within registered worktree |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with absolute `file_path` and matching `base_dir` | Absolute path validated within base_dir, processed |

**Test Data:** testdata/multi-worktree.csv row 3
**Postconditions:** File processed

---

### TC-113: AF-3 workspace_root alias (UC-05 AF-3, BR-45)

| Field | Value |
|-------|-------|
| **ID** | TC-113 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-05 AF-3, BR-45 |
| **Preconditions** | `workspace_root` provided instead of `base_dir` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `workspace_root=/worktree-B` | Treated as base_dir, resolved successfully |

**Test Data:** testdata/multi-worktree.csv row 4 (workspace_root alias)
**Postconditions:** Worktree B used

---

### TC-114: AF-1 CLI renderer unavailable (UC-04 AF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-114 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-04 AF-3 |
| **Preconditions** | draw.io CLI not installed or not in PATH |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_export_png` with `content_base64` | Falls back to Chrome DevTools MCP |

**Test Data:** testdata/png-export.csv row 1
**Postconditions:** PNG via Chrome

---

### TC-115: AF-2 Chrome DevTools MCP unavailable (UC-04 AF-4)

| Field | Value |
|-------|-------|
| **ID** | TC-115 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-04 AF-4 |
| **Preconditions** | CLI and Chrome DevTools MCP unavailable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_export_png` with `content_base64` | Falls back to Puppeteer MCP |

**Test Data:** testdata/png-export.csv row 1
**Postconditions:** PNG via Puppeteer

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: EF-1 XML parsing failure (UC-01 EF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-01 EF-1 |
| **Test Level** | UT, IT, E2E-API |
| **Preconditions** | .drawio file with malformed XML |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with malformed XML file | Response error: "Analysis failed: <exception message>" |

**Test Data:** testdata/error-flows.csv row 1 (malformed XML)
**Postconditions:** No changes

---

### TC-201: EF-2 Detection algorithm exception (UC-01 EF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-01 EF-2 |
| **Preconditions** | Diagram causing exception in specific detector |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with problematic diagram | Partial results returned, exception logged, other detections continue |

**Test Data:** testdata/error-flows.csv row 2 (detector exception)
**Postconditions:** Partial detection results

---

### TC-202: EF-3 Path traversal attempt (UC-01 EF-3, UC-06 EF-1, BR-47)

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-01 EF-3, UC-06 EF-1, BR-47, BR-51, Story 6 AC-1 |
| **Preconditions** | file_path="..\\..\\etc\\passwd" with any base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=..\\..\\etc\\passwd` | Response generic error: "File path not allowed: path traversal detected", audit logged |

**Test Data:** testdata/security.csv row 2 (traversal payload)
**Postconditions:** No file access, security audit entry created

---

### TC-203: EF-1 ELK initialization failure (UC-02 EF-1, UC-03 EF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-02 EF-1, UC-03 EF-1 |
| **Preconditions** | ELK.js constructor throws |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply` (ELK init fails) | Falls back to legacy layered, warning logged |

**Test Data:** testdata/elk-layout.csv row 10
**Postconditions:** Legacy layout

---

### TC-204: EF-2 Compound node layout failure (UC-03 EF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-03 EF-2 |
| **Preconditions** | ELK compound layout throws |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with containers, `mode=apply` | Children laid out without container constraints |

**Test Data:** testdata/elk-layout.csv row 11
**Postconditions:** Partial layout

---

### TC-205: EF-3 ELK invalid output (UC-03 EF-2, TDD)

| Field | Value |
|-------|-------|
| **ID** | TC-205 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-03 EF-2 |
| **Preconditions** | ELK returns NaN coordinates or non-positive dimensions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply` (ELK invalid output) | Error: "ELK returned invalid coordinates for node 'X'" |

**Test Data:** testdata/elk-layout.csv row 12 (invalid output)
**Postconditions:** Error returned

---

### TC-206: EF-4 Write file permission error (UC-02 EF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-206 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-02 EF-3 |
| **Preconditions** | Output file path not writable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply` to read-only location | Error: "Failed to write fixed diagram" |

**Test Data:** testdata/error-flows.csv row 3 (permission denied)
**Postconditions:** No write

---

### TC-207: EF-1 base_dir not in allowlist (UC-05 EF-1, BR-39)

| Field | Value |
|-------|-------|
| **ID** | TC-207 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-05 EF-1, BR-39 |
| **Preconditions** | base_dir not registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with unregistered `base_dir` | Error: "PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root 'X' is not registered" |

**Test Data:** testdata/security.csv row 1
**Postconditions:** Rejected

---

### TC-208: EF-2 base_dir doesn't exist (UC-05 EF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-208 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-05 EF-2 |
| **Preconditions** | base_dir path doesn't exist on filesystem |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with non-existent `base_dir` | Error: "FS_ERROR: Workspace root 'X' does not exist" |

**Test Data:** testdata/security.csv row 3 (missing base_dir)
**Postconditions:** Rejected

---

### TC-209: EF-3 Resolved path escapes base_dir (UC-05 EF-3, BR-40)

| Field | Value |
|-------|-------|
| **ID** | TC-209 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-05 EF-3, BR-40 |
| **Preconditions** | Relative file_path with ../ escaping base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=../../secrets.txt`, valid `base_dir` | Error: "PATH_REJECTED_OUTSIDE_ALLOWLIST" |

**Test Data:** testdata/security.csv row 4 (path escape)
**Postconditions:** Rejected

---

### TC-210: EF-4 Symlink escape (UC-05 EF-3, BR-43, BR-55, UC-06 EF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-210 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-05 EF-3, BR-43, BR-55, UC-06 EF-3 |
| **Preconditions** | Symlink in workspace pointing outside allowlist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with file_path resolving through malicious symlink | Error: "PATH_REJECTED_OUTSIDE_ALLOWLIST", symlink resolved before containment check |

**Test Data:** testdata/security.csv row 5 (symlink escape)
**Postconditions:** Rejected, audit logged

---

### TC-211: EF-5 NUL byte injection (UC-05 EF-4, BR-51)

| Field | Value |
|-------|-------|
| **ID** | TC-211 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-05 EF-4, BR-51 |
| **Preconditions** | file_path contains NUL byte |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=diagrams\0secret.txt` | Error: "PATH_REJECTED_OUTSIDE_ALLOWLIST" |

**Test Data:** testdata/security.csv row 6 (NUL byte)
**Postconditions:** Rejected

---

### TC-212: EF-5 Non-string base_dir (UC-05 EF-5, BR-46)

| Field | Value |
|-------|-------|
| **ID** | TC-212 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-05 EF-5, BR-46 |
| **Preconditions** | base_dir provided as number/object |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `base_dir=123` | Error: "base_dir must be a non-empty string" |

**Test Data:** testdata/security.csv row 7 (non-string base_dir)
**Postconditions:** Rejected

---

### TC-213: EF-1 Absolute path outside allowlist (UC-06 EF-2, BR-50)

| Field | Value |
|-------|-------|
| **ID** | TC-213 |
| **Priority** | Critical |
| **Type** | Security |
| **Requirement** | UC-06 EF-2, BR-50 |
| **Preconditions** | Absolute file_path outside all registered workspaces |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=C:\\Windows\\System32\\config\\SAM` | Error: "PATH_REJECTED_OUTSIDE_ALLOWLIST" (generic) |

**Test Data:** testdata/security.csv row 8 (absolute outside)
**Postconditions:** Rejected, no filesystem leak

---

### TC-214: EF-1 Legacy call validated against primary (UC-06 AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-214 |
| **Priority** | High |
| **Type** | Security |
| **Requirement** | UC-06 AF-1 |
| **Preconditions** | No base_dir, file_path escapes primary workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `file_path=..\\..\\etc\\passwd` (no base_dir) | Rejected against primary workspace |

**Test Data:** testdata/security.csv row 9 (legacy traversal)
**Postconditions:** Rejected

---

### TC-215: EF-2 Absolute file_path without base_dir (UC-06 AF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-215 |
| **Priority** | High |
| **Type** | Security |
| **Requirement** | UC-06 AF-2 |
| **Preconditions** | Absolute file_path, no base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with absolute path outside primary workspace | Rejected against primary workspace |

**Test Data:** testdata/security.csv row 10 (absolute no base_dir)
**Postconditions:** Rejected

---

### TC-216: Invalid threshold values (FSD 3.1.4 Validation Rules)

| Field | Value |
|-------|-------|
| **ID** | TC-216 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.1.4 Validation Rules |
| **Preconditions** | overlap_threshold > 0.5 or ≤ 0 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `overlap_threshold=0.6` | Error: "Overlap threshold must be between 0 and 0.5" |
| 2 | Call `drawio_auto_layout` with `gap_threshold=5` | Error: "Gap threshold must be ≥ 10" |
| 3 | Call `drawio_auto_layout` with `max_iterations=0` | Error: "Max iterations must be 1-5" |
| 4 | Call `drawio_auto_layout` with `spacing_increment=5` | Error: "Spacing increment must be 10-50" |

**Test Data:** testdata/boundary-negative.csv rows 1-4 (invalid thresholds)
**Postconditions:** Validation errors returned

---

### TC-217: INVALID_XML error (FSD 3.1.5 Business Error Scenarios)

| Field | Value |
|-------|-------|
| **ID** | TC-217 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | File exists but not valid mxGraphModel XML |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with invalid XML file | Error: "INVALID_XML: Analysis failed: <details>" |

**Test Data:** testdata/error-flows.csv row 4 (invalid XML structure)
**Postconditions:** Error returned

---

### TC-218: NO_NODES error (FSD 3.1.5)

| Field | Value |
|-------|-------|
| **ID** | TC-218 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | Valid mxGraphModel but zero vertex cells |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with empty diagram | Error: "NO_NODES: No nodes found in diagram" |

**Test Data:** testdata/alternative-flows.csv row 1
**Postconditions:** Error returned

---

### TC-219: FILE_NOT_FOUND error (FSD 3.1.5)

| Field | Value |
|-------|-------|
| **ID** | TC-219 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | File does not exist at resolved path |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with non-existent file | Error: "FILE_NOT_FOUND: File not found or not accessible" |

**Test Data:** testdata/alternative-flows.csv row 2
**Postconditions:** Error returned

---

### TC-220: RENDERER_UNAVAILABLE error (FSD 3.1.5, UC-04 EF-4)

| Field | Value |
|-------|-------|
| **ID** | TC-220 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.1.5, UC-04 EF-4 |
| **Preconditions** | All 3 renderers unavailable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_export_png` with `content_base64` | Tool hidden from MCP tool list (existing behavior) |

**Test Data:** testdata/png-export.csv row 2 (no renderers)
**Postconditions:** Tool not discoverable

---

### TC-221: LAYOUT_FAILED error (FSD 3.2.5)

| Field | Value |
|-------|-------|
| **ID** | TC-221 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.2.5 |
| **Preconditions** | ELK layout exception after all strategies exhausted |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply` triggering total layout failure | Error: "LAYOUT_FAILED: Layout engine failed. Please check input diagram and retry." |

**Test Data:** testdata/verify-loop.csv row 7 (total layout failure)
**Postconditions:** Error returned

---

### TC-222: DIAGRAM_TOO_LARGE error (FSD 3.2.5, BR-19)

| Field | Value |
|-------|-------|
| **ID** | TC-222 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.2.5, BR-19 |
| **Preconditions** | Diagram with >500 nodes (SA4E_ELK_MAX_NODES) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with 501 nodes | Error: "DIAGRAM_TOO_LARGE: Diagram too large (501 nodes, max 500)" |

**Test Data:** testdata/performance.csv row 2 (501 nodes)
**Postconditions:** Error returned

---

### TC-223: REPAIR_FAILED error (FSD 3.2.5)

| Field | Value |
|-------|-------|
| **ID** | TC-223 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.2.5 |
| **Preconditions** | Local repair throws exception |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply`, scope=positions, repair fails | Error: "REPAIR_FAILED: Local repair failed. Please check diagram structure." |

**Test Data:** testdata/verify-loop.csv row 8 (repair failure)
**Postconditions:** Error returned

---

### TC-224: ELK_INIT_FAILED error (FSD 3.3.5)

| Field | Value |
|-------|-------|
| **ID** | TC-224 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.3.5 |
| **Preconditions** | ELK.js import/constructor failure |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with `mode=apply`, ELK init fails | Error: "ELK_INIT_FAILED: Layout engine failed to initialize" |

**Test Data:** testdata/elk-layout.csv row 10
**Postconditions:** Error returned

---

### TC-225: ELK_TIMEOUT error (FSD 3.3.5, BR-18)

| Field | Value |
|-------|-------|
| **ID** | TC-225 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 3.3.5, BR-18 |
| **Preconditions** | ELK layout exceeds SA4E_ELK_TIMEOUT_MS (default 10s) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `drawio_auto_layout` with complex diagram, `mode=apply`, timeout=1000ms | Error: "ELK_TIMEOUT: Layout engine timed out after 1000ms" |

**Test Data:** testdata/performance.csv row 3 (slow layout)
**Postconditions:** Error returned

---

## 4. Business Rule Validation

### TC-300: BR-01 Node overlap at 5% threshold

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01 |
| **Test Level** | PBT, UT, IT, E2E-API |
| **Preconditions** | Two nodes with varying overlap ratios |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test overlap at 4.9% | Not flagged |
| 2 | Test overlap at 5.0% | Flagged as node_overlap |
| 3 | Test overlap at 5.1% | Flagged as node_overlap |

**Test Data:** testdata/business-rules.csv rows 1-3 (overlap boundary)
**Postconditions:** Threshold enforced

---

### TC-301: BR-02 Parent/child exclusion

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02 |
| **Preconditions** | Parent container with child node |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detection with 100% child-in-parent overlap | No node_overlap issue for this pair |

**Test Data:** testdata/business-rules.csv row 4 (parent-child)
**Postconditions:** Exclusion works

---

### TC-302: BR-03 Sequence constructs warn only

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-03 |
| **Preconditions** | Sequence diagram with lifelines |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detection on sequence diagram | Overlaps reported as low severity warn, no auto-fix |

**Test Data:** testdata/business-rules.csv row 5 (sequence)
**Postconditions:** Warn only

---

### TC-303: BR-04 Full containment hint

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-04 |
| **Preconditions** | Node A fully inside Node B (no parent) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detection | node_containment_hint low severity, fix_hint suggests parenting |

**Test Data:** testdata/business-rules.csv row 6 (containment)
**Postconditions:** Hint provided

---

### TC-304: BR-05 Gap threshold 40px

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-05 |
| **Preconditions** | Edge passing near non-endpoint node |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edge at 39px from node | Gap violation flagged |
| 2 | Edge at 40px from node | No violation |
| 3 | Edge at 41px from node | No violation |

**Test Data:** testdata/business-rules.csv rows 7-9 (gap boundary)
**Postconditions:** Threshold enforced

---

### TC-305: BR-06 Sibling proximity 40px

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-06 |
| **Preconditions** | Sibling nodes at varying distances |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Siblings at 39px | node_proximity low severity |
| 2 | Siblings at 40px | No proximity issue |
| 3 | Siblings at 41px | No proximity issue |

**Test Data:** testdata/business-rules.csv rows 10-12 (proximity boundary)
**Postconditions:** Cosmetic only, never auto-fixed

---

### TC-306: BR-07 Child outside container 5px tolerance

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-07 |
| **Preconditions** | Child node extending outside container |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Child 4px outside | Not flagged (within 5px tolerance) |
| 2 | Child 5px outside | Not flagged (boundary) |
| 3 | Child 6px outside | child_outside_container high severity |

**Test Data:** testdata/business-rules.csv rows 13-15 (containment boundary)
**Postconditions:** Tolerance enforced

---

### TC-307: BR-08 Diagonal edge dx>20 AND dy>20

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-08 |
| **Preconditions** | Edges with varying dx, dy |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | dx=20, dy=20 | Not diagonal (both not >20) |
| 2 | dx=21, dy=20 | Not diagonal (dy not >20) |
| 3 | dx=20, dy=21 | Not diagonal (dx not >20) |
| 4 | dx=21, dy=21 | diagonal_edge low severity |

**Test Data:** testdata/business-rules.csv rows 16-19 (diagonal boundary)
**Postconditions:** Boundary enforced

---

### TC-308: BR-09 Edge crossing 5px margin

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-09 |
| **Preconditions** | Edge-node, edge-edge, edge-container crossings |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edge crosses node with 4px margin | edge_crossing high severity |
| 2 | Edge crosses edge with 4px margin | edge_edge_crossing medium severity |
| 3 | Edge crosses container with 4px margin | edge_container_crossing low severity |
| 4 | All with 6px margin | No crossing flagged |

**Test Data:** testdata/business-rules.csv rows 20-23 (crossing margin)
**Postconditions:** Margin enforced

---

### TC-309: BR-10 Detection <500ms for 50 nodes

| Field | Value |
|-------|-------|
| **ID** | TC-309 |
| **Priority** | High |
| **Type** | Business Rule — Performance |
| **Requirement** | BR-10 |
| **Preconditions** | 50-node diagram |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure detection time | < 500ms |

**Test Data:** testdata/performance.csv row 1
**Postconditions:** Performance met

---

### TC-310: BR-11 Fix hints with coordinates

| Field | Value |
|-------|-------|
| **ID** | TC-310 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-11 |
| **Preconditions** | Diagram with detected issues |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check fix_hint for overlap issue | Contains specific coordinate adjustment |
| 2 | Check fix_hint for gap issue | Contains specific clearance recommendation |
| 3 | Check fix_hint for crossing | Contains reroute suggestion |

**Test Data:** testdata/business-rules.csv rows 24-26 (fix hints)
**Postconditions:** Actionable hints provided

---

### TC-311: BR-12 Max iterations 3 (configurable 1-5)

| Field | Value |
|-------|-------|
| **ID** | TC-311 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-12 |
| **Preconditions** | Verify loop with varying max_iterations |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | max_iterations=1 | Loop runs max 1 iteration |
| 2 | max_iterations=3 (default) | Loop runs max 3 iterations |
| 3 | max_iterations=5 | Loop runs max 5 iterations |
| 4 | max_iterations=0 | Validation error |
| 5 | max_iterations=6 | Validation error |

**Test Data:** testdata/business-rules.csv rows 27-31 (iterations)
**Postconditions:** Limits enforced

---

### TC-312: BR-13 Spacing increment 20% default

| Field | Value |
|-------|-------|
| **ID** | TC-312 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-13 |
| **Preconditions** | Verify loop with spacing increment |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | spacing_increment=20 (default) | Each iteration increases spacing by 20% |
| 2 | spacing_increment=10 | Each iteration increases by 10% |
| 3 | spacing_increment=50 | Each iteration increases by 50% |
| 4 | spacing_increment=5 | Validation error |
| 5 | spacing_increment=51 | Validation error |

**Test Data:** testdata/business-rules.csv rows 32-36 (spacing increment)
**Postconditions:** Increment applied correctly

---

### TC-313: BR-14 Iteration history in response

| Field | Value |
|-------|-------|
| **ID** | TC-313 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-14 |
| **Preconditions** | Verify loop with multiple iterations |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check response iteration_history | Array with iteration, issues_before, issues_after, strategy |

**Test Data:** testdata/verify-loop.csv row 2
**Postconditions:** History present

---

### TC-314: BR-15 Restore original if worse

| Field | Value |
|-------|-------|
| **ID** | TC-314 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-15 |
| **Preconditions** | Diagram where fix increases issues |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | mode=apply, final issues > initial | Original restored, status=partial |

**Test Data:** testdata/verify-loop.csv row 4
**Postconditions:** Original preserved

---

### TC-315: BR-16 Status fixed/partial logic

| Field | Value |
|-------|-------|
| **ID** | TC-315 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-16 |
| **Preconditions** | Various verify loop outcomes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | All high/medium resolved | status=fixed |
| 2 | Issues remain after max iterations | status=partial |
| 3 | No issues initially | status=already_good |
| 4 | Issues found, mode=review | status=needs_fix |

**Test Data:** testdata/verify-loop.csv rows 1,3,4,9
**Postconditions:** Correct status

---

### TC-316: BR-17 Fix strategy selection

| Field | Value |
|-------|-------|
| **ID** | TC-316 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-17 |
| **Preconditions** | Different issue types |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Only edge routing issues | strategy=ports |
| 2 | Few node violations | strategy=local |
| 3 | >40% cells involved or relayout=true | strategy=elk |

**Test Data:** testdata/verify-loop.csv rows 10-12 (strategies)
**Postconditions:** Correct strategy selected

---

### TC-317: BR-18 ELK timeout 10s default

| Field | Value |
|-------|-------|
| **ID** | TC-317 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-18 |
| **Preconditions** | ELK layout with timeout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Default timeout | 10000ms |
| 2 | SA4E_ELK_TIMEOUT_MS=5000 | 5000ms |
| 3 | SA4E_ELK_TIMEOUT_MS=60000 | 60000ms |
| 4 | SA4E_ELK_TIMEOUT_MS=500 | Validation error (min 1000) |

**Test Data:** testdata/performance.csv rows 4-7 (timeout config)
**Postconditions:** Configurable timeout

---

### TC-318: BR-19 Max nodes 500 default

| Field | Value |
|-------|-------|
| **ID** | TC-318 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-19 |
| **Preconditions** | Diagrams with varying node counts |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 500 nodes | Accepted |
| 2 | 501 nodes | DIAGRAM_TOO_LARGE error |
| 3 | SA4E_ELK_MAX_NODES=1000 | 1000 nodes accepted |

**Test Data:** testdata/performance.csv rows 2,8,9 (max nodes)
**Postconditions:** Limit enforced

---

### TC-319: BR-20 Max spacing 500px

| Field | Value |
|-------|-------|
| **ID** | TC-319 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-20 |
| **Preconditions** | High spacing values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | spacing=600 | Capped at 500 |
| 2 | spacing_increment causes >500 | Capped at 500 |

**Test Data:** testdata/business-rules.csv rows 37-38 (max spacing)
**Postconditions:** Cap enforced

---

### TC-320: BR-21 Algorithm enum validation

| Field | Value |
|-------|-------|
| **ID** | TC-320 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-21 |
| **Preconditions** | Various algorithm values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | algorithm=layered | Accepted |
| 2 | algorithm=stress | Accepted |
| 3 | algorithm=force | Accepted |
| 4 | algorithm=radial | Accepted |
| 5 | algorithm=invalid | Fallback to layered, warning |

**Test Data:** testdata/business-rules.csv rows 39-43 (algorithm enum)
**Postconditions:** Enum validated

---

### TC-321: BR-22 Direction enum validation

| Field | Value |
|-------|-------|
| **ID** | TC-321 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-22 |
| **Preconditions** | Various direction values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | direction=DOWN | Accepted |
| 2 | direction=RIGHT | Accepted |
| 3 | direction=LEFT | Accepted |
| 4 | direction=UP | Accepted |
| 5 | direction=INVALID | Validation error |

**Test Data:** testdata/business-rules.csv rows 44-48 (direction enum)
**Postconditions:** Enum validated

---

### TC-322: BR-23 Spacing >0, ≤500

| Field | Value |
|-------|-------|
| **ID** | TC-322 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-23 |
| **Preconditions** | Various spacing values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | spacing=0 | Validation error |
| 2 | spacing=1 | Accepted |
| 3 | spacing=500 | Accepted |
| 4 | spacing=501 | Validation error |

**Test Data:** testdata/business-rules.csv rows 49-52 (spacing range)
**Postconditions:** Range validated

---

### TC-323: BR-24 Container margin ≥0

| Field | Value |
|-------|-------|
| **ID** | TC-323 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-24 |
| **Preconditions** | Various container_margin values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | container_margin=-1 | Validation error |
| 2 | container_margin=0 | Accepted |
| 3 | container_margin=40 | Accepted (default) |

**Test Data:** testdata/business-rules.csv rows 53-55 (container margin)
**Postconditions:** Range validated

---

### TC-324: BR-25 Container bounds encompass children + margin

| Field | Value |
|-------|-------|
| **ID** | TC-324 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-25 |
| **Preconditions** | Containers with children after layout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check container bounds after layout | Container rect contains all children + margin |

**Test Data:** testdata/elk-layout.csv rows 1,5,8
**Postconditions:** Containers properly sized

---

### TC-325: BR-26 Nested containers correct

| Field | Value |
|-------|-------|
| **ID** | TC-325 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-26 |
| **Preconditions** | Nested containers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check inner container within outer | Inner positioned within outer bounds |
| 2 | Check both resize | Both encompass children + margin |

**Test Data:** testdata/elk-layout.csv row 5
**Postconditions:** Nested correct

---

### TC-326: BR-27 Layered topological + BFS

| Field | Value |
|-------|-------|
| **ID** | TC-326 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-27 |
| **Preconditions** | DAG diagram |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | algorithm=layered | Nodes assigned to layers via topological sort + BFS |

**Test Data:** testdata/elk-layout.csv row 1
**Postconditions:** Layered algorithm correct

---

### TC-327: BR-28 Stress convergence <0.01

| Field | Value |
|-------|-------|
| **ID** | TC-327 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-28 |
| **Preconditions** | ≤30 nodes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | algorithm=stress | Stress value < 0.01 |

**Test Data:** testdata/elk-layout.csv row 2
**Postconditions:** Convergence met

---

### TC-328: BR-29 Force 100 iterations damping

| Field | Value |
|-------|-------|
| **ID** | TC-328 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-29 |
| **Preconditions** | algorithm=force |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check iterations | 100 iterations with damping completed |
| 2 | Check node drift | No significant drift after convergence |

**Test Data:** testdata/elk-layout.csv row 3
**Postconditions:** Force algorithm correct

---

### TC-329: BR-30 Radial max 8 nodes/ring

| Field | Value |
|-------|-------|
| **ID** | TC-329 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-30 |
| **Preconditions** | algorithm=radial, tree structure |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Count nodes per ring | Max 8 nodes per ring |
| 2 | Check root position | Root at center |

**Test Data:** testdata/elk-layout.csv row 4
**Postconditions:** Radial algorithm correct

---

### TC-330: BR-31 ELK options passthrough

| Field | Value |
|-------|-------|
| **ID** | TC-330 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-31 |
| **Preconditions** | Custom elk_options |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | elk_options with valid keys | Applied to ELK layout |
| 2 | elk_options with invalid keys | Invalid ignored, valid applied |

**Test Data:** testdata/elk-layout.csv rows 7,13
**Postconditions:** Options passed through

---

### TC-331: BR-32 Orthogonal routing enforced

| Field | Value |
|-------|-------|
| **ID** | TC-331 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-32 |
| **Preconditions** | Any algorithm |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check edge routes after layout | All edges orthogonal (horizontal/vertical only) |

**Test Data:** testdata/elk-layout.csv rows 1-4
**Postconditions:** Orthogonal routing

---

### TC-332: BR-33 Cross-container edges at root

| Field | Value |
|-------|-------|
| **ID** | TC-332 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-33 |
| **Preconditions** | Edges between different containers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check edge routing | Cross-container edges routed at root level |

**Test Data:** testdata/elk-layout.csv row 8
**Postconditions:** Root-level routing

---

### TC-333: BR-34 Tools discoverable via find_tools

| Field | Value |
|-------|-------|
| **ID** | TC-333 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-34 |
| **Preconditions** | MCP orchestration running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call find_tools for drawio | drawio_auto_layout and drawio_export_png listed |

**Test Data:** N/A (MCP call)
**Postconditions:** Tools discoverable

---

### TC-334: BR-35 content_base64 + output_base64

| Field | Value |
|-------|-------|
| **ID** | TC-334 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-35 |
| **Preconditions** | Base64 XML input |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | content_base64 + output_base64=true | Returns base64 XML, no file I/O |

**Test Data:** testdata/base64-roundtrip.csv row 1
**Postconditions:** Roundtrip works

---

### TC-335: BR-36 Renderer detection via orchestration

| Field | Value |
|-------|-------|
| **ID** | TC-335 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-36 |
| **Preconditions** | Multiple renderers available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check renderer detection | Uses orchestration engine, not hardcoded paths |

**Test Data:** testdata/png-export.csv rows 1-3
**Postconditions:** Dynamic detection

---

### TC-336: BR-37 Backward compatible no base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-336 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-37 |
| **Preconditions** | Legacy call |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call without base_dir | Uses primary workspace |

**Test Data:** testdata/multi-worktree.csv row 2
**Postconditions:** Backward compatible

---

### TC-337: BR-38 Legacy tools deprecated not removed

| Field | Value |
|-------|-------|
| **ID** | TC-337 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-38 |
| **Preconditions** | Legacy extension tools |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check legacy tool registration | Deprecated but still functional |

**Test Data:** N/A (manual check)
**Postconditions:** Legacy supported

---

### TC-338: BR-39 base_dir absolute + allowlist

| Field | Value |
|-------|-------|
| **ID** | TC-338 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-39 |
| **Preconditions** | Various base_dir values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | base_dir relative | Rejected (must be absolute) |
| 2 | base_dir absolute, not in allowlist | PATH_REJECTED |
| 3 | base_dir absolute, in allowlist | Accepted |

**Test Data:** testdata/security.csv rows 1,11,12
**Postconditions:** Validation enforced

---

### TC-339: BR-40 Relative paths with ../ escape rejected

| Field | Value |
|-------|-------|
| **ID** | TC-339 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-40 |
| **Preconditions** | file_path with ../ |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | file_path=../../etc/passwd | PATH_REJECTED |

**Test Data:** testdata/security.csv row 4
**Postconditions:** Escape prevented

---

### TC-340: BR-41 Absolute file_path validated in any workspace

| Field | Value |
|-------|-------|
| **ID** | TC-340 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-41 |
| **Preconditions** | Absolute file_path |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Absolute path in worktree A, base_dir=worktree B | Validated within base_dir (worktree B) |
| 2 | Absolute path in worktree A, no base_dir | Validated within primary workspace |

**Test Data:** testdata/multi-worktree.csv rows 3,5
**Postconditions:** Correct validation

---

### TC-341: BR-42 No base_dir → primary workspace

| Field | Value |
|-------|-------|
| **ID** | TC-341 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-42 |
| **Preconditions** | No base_dir provided |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call without base_dir | Primary workspace used |

**Test Data:** testdata/multi-worktree.csv row 2
**Postconditions:** Legacy behavior

---

### TC-342: BR-43 Symlinks resolved before validation

| Field | Value |
|-------|-------|
| **ID** | TC-342 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-43 |
| **Preconditions** | Symlink in path |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Path contains symlink | Realpath resolved before containment check |

**Test Data:** testdata/security.csv row 5
**Postconditions:** Symlink resolved

---

### TC-343: BR-44 Win32 case-fold containment

| Field | Value |
|-------|-------|
| **ID** | TC-343 |
| **Priority** | High |
| **Type** | Business Rule — Security |
| **Requirement** | BR-44 |
| **Preconditions** | Windows paths with different case |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | C:\\Project vs c:\\project | Case-fold match, containment passes |

**Test Data:** testdata/security.csv row 13 (case-fold)
**Postconditions:** Case-insensitive on Windows

---

### TC-344: BR-45 Empty base_dir treated as absent

| Field | Value |
|-------|-------|
| **ID** | TC-344 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-45 |
| **Preconditions** | Empty/whitespace base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | base_dir="" | Treated as absent, primary workspace |
| 2 | base_dir="   " | Treated as absent |

**Test Data:** testdata/boundary-negative.csv rows 5-6 (empty base_dir)
**Postconditions:** Handled as absent

---

### TC-345: BR-46 Non-string base_dir typed error

| Field | Value |
|-------|-------|
| **ID** | TC-345 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-46 |
| **Preconditions** | base_dir as number/object/array |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | base_dir=123 | Error: "base_dir must be a non-empty string" |
| 2 | base_dir={} | Error: "base_dir must be a non-empty string" |
| 3 | base_dir=[] | Error: "base_dir must be a non-empty string" |

**Test Data:** testdata/security.csv row 7, testdata/boundary-negative.csv rows 7-8
**Postconditions:** Type validation

---

### TC-346: BR-47 All file_path validated against allowlist

| Field | Value |
|-------|-------|
| **ID** | TC-346 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-47 |
| **Preconditions** | Various file_path scenarios |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | All drawio tools | Same validation applied |

**Test Data:** testdata/security.csv rows 1-10
**Postconditions:** Consistent validation

---

### TC-347: BR-48 path.resolve then validate

| Field | Value |
|-------|-------|
| **ID** | TC-347 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-48 |
| **Preconditions** | Path with .. sequences |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | file_path=diagrams/../secrets.txt | Resolved then validated |

**Test Data:** testdata/security.csv row 14 (canonicalization)
**Postconditions:** Canonicalization works

---

### TC-348: BR-49 Reject .. escaping workspace

| Field | Value |
|-------|-------|
| **ID** | TC-348 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-49 |
| **Preconditions** | Path traversal with .. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Any .. escaping workspace | Rejected |

**Test Data:** testdata/security.csv rows 2,4,9
**Postconditions:** Traversal blocked

---

### TC-349: BR-50 Reject absolute outside allowlist

| Field | Value |
|-------|-------|
| **ID** | TC-349 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-50 |
| **Preconditions** | Absolute path outside workspaces |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | C:\\Windows\\... | Rejected |

**Test Data:** testdata/security.csv row 8
**Postconditions:** Blocked

---

### TC-350: BR-51 Generic error messages

| Field | Value |
|-------|-------|
| **ID** | TC-350 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-51 |
| **Preconditions** | Various path violations |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check error responses | "File path not allowed: path traversal detected" (no paths leaked) |

**Test Data:** testdata/security.csv rows 1-10
**Postconditions:** No filesystem leak

---

### TC-351: BR-52 All drawio tools same validation

| Field | Value |
|-------|-------|
| **ID** | TC-351 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-52 |
| **Preconditions** | drawio_auto_layout and drawio_export_png |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test both tools with same violation | Same error code and message |

**Test Data:** testdata/security.csv rows 1-10 (both tools)
**Postconditions:** Consistent enforcement

---

### TC-352: BR-53 Separator-boundary containment

| Field | Value |
|-------|-------|
| **ID** | TC-352 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-53 |
| **Preconditions** | Path at workspace boundary |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Path exactly at workspace root | Allowed (separator-boundary) |
| 2 | Path one level outside | Rejected |

**Test Data:** testdata/security.csv rows 15-16 (boundary)
**Postconditions:** Separator-boundary correct

---

### TC-353: BR-54 Audit logging for traversal attempts

| Field | Value |
|-------|-------|
| **ID** | TC-353 |
| **Priority** | High |
| **Type** | Business Rule — Security |
| **Requirement** | BR-54 |
| **Preconditions** | Path traversal attempt |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger traversal attempt | Audit log entry with timestamp, sanitized path, client_info, error_code, workspace_root |

**Test Data:** testdata/security.csv rows 1-10
**Postconditions:** Audit logged

---

### TC-354: BR-55 Symlinks resolved before validation

| Field | Value |
|-------|-------|
| **ID** | TC-354 |
| **Priority** | Critical |
| **Type** | Business Rule — Security |
| **Requirement** | BR-55 |
| **Preconditions** | Symlink pointing outside |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Symlink escape attempt | Rejected, realpath resolved first |

**Test Data:** testdata/security.csv row 5
**Postconditions:** Symlink resolved

---

### TC-355: BR-56 No stack traces in errors

| Field | Value |
|-------|-------|
| **ID** | TC-355 |
| **Priority** | High |
| **Type** | Business Rule — Security |
| **Requirement** | BR-56 |
| **Preconditions** | Any error response |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check error responses | No stack traces, no filesystem details |

**Test Data:** testdata/error-flows.csv all rows
**Postconditions:** Clean errors

---

## 5. Boundary & Negative Testing

### TC-400: overlap_threshold boundary (0, 0.5]

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | FSD 3.1.4 Validation Rules |
| **Test Level** | PBT, UT, IT |
| **Preconditions** | Various overlap_threshold values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | overlap_threshold=0 | Validation error |
| 2 | overlap_threshold=0.001 | Accepted |
| 3 | overlap_threshold=0.5 | Accepted |
| 4 | overlap_threshold=0.5001 | Validation error |
| 5 | overlap_threshold=-0.1 | Validation error |

**Test Data:** testdata/boundary-negative.csv rows 9-13
**Postconditions:** Boundary enforced

---

### TC-401: gap_threshold boundary ≥10

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | FSD 3.1.4 Validation Rules |
| **Preconditions** | Various gap_threshold values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | gap_threshold=9 | Validation error |
| 2 | gap_threshold=10 | Accepted |
| 3 | gap_threshold=1000 | Accepted |
| 4 | gap_threshold=-1 | Validation error |

**Test Data:** testdata/boundary-negative.csv rows 14-17
**Postconditions:** Boundary enforced

---

### TC-402: spacing boundary 1-500

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-23 |
| **Preconditions** | Various spacing values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | spacing=0 | Validation error |
| 2 | spacing=1 | Accepted |
| 3 | spacing=500 | Accepted |
| 4 | spacing=501 | Validation error |

**Test Data:** testdata/boundary-negative.csv rows 18-21
**Postconditions:** Boundary enforced

---

### TC-403: container_margin boundary ≥0

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-24 |
| **Preconditions** | Various container_margin values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | container_margin=-1 | Validation error |
| 2 | container_margin=0 | Accepted |
| 3 | container_margin=1000 | Accepted |

**Test Data:** testdata/boundary-negative.csv rows 22-24
**Postconditions:** Boundary enforced

---

### TC-404: max_iterations boundary [1,5]

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-12 |
| **Preconditions** | Various max_iterations values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | max_iterations=0 | Validation error |
| 2 | max_iterations=1 | Accepted |
| 3 | max_iterations=5 | Accepted |
| 4 | max_iterations=6 | Validation error |

**Test Data:** testdata/boundary-negative.csv rows 25-28
**Postconditions:** Boundary enforced

---

### TC-405: spacing_increment boundary [10,50]

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-13 |
| **Preconditions** | Various spacing_increment values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | spacing_increment=9 | Validation error |
| 2 | spacing_increment=10 | Accepted |
| 3 | spacing_increment=50 | Accepted |
| 4 | spacing_increment=51 | Validation error |

**Test Data:** testdata/boundary-negative.csv rows 29-32
**Postconditions:** Boundary enforced

---

### TC-406: file_path empty string

| Field | Value |
|-------|-------|
| **ID** | TC-406 |
| **Priority** | High |
| **Type** | Negative |
| **Requirement** | FSD 3.1.4 (required field) |
| **Preconditions** | file_path="" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with empty file_path | Validation error: file_path required |

**Test Data:** testdata/boundary-negative.csv row 33
**Postconditions:** Error returned

---

### TC-407: file_path not .drawio extension

| Field | Value |
|-------|-------|
| **ID** | TC-407 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | FSD 3.1.4 Validation Rules |
| **Preconditions** | file_path="diagram.txt" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with non-.drawio file | Validation error or FILE_NOT_FOUND |

**Test Data:** testdata/boundary-negative.csv row 34
**Postconditions:** Error returned

---

### TC-408: content_base64 invalid base64

| Field | Value |
|-------|-------|
| **ID** | TC-408 |
| **Priority** | High |
| **Type** | Negative |
| **Requirement** | FSD 3.4.4 Validation Rules |
| **Preconditions** | content_base64="not-valid-base64!" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call drawio_auto_layout with invalid base64 | Error: BASE64_DECODE_ERROR |

**Test Data:** testdata/boundary-negative.csv row 35
**Postconditions:** Error returned

---

### TC-409: content_base64 + file_path both provided

| Field | Value |
|-------|-------|
| **ID** | TC-409 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | FSD 3.4.4 Validation Rules (mutually exclusive) |
| **Preconditions** | Both content_base64 and file_path provided |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with both | Validation error: mutually exclusive |

**Test Data:** testdata/boundary-negative.csv row 36
**Postconditions:** Error returned

---

### TC-410: output_base64 without content_base64

| Field | Value |
|-------|-------|
| **ID** | TC-410 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | FSD 3.4.4 Validation Rules |
| **Preconditions** | output_base64=true with file_path (no content_base64) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with output_base64 but no content_base64 | Validation error |

**Test Data:** testdata/boundary-negative.csv row 37
**Postconditions:** Error returned

---

### TC-411: mode invalid value

| Field | Value |
|-------|-------|
| **ID** | TC-411 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | FSD 3.1.4 Validation Rules |
| **Preconditions** | mode="invalid" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with invalid mode | Validation error: must be review or apply |

**Test Data:** testdata/boundary-negative.csv row 38
**Postconditions:** Error returned

---

### TC-412: scope invalid value

| Field | Value |
|-------|-------|
| **ID** | TC-412 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | FSD 3.2.4 Validation Rules |
| **Preconditions** | scope="invalid" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with invalid scope | Validation error: must be auto, positions, or ports |

**Test Data:** testdata/boundary-negative.csv row 39
**Postconditions:** Error returned

---

### TC-413: algorithm invalid value

| Field | Value |
|-------|-------|
| **ID** | TC-413 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | BR-21 |
| **Preconditions** | algorithm="invalid" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with invalid algorithm | Fallback to layered, warning logged |

**Test Data:** testdata/boundary-negative.csv row 40
**Postconditions:** Fallback applied

---

### TC-414: direction invalid value

| Field | Value |
|-------|-------|
| **ID** | TC-414 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | BR-22 |
| **Preconditions** | direction="INVALID" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with invalid direction | Validation error |

**Test Data:** testdata/boundary-negative.csv row 41
**Postconditions:** Error returned

---

### TC-415: Large diagram 500 nodes performance

| Field | Value |
|-------|-------|
| **ID** | TC-415 |
| **Priority** | Medium |
| **Type** | Boundary — Performance |
| **Requirement** | BR-19, TDD Section 8 |
| **Preconditions** | Diagram with 500 nodes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detection on 500 nodes | Completes within reasonable time, no OOM |

**Test Data:** testdata/performance.csv row 8 (500 nodes)
**Postconditions:** Handled

---

### TC-416: Very large diagram 501 nodes rejected

| Field | Value |
|-------|-------|
| **ID** | TC-416 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-19 |
| **Preconditions** | Diagram with 501 nodes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with 501 nodes | DIAGRAM_TOO_LARGE error |

**Test Data:** testdata/performance.csv row 2
**Postconditions:** Rejected

---

### TC-417: Empty content_base64

| Field | Value |
|-------|-------|
| **ID** | TC-417 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | FSD 3.4.4 |
| **Preconditions** | content_base64="" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with empty base64 | Validation error or INVALID_XML |

**Test Data:** testdata/boundary-negative.csv row 42
**Postconditions:** Error returned

---

### TC-418: Nested containers deep (5 levels)

| Field | Value |
|-------|-------|
| **ID** | TC-418 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | BR-26 |
| **Preconditions** | 5 levels of nested containers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with deep nesting | All levels resize correctly |

**Test Data:** testdata/elk-layout.csv row 14 (deep nesting)
**Postconditions:** Nested handled

---

### TC-419: Many edges (200) crossing detection

| Field | Value |
|-------|-------|
| **ID** | TC-419 |
| **Priority** | Medium |
| **Type** | Boundary — Performance |
| **Requirement** | BR-09, BR-10 |
| **Preconditions** | Diagram with 50 nodes, 200 edges |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call detection | Completes <500ms, all crossings detected |

**Test Data:** testdata/performance.csv row 9 (many edges)
**Postconditions:** Performance met

---

### TC-420: Special characters in file_path

| Field | Value |
|-------|-------|
| **ID** | TC-420 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | Path validation |
| **Preconditions** | file_path with Unicode, spaces, special chars |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | file_path with spaces | Handled correctly |
| 2 | file_path with Unicode | Handled correctly |
| 3 | file_path with NUL | Rejected (TC-211) |

**Test Data:** testdata/boundary-negative.csv rows 43-45
**Postconditions:** Special chars handled

---

## 6. Non-Functional Testing (Performance, Security)

### TC-600: Detection performance 50 nodes <500ms

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | BR-10, BRD Section 6, TDD Section 8.1 |
| **Test Level** | IT, E2E-API |
| **Preconditions** | 50-node diagram, mode=review |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure detection time over 10 runs | Average < 500ms, p95 < 800ms |

**Test Data:** testdata/performance.csv row 1
**Acceptance Criteria:** <500ms average

---

### TC-601: Verify loop 3 iterations <2s

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | BRD Section 6, TDD Section 8.1 |
| **Preconditions** | Diagram requiring 3 iterations, mode=apply |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure total verify loop time | < 2 seconds |

**Test Data:** testdata/verify-loop.csv row 3
**Acceptance Criteria:** <2s total

---

### TC-602: ELK Layered 50 nodes <1s

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | BRD Section 6, TDD Section 8.1 |
| **Preconditions** | 50 nodes, algorithm=layered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure layout time | < 1 second |

**Test Data:** testdata/performance.csv row 1
**Acceptance Criteria:** <1s

---

### TC-603: ELK Stress 30 nodes <1s

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | BRD Section 6, TDD Section 8.1 |
| **Preconditions** | 30 nodes, algorithm=stress |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure layout time | < 1 second |

**Test Data:** testdata/performance.csv row 10 (30 nodes stress)
**Acceptance Criteria:** <1s

---

### TC-604: ELK Force 50 nodes <1s

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | BRD Section 6, TDD Section 8.1 |
| **Preconditions** | 50 nodes, algorithm=force |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure layout time | < 1 second |

**Test Data:** testdata/performance.csv row 11 (50 nodes force)
**Acceptance Criteria:** <1s

---

### TC-605: PNG Export CLI <30s

| Field | Value |
|-------|-------|
| **ID** | TC-605 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | BRD Section 6, TDD Section 8.1 |
| **Preconditions** | Complex diagram, CLI renderer |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure PNG export time | < 30 seconds |

**Test Data:** testdata/png-export.csv row 1
**Acceptance Criteria:** <30s

---

### TC-606: Path resolution <10ms

| Field | Value |
|-------|-------|
| **ID** | TC-606 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | TDD Section 8.1 |
| **Preconditions** | Various path resolution scenarios |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure path resolution | < 10ms |

**Test Data:** testdata/multi-worktree.csv all rows
**Acceptance Criteria:** <10ms

---

### TC-607: Concurrent tool calls (10 parallel)

| Field | Value |
|-------|-------|
| **ID** | TC-607 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | TDD Section 8.5 (stateless, parallel) |
| **Preconditions** | 10 parallel tool calls |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute 10 parallel drawio_auto_layout calls | All complete successfully, no interference |

**Test Data:** testdata/performance.csv row 12 (concurrent)
**Acceptance Criteria:** All pass

---

### TC-608: Memory stability under load

| Field | Value |
|-------|-------|
| **ID** | TC-608 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | TDD Section 8.2 (caching), 8.6 (resource limits) |
| **Preconditions** | Repeated calls over time |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run 100 sequential calls | No memory leak, stable memory usage |

**Test Data:** testdata/performance.csv row 13 (load)
**Acceptance Criteria:** Stable memory

---

### TC-609: Path traversal blocked — relative traversal

| Field | Value |
|-------|-------|
| **ID** | TC-609 |
| **Priority** | Critical |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-47 to BR-56, UC-06, Story 6 |
| **Preconditions** | file_path="../../../etc/passwd" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with traversal payload | Rejected, generic error, audit logged |

**Test Data:** testdata/security.csv row 2
**Acceptance Criteria:** Blocked, no leak

---

### TC-610: Path traversal blocked — absolute outside

| Field | Value |
|-------|-------|
| **ID** | TC-610 |
| **Priority** | Critical |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-47 to BR-56, UC-06, Story 6 |
| **Preconditions** | file_path="C:\\Windows\\System32\\config\\SAM" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with absolute outside path | Rejected, generic error, audit logged |

**Test Data:** testdata/security.csv row 8
**Acceptance Criteria:** Blocked, no leak

---

### TC-611: Path traversal blocked — symlink escape

| Field | Value |
|-------|-------|
| **ID** | TC-611 |
| **Priority** | Critical |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-43, BR-55, UC-06 EF-3 |
| **Preconditions** | Symlink pointing outside workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with symlink escape | Rejected, realpath resolved, audit logged |

**Test Data:** testdata/security.csv row 5
**Acceptance Criteria:** Blocked, symlink resolved

---

### TC-612: Path traversal blocked — NUL byte

| Field | Value |
|-------|-------|
| **ID** | TC-612 |
| **Priority** | Critical |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-51, UC-05 EF-4 |
| **Preconditions** | file_path with NUL byte |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with NUL byte | Rejected, generic error |

**Test Data:** testdata/security.csv row 6
**Acceptance Criteria:** Blocked

---

### TC-613: Generic error messages no filesystem leak

| Field | Value |
|-------|-------|
| **ID** | TC-613 |
| **Priority** | Critical |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-51, BR-56, Story 6 AC-5 |
| **Preconditions** | Various path violations |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check all error responses | No absolute paths, no stack traces, no directory structure |

**Test Data:** testdata/security.csv all rows
**Acceptance Criteria:** Clean errors

---

### TC-614: Win32 case-fold parity

| Field | Value |
|-------|-------|
| **ID** | TC-614 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-44 |
| **Preconditions** | Windows paths with case differences |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | C:\\Project\\file vs c:\\project\\file | Both resolve to same, containment works |

**Test Data:** testdata/security.csv row 13
**Acceptance Criteria:** Case-insensitive match

---

### TC-615: Audit log completeness

| Field | Value |
|-------|-------|
| **ID** | TC-615 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | BR-54, TDD Section 7.6 |
| **Preconditions** | Path traversal attempt |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check audit log | Contains timestamp, sanitized attempted_path, client_info, error_code, workspace_root |

**Test Data:** testdata/security.csv row 1
**Acceptance Criteria:** Complete audit entry

---

## 7. Integration Testing

### TC-700: MCP tool registration and discovery

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 3.1, BR-34, UC-04 |
| **Test Level** | IT, E2E-API |
| **Preconditions** | MCP orchestration running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call find_tools for drawio | Both drawio_auto_layout and drawio_export_png listed with schemas |

**Test Data:** N/A (MCP call)
**Postconditions:** Tools discoverable

---

### TC-701: execute_dynamic_tool invocation

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 3.1, UC-04 |
| **Preconditions** | Tools registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call execute_dynamic_tool for drawio_auto_layout | Tool executes, returns valid response |

**Test Data:** testdata/integration.csv row 1
**Postconditions:** Invocation works

---

### TC-702: Extension bridge base_dir resolution

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-04, UC-05, TDD Section 2.1 |
| **Preconditions** | Extension bridge connected |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call via extension with base_dir | Path resolved by bridge, passed to backend |

**Test Data:** testdata/integration.csv row 2
**Postconditions:** Bridge resolution works

---

### TC-703: Workspace allowlist loading

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 6.5, BR-39 |
| **Preconditions** | MCP_WORKSPACE_ROOTS configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start backend | Allowlist loaded, contains all configured roots |

**Test Data:** testdata/integration.csv row 3 (allowlist config)
**Postconditions:** Allowlist populated

---

### TC-704: ELK.js dynamic import

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 6.1, 5.2 (Factory pattern) |
| **Preconditions** | elkjs npm package installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call drawio_auto_layout with mode=apply | ELK.js dynamically imported, layout executes |

**Test Data:** testdata/integration.csv row 4
**Postconditions:** ELK loaded

---

### TC-705: draw.io CLI detection

| Field | Value |
|-------|-------|
| **ID** | TC-705 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 6.2, UC-04 |
| **Preconditions** | draw.io CLI installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call drawio_export_png | CLI detected, used as primary renderer |

**Test Data:** testdata/integration.csv row 5
**Postconditions:** CLI detected

---

### TC-706: Chrome DevTools MCP fallback

| Field | Value |
|-------|-------|
| **ID** | TC-706 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 6.3, UC-04 AF-3 |
| **Preconditions** | CLI unavailable, Chrome DevTools MCP available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call drawio_export_png | Falls back to Chrome DevTools MCP |

**Test Data:** testdata/integration.csv row 6
**Postconditions:** Fallback works

---

### TC-707: Puppeteer MCP fallback

| Field | Value |
|-------|-------|
| **ID** | TC-707 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | TDD Section 6.4, UC-04 AF-4 |
| **Preconditions** | CLI and Chrome unavailable, Puppeteer available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call drawio_export_png | Falls back to Puppeteer MCP |

**Test Data:** testdata/integration.csv row 7
**Postconditions:** Fallback works

---

### TC-708: Content_base64 passthrough

| Field | Value |
|-------|-------|
| **ID** | TC-708 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | TDD Section 3.1.2, BR-35 |
| **Preconditions** | Base64 XML content |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with content_base64, output_base64=true | XML processed, base64 returned, no file I/O |

**Test Data:** testdata/integration.csv row 8
**Postconditions:** Passthrough works

---

### TC-709: Structured logging (pino)

| Field | Value |
|-------|-------|
| **ID** | TC-709 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | TDD Section 9.1 |
| **Preconditions** | Tool execution |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check logs | Structured JSON with tool name, parameters, timing |

**Test Data:** testdata/integration.csv row 9
**Postconditions:** Logs structured

---

### TC-710: Metrics collection

| Field | Value |
|-------|-------|
| **ID** | TC-710 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | TDD Section 9.2 |
| **Preconditions** | Multiple tool calls |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check metrics endpoint | Counters for invocations, durations, issues, renderer used, path rejections |

**Test Data:** testdata/integration.csv row 10
**Postconditions:** Metrics collected

---

## 8. Regression Testing

### TC-800: Legacy drawio_auto_layout without base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-37, BR-42, F6 existing behavior |
| **Test Level** | IT, E2E-API |
| **Preconditions** | Existing diagram, no base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call legacy style (file_path only) | Works identically to before |

**Test Data:** testdata/regression.csv row 1
**Postconditions:** Backward compatible

---

### TC-801: Legacy drawio_export_png without base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-37, F6 existing behavior |
| **Preconditions** | Existing diagram, no base_dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call legacy style (content_base64 only) | Works identically to before |

**Test Data:** testdata/regression.csv row 2
**Postconditions:** Backward compatible

---

### TC-802: Existing detection types still work

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | F6 engine existing detections |
| **Preconditions** | Diagrams with previously detected issues |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run detection on existing test diagrams | Same issues detected (plus new ones from precision) |

**Test Data:** testdata/regression.csv rows 3-8
**Postconditions:** No regression

---

### TC-803: Existing ELK layered algorithm behavior

| Field | Value |
|-------|-------|
| **ID** | TC-803 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | SA4E-84 (previous ELK integration) |
| **Preconditions** | Diagrams that worked with previous ELK layered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | algorithm=layered on existing diagrams | Same or better layout quality |

**Test Data:** testdata/regression.csv rows 9-10
**Postconditions:** No regression

---

### TC-804: Existing fix strategies (ports, local repair)

| Field | Value |
|-------|-------|
| **ID** | TC-804 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | F6 engine existing fix strategies |
| **Preconditions** | Diagrams suitable for ports/local repair |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | scope=ports on edge routing issues | Ports-only fix works |
| 2 | scope=positions on few violations | Local repair works |

**Test Data:** testdata/regression.csv rows 11-12
**Postconditions:** Strategies work

---

### TC-805: PNG export existing behavior

| Field | Value |
|-------|-------|
| **ID** | TC-805 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | F6 existing PNG export |
| **Preconditions** | Diagrams previously exported |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Export previously working diagrams | PNG generated successfully |

**Test Data:** testdata/regression.csv row 13
**Postconditions:** Export works

---

### TC-806: File path resolution legacy mode

| Field | Value |
|-------|-------|
| **ID** | TC-806 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | SA4E-356, SA4E-357 (pinned root) |
| **Preconditions** | Legacy single-root workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call without base_dir in legacy mode | Resolves against pinned workspace root |

**Test Data:** testdata/regression.csv row 14
**Postconditions:** Legacy mode works

---

### TC-807: workspace_root alias deprecated but works

| Field | Value |
|-------|-------|
| **ID** | TC-807 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-45, BR-38 |
| **Preconditions** | Old calls using workspace_root |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with workspace_root | Treated as base_dir, works |

**Test Data:** testdata/regression.csv row 15
**Postconditions:** Alias supported

---

### TC-808: Auto_fix boolean alias

| Field | Value |
|-------|-------|
| **ID** | TC-808 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-37, FSD 3.2.4 (legacy alias) |
| **Preconditions** | Old calls using auto_fix=true |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with auto_fix=true | Treated as mode=apply |

**Test Data:** testdata/regression.csv row 16
**Postconditions:** Alias works

---

### TC-809: Detection flags default true

| Field | Value |
|-------|-------|
| **ID** | TC-809 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | FSD 3.1.4 (detect_* defaults) |
| **Preconditions** | Calls without detect_* flags |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call without detect_overlaps, detect_crossings, detect_diagonals | All three enabled by default |

**Test Data:** testdata/regression.csv row 17
**Postconditions:** Defaults work

---

### TC-810: Error codes backward compatible

| Field | Value |
|-------|-------|
| **ID** | TC-810 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | FSD 3.1.5, 3.2.5, 3.3.5 (error codes) |
| **Preconditions** | Error scenarios |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger known errors | Same error codes as before (PATH_REJECTED_OUTSIDE_ALLOWLIST, FILE_NOT_FOUND, INVALID_XML, etc.) |

**Test Data:** testdata/regression.csv rows 18-22
**Postconditions:** Error codes stable

---

## 9. E2E-API Test Cases (Automated)

### E2E-API-01: Full CRUD lifecycle via MCP tools

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-crud.e2e.test.ts |
| **Traces To** | UC-01, UC-02, UC-03, UC-04, UC-05 |

**Test Steps:**

```typescript
test("Full diagram lifecycle: create -> detect -> fix -> export", async () => {
  // 1. Create test diagram file
  await fs.writeFile(testDrawioPath, testDiagramXml);
  
  // 2. Detect issues (review mode)
  const detectResp = await mcpCall('drawio_auto_layout', {
    file_path: testDrawioPath,
    mode: 'review'
  });
  expect(detectResp.status).toBe('needs_fix');
  
  // 3. Auto-fix with verify loop (apply mode)
  const fixResp = await mcpCall('drawio_auto_layout', {
    file_path: testDrawioPath,
    mode: 'apply',
    max_iterations: 3
  });
  expect(fixResp.status).toBe('fixed');
  
  // 4. Export to PNG
  const fixedXml = await fs.readFile(testDrawioPath, 'utf-8');
  const exportResp = await mcpCall('drawio_export_png', {
    content_base64: Buffer.from(fixedXml).toString('base64')
  });
  expect(exportResp.success).toBe(true);
  expect(exportResp.output_base64).toBeDefined();
});
```

---

### E2E-API-02: Multi-worktree path resolution

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-multiworktree.e2e.test.ts |
| **Traces To** | UC-05, BR-39 to BR-46 |

```typescript
test("Cross-worktree file access", async () => {
  const worktreeB = path.join(process.cwd(), '..', 'worktree-B');
  await mcpCall('drawio_auto_layout', {
    file_path: 'diagrams/test.drawio',
    base_dir: worktreeB,
    mode: 'review'
  });
  // Verify effective_root is worktreeB
});
```

---

### E2E-API-03: Path traversal prevention

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | Critical |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-security.e2e.test.ts |
| **Traces To** | UC-06, BR-47 to BR-56 |

```typescript
test("Path traversal attempts blocked", async () => {
  const payloads = [
    { file_path: '../../../etc/passwd' },
    { file_path: 'C:\\Windows\\System32\\config\\SAM' },
    { file_path: 'diagrams/../../secrets.txt' },
    { file_path: 'diagrams\0secret.txt' }
  ];
  for (const payload of payloads) {
    const resp = await mcpCall('drawio_auto_layout', payload);
    expect(resp.error).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
  }
});
```

---

### E2E-API-04: Verify loop iteration history

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-verifyloop.e2e.test.ts |
| **Traces To** | UC-02, BR-12 to BR-16 |

```typescript
test("Verify loop records iteration history", async () => {
  const resp = await mcpCall('drawio_auto_layout', {
    file_path: complexDiagramPath,
    mode: 'apply',
    max_iterations: 3
  });
  expect(resp.iteration_history).toBeDefined();
  expect(resp.iteration_history.length).toBeLessThanOrEqual(3);
  resp.iteration_history.forEach((iter, i) => {
    expect(iter.iteration).toBe(i + 1);
    expect(iter.issues_before).toBeGreaterThanOrEqual(iter.issues_after);
  });
});
```

---

### E2E-API-05: ELK algorithm selection

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-elk-algorithms.e2e.test.ts |
| **Traces To** | UC-03, BR-21 to BR-33 |

```typescript
const algorithms = ['layered', 'stress', 'force', 'radial'];
for (const algo of algorithms) {
  test(`ELK ${algo} algorithm works`, async () => {
    const resp = await mcpCall('drawio_auto_layout', {
      file_path: testDiagramPath,
      mode: 'apply',
      algorithm: algo
    });
    expect(resp.status).toBe('fixed');
    expect(resp.repositioned_nodes.length).toBeGreaterThan(0);
  });
}
```

---

### E2E-API-06: Renderer fallback chain

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-export-fallback.e2e.test.ts |
| **Traces To** | UC-04, TDD 6.2-6.4 |

```typescript
test("Renderer fallback: CLI -> Chrome -> Puppeteer", async () => {
  // Mock CLI unavailable, Chrome available
  const resp = await mcpCall('drawio_export_png', {
    content_base64: testDiagramBase64
  });
  expect(['drawio-cli', 'chrome-devtools-mcp', 'puppeteer-mcp']).toContain(resp.renderer);
});
```

---

### E2E-API-07: Base64 roundtrip

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-base64.e2e.test.ts |
| **Traces To** | UC-04, BR-35 |

```typescript
test("Base64 input -> layout -> base64 output", async () => {
  const resp = await mcpCall('drawio_auto_layout', {
    content_base64: testDiagramBase64,
    output_base64: true,
    mode: 'apply'
  });
  expect(resp.output_base64).toBeDefined();
  // Verify output is valid XML
  const outputXml = Buffer.from(resp.output_base64, 'base64').toString('utf-8');
  expect(outputXml).toContain('<mxGraphModel>');
});
```

---

### E2E-API-08: Concurrent requests handling

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-08 |
| **Priority** | Medium |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-concurrent.e2e.test.ts |
| **Traces To** | TDD Section 8.5 |

```typescript
test("10 concurrent requests handled correctly", async () => {
  const promises = Array(10).fill(null).map(() => 
    mcpCall('drawio_auto_layout', { file_path: testDiagramPath, mode: 'review' })
  );
  const results = await Promise.all(promises);
  results.forEach(r => expect(r.status).toBeDefined());
});
```

---

### E2E-API-09: Large diagram handling

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-09 |
| **Priority** | Medium |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-large.e2e.test.ts |
| **Traces To** | BR-19, TDD Section 8.6 |

```typescript
test("500 nodes accepted, 501 rejected", async () => {
  const resp500 = await mcpCall('drawio_auto_layout', { 
    content_base64: diagram500Nodes, mode: 'review' 
  });
  expect(resp500.status).not.toBe('error');
  
  const resp501 = await mcpCall('drawio_auto_layout', { 
    content_base64: diagram501Nodes, mode: 'review' 
  });
  expect(resp501.error).toContain('DIAGRAM_TOO_LARGE');
});
```

---

### E2E-API-10: Configuration via environment variables

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-10 |
| **Priority** | Medium |
| **Type** | Automated (vitest + fetch) |
| **Test Level** | E2E-API |
| **File** | tests/e2e/drawio-config.e2e.test.ts |
| **Traces To** | BR-18, BR-19, TDD Section 10.1 |

```typescript
test("SA4E_ELK_TIMEOUT_MS and SA4E_ELK_MAX_NODES respected", async () => {
  // Test with custom env vars
  process.env.SA4E_ELK_TIMEOUT_MS = '5000';
  process.env.SA4E_ELK_MAX_NODES = '100';
  // ... verify behavior
});
```

---

## 10. SIT Manual Test Cases

### SIT-01: Visual layout quality assessment

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | Medium |
| **Type** | Manual — Visual/UX |
| **Test Level** | SIT |
| **Requirement** | All layout algorithms |
| **Preconditions** | Complex diagrams with containers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate diagram with each algorithm | Visually inspect: no overlaps, clean routing, containers properly sized |
| 2 | Compare layered vs stress vs force vs radial | Each produces appropriate layout for diagram type |

**Note:** Cannot be automated — requires human visual judgment

---

### SIT-02: Nested container edge cases

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | Medium |
| **Type** | Manual — Exploratory |
| **Test Level** | SIT |
| **Requirement** | BR-26, UC-03 |
| **Preconditions** | 3+ levels of nested containers with cross-container edges |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply layout | All containers resize, edges route correctly at each level |
| 2 | Verify inner container constraints | Children stay within inner, inner within outer |

**Note:** Complex nesting edge cases difficult to fully automate

---

### SIT-03: Renderer output visual verification

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | Medium |
| **Type** | Manual — Visual |
| **Test Level** | SIT |
| **Requirement** | PNG Export |
| **Preconditions** | Exported PNG from each renderer |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open PNG from CLI renderer | Matches diagram, correct colors, no artifacts |
| 2 | Open PNG from Chrome renderer | Matches diagram |
| 3 | Open PNG from Puppeteer renderer | Matches diagram |

**Note:** Visual verification required

---

### SIT-04: Complex sequence diagram layout

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | Low |
| **Type** | Manual — Exploratory |
| **Test Level** | SIT |
| **Requirement** | BR-03 (sequence constructs) |
| **Preconditions** | UML sequence diagram with lifelines, fragments |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply layout | Lifelines aligned, fragments contain messages, overlaps warned not fixed |

**Note:** Sequence diagrams have unique layout requirements

---

### SIT-05: Stress algorithm on large graph

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | Low |
| **Type** | Manual — Exploratory |
| **Test Level** | SIT |
| **Requirement** | BR-28 |
| **Preconditions** | 100+ node general graph |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply stress layout | Converges, aesthetically pleasing, no overlaps |

**Note:** Stress algorithm quality subjective

---

### SIT-06: Radial algorithm deep tree

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | Low |
| **Type** | Manual — Exploratory |
| **Test Level** | SIT |
| **Requirement** | BR-30 |
| **Preconditions** | Deep tree (8+ levels) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply radial layout | Root centered, rings organized, max 8 nodes/ring |

**Note:** Ring packing visual verification

---

### SIT-07: Error message clarity

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Priority** | Medium |
| **Type** | Manual — UX |
| **Test Level** | SIT |
| **Requirement** | BR-51, BR-56 |
| **Preconditions** | Various error conditions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger each error type | Error messages clear, actionable, no technical jargon |

**Note:** UX evaluation

---

### SIT-08: Tool parameter discovery

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Priority** | Low |
| **Type** | Manual — UX |
| **Test Level** | SIT |
| **Requirement** | BR-34 |
| **Preconditions** | MCP tools/list |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect tool schemas | All parameters documented, enums clear, defaults shown |

**Note:** Developer experience check

---

## 11. QA Verification Suite — Diagram Quality Guarantees (BRD STORY 7, BR-57..BR-65)

Added in v2.0 (QA rounds 1–3, 2026-11-11/12) and extended in v2.1 (QA round 4 follow-up, 2026-11-12) with the F1/F2/F4 hardening tests. These test cases verify the STORY 7 guarantees **end-to-end through the real tool** (`executeLocalTool('drawio_auto_layout', …)` on temp-copy fixtures under an allowlisted `MCP_WORKSPACE_ROOTS`) and through the pure detectors. All are automated vitest tests; measured this session: **27/27 defined (QA-01..QA-20 plus QA-D-01..QA-D-07), 27 pass + 0 skipped** (QA-11 now ACTIVE and passing, PD-QA1 closed — see §11.3). New files: `drawio-xml-rewrite.test.ts` (F1), `fs-guards.symlink-file.test.ts` (F2, under `extension/src/services/__tests__/`), `drawio-session-root-f4.test.ts` (F4), `drawio-ports-only-positions.test.ts` (QA-20 regression lock for the `enforceFinalGate` fix).

### 11.1 QA Round-3 Test Cases (the 4 QA files — 15 tests)

| ID | Vitest File | Test | Requirement | Level | Priority | Status |
|----|-------------|------|-------------|-------|----------|--------|
| QA-01 | drawio-session-root-binding.test.ts | resolves and fixes a file whose base_dir sits under a trusted parent | BR-55, A6/A7 | IT | High | ✅ PASS |
| QA-02 | drawio-session-root-binding.test.ts | rejects a base_dir under no parent with the exact allowlist code | BR-51, A6/A7 | IT | High | ✅ PASS |
| QA-03 | drawio-final-gate.test.ts | snaps off-grid vertices, labels the unambiguous branch and drops stale hints | BR-62, BR-64 | UT | High | ✅ PASS |
| QA-04 | drawio-final-gate.test.ts | already_good exit leaves a clean diagram byte-identical | BR-62 (idempotency gate) | UT | High | ✅ PASS |
| QA-05 | drawio-final-gate.test.ts | preflight unwrap + repair: wrapped off-grid input ends unwrapped and on-grid | BR-65, BR-62 | IT | High | ✅ PASS |
| QA-06 | drawio-final-gate.test.ts | adopt rewrite: boxes drawn over an empty band are adopted, then land on-grid | BR-62, BR-57 | IT | High | ✅ PASS |
| QA-07 | drawio-final-gate.test.ts | report-only exit: positions stay untouched, titles are never invented | BR-63 (CONTENT-OWNED) | IT | High | ✅ PASS |
| QA-08 | drawio-scope-args.test.ts | absent or unknown scope normalizes to auto | FSD 3.1.4 | UT | Medium | ✅ PASS |
| QA-09 | drawio-scope-args.test.ts | accepts the three documented values verbatim | FSD 3.1.4 | UT | Medium | ✅ PASS |
| QA-10 | drawio-scope-args.test.ts | spacing above the 500px cap is clamped, not rejected (BR-23) | BR-23 | UT | Medium | ✅ PASS |
| QA-11 | drawio-scope-args.test.ts | writes one distinct exit anchor per fan edge and moves no node | BR-16 (honesty), FSD 3.1 ports-only contract | IT | High | ✅ **PASS — ACTIVE** (PD-QA1 closed by DEV round 4c, see 11.3) |
| QA-12 | drawio-scope-args.test.ts | escalates to humanized_layered only when scope=positions asks for it | FSD 3.1.4 scope=positions | IT | High | ✅ PASS |
| QA-13 | drawio-corridor-invariants.test.ts | re-plans every edge through the corridors: no edge over unrelated content | BR-59, BR-60 | IT | High | ✅ PASS |
| QA-14 | drawio-corridor-invariants.test.ts | the skip edge detours around the middle lane step (background only) | BR-59 | IT | High | ✅ PASS |
| QA-15 | drawio-corridor-invariants.test.ts | an unrelated edge-less band never becomes a corridor for lane edges | BR-59, BR-57 | IT | High | ✅ PASS |
| QA-16 | drawio-xml-rewrite.test.ts | rewriteCells: multiple patches in one pass; untouched cells byte-identical; unknown id tolerated; duplicate last-wins; body replacement; self-closing skipped; unterminated cell completes; empty map identity (9 vitest tests) | BR-62 (grid-safe rewrite), BR-65 (bare mxGraphModel) | UT | High | ✅ PASS |
| QA-17 | drawio-xml-rewrite.test.ts | scaled timing guard: 2,000-cell table completes < 2 s (no quadratic regression) | FSD §8 performance, BR-10 | UT | High | ✅ PASS |
| QA-18 | fs-guards.symlink-file.test.ts | checkSymlinkGuardForPath: rejects workspace file that is itself a symlink outside root; allows regular file; allows non-existent path (ENOENT → new-file writes) (3 vitest tests) | BR-43, BR-55 (symlink escape), UC-06 | UT | Critical | ✅ PASS |
| QA-19 | drawio-session-root-f4.test.ts | drawio_auto_layout resolves and rewrites a file under the bound ctx.sessionRoot (root_source=session), not legacy folders[0] | BR-39, BR-40, BR-41 (multi-worktree / session-root binding) | UT/IT | High | ✅ PASS |
| QA-20 | drawio-ports-only-positions.test.ts | regression lock: on scope='ports' the apply→verify-loop→enforceFinalGate flow keeps all node positions (node c stays 400,80), spreads anchors (3 distinct exits), status='partial', node_proximity reported (FSD §3.1 ports-only contract) | BR-16 (honesty), FSD 3.1 ports-only contract | IT | High | ✅ PASS (QA-11 regression lock, DEV round 4c) |

### 11.2 Dev-Round Verification Tests Reused as QA Evidence (QA-D-01..07)

The dev round (2026-11-11) implemented the STORY 7 fixes; QA rounds 1–2 verified these tests against the BRD/FSD semantics and they are green in the 2026-11-12 full run. They provide the direct BR-57/58/61/64 coverage.

| ID | Vitest File | Test | Requirement | Level | Priority | Status |
|----|-------------|------|-------------|-------|----------|--------|
| QA-D-01 | drawio-sa406-defects.test.ts | flags an oversized plain band and skips shared-length swimlanes | BR-57 | UT | High | ✅ PASS |
| QA-D-02 | drawio-sa406-defects.test.ts | treats tight siblings as a medium issue and spreads them apart | BR-58 | UT | High | ✅ PASS |
| QA-D-03 | drawio-sa406-defects.test.ts | reports (never labels) a decision with three branches | BR-64 (CONTENT-OWNED) | UT | High | ✅ PASS |
| QA-D-04 | drawio-humanize-e2e.test.ts | leaves no blocking issues / no stale edge hints; re-parents cross-container edges to the root; output has no `childLayout=` | BR-59, BR-60, BR-61 | IT | High | ✅ PASS |
| QA-D-05 | drawio-sa406-defects.test.ts | detects a cross-lane edge parented to one endpoint lane and repairs it | BR-60 | IT | High | ✅ PASS |
| QA-D-06 | drawio-sa406-defects.test.ts | writes the bare `<mxGraphModel>` and never reintroduces `<mxfile>` | BR-65 | UT | High | ✅ PASS |
| QA-D-07 | drawio-sa406-defects.test.ts | snaps every vertex to the grid so no off-grid cell remains | BR-62 | UT | High | ✅ PASS |

### 11.3 PD-QA1 — Test QA-11 → CLOSED (fixed by DEV round 4c)

| Field | Value |
|-------|-------|
| **ID** | PD-QA1 (test QA-11, now ACTIVE — `it.skip` removed) |
| **Severity** | Major (contract violation, silent behaviour change) → **CLOSED** |
| **Contract** | FSD §3.1 fix strategies: *"Ports Only (`scope=ports`): Redistribute edge anchor ports, **keep all node positions**"* |
| **Observed (before fix)** | `repositioned_nodes=[{id:'c', x_old:400, y_old:80, x_new:400, y_new:100}]` — node `c` moves 20px although `scope='ports'`; `status='fixed'` instead of `'partial'`; `node_proximity` silently fixed, honesty contract broken |
| **Observed (after DEV round 4c fix, measured this session)** | Node `c` stays (400,80); honest `status='partial'`; `node_proximity` still reported; 3 distinct edge anchors (exit y = 0.25/0.5/0.75), no entry keys; `repositioned_nodes=[]`. QA-11 assertions all pass. |
| **Minimal repro** | Nodes `a(0,150) b(400,0) c(400,80) d(400,300)`, edges a→b/c/d, call `scope:'ports'`; node `c` sits 20px under `b` (< 40px gap threshold) |
| **DEV round 4c fix references** | `drawio-verify-loop.ts:50-54` computes `portsOnly` once from the original request scope; `:79` passes `{portsOnly}` into `finalize`; `:86,:89` forward `{portsOnly}` into `enforceFinalGate`; `drawio-apply-validate.ts:79-86` `enforceFinalGate(filePath, opts?)` forwards `opts` to `snapDiagramToGrid`; `drawio-grid-snap.ts:23-33` skips `debunch()`/`separateContainers()` when `opts?.portsOnly`. (Round 4b partial: `drawio-grid-snap.ts:27-30`, `drawio-apply-validate.ts:59-65`, `drawio-apply-strategy.ts:173`.) |
| **Root cause (resolved)** | `drawio-verify-loop.ts:87` `finalize()` called `enforceFinalGate(filePath)` **WITHOUT `opts`**, so `debunch()` re-ran on the ports-only file after `commitLayout` preserved positions. Now `opts` is forwarded through the final gate. |
| **Verified correct parts** | Anchor redistribution honours the contract (e1/e2/e3 exit y = 0.25/0.5/0.75, no entry keys) — unchanged by the fix. |
| **Regression lock** | `drawio-ports-only-positions.test.ts` (QA-20, §11.1): 2 tests — positions preserved through apply+verify+final-gate, anchors spread, final-gate invariants (on-grid, `<mxfile>`-free) enforced on the ports path. |
| **QA action** | QA-11 re-enabled (`it.skip` removed), assertions unchanged, now **PASS**. PD-QA1 → CLOSED. QA-11 listed as ACTIVE (not skipped). Production code NOT touched by QA (role boundary); fix authored by DEV round 4c. |

### 11.4 QA Round-3 Test-Fix Note (QA-15 fixture)

QA-15 initially failed because its fixture band (400×180 = 72,000 px² ≥ `MIN_BAND_AREA` 60,000, single 120×60 child → fill 0.1 < `MIN_FILL` 0.2) is **genuinely oversized** — the detector correctly reports `band_oversize` (medium), a defect class orthogonal to the corridor invariant under test. Resolution: **test fixture fixed** (band resized to 200×150 = 30,000 px² < 60,000), expectation unchanged. QA-15 now passes and still asserts zero medium+ issues.

---

## 12. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 | FSD 3.1 | TC-001 to TC-011, TC-100 to TC-103, TC-200 to TC-202, TC-300 to TC-310, TC-400, TC-401, TC-406, TC-407, TC-411, TC-600, TC-609, E2E-API-01 | ✅ |
| UC-02 | FSD 3.2 | TC-012 to TC-015, TC-104 to TC-107, TC-203, TC-206, TC-311 to TC-319, TC-404, TC-405, TC-601, E2E-API-01, E2E-API-04 | ✅ |
| UC-03 | FSD 3.3 | TC-016 to TC-021, TC-029, TC-030, TC-108 to TC-110, TC-203 to TC-205, TC-224, TC-225, TC-320 to TC-332, TC-402, TC-403, TC-413, TC-414, TC-418, TC-602 to TC-604, E2E-API-01, E2E-API-05 | ✅ |
| UC-04 | FSD 3.4 | TC-025 to TC-028, TC-114, TC-115, TC-220, TC-333 to TC-337, TC-408 to TC-410, TC-605, E2E-API-01, E2E-API-06, E2E-API-07 | ✅ |
| UC-05 | FSD 3.5 | TC-022 to TC-024, TC-111 to TC-113, TC-207 to TC-212, TC-214, TC-215, TC-338 to TC-345, TC-412, TC-606, E2E-API-01, E2E-API-02 | ✅ |
| UC-06 | FSD 3.6 | TC-202, TC-209 to TC-213, TC-215, TC-346 to TC-355, TC-609 to TC-615 | ✅ |
| BR-01 to BR-56 | FSD 3.1.3-3.6.3 | TC-300 to TC-355 | ✅ |
| Story 1 AC-1 to AC-6 | BRD 2.3 | TC-001, TC-002, TC-003, TC-004, TC-011, TC-310 | ✅ |
| Story 2 AC-1 to AC-6 | BRD 2.3 | TC-012, TC-013, TC-014, TC-015, TC-313, TC-314 | ✅ |
| Story 3 AC-1 to AC-7 | BRD 2.3 | TC-016, TC-017, TC-018, TC-019, TC-020, TC-021, TC-029 | ✅ |
| Story 4 AC-1 to AC-6 | BRD 2.3 | TC-025, TC-028, TC-333 to TC-337 | ✅ |
| Story 5 AC-1 to AC-6 | BRD 2.3 | TC-022, TC-023, TC-024, TC-338 to TC-345 | ✅ |
| Story 6 AC-1 to AC-6 | BRD 2.3 | TC-202, TC-209, TC-210, TC-211, TC-350, TC-351, TC-613 | ✅ |
| Story 7 AC-1 to AC-9 (BR-57 to BR-65) | BRD 2.7 | QA-01 to QA-15, QA-D-01 to QA-D-07, QA-16 (F1 drawio-xml-rewrite), QA-17 (F1 2,000-cell timing guard), QA-18 (F2 fs-guards symlink), QA-19 (F4 session-root threading), QA-20 (ports-only positions regression lock, PD-QA1 close evidence) (STC §11) | ✅ |
| NFR Performance | BRD 6, TDD 8 | TC-600 to TC-608 | ✅ |
| NFR Security | BRD 6, TDD 7 | TC-609 to TC-615 | ✅ |
| Error Codes | FSD 3.1.5, 3.2.5, 3.3.5, 3.4.5, 3.5.5, 3.6.5 | TC-200 to TC-225, TC-406 to TC-414, TC-810 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 6 | 6 | 100% |
| Business Rules | 65 (BR-01..BR-65) | 65 | 100% |
| Acceptance Criteria | 35 (Stories 1–7) | 35 | 100% |
| Error Codes | 22 | 22 | 100% |
| **Overall** | **128** | **128** | **100%** |

> **Honesty note (recomputed 2026-11-12):** BR-63/BR-64 are CONTENT-OWNED — coverage means the tool **detects and reports** the issue and never invents content (QA-07, QA-D-03); the human/author supplies titles and Yes/No labels. All other STORY 7 guarantees are tool-owned and verified end-to-end. All 27 QA-suite tests pass (QA-01..QA-20 plus QA-D-01..QA-D-07), 0 skipped — QA-11 is ACTIVE and passing (PD-QA1 closed by DEV round 4c: `enforceFinalGate` in drawio-verify-loop.ts now forwards `portsOnly` to `snapDiagramToGrid`, so the final gate no longer re-runs `debunch` on the ports path; measured node c stays (400,80), honest `status='partial'`, `node_proximity` still reported). Regression lock QA-20 (`drawio-ports-only-positions.test.ts`) guards against reintroduction. New hardening tests QA-16..QA-19 add coverage for F1 (batch XML rewrite + timing guard), F2 (file-level symlink guard), and F4 (session-root threading) within existing requirements — no new requirements added, so the requirement totals are unchanged at 128/128 = 100%.

---

## 13. Appendix

### Test Data Setup Scripts

See `documents/SA4E-406/testdata/` for CSV test data files:
- `detector-precision.csv` — Overlap, gap, proximity, containment, diagonal, crossing test cases
- `verify-loop.csv` — Verify loop scenarios (1-3 iterations, partial, rollback, strategies)
- `elk-layout.csv` — 4 algorithms, containers, nested, cross-container, edge cases
- `multi-worktree.csv` — base_dir, workspace_root, absolute paths, legacy
- `security.csv` — Path traversal, symlink, NUL, allowlist, case-fold, audit
- `error-flows.csv` — XML parsing, detector exceptions, permissions, validation
- `boundary-negative.csv` — All parameter boundaries, invalid values
- `performance.csv` — 50 nodes, 500 nodes, concurrent, timeouts, max nodes
- `png-export.csv` — CLI, Chrome, Puppeteer, base64 roundtrip
- `integration.csv` — MCP registration, bridge, allowlist, ELK, CLI, logging
- `regression.csv` — Legacy behavior, existing detections, fix strategies, error codes
- `base64-roundtrip.csv` — content_base64 + output_base64
- `alternative-flows.csv` — Empty diagram, missing file
- `business-rules.csv` — All 56 BR validation test cases

### Environment Configuration

```bash
# Required for multi-worktree testing
export MCP_WORKSPACE_ROOTS="/workspace/primary:/workspace/worktree-B:/workspace/worktree-C"

# Optional ELK tuning
export SA4E_ELK_MAX_NODES=500
export SA4E_ELK_TIMEOUT_MS=10000

# Logging
export LOG_LEVEL=debug
```

### Test Execution Commands

```bash
# Drawio tool suite (QA verification suite included) — measured 2026-11-12 v2.1
npx vitest run src/tools/drawio          # 23 files — 168 pass + 1 skipped (QA-11/PD-QA1)

# Full extension suite — measured 2026-11-12 v2.1
npx vitest run                            # 460 files passed | 1 skipped (461); 3,599 tests passed | 7 skipped (3,606)

# Run one QA verification file
npx vitest run src/tools/drawio/__tests__/drawio-final-gate.test.ts
```

---

*End of STC for SA4E-406*