# Discrepancy Report — SA4E-44

## SA → BA Feedback: FSD v2.2 vs Current Codebase

**Date:** 2026-07-17
**Author:** SA Agent
**Purpose:** Flag gaps between FSD v2.2 specification and current codebase state for SA→BA feedback loop.

---

## Summary

| # | Category | Severity | Description |
|---|----------|----------|-------------|
| D-01 | Task Queue Models | Low | TaskType enum missing CALL_GRAPH_BUILD, IMPACT_ANALYSIS (expected per FSD §5.2) |
| D-02 | Task Queue Models | Low | entry_id is non-nullable in current code; FSD requires nullable for code-intel tasks |
| D-03 | Code Intel Module | Medium | Current CodeIntelModule uses filesystem-based IndexingEngine; needs full rewrite per FSD UC-10 |
| D-04 | Database Schema | Medium | code_files, code_symbols, code_dependencies, code_call_graph tables do not yet exist |
| D-05 | knowledge_entries | Low | Missing `timestamp` column (required per BR-09, BR-10) |
| D-06 | Extension | Medium | No code-intel directory exists in extension/src/ yet |
| D-07 | Dependencies | Low | Backend still has chokidar/web-tree-sitter references (to be removed per UC-10) |

---

## Details

### D-01: TaskType Enum Incomplete

**FSD says (§5.2):** task_type includes TAG_ENRICHMENT, VECTOR_EMBEDDING, CALL_GRAPH_BUILD, IMPACT_ANALYSIS
**Current code:** Only TAG_ENRICHMENT and VECTOR_EMBEDDING exist in `backend/src/modules/memory/task-queue/models.ts`
**Action:** Extend enum (implementation task, not FSD issue)
**Severity:** Low — This is expected implementation work, not an FSD inconsistency

### D-02: entry_id Nullability

**FSD says (§5.2):** entry_id is nullable (Yes) — code-intel tasks reference code_files not knowledge_entries
**Current code:** `entry_id: number` (non-nullable) in PendingTask interface
**Action:** Change to `entry_id: number | null` during implementation
**Severity:** Low — Expected change

### D-03: CodeIntelModule Uses Filesystem

**FSD says (UC-10):** Backend MUST NOT access filesystem. Remove CodeIntelModule, IndexingEngine, chokidar, Tree-sitter.
**Current code:** `CodeIntelModule.ts` imports DatabaseManager, IndexingEngine, calls `startBackgroundIndexing()` and accesses workspace filesystem.
**Action:** Full rewrite of CodeIntelModule to query-only (DB-backed)
**Severity:** Medium — Core architectural change required

### D-04: Missing Database Tables

**FSD says (§5.3-5.6):** Tables code_files, code_symbols, code_dependencies, code_call_graph required
**Current code:** These tables do not exist in any migration
**Action:** Create migrations 004-007 as specified in TDD §6.1
**Severity:** Medium — New schema needed

### D-05: Missing timestamp Column

**FSD says (§5.1, BR-09, BR-10):** knowledge_entries needs `timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`
**Current code:** Column not present in knowledge_entries schema
**Action:** Add migration 008 to add timestamp column
**Severity:** Low — Additive schema change

### D-06: Extension Code Intelligence Not Started

**FSD says (UC-06, UC-07, UC-09):** Extension needs CodeIntelScanner, CodeIntelUploader, FileChangeWatcher
**Current code:** No `extension/src/code-intel/` directory exists
**Action:** Create new module in extension
**Severity:** Medium — Greenfield implementation

### D-07: Backend Dependencies to Remove

**FSD says (UC-10):** Remove chokidar, web-tree-sitter from backend
**Current code:** These are still referenced in CodeIntelModule imports
**Action:** Remove after CodeIntelModule rewrite
**Severity:** Low — Cleanup task

---

## Conclusion

**No FSD inconsistencies found.** All discrepancies are expected implementation gaps — the FSD describes the target state correctly, and the codebase is the current state that needs to be changed.

**Recommendation:** No FSD revision needed. Proceed to implementation.
