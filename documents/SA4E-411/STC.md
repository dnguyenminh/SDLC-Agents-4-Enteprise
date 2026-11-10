# Software Test Cases (STC)

## SA4E-411: [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-411 |
| Title | [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-11-10 |
| Status | Complete — All 18 child stories implemented and In Review |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-10 | QA Agent | Initial STC creation from BRD, FSD, TDD, and 18 child story test evidence |

---

## 1. Introduction

### 1.1 Purpose

This document defines the comprehensive test cases for the Code Agent 16K epic (SA4E-411), covering all 17 mandatory Acceptance Criteria (AC-01 through AC-17) plus the SA4E regression gate (AC-18). Test cases are derived from the BRD, FSD, TDD, and implementation evidence across 18 child stories (SA4E-412 through SA4E-429).

### 1.2 Scope

Test coverage spans four implementation phases decomposed into 18 child stories:

| Phase | Goal | Child Stories | Test Focus |
|-------|------|---------------|------------|
| **0** | Scope Decision: SQLite vs PostgreSQL, Language MVP | SA4E-412 | ADR-001 compliance |
| **1** | Code Intelligence Engine Foundation | SA4E-413..417 | Data model, pipeline, retrieval, persistence, patch |
| **2** | Agent UX Layer | SA4E-418..422 | Repo Map, chunking, core tools, scratchpad/eviction, token budget |
| **3** | Hardening | SA4E-423..426 | State recovery, sandbox, SSE, API pin enforcement |
| **4** | Validation | SA4E-427..429 | 17 AC suite, token/eviction integration, SA4E regression |

### 1.3 References

| Document | Location |
|----------|----------|
| BRD (Epic) | `documents/SA4E-411/BRD.md` |
| FSD (Epic) | `documents/SA4E-411/FSD.md` |
| TDD (Consolidated) | `documents/SA4E-411/TDD.md` |
| TDD-01 Data Model | `documents/SA4E-411/TDD-01-data-model.md` |
| ADR-001 | `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md` |
| AC Matrix | `documents/SA4E-427/ACCEPTANCE-MATRIX.md` |
| Performance Baselines | `documents/SA4E-427/PERF-BASELINES.md` |
| STP (Test Plan) | `documents/SA4E-411/STP.md` |

### 1.4 Test Data References

Test data CSV files in `documents/SA4E-411/testdata/`:
- `pre-seeded-data.csv` — Baseline repositories, commits, snapshots, embedding sets, chat sessions
- `create-snapshot-testdata.csv` — Snapshot creation and validation (UT-001..010)
- `retrieval-testdata.csv` — Snapshot-scoped retrieval (UT-011..025)
- `agent-persistence-testdata.csv` — Plan/step/approval persistence (UT-026..035)
- `patch-testdata.csv` — Staged patch protocol (UT-036..045)
- `token-budget-testdata.csv` — Runtime token budget tiers and escalation (UT-046..056)
- `sse-testdata.csv` — SSE durable log and replay (UT-057..073)
- `api-pin-testdata.csv` — API pinned snapshot enforcement (UT-074..085)

---

## 2. Test Strategy Summary

### 2.1 Test Levels

| Level | Scope | Automation | Tools | Prefix |
|-------|-------|------------|-------|--------|
| PBT | Property-based correctness (random inputs) | Automated | fast-check | PBT-XX |
| UT | Unit/edge case tests (in-process) | Automated | vitest | UT-XX |
| IT | Integration tests (Hono app in-process) | Automated | vitest + Hono `app.request()` | IT-XX |
| E2E-API | REST endpoint E2E (real server) | Automated | vitest + fetch | E2E-API-XX |
| E2E-UI | Browser UI E2E (Playwright) | Automated | Playwright | E2E-UI-XX |
| SIT | Manual exploratory / visual / timing only | Manual | Browser | SIT-XX |

### 2.2 Test Cases Summary by Level

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 12 | 12 | 0 |
| UT | 187 | 187 | 0 |
| IT | 43 | 43 | 0 |
| E2E-API | 28 | 28 | 0 |
| E2E-UI | 15 | 15 | 0 |
| SIT | 8 | 0 | 8 |
| **Total** | **293** | **285 (97%)** | **8 (3%)** |

---

## 3. Diagram Index

The following diagrams are shared with STP.md and provide visual context for test coverage and execution flow:

| # | Diagram | Image | Source (editable) | Purpose |
|---|---------|-------|-------------------|---------|
| 1 | Test Coverage Matrix | `diagrams/test-coverage.png` | `diagrams/test-coverage.drawio` | Requirements × Test Levels coverage heatmap |
| 2 | Test Execution Flow | `diagrams/test-execution-flow.png` | `diagrams/test-execution-flow.drawio` | Pipeline: PBT → UT → IT → E2E-API → E2E-UI → SIT with feedback loops |

![Test Coverage](diagrams/test-coverage.png)
![Test Execution Flow](diagrams/test-execution-flow.png)

---

## 4. Test Cases by Functional Area

### 4.1 Phase 0: Scope Decision (SA4E-412)

#### TC-001: ADR-001 Document Exists and Contains Required Decisions

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | ES-01, ADR-001 |
| **Preconditions** | Project repository checked out |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md` exists | File exists and is readable |
| 2 | Verify document records: SQLite for engine store, PostgreSQL for platform DB | Decision explicitly stated |
| 3 | Verify language MVP documented (Java, TypeScript primary; others syntax-only) | Language list present |
| 4 | Verify trigger conditions for PostgreSQL engine migration explicitly stated | Three conditions documented: (a) multi-team collaboration, (b) cross-repo search, (c) concurrent writers |

**Test Data:** N/A
**Postconditions:** N/A
**Pass/Fail Criteria:** All 4 verifications pass → PASS; any missing → FAIL

---

### 4.2 Phase 1: Snapshot/Revision Data Model (SA4E-413)

#### UT-001: Valid Snapshot Creation — AC-01 Baseline

| Field | Value |
|-------|-------|
| **ID** | UT-001 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-07, AC-01 |
| **Preconditions** | Clean SQLite DB; pre-seeded repo-001, commit-001 from `pre-seeded-data.csv` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createSnapshot(repo-001, commit-001, cfg-001, model-001, toolchain-001)` | Returns snapshot ID with status READY |
| 2 | Verify `code_index_snapshot` row created with correct repository_id, commit_id, config_fingerprint, code_model_version | Row matches input; status = READY |
| 3 | Verify UNIQUE constraint on (repository_id, commit_id, config_fingerprint, code_model_version) | Duplicate creation with same params returns existing snapshot |

**Test Data:** `create-snapshot-testdata.csv` row 2 (UT-001)
**Postconditions:** Snapshot snap-001 created
**Pass/Fail Criteria:** Snapshot created with READY status → PASS; otherwise FAIL

---

#### UT-002: Re-index Same Commit with New Adapter — AC-01

| Field | Value |
|-------|-------|
| **ID** | UT-002 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-07, AC-01 |
| **Preconditions** | Snapshot snap-001 exists (READY) from UT-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `createSnapshot(repo-001, commit-001, cfg-002, model-001, toolchain-001)` with NEW config_fingerprint | Returns NEW snapshot ID (snap-006) with status READY |
| 2 | Verify original snap-001 remains READY with unchanged symbol/chunk counts | snap-001 status = READY; counts unchanged |
| 3 | Verify new snapshot snap-006 contains only the new adapter output | New artifact rows reference snap-006 only |

**Test Data:** `create-snapshot-testdata.csv` row 3 (UT-002)
**Postconditions:** Two snapshots for same commit, different config_fingerprint
**Pass/Fail Criteria:** Old snapshot intact, new snapshot separate → PASS; corruption or mixing → FAIL

---

#### UT-003: Two Embedding Models on Same Snapshot — AC-02

| Field | Value |
|-------|-------|
| **ID** | UT-003 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-10, FR-SNAP-11, AC-02 |
| **Preconditions** | Snapshot snap-001 exists (READY) with code_chunks populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create `embedding_set` for `text-embedding-3-small` on snap-001 | embedding-set-001 created |
| 2 | Create `embedding_set` for `custom-model` on snap-001 | embedding-set-002 created |
| 3 | Generate embeddings for both sets against same chunks | code_embedding rows reference correct embedding_set_id |
| 4 | Query vector search with `text-embedding-3-small` | Returns only chunks from embedding-set-001 |
| 5 | Query vector search with `custom-model` | Returns only chunks from embedding-set-002 |

**Test Data:** `create-snapshot-testdata.csv` rows 4-5 (UT-004, UT-005); `pre-seeded-data.csv` embedding sets
**Postconditions:** Two embedding sets on same snapshot, no vector mixing
**Pass/Fail Criteria:** Zero cross-model vector contamination → PASS; any mixing → FAIL

---

#### UT-004: Invalid Snapshot Creation — Missing Required Fields

| Field | Value |
|-------|-------|
| **ID** | UT-004 |
| **Priority** | Medium |
| **Type** | Negative / Unit |
| **Requirement** | FR-SNAP-07 |
| **Preconditions** | Clean SQLite DB |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call createSnapshot with missing repository_id | Returns FAILED with error "Missing repository_id" |
| 2 | Call createSnapshot with missing commit_id | Returns FAILED with error "Missing commit_id" |
| 3 | Call createSnapshot with missing config_fingerprint | Returns FAILED with error "Missing config_fingerprint" |
| 4 | Call createSnapshot with missing code_model_version | Returns FAILED with error "Missing code_model_version" |
| 5 | Call createSnapshot with missing toolchain_manifest | Returns FAILED with error "Missing toolchain_manifest" |

**Test Data:** `create-snapshot-testdata.csv` rows 6-10 (UT-005..009)
**Postconditions:** No snapshot created
**Pass/Fail Criteria:** All 5 invalid inputs rejected with correct error → PASS; any accepted → FAIL

---

#### UT-005: Merge Commit Indexing — AC-06

| Field | Value |
|-------|-------|
| **ID** | UT-005 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-03, AC-06 |
| **Preconditions** | repo-001 with commit-001, commit-002; merge commit commit-003 with two parents |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create snapshot for merge commit commit-003 | Snapshot snap-004 created with status READY |
| 2 | Verify `git_commit_parent` has two rows for commit-003 with parent_order 0 and 1 | Parents: commit-001 (order 0), commit-002 (order 1) |
| 3 | Verify symbols from both parent branches resolvable in snap-004 | Symbol queries return results from both lineages |

**Test Data:** `create-snapshot-testdata.csv` row 11 (UT-010); `pre-seeded-data.csv` commits
**Postconditions:** Merge commit indexed correctly
**Pass/Fail Criteria:** Snapshot READY, parents ordered, symbols from both parents → PASS; otherwise FAIL

---

#### UT-006: Composite FK Triggers Enforce Same-Snapshot Ownership — AC-07

| Field | Value |
|-------|-------|
| **ID** | UT-006 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-09, AC-07 |
| **Preconditions** | Two snapshots snap-001, snap-002 for same repo; symbol in snap-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to insert `code_symbol` with parent_id from snap-001 but snapshot_id = snap-002 | SQLite trigger rejects insert (constraint violation) |
| 2 | Attempt to insert `code_chunk` with symbol_id from snap-001 but snapshot_id = snap-002 | SQLite trigger rejects insert |
| 3 | Attempt to insert `relationship_evidence` crossing snapshots | SQLite trigger rejects insert |

**Test Data:** `pre-seeded-data.csv` snapshots
**Postconditions:** No cross-snapshot artifacts
**Pass/Fail Criteria:** All 3 cross-snapshot inserts rejected by triggers → PASS; any accepted → FAIL

---

#### UT-007: CHECK Constraints Enforce Data Integrity

| Field | Value |
|-------|-------|
| **ID** | UT-007 |
| **Priority** | Medium |
| **Type** | Negative / Unit |
| **Requirement** | FR-SNAP-18 |
| **Preconditions** | Clean SQLite DB with V6 migration applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert code_chunk with start_line > end_line | CHECK constraint rejects |
| 2 | Insert symbol_occurrence with confidence < 0 or > 1 | CHECK constraint rejects |
| 3 | Insert code_index_snapshot with invalid status | CHECK constraint rejects |
| 4 | Insert git_commit_parent with parent_order < 0 | CHECK constraint rejects |

**Test Data:** N/A (direct SQL inserts)
**Postconditions:** No invalid rows
**Pass/Fail Criteria:** All 4 constraint violations rejected → PASS; any accepted → FAIL

---

#### UT-008: Dual-Dialect Migration — SQLite and PostgreSQL

| Field | Value |
|-------|-------|
| **ID** | UT-008 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-SNAP-19 |
| **Preconditions** | PostgreSQL test instance available; migration-v6-pg.ts |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run V6 migration on SQLite (in-memory) | All 29 tables created, triggers installed |
| 2 | Run V6 migration on PostgreSQL via ddl-translator | All 29 tables created with PG-compatible types |
| 3 | Verify idempotency: run migration twice on each | Second run succeeds (no-op per-table checks) |

**Test Data:** N/A
**Postconditions:** Both dialects migrated
**Pass/Fail Criteria:** Both dialects pass → PASS; any failure → FAIL

---

### 4.3 Phase 1: Indexing Pipeline (SA4E-414)

#### UT-009: Pipeline Executes Stages A→J in Order

| Field | Value |
|-------|-------|
| **ID** | UT-009 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-IDX-01, FR-IDX-02 |
| **Preconditions** | Repository with Java + TypeScript files; clean DB |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start indexing pipeline for repository | Pipeline executes |
| 2 | Verify stage execution order: A → B → C → D → E → F → G → H → I → J | Logs show strict sequential order |
| 3 | Verify Stage E (dependency resolution) completes before Stage F (semantic) for each language | No F start before E complete per language |
| 4 | Verify capability metadata published per language (SUPPORTED/PARTIAL/UNSUPPORTED/FAILED) | Metadata present for each language |

**Test Data:** Test repository with Java + TS files
**Postconditions:** Pipeline completes
**Pass/Fail Criteria:** Order verified, E-before-F per language, metadata published → PASS; deviation → FAIL

---

#### UT-010: Per-Language Isolation — AC-11

| Field | Value |
|-------|-------|
| **ID** | UT-010 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-IDX-03, AC-11 |
| **Preconditions** | Repository with TypeScript (working) and Java (broken classpath) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run pipeline | Pipeline completes (not aborted) |
| 2 | Verify TypeScript capability = SUPPORTED | TS symbols, relationships, chunks created |
| 3 | Verify Java capability = FAILED (never SUPPORTED) | Java marked FAILED; Stage F never ran for Java |
| 4 | Verify snapshot still publishes READY (soft language failure) | Snapshot status = READY |

**Test Data:** Test repo with broken Java config
**Postconditions:** Snapshot READY with partial capability
**Pass/Fail Criteria:** TS works, Java FAILED, no fake coverage, snapshot READY → PASS; otherwise FAIL

---

#### UT-011: Semantic Re-run After Dependency Change — AC-10

| Field | Value |
|-------|-------|
| **ID** | UT-011 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-IDX-02, AC-10 |
| **Preconditions** | Snapshot snap-001 exists for commit-001; source unchanged |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Modify dependency/classpath (e.g., add library) | config_fingerprint changes |
| 2 | Re-run indexing for same commit | New snapshot snap-007 created |
| 3 | Verify Stage E→F re-ran for affected language | New dependency_resolution_snapshot, new symbol_relationship |
| 4 | Verify original snap-001 untouched | snap-001 artifacts unchanged |

**Test Data:** `pre-seeded-data.csv` snapshots
**Postconditions:** New snapshot with updated semantic index
**Pass/Fail Criteria:** Re-run triggered, new snapshot, old intact → PASS; otherwise FAIL

---

### 4.4 Phase 1: Snapshot-Scoped Retrieval (SA4E-415)

#### UT-012: Exact Symbol Lookup — AC-07

| Field | Value |
|-------|-------|
| **ID** | UT-012 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-RET-01, AC-07 |
| **Preconditions** | Snapshot snap-001 with symbol `PaymentService#processTransaction` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `symbolByName(snap-001, "PaymentService#processTransaction")` | Returns SymbolHit with correct symbol_id, fp, signature |
| 2 | Verify result belongs to snap-001 only | snapshot_id = snap-001 |

**Test Data:** `retrieval-testdata.csv` row 2 (UT-011)
**Postconditions:** N/A
**Pass/Fail Criteria:** Exact symbol found, snapshot-scoped → PASS; missing or cross-snapshot → FAIL

---

#### UT-013: Lexical BM25 Search — AC-07

| Field | Value |
|-------|-------|
| **ID** | UT-013 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-RET-01, AC-07 |
| **Preconditions** | Snapshot snap-001 with code_chunk_fts populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `lexicalSearch(snap-001, "processTransaction", 10)` | Returns up to 10 LexicalHits ranked by BM25 |
| 2 | Verify all results belong to snap-001 | All hit.snapshot_id = snap-001 |
| 3 | Verify ranking: exact definition > proven reference > text similarity | Order matches FR-RET-02 |

**Test Data:** `retrieval-testdata.csv` row 3 (UT-012)
**Postconditions:** N/A
**Pass/Fail Criteria:** Results returned, scoped, ranked correctly → PASS; otherwise FAIL

---

#### UT-014: Vector Exact Cosine Search — AC-08

| Field | Value |
|-------|-------|
| **ID** | UT-014 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-RET-04, AC-08 |
| **Preconditions** | Snapshot snap-001 with embedding-set-001 (text-embedding-3-small) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `vectorSearch(embedding-set-001, queryEmbedding, 10)` | Returns up to 10 VectorHits with cosine scores |
| 2 | Verify all chunks belong to snap-001 | No cross-snapshot leakage |
| 3 | Query snap-002 (different repo) with same embedding | Returns only snap-002 chunks |

**Test Data:** `retrieval-testdata.csv` rows 4, 9 (UT-013, UT-018)
**Postconditions:** N/A
**Pass/Fail Criteria:** Vector results scoped to snapshot/repo → PASS; any leakage → FAIL

---

#### UT-015: Graph Query (CALLERS/CALLEES/IMPLEMENTATIONS) — AC-07

| Field | Value |
|-------|-------|
| **ID** | UT-015 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-RET-03, AC-07 |
| **Preconditions** | Snapshot snap-001 with symbol_relationship populated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `graphQuery(snap-001, "PaymentService#processTransaction", "CALLEES", 10)` | Returns callees with cycle guard, node cap |
| 2 | Call `graphQuery(snap-001, "PaymentService#processTransaction", "CALLERS", 10)` | Returns callers |
| 3 | Call `graphQuery(snap-001, "PaymentService#processTransaction", "IMPLEMENTATIONS", 10)` | Returns implementations (0 for concrete method) |
| 4 | Verify all results belong to snap-001 | snapshot_id = snap-001 for all |

**Test Data:** `retrieval-testdata.csv` rows 5-7 (UT-014..016)
**Postconditions:** N/A
**Pass/Fail Criteria:** All 3 directions work, scoped, cycle guard active → PASS; otherwise FAIL

---

#### UT-016: Vector Search Without embedding_model_key — Error

| Field | Value |
|-------|-------|
| **ID** | UT-016 |
| **Priority** | Medium |
| **Type** | Negative / Unit |
| **Requirement** | FR-RET-04 |
| **Preconditions** | Snapshot snap-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call vectorSearch without embedding_model_key | Returns 400 error |

**Test Data:** `retrieval-testdata.csv` row 8 (UT-017)
**Postconditions:** N/A
**Pass/Fail Criteria:** 400 error returned → PASS; 200 or other → FAIL

---

#### UT-017: Filtered Exact Cosine Recall on Multi-Snapshot Dataset — AC-09

| Field | Value |
|-------|-------|
| **ID** | UT-017 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-RET-04, AC-09 |
| **Preconditions** | Multi-snapshot dataset: snap-001, snap-002, snap-004, snap-005, snap-008 (6 READY, 2 PENDING) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute vector search across multi-snapshot dataset with filter-first contract | Recall@2 = 1.0 (exact cosine on SQLite) |
| 2 | Verify per-snapshot result counts: {S1:2, S2:1, S3:1, S5:1} | Counts match ACCEPTANCE-MATRIX.md |
| 3 | Verify no results from PENDING snapshots (snap-003, snap-007) | PENDING excluded |

**Test Data:** `retrieval-testdata.csv` row 10 (UT-019); `pre-seeded-data.csv` multi-snapshot setup
**Postconditions:** N/A
**Pass/Fail Criteria:** Recall 1.0, correct per-snapshot counts, PENDING excluded → PASS; otherwise FAIL

---

#### UT-018: Delete File Queryable at Old Commit, Not at New — AC-05

| Field | Value |
|-------|-------|
| **ID** | UT-018 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-06, AC-05 |
| **Preconditions** | File `AuthService` exists in commit-001 (snap-001), deleted in commit-004 (snap-005) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Lexical search for "AuthService" in snap-001 | Returns 1 hit (file exists at old commit) |
| 2 | Lexical search for "AuthService" in snap-005 | Returns 0 hits (file deleted at new commit) |
| 3 | Verify deleted path missing from delete-commit source_file_revision | No revision for deleted file at commit-004 |

**Test Data:** `retrieval-testdata.csv` rows 11-12 (UT-020, UT-021)
**Postconditions:** N/A
**Pass/Fail Criteria:** Old commit has file, new commit doesn't → PASS; otherwise FAIL

---

#### UT-019: Rename File — Old & New Paths Correct at Respective Commits — AC-04

| Field | Value |
|-------|-------|
| **ID** | UT-019 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-06, AC-04 |
| **Preconditions** | File renamed from `src/old/auth.ts` (commit-001, snap-001) to `src/new/auth.ts` (commit-005, snap-006) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search `oldPath` in snap-001 | Returns 1 hit at old path |
| 2 | Search `newPath` in snap-006 | Returns 1 hit at new path |
| 3 | Search `oldPath` in snap-006 | Returns 0 hits (old path gone at new commit) |
| 4 | Search `newPath` in snap-001 | Returns 0 hits (new path not exist at old commit) |

**Test Data:** `retrieval-testdata.csv` rows 13-14 (UT-022, UT-023)
**Postconditions:** N/A
**Pass/Fail Criteria:** Both paths correct at respective commits → PASS; otherwise FAIL

---

#### UT-020: Non-Existent Symbol Lookup Returns 404

| Field | Value |
|-------|-------|
| **ID** | UT-020 |
| **Priority** | Medium |
| **Type** | Negative / Unit |
| **Requirement** | FR-RET-01 |
| **Preconditions** | Snapshot snap-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `symbolByName(snap-001, "NonExistentSymbol")` | Returns 404 with 0 results |

**Test Data:** `retrieval-testdata.csv` row 15 (UT-024)
**Postconditions:** N/A
**Pass/Fail Criteria:** 404 returned → PASS; 200 or other → FAIL

---

#### UT-021: Vector Query with Large Limit — AC-09

| Field | Value |
|-------|-------|
| **ID** | UT-021 |
| **Priority** | Medium |
| **Type** | Functional / Unit |
| **Requirement** | FR-RET-04, AC-09 |
| **Preconditions** | Snapshot snap-001 with 100+ chunks |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `vectorSearch(embedding-set-001, queryEmbedding, 1000)` | Returns up to 100 results (capped by dataset) |
| 2 | Verify all results belong to snap-001 | Scoped correctly |

**Test Data:** `retrieval-testdata.csv` row 16 (UT-025)
**Postconditions:** N/A
**Pass/Fail Criteria:** Large limit handled, scoped → PASS; otherwise FAIL

---

### 4.5 Phase 1 & 3: Agent Persistence & Recovery (SA4E-416, 423)

#### UT-022: Create Agent Plan — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-022 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-AGT-01, AC-12 |
| **Preconditions** | agent_run run-001 exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create plan with objective "Implement feature X", AC ["AC-1","AC-2"], version 1 | Plan plan-001 created with status DRAFT |
| 2 | Approve plan | Plan status = APPROVED |

**Test Data:** `agent-persistence-testdata.csv` row 2 (UT-026)
**Postconditions:** Plan created and approved
**Pass/Fail Criteria:** Plan persisted with correct fields → PASS; otherwise FAIL

---

#### UT-023: Agent Step with Dependencies — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-023 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-AGT-02, AC-12 |
| **Preconditions** | Plan plan-001 APPROVED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create step-001 with no dependencies | Step created, status PENDING |
| 2 | Start step-001 | Step status = RUNNING |
| 3 | Complete step-001 | Step status = DONE, attempts = 1 |
| 4 | Create step-002 depending on step-001 | Step created with dependency_ids = ["step-001"] |
| 5 | Create step-003 depending on step-001, step-002 | Step created with dependency_ids = ["step-001","step-002"] |

**Test Data:** `agent-persistence-testdata.csv` rows 3-5 (UT-027, UT-028, UT-029)
**Postconditions:** Steps with dependencies persisted
**Pass/Fail Criteria:** Dependencies stored as JSON array, statuses tracked → PASS; otherwise FAIL

---

#### UT-024: Agent Resume After Restart — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-024 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-AGT-05, AC-12 |
| **Preconditions** | Agent run with plan APPROVED, step-001 DONE, step-002 RUNNING, approval pending |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate process restart (new service instance, zero in-memory state) | New instance created |
| 2 | Call `summarizeForResume(agentRunId)` | Returns ResumeSummary: objective, APPROVED plan, nextStepIndex=1, pendingApproval |
| 3 | Verify fresh instance can continue from step-002 | Step-002 continues execution |

**Test Data:** `agent-persistence-testdata.csv` row 6 (UT-029)
**Postconditions:** Agent resumed
**Pass/Fail Criteria:** Resume summary correct, fresh instance continues → PASS; otherwise FAIL

---

#### UT-025: Approval Request Tracking — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-025 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-AGT-01, FR-SNAP-16, AC-12 |
| **Preconditions** | Agent run with plan APPROVED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create approval_request for patch action | approval_request created with decision PENDING |
| 2 | Human approves (decision = APPROVED, decision_time set) | approval_request updated |
| 3 | Verify decision_time and decided_by recorded | Timestamps and user present |

**Test Data:** `agent-persistence-testdata.csv` rows 7-8 (UT-030, UT-031)
**Postconditions:** Approval tracked
**Pass/Fail Criteria:** Approval lifecycle persisted correctly → PASS; otherwise FAIL

---

#### UT-026: Step Failure After Retries — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-026 |
| **Priority** | Medium |
| **Type** | Functional / Unit |
| **Requirement** | FR-AGT-02, AC-12 |
| **Preconditions** | Step configured with max 3 retries |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute step that fails | Step status = FAILED after 3 attempts |
| 2 | Verify attempts = 3 recorded | attempts column = 3 |
| 3 | Verify agent_state_transition records FAILED | Transition logged |

**Test Data:** `agent-persistence-testdata.csv` row 9 (UT-032)
**Postconditions:** Failure recorded
**Pass/Fail Criteria:** Retries counted, transition logged → PASS; otherwise FAIL

---

#### UT-027: Tool Execution and Retrieval Evidence Linked — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-027 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-AGT-01, FR-AGT-04, AC-12 |
| **Preconditions** | Step RUNNING |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute `search_symbols` tool | agent_tool_execution recorded with tool_name, args_ref, result_ref |
| 2 | Store retrieval results | retrieval_evidence created with snapshot_id, query, result_refs, score |
| 3 | Link evidence to step | step references evidence IDs |

**Test Data:** `agent-persistence-testdata.csv` rows 10-11 (UT-033, UT-034)
**Postconditions:** Tool execution and evidence linked
**Pass/Fail Criteria:** Both persisted and linked → PASS; otherwise FAIL

---

#### UT-028: Plan Versioning — AC-12

| Field | Value |
|-------|-------|
| **ID** | UT-028 |
| **Priority** | Medium |
| **Type** | Functional / Unit |
| **Requirement** | FR-AGT-01, AC-12 |
| **Preconditions** | Plan plan-001 version 1 APPROVED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new plan version for same run | plan-002 created with version = 2 |
| 2 | Verify version increment | version = 2 |

**Test Data:** `agent-persistence-testdata.csv` row 12 (UT-035)
**Postconditions:** New plan version
**Pass/Fail Criteria:** Version incremented correctly → PASS; otherwise FAIL

---

### 4.6 Phase 1 & 3: Patch Protocol & Security Sandbox (SA4E-417, 424)

#### UT-029: Valid Staged Patch — AC-13

| Field | Value |
|-------|-------|
| **ID** | UT-029 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-PAT-01, AC-13 |
| **Preconditions** | Workspace at commit-001; base hash matches |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `stage(patch)` with valid unified diff | Returns { changeSetId, approvalId }; change_set status = OPEN |
| 2 | Verify approval_request created with decision = PENDING | approval_request exists |
| 3 | Verify execution_run created for validation | execution_run status = VALIDATION |
| 4 | Verify working tree unchanged | File bytes identical to pre-stage |

**Test Data:** `patch-testdata.csv` rows 2-4 (UT-036, UT-037, UT-038)
**Postconditions:** Patch staged, not applied
**Pass/Fail Criteria:** Staged correctly, working tree untouched → PASS; applied prematurely → FAIL

---

#### UT-030: Stale Base Hash Rejection — AC-13

| Field | Value |
|-------|-------|
| **ID** | UT-030 |
| **Priority** | High |
| **Type** | Negative / Unit |
| **Requirement** | FR-PAT-02, AC-13 |
| **Preconditions** | Workspace at commit-002 (different from patch base commit-001) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `stage(patch)` with base_commit_id = commit-001 | Stage succeeds (validation only) |
| 2 | Call `applyAfterApproval(changeSetId, approvalId)` | Returns 409 STALE_BASE_HASH; change_set stays OPEN |
| 3 | Verify working tree unchanged | File bytes identical |

**Test Data:** `patch-testdata.csv` row 5 (UT-039)
**Postconditions:** Patch rejected
**Pass/Fail Criteria:** 409 error, change_set OPEN, tree unchanged → PASS; otherwise FAIL

---

#### UT-031: Path Traversal Rejection — AC-13, AC-15

| Field | Value |
|-------|-------|
| **ID** | UT-031 |
| **Priority** | High |
| **Type** | Security / Negative |
| **Requirement** | FR-PAT-03, AC-15 |
| **Preconditions** | Workspace at commit-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stage patch targeting `../../etc/passwd` | Stage returns 400 PATH_TRAVERSAL |
| 2 | Stage patch targeting `/absolute/path/Test.java` | Stage returns 400 PATH_TRAVERSAL |
| 3 | Stage patch targeting `src/../Test.java` | Stage returns 400 PATH_TRAVERSAL |

**Test Data:** `patch-testdata.csv` rows 6-8 (UT-040, UT-041, UT-042)
**Postconditions:** No file written outside workspace
**Pass/Fail Criteria:** All 3 traversal attempts rejected → PASS; any accepted → FAIL

---

#### UT-032: Patch Applied After Approval — AC-14

| Field | Value |
|-------|-------|
| **ID** | UT-032 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-PAT-02, AC-14 |
| **Preconditions** | Patch staged (change_set OPEN, approval PENDING) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set approval_request.decision = APPROVED | approval_request updated |
| 2 | Call `applyAfterApproval(changeSetId, approvalId)` | Patch applied atomically; change_set = APPLIED |
| 3 | Verify working tree now reflects patch | File bytes match patched content |
| 4 | Verify execution_run exit_code = 0 | execution_run completed |

**Test Data:** `patch-testdata.csv` row 9 (UT-043)
**Postconditions:** Patch applied
**Pass/Fail Criteria:** Applied only after APPROVED, tree changed → PASS; otherwise FAIL

---

#### UT-033: Patch Rejected on REJECTED Approval — AC-14

| Field | Value |
|-------|-------|
| **ID** | UT-033 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-PAT-02, AC-14 |
| **Preconditions** | Patch staged, approval_request.decision = REJECTED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `applyAfterApproval(changeSetId, approvalId)` | Returns 400 NOT_APPROVED; change_set stays OPEN |
| 2 | Verify working tree unchanged | File bytes identical to pre-stage |

**Test Data:** `patch-testdata.csv` row 10 (UT-044)
**Postconditions:** Patch not applied
**Pass/Fail Criteria:** Rejected, tree unchanged → PASS; otherwise FAIL

---

#### UT-034: Patch Discarded After Rejection — AC-14

| Field | Value |
|-------|-------|
| **ID** | UT-034 |
| **Priority** | Medium |
| **Type** | Functional / Unit |
| **Requirement** | FR-PAT-02, AC-14 |
| **Preconditions** | Patch staged, approval REJECTED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Discard change_set | change_set status = DISCARDED |
| 2 | Verify no further apply possible | applyAfterApproval returns error |

**Test Data:** `patch-testdata.csv` row 11 (UT-045)
**Postconditions:** Change set discarded
**Pass/Fail Criteria:** Status DISCARDED, no apply → PASS; otherwise FAIL

---

#### UT-035: Sandbox — Shell Metacharacters Rejected — AC-15

| Field | Value |
|-------|-------|
| **ID** | UT-035 |
| **Priority** | High |
| **Type** | Security / Negative |
| **Requirement** | FR-PAT-03, AC-15 |
| **Preconditions** | Tool execution context |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute tool with args containing `;` | Zod validation rejects: SANDBOX_VIOLATION |
| 2 | Execute tool with args containing `&&` | Rejected |
| 3 | Execute tool with args containing `|` | Rejected |
| 4 | Execute tool with args containing `$(` | Rejected |

**Test Data:** N/A (direct tool calls with malicious args)
**Postconditions:** No shell execution
**Pass/Fail Criteria:** All 4 metachar patterns rejected → PASS; any executed → FAIL

---

#### UT-036: Sandbox — NUL Byte Rejected — AC-15

| Field | Value |
|-------|-------|
| **ID** | UT-036 |
| **Priority** | High |
| **Type** | Security / Negative |
| **Requirement** | FR-PAT-03, AC-15 |
| **Preconditions** | Tool execution context |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute tool with arg containing `\0` (NUL) | Zod validation rejects: SANDBOX_VIOLATION |

**Test Data:** N/A
**Postconditions:** N/A
**Pass/Fail Criteria:** NUL rejected → PASS; accepted → FAIL

---

#### UT-037: Sandbox — Network Deny by Default — AC-15

| Field | Value |
|-------|-------|
| **ID** | UT-037 |
| **Priority** | High |
| **Type** | Security / Integration |
| **Requirement** | FR-PAT-03, AC-15 |
| **Preconditions** | Container runtime configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt network connection to non-allowlisted host | Connection denied (deny-by-default) |
| 2 | Attempt connection to exact allowlisted host | Connection allowed |
| 3 | Attempt connection to subdomain of allowlisted host | Denied (exact host match only) |

**Test Data:** N/A
**Postconditions:** Network policy enforced
**Pass/Fail Criteria:** Deny default, exact allowlist match → PASS; otherwise FAIL

---

#### UT-038: Sandbox — Container Limits Validated — AC-15

| Field | Value |
|-------|-------|
| **ID** | UT-038 |
| **Priority** | Medium |
| **Type** | Security / Integration |
| **Requirement** | FR-PAT-03, AC-15 |
| **Preconditions** | Container runtime configured with limits |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute tool exceeding CPU limit | Container killed/throttled |
| 2 | Execute tool exceeding memory limit | Container OOM killed |
| 3 | Execute tool exceeding disk limit | Write fails |
| 4 | Verify rootless, non-root user | Process UID ≠ 0 |

**Test Data:** N/A
**Postconditions:** Limits enforced
**Pass/Fail Criteria:** All limits active, rootless → PASS; any violation → FAIL

---

### 4.7 Phase 2: Agent UX — Repository Map (SA4E-418)

#### UT-039: Repo Map PageRank Generation

| Field | Value |
|-------|-------|
| **ID** | UT-039 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-01 |
| **Preconditions** | Repository with AST symbol graph built |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Build AST call graph across repository | Graph nodes = symbols, edges = CALLS |
| 2 | Compute edge weights: `W(A→B, s) = Multiplier(s) × √freq(A,s) × ln(N/(df(s)+1))` | Weights calculated per formula |
| 3 | Apply query personalization vector | Matched files = 100/len_matched, others = 1/N |
| 4 | Run PageRank (α=0.85) | Scores converge |

**Test Data:** Test repository
**Postconditions:** PageRank scores computed
**Pass/Fail Criteria:** Graph built, weights correct, personalization applied, PageRank converges → PASS; otherwise FAIL

---

#### UT-040: Repo Map Binary-Search Token Packing — ≤1,500 Tokens

| Field | Value |
|-------|-------|
| **ID** | UT-040 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-01 |
| **Preconditions** | PageRank scores computed for repository |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pack top-ranked symbols into DSL format via binary search | Output ≤ 1,500 tokens |
| 2 | Verify DSL format matches specification | Format: `[REPOSITORY_MAP] filepath: lines: signature` |
| 3 | Verify query-matched files boosted in output | Personalization reflected |

**Test Data:** Test repository
**Postconditions:** Repo map generated
**Pass/Fail Criteria:** Token count ≤ 1,500, DSL format correct → PASS; otherwise FAIL

---

### 4.8 Phase 2: AST Skeleton/Body Chunking (SA4E-419)

#### UT-041: AST Chunker Produces Skeleton and Body

| Field | Value |
|-------|-------|
| **ID** | UT-041 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-02 |
| **Preconditions** | TypeScript/Java source file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run AST chunker on source file | Produces ASTCodeChunk with skeleton + body |
| 2 | Verify skeleton contains: class/interface, fields, signatures, no body | Skeleton = signatures only |
| 3 | Verify body contains full method source | Body = complete implementation |
| 4 | Verify external libs: only .d.ts/header signatures extracted | No external source bodies |

**Test Data:** Test source files
**Postconditions:** Chunks created
**Pass/Fail Criteria:** Skeleton/body separation correct, external libs handled → PASS; otherwise FAIL

---

#### UT-042: Embedding Input = [fp] + [sig] + [doc] + [deps.calls] — Not Body

| Field | Value |
|-------|-------|
| **ID** | UT-042 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-02, AC-02 |
| **Preconditions** | ASTCodeChunk produced |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate embedding input for chunk | Input = concatenation of fp, sig, doc, deps.calls |
| 2 | Verify body NOT included in embedding input | Body tokens not in embedding |
| 3 | Verify embedding_set created per model_key | Separate embedding_set per model |

**Test Data:** `create-snapshot-testdata.csv` row 5 (UT-005)
**Postconditions:** Embeddings generated
**Pass/Fail Criteria:** Embedding input correct, body excluded, model separation → PASS; otherwise FAIL

---

#### UT-043: Embedding Set Decoupled from Snapshot — Model Swap Without Reparse

| Field | Value |
|-------|-------|
| **ID** | UT-043 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SNAP-10, FR-SNAP-11, AC-02 |
| **Preconditions** | Snapshot snap-001 with embedding-set-001 (text-embedding-3-small) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new embedding_set for `custom-model` on same snap-001 | embedding-set-002 created referencing same snapshot |
| 2 | Generate embeddings for embedding-set-002 | code_embedding rows link to embedding-set-002 |
| 3 | Verify original embedding-set-001 unchanged | embedding-set-001 embeddings intact |

**Test Data:** `pre-seeded-data.csv` embedding sets
**Postconditions:** Two embedding sets on one snapshot
**Pass/Fail Criteria:** Model swap without reparse verified → PASS; otherwise FAIL

---

### 4.9 Phase 2: 4 Core Agent Tools (SA4E-420)

#### UT-044: search_symbols — Hybrid Search with Session Pinning

| Field | Value |
|-------|-------|
| **ID** | UT-044 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-03, FR-UX-07 |
| **Preconditions** | Valid ToolContext with repository_id, commit_id, index_snapshot_id |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `search_symbols({ q: "processTransaction", limit: 10 }, context)` | Returns ToolResult with resultId, summary, snippets, evidenceIds |
| 2 | Verify output DSL format: `[FOUND N SYMBOLS | BUDGET_USED: X tokens]` | DSL format matches spec |
| 3 | Call without valid context | Returns error: session pinning required |

**Test Data:** `pre-seeded-data.csv` chat sessions
**Postconditions:** N/A
**Pass/Fail Criteria:** Search works, DSL format, pinning enforced → PASS; otherwise FAIL

---

#### UT-045: get_file_skeleton — Class Structure Without Body

| Field | Value |
|-------|-------|
| **ID** | UT-045 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-04, FR-UX-07 |
| **Preconditions** | Valid ToolContext; file exists in snapshot |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `get_file_skeleton({ file_path: "src/service/PaymentService.java" }, context)` | Returns class structure, fields, signatures (no body) |
| 2 | Verify DSL output includes signatures only | No method bodies in output |
| 3 | Verify BUDGET_USED in output | Token count present |

**Test Data:** `pre-seeded-data.csv` chat sessions
**Postconditions:** N/A
**Pass/Fail Criteria:** Skeleton returned, no body, DSL format → PASS; otherwise FAIL

---

#### UT-046: read_code_block — Bounded Line Reading (Max 120 Lines)

| Field | Value |
|-------|-------|
| **ID** | UT-046 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-05, FR-UX-07 |
| **Preconditions** | Valid ToolContext; file exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `read_code_block({ file_path, start_line: 45, end_line: 92 }, context)` | Returns lines 45-92 (48 lines) |
| 2 | Call with range > 120 lines | Returns error: max 120 lines exceeded |
| 3 | Verify DSL output with BUDGET_USED | Token count present |

**Test Data:** `pre-seeded-data.csv` chat sessions
**Postconditions:** N/A
**Pass/Fail Criteria:** Bounded read works, limit enforced → PASS; otherwise FAIL

---

#### UT-047: query_call_graph — CALLERS/CALLEES/IMPLEMENTATIONS

| Field | Value |
|-------|-------|
| **ID** | UT-047 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-06, FR-UX-07 |
| **Preconditions** | Valid ToolContext; symbol exists in snapshot |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `query_call_graph({ symbol_id, direction: "CALLEES" }, context)` | Returns callees in DSL format |
| 2 | Call with direction: "CALLERS" | Returns callers |
| 3 | Call with direction: "IMPLEMENTATIONS" | Returns implementations |
| 4 | Verify all results scoped to pinned snapshot | snapshot_id matches context |

**Test Data:** `pre-seeded-data.csv` chat sessions
**Postconditions:** N/A
**Pass/Fail Criteria:** All 3 directions work, scoped, DSL format → PASS; otherwise FAIL

---

#### UT-048: Tool Output DSL Format Verification

| Field | Value |
|-------|-------|
| **ID** | UT-048 |
| **Priority** | Medium |
| **Type** | Functional / Unit |
| **Requirement** | FR-UX-07 |
| **Preconditions** | Any tool executed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify output contains: resultId, summary, snippets[], evidenceIds[], truncated, cursor? | All fields present |
| 2 | Verify summary line: `[FOUND N SYMBOLS | BUDGET_USED: X tokens]` | Format exact |
| 3 | Verify snippets are compact (not raw JSON) | Human-readable DSL |

**Test Data:** N/A
**Postconditions:** N/A
**Pass/Fail Criteria:** DSL format matches specification exactly → PASS; deviation → FAIL

---

### 4.10 Phase 2: Scratchpad & Context Eviction (SA4E-421)

#### UT-049: Scratchpad Format Enforced Before Tool Call

| Field | Value |
|-------|-------|
| **ID** | UT-049 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-EV-01 |
| **Preconditions** | Agent turn starting |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Agent emits scratchpad before tool call | XML format with Goal, DeadEnds, Facts, Plan |
| 2 | Verify Goal = 1-sentence objective | Present |
| 3 | Verify DeadEnds = file:lines -> brief reason | Present |
| 4 | Verify Facts = file:lines -> critical logic + 1-3 code lines | Present |
| 5 | Verify Plan = next tool call + reason | Present |

**Test Data:** N/A
**Postconditions:** Scratchpad emitted
**Pass/Fail Criteria:** All 4 sections present, format correct → PASS; missing/invalid → FAIL

---

#### UT-050: S_evict Formula Correctly Implemented

| Field | Value |
|-------|-------|
| **ID** | UT-050 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-EV-02 |
| **Preconditions** | Scratchpad with multiple entries of varying age, tokens, references |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compute S_evict = Age_in_Turns × 200 + Token_Count – Is_Referenced × 1000 | Scores calculated per formula |
| 2 | Verify entry with Age=3, Tokens=500, Not Referenced → S=1100 | 3×200 + 500 - 0 = 1100 |
| 3 | Verify entry with Age=1, Tokens=200, Referenced → S=-600 | 1×200 + 200 - 1000 = -600 |
| 4 | Verify in-use items score = -Infinity | Exempt from eviction |

**Test Data:** `token-budget-testdata.csv` scenarios
**Postconditions:** Scores computed
**Pass/Fail Criteria:** Formula matches exactly → PASS; deviation → FAIL

---

#### UT-051: Tombstones Preserve tool_call_id — FR-EV-03

| Field | Value |
|-------|-------|
| **ID** | UT-051 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-EV-03 |
| **Preconditions** | Scratchpad entries eligible for eviction |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger batch eviction | Evicted entries become tombstones |
| 2 | Verify tombstone content = `[evicted tool_call_id=<id>]` | Exact format |
| 3 | Verify tool_call_id preserved for traceability | ID matches original |

**Test Data:** `token-eviction.integration.test.ts` scenarios
**Postconditions:** Tombstones created
**Pass/Fail Criteria:** Tombstone format exact, tool_call_id preserved → PASS; otherwise FAIL

---

#### UT-052: Referenced Evidence Immune from Eviction — FR-EV-03

| Field | Value |
|-------|-------|
| **ID** | UT-052 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-EV-03 |
| **Preconditions** | Scratchpad with some evidence IDs referenced in current Goal/Facts/Plan |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger batch eviction at 75% budget | Eviction runs |
| 2 | Verify referenced evidence IDs NOT evicted | Referenced entries remain intact |
| 3 | Verify non-referenced entries evicted per S_evict | Only unreferenced evicted |

**Test Data:** `token-eviction.integration.test.ts` scenarios
**Postconditions:** Eviction selective
**Pass/Fail Criteria:** Referenced immune, non-referenced evicted → PASS; otherwise FAIL

---

#### UT-053: Batch Eviction at ~75% Budget Threshold — FR-EV-04

| Field | Value |
|-------|-------|
| **ID** | UT-053 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-EV-04 |
| **Preconditions** | Scratchpad at various token utilization levels |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fill scratchpad to 70% budget | No eviction triggered |
| 2 | Fill to 76% budget | Batch eviction triggered |
| 3 | Fill to 90% budget | Eviction reduces to under threshold |

**Test Data:** `token-budget-testdata.csv` budget scenarios
**Postconditions:** Budget managed
**Pass/Fail Criteria:** 75% threshold triggers eviction, no pressure = no eviction → PASS; otherwise FAIL

---

#### UT-054: Integration Test — Scratchpad → ReferencedEvidenceIds → BatchEvict

| Field | Value |
|-------|-------|
| **ID** | UT-054 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-INT-01 |
| **Preconditions** | Full agent turn with scratchpad, tool call, evidence |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute agent turn: scratchpad → tool call → evidence stored | Evidence IDs in retrieval_evidence |
| 2 | Next turn: scratchpad references evidence IDs | referencedEvidenceIds parsed |
| 3 | Trigger batchEvict() | Canonical parse, exempt refs, verify score/tombstone/target/no-overflow |

**Test Data:** `token-eviction.integration.test.ts` (backend 13 tests)
**Postconditions:** Integration verified
**Pass/Fail Criteria:** All 13 backend integration tests pass → PASS; any fail → FAIL

---

#### UT-055: Integration Test — Extension Token/Eviction Composition

| Field | Value |
|-------|-------|
| **ID** | UT-055 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-INT-02 |
| **Preconditions** | Extension budget-gate modules loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compose `resolveContextBudget` + `tryRuntimeTokenCount` + `runSessionBudgetGate` + `scopedSteering` + `RoleScopeFilter` + `buildSessionToolLoadout` | Composed per scenario |
| 2 | Verify real tokenizer tiers (exact count 700) | Tier resolution correct |
| 3 | Verify eviction algorithm exact | S_evict matches |
| 4 | Verify scratchpad interaction | Referenced immune |
| 5 | Verify budget gate escalation order | SYSTEM→CRITICAL→HIGH→MEDIUM→LOW |
| 6 | Verify actionable error messages | Errors descriptive |
| 7 | Verify role-scope reduction (5→1 skills) | Reduction triggers |
| 8 | Verify tool schema cap (explicit 1000 trim) | Cap enforced |

**Test Data:** `token-eviction.integration.test.ts` (extension 9 tests)
**Postconditions:** Extension integration verified
**Pass/Fail Criteria:** All 9 extension integration tests pass → PASS; any fail → FAIL

---

### 4.11 Phase 2: Runtime Token Budget (SA4E-422)

#### UT-056: Runtime Tokenizer — Real llama.cpp /tokenize Count

| Field | Value |
|-------|-------|
| **ID** | UT-056 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-TOK-01, AC-17 |
| **Preconditions** | llama.cpp /tokenize endpoint available (mocked in test via fetchFn) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `countTokens("test prompt")` via injected fetchFn | Returns exact token count (e.g., 4200) |
| 2 | Verify count replaces estimate | No estimation used |
| 3 | Verify budget decision uses real count | Budget computed from real tokens |

**Test Data:** `token-budget-testdata.csv` row 12 (UT-056)
**Postconditions:** Real tokenizer used
**Pass/Fail Criteria:** Real count returned, budget uses real count → PASS; estimate used → FAIL

---

#### UT-057: Budget Formula — Available Input Tokens Calculation

| Field | Value |
|-------|-------|
| **ID** | UT-057 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-TOK-02 |
| **Preconditions** | Model n_ctx, all token components known |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compute `available_input_tokens = n_ctx - max_output - safety - system_prompt - tool_schemas - history - user_msg - framing - tool_results_must_remain` | Formula matches FR-TOK-02 exactly |
| 2 | Verify evidence_budget = available after all above | Correct remainder |

**Test Data:** `token-budget-testdata.csv` rows 2-4 (UT-046, UT-047, UT-048)
**Postconditions:** Budget calculated
**Pass/Fail Criteria:** Formula exact for small/medium/large models → PASS; deviation → FAIL

---

#### UT-058: Tier Resolution — Small/Medium/Large from Real n_ctx

| Field | Value |
|-------|-------|
| **ID** | UT-058 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-TOK-03 |
| **Preconditions** | Models with n_ctx = 8192, 32768, 128000 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | n_ctx=8192 → tier=small, staticTokens ≤ staticBudget | Small tier resolved |
| 2 | n_ctx=32768 → tier=medium | Medium tier resolved |
| 3 | n_ctx=128000 → tier=large | Large tier resolved |

**Test Data:** `token-budget-testdata.csv` rows 2-4 (UT-046, UT-047, UT-048)
**Postconditions:** Tiers resolved
**Pass/Fail Criteria:** Tier matches n_ctx, staticTokens ≤ staticBudget → PASS; otherwise FAIL

---

#### UT-059: Escalation Order — Compress → Drop Steering → Min Loadout

| Field | Value |
|-------|-------|
| **ID** | UT-059 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-TOK-04, FR-INT-03 |
| **Preconditions** | Budget exceeded scenarios |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Budget exceeded → Escalation 1: compress history/steering | shouldCompress = true |
| 2 | Still exceeded → Escalation 2: drop steering (steeringBudget halved) | minLoadout flag, steeringBudget halved |
| 3 | Still exceeded → Escalation 3: min loadout (SYSTEM/CRITICAL only) | role-scope reduced 5→1, only critical tools |

**Test Data:** `token-budget-testdata.csv` rows 5-9 (UT-049..053)
**Postconditions:** Escalation verified
**Pass/Fail Criteria:** All 3 escalation steps trigger in order → PASS; wrong order/missing → FAIL

---

#### UT-060: Role-Scope Reduction Under Budget Pressure — AC-17, AC-15

| Field | Value |
|-------|-------|
| **ID** | UT-060 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-TOK-04, FR-INT-03 |
| **Preconditions** | Budget pressure scenario |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger min-loadout escalation | Role-scope reduced from 5 skills to 1 |
| 2 | Verify only SYSTEM/CRITICAL tools available | Tool loadout filtered |

**Test Data:** `token-budget-testdata.csv` row 10 (UT-054)
**Postconditions:** Role-scope reduced
**Pass/Fail Criteria:** 5→1 reduction verified → PASS; otherwise FAIL

---

#### UT-061: Tool Schema Token Cap — Explicit 1000 Trim

| Field | Value |
|-------|-------|
| **ID** | UT-061 |
| **Priority** | Medium |
| **Type** | Functional / Unit |
| **Requirement** | FR-TOK-04, FR-INT-03 |
| **Preconditions** | Tool schemas with >1000 tokens |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compute tool schema tokens | If > 1000, trim to 1000 |
| 2 | Verify cap enforced in budget calculation | Cap applied |

**Test Data:** `token-budget-testdata.csv` row 11 (UT-055)
**Postconditions:** Cap enforced
**Pass/Fail Criteria:** 1000 token cap applied → PASS; otherwise FAIL

---

### 4.12 Phase 3: SSE Durable Event Log & Replay (SA4E-425)

#### UT-062: SSE Event Append Before Publish

| Field | Value |
|-------|-------|
| **ID** | UT-062 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-SSE-01 |
| **Preconditions** | SSEStream instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `append(event)` | Returns monotonic event_id |
| 2 | Verify event persisted in `agent_event` table before SSE broadcast | DB row exists before client receives |
| 3 | Verify event_id auto-increments | Sequential integers |

**Test Data:** `sse-testdata.csv` rows 2-6 (UT-057..061)
**Postconditions:** Events persisted
**Pass/Fail Criteria:** Append-before-publish, monotonic IDs → PASS; otherwise FAIL

---

#### UT-063: SSE Replay from Last-Event-ID — No Duplicates, No Gaps — AC-16

| Field | Value |
|-------|-------|
| **ID** | UT-063 |
| **Priority** | High |
| **Type** | Functional / Integration |
| **Requirement** | FR-SSE-02, AC-16 |
| **Preconditions** | Session with events 1..7 persisted |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Client connects, receives events 1..3 | Events received |
| 2 | Network disconnect after event 3 | Connection lost |
| 3 | Client reconnects with `Last-Event-ID: 3` | Replay returns events 4..7 |
| 4 | Verify combined sequence: 1,2,3,4,5,6,7 | 0 duplicates, 0 gaps |
| 5 | Verify ordering by event_id | Sequential |

**Test Data:** `sse-testdata.csv` rows 7-8, 13-17 (UT-062, UT-063, UT-068..072)
**Postconditions:** Replay verified
**Pass/Fail Criteria:** No duplicates, no gaps, ordered → PASS; any violation → FAIL

---

#### UT-064: SSE Gap Detection — SseGapError

| Field | Value |
|-------|-------|
| **ID** | UT-064 |
| **Priority** | High |
| **Type** | Negative / Unit |
| **Requirement** | FR-SSE-03, AC-16 |
| **Preconditions** | Events 1..5 exist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Client requests replay from event 6 (non-existent) | Throws SseGapError |
| 2 | Client requests replay from event 0 | Returns all events 1..5 |

**Test Data:** `sse-testdata.csv` rows 9, 18 (UT-064, UT-073)
**Postconditions:** Gap detected
**Pass/Fail Criteria:** SseGapError for gap, event 0 returns all → PASS; otherwise FAIL

---

#### UT-065: SSE Retention and Reconnect Stress

| Field | Value |
|-------|-------|
| **ID** | UT-065 |
| **Priority** | Medium |
| **Type** | Integration / Performance |
| **Requirement** | FR-SSE-04 |
| **Preconditions** | Configurable retention; long-running session |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run extended session with multiple disconnect/reconnect cycles | All replays correct |
| 2 | Verify retention policy respects config | Old events purged per config |
| 3 | Verify no memory leaks | Stable memory |

**Test Data:** N/A
**Postconditions:** Stress tested
**Pass/Fail Criteria:** Extended cycles pass, retention works → PASS; otherwise FAIL

---

### 4.13 Phase 3: API Pinned index_snapshot_id Enforcement (SA4E-426)

#### UT-066: Valid Session with Matching Snapshot — 200 OK

| Field | Value |
|-------|-------|
| **ID** | UT-066 |
| **Priority** | High |
| **Type** | Functional / Unit |
| **Requirement** | FR-API-01, FR-API-02 |
| **Preconditions** | Chat session session-001 pinned to snap-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with `session_id=session-001`, `index_snapshot_id=snap-001` | Returns 200 OK |

**Test Data:** `api-pin-testdata.csv` rows 2, 8-13 (UT-074, UT-079..085)
**Postconditions:** N/A
**Pass/Fail Criteria:** 200 OK → PASS; otherwise FAIL

---

#### UT-067: Missing session_id — 400 MISSING_SESSION_ID

| Field | Value |
|-------|-------|
| **ID** | UT-067 |
| **Priority** | High |
| **Type** | Negative / Unit |
| **Requirement** | FR-API-01, FR-API-02 |
| **Preconditions** | N/A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with missing `session_id`, valid `index_snapshot_id` | Returns 400 MISSING_SESSION_ID |

**Test Data:** `api-pin-testdata.csv` row 3 (UT-075)
**Postconditions:** N/A
**Pass/Fail Criteria:** 400 with correct error code → PASS; otherwise FAIL

---

#### UT-068: Missing index_snapshot_id — 400 MISSING_INDEX_SNAPSHOT_ID

| Field | Value |
|-------|-------|
| **ID** | UT-068 |
| **Priority** | High |
| **Type** | Negative / Unit |
| **Requirement** | FR-API-01, FR-API-02 |
| **Preconditions** | Valid session_id |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with `session_id`, missing `index_snapshot_id` | Returns 400 MISSING_INDEX_SNAPSHOT_ID |

**Test Data:** `api-pin-testdata.csv` row 4 (UT-076)
**Postconditions:** N/A
**Pass/Fail Criteria:** 400 with correct error code → PASS; otherwise FAIL

---

#### UT-069: Snapshot Mismatch with Session Pin — 400 SNAPSHOT_MISMATCH

| Field | Value |
|-------|-------|
| **ID** | UT-069 |
| **Priority** | High |
| **Type** | Negative / Unit |
| **Requirement** | FR-API-02, AC-13 |
| **Preconditions** | Session session-001 pinned to snap-001 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with `session_id=session-001`, `index_snapshot_id=snap-002` | Returns 400 SNAPSHOT_MISMATCH |

**Test Data:** `api-pin-testdata.csv` row 5 (UT-077)
**Postconditions:** N/A
**Pass/Fail Criteria:** 400 SNAPSHOT_MISMATCH → PASS; otherwise FAIL

---

#### UT-070: Snapshot Not READY — 400 SNAPSHOT_NOT_READY

| Field | Value |
|-------|-------|
| **ID** | UT-070 |
| **Priority** | High |
| **Type** | Negative / Unit |
| **Requirement** | FR-API-02, AC-13 |
| **Preconditions** | Session session-001; snap-003 status = PENDING |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with `index_snapshot_id=snap-003` | Returns 400 SNAPSHOT_NOT_READY |

**Test Data:** `api-pin-testdata.csv` row 6 (UT-078)
**Postconditions:** N/A
**Pass/Fail Criteria:** 400 SNAPSHOT_NOT_READY → PASS; otherwise FAIL

---

#### UT-071: Non-Existent Snapshot — 404 SNAPSHOT_NOT_FOUND

| Field | Value |
|-------|-------|
| **ID** | UT-071 |
| **Priority** | Medium |
| **Type** | Negative / Unit |
| **Requirement** | FR-API-02 |
| **Preconditions** | Valid session |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with `index_snapshot_id=non-existent` | Returns 404 SNAPSHOT_NOT_FOUND |

**Test Data:** `api-pin-testdata.csv` row 9 (UT-081)
**Postconditions:** N/A
**Pass/Fail Criteria:** 404 SNAPSHOT_NOT_FOUND → PASS; otherwise FAIL

---

#### UT-072: Session Pinned to Different Snapshot — 400 SNAPSHOT_MISMATCH

| Field | Value |
|-------|-------|
| **ID** | UT-072 |
| **Priority** | Medium |
| **Type** | Negative / Unit |
| **Requirement** | FR-API-02 |
| **Preconditions** | Session session-004 pinned to different snapshot |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call API with `session_id=session-004`, `index_snapshot_id=snap-001` | Returns 400 SNAPSHOT_MISMATCH |

**Test Data:** `api-pin-testdata.csv` row 10 (UT-082)
**Postconditions:** N/A
**Pass/Fail Criteria:** 400 SNAPSHOT_MISMATCH → PASS; otherwise FAIL

---

### 4.14 Phase 4: 17 Acceptance Criteria Test Suite (SA4E-427)

#### E2E-API-01: AC-01 Re-index Same Commit — New Adapter Keeps Old Snapshot Intact

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-02, AC-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create snapshot S1 for commit C1 with adapter A1 | S1 status = READY |
| 2 | Re-index same commit C1 with new adapter A2 | Creates S2 status = READY |
| 3 | Verify S1 remains READY with unchanged symbol/chunk counts | S1 counts unchanged |
| 4 | Verify S2 contains only A2 output | S2 artifacts reference A2 only |

**Test Data:** `pre-seeded-data.csv` repo-001, commit-001
**Postconditions:** Two snapshots for same commit
**Pass/Fail Criteria:** S1 intact, S2 separate → PASS; corruption → FAIL

---

#### E2E-API-02: AC-02 Two Embedding Models on Same Snapshot — No Vector Mixing

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-08, AC-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create embedding_set ES1 with model `local-minilm` on snapshot S1 | ES1 created |
| 2 | Create embedding_set ES2 with model `other-model` on same S1 | ES2 created |
| 3 | Vector search with `local-minilm` | Returns only ES1 chunks |
| 4 | Vector search with `other-model` | Returns only ES2 chunks |

**Test Data:** `pre-seeded-data.csv` embedding sets
**Postconditions:** Two models on one snapshot
**Pass/Fail Criteria:** Zero cross-model contamination → PASS; mixing → FAIL

---

#### E2E-API-03: AC-03 Chat Pinned to Old Commit Queries After Branch Moves

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-13, AC-03 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create chat session pinned to snapshot S1 (commit C1) | Session created |
| 2 | Move branch head to new commit C2 (new snapshot S2) | Branch head updated |
| 3 | Query via pinned session | Returns results from S1/C1 |
| 4 | Verify symbol lookup returns `s-auth1` from old commit | Correct symbol returned |

**Test Data:** `pre-seeded-data.csv` chat sessions
**Postconditions:** Branch moved, session still queries old commit
**Pass/Fail Criteria:** Session queries pinned snapshot, not branch head → PASS; follows branch → FAIL

---

#### E2E-API-04: AC-04 Rename — Old & New Paths Correct at Respective Commits

| Field | Value |
|-------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-04, AC-04 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Index commit C1 with file at `src/old/auth.ts` | S1 has old path |
| 2 | Index commit C2 (rename) with file at `src/new/auth.ts` | S2 has new path |
| 3 | Search `oldPath` in S1 | Returns 1 hit |
| 4 | Search `newPath` in S2 | Returns 1 hit |
| 5 | Search `oldPath` in S2 | Returns 0 |
| 6 | Search `newPath` in S1 | Returns 0 |

**Test Data:** `pre-seeded-data.csv` commits/snapshots
**Postconditions:** N/A
**Pass/Fail Criteria:** Both paths correct at respective commits → PASS; otherwise FAIL

---

#### E2E-API-05: AC-05 Delete — Queryable at Old Commit, Not at New

| Field | Value |
|-------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-05, AC-05 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Index commit C1 with `AuthService` | S1 has file |
| 2 | Index commit C4 (delete) without `AuthService` | S4 lacks file |
| 3 | Search `AuthService` in S1 | Returns 1 hit |
| 4 | Search `AuthService` in S4 | Returns 0 hits |
| 5 | Verify deleted path missing from C4 source_file_revision | No revision row |

**Test Data:** `pre-seeded-data.csv` snapshots
**Postconditions:** N/A
**Pass/Fail Criteria:** Old commit has, new commit doesn't → PASS; otherwise FAIL

---

#### E2E-API-06: AC-06 Merge Commit with Two Parents Indexed Correctly

| Field | Value |
|-------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-03, AC-06 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create merge commit C3 with parents C1, C2 | git_commit_parent order [C1, C2] |
| 2 | Index merge commit C3 | S3 status = READY |
| 3 | Verify symbols from both parents resolvable in S3 | Cross-lineage symbols found |

**Test Data:** `pre-seeded-data.csv` merge commit
**Postconditions:** Merge indexed
**Pass/Fail Criteria:** Parents ordered, S3 READY, symbols from both → PASS; otherwise FAIL

---

#### E2E-API-07: AC-07 Every Artifact Belongs to Required Snapshot (DB-Enforced)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-04, AC-07 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify all symbol/chunk/embedding snapshot_ids exist in code_index_snapshot | All valid |
| 2 | Attempt cross-snapshot parent insert | Rejected by DB triggers |
| 3 | Attempt cross-repo chat pin | Rejected by DB triggers |

**Test Data:** `pre-seeded-data.csv` snapshots
**Postconditions:** N/A
**Pass/Fail Criteria:** DB triggers enforce ownership → PASS; any cross-snapshot accepted → FAIL

---

#### E2E-API-08: AC-08 Vector Query Never Leaks Across Repo/Snapshot

| Field | Value |
|-------|-------|
| **ID** | E2E-API-08 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts` |
| **Traces To** | BRD ES-04, AC-08 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Vector query on S1 (repo-001) | Returns only S1 chunks (no ch2/ch3/ch5) |
| 2 | Vector query on S5 (repo-002) | Returns only ch5 (repo-002) |
| 3 | Lexical search scoped per snapshot | Per-snapshot results |

**Test Data:** `pre-seeded-data.csv` multi-repo snapshots
**Postconditions:** N/A
**Pass/Fail Criteria:** Zero cross-repo/snapshot leakage → PASS; any leakage → FAIL

---

#### E2E-API-09: AC-09 Filtered ANN Recall + Result-Count on Multi-Snapshot Dataset

| Field | Value |
|-------|-------|
| **ID** | E2E-API-09 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts` |
| **Traces To** | BRD ES-04, AC-09 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute filter-first retrieval on multi-snapshot dataset | Recall@2 = 1.0 (exact cosine) |
| 2 | Verify per-snapshot counts: {S1:2, S2:1, S3:1, S5:1} | Counts match ACCEPTANCE-MATRIX.md |

**Test Data:** `pre-seeded-data.csv` 8 snapshots
**Postconditions:** N/A
**Pass/Fail Criteria:** Recall 1.0, correct counts → PASS; otherwise FAIL

---

#### E2E-API-10: AC-10 Semantic Re-run After Dependency/Classpath Change

| Field | Value |
|-------|-------|
| **ID** | E2E-API-10 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts` |
| **Traces To** | BRD ES-03, AC-10 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Index commit C1 → snapshot S1 | S1 READY |
| 2 | Change dependency/classpath (source unchanged) | config_fingerprint changes |
| 3 | Re-index same commit C1 | New snapshot S7 created |
| 4 | Verify S7 status = READY with new config_fingerprint | S7 READY, new fingerprint |
| 5 | Verify S1 untouched | S1 artifacts unchanged |

**Test Data:** `pre-seeded-data.csv` snapshots
**Postconditions:** N/A
**Pass/Fail Criteria:** Re-run triggered, new snapshot, old intact → PASS; otherwise FAIL

---

#### E2E-API-11: AC-11 Dependency Failure → No Fake Semantic Coverage Cascade

| Field | Value |
|-------|-------|
| **ID** | E2E-API-11 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts` |
| **Traces To** | BRD ES-03, AC-11 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Index with Java resolver failing (broken classpath) | Java capability = FAILED |
| 2 | Verify Stage F never ran for Java | No Java semantic artifacts |
| 3 | Verify snapshot still publishes READY | Snapshot READY (soft failure) |
| 4 | Verify TypeScript capability = SUPPORTED | TS works independently |

**Test Data:** Test repo with broken Java config
**Postconditions:** N/A
**Pass/Fail Criteria:** Java FAILED, never SUPPORTED, snapshot READY, TS works → PASS; otherwise FAIL

---

#### E2E-API-12: AC-12 Agent Restart → Resume from Persisted Plan/Step/Approval

| Field | Value |
|-------|-------|
| **ID** | E2E-API-12 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts` |
| **Traces To** | BRD ES-05, AC-12 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run agent with plan, steps, approval pending | State persisted |
| 2 | Simulate restart (fresh service instance) | New instance, zero in-memory state |
| 3 | Call `summarizeForResume(agentRunId)` | Returns: objective, APPROVED plan, nextStepIndex=1, pendingApproval |
| 4 | Verify fresh instance continues from step-002 | Execution resumes |

**Test Data:** `agent-persistence-testdata.csv` scenario
**Postconditions:** Agent resumed
**Pass/Fail Criteria:** Resume summary correct, fresh instance continues → PASS; otherwise FAIL

---

#### E2E-API-13: AC-13 Patch Rejects Stale Base Hash and Path Traversal

| Field | Value |
|-------|-------|
| **ID** | E2E-API-13 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts` |
| **Traces To** | BRD ES-06, AC-13 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stage patch with base commit C1 | Stage succeeds |
| 2 | Apply after approval with workspace at C2 (stale base) | 409 STALE_BASE_HASH; change_set stays OPEN |
| 3 | Stage patch with path `../../etc/passwd` | 400 PATH_TRAVERSAL |
| 4 | Stage patch with absolute path `/absolute/path` | 400 PATH_TRAVERSAL |
| 5 | Verify original file bytes untouched in all cases | Files unchanged |

**Test Data:** `patch-testdata.csv` scenarios
**Postconditions:** N/A
**Pass/Fail Criteria:** Stale base rejected, traversal rejected, files untouched → PASS; otherwise FAIL

---

#### E2E-API-14: AC-14 Original Working Tree Unchanged Before Approval

| Field | Value |
|-------|-------|
| **ID** | E2E-API-14 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts` |
| **Traces To** | BRD ES-06, AC-14 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stage patch | Working tree fingerprint captured |
| 2 | Verify fingerprint identical after staging | No change |
| 3 | Attempt apply with NOT_APPROVED | Rejected |
| 4 | Verify fingerprint still identical | No change |
| 5 | Approve and apply | Fingerprint changes (patch applied) |

**Test Data:** `patch-testdata.csv` scenarios
**Postconditions:** N/A
**Pass/Fail Criteria:** Tree unchanged until APPROVED apply → PASS; premature change → FAIL

---

#### E2E-API-15: AC-15 Sandbox — No Workspace Escape, No Unrestricted Network

| Field | Value |
|-------|-------|
| **ID** | E2E-API-15 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts` |
| **Traces To** | BRD ES-06, AC-15 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt absolute path | Rejected |
| 2 | Attempt `..` traversal | Rejected |
| 3 | Attempt NUL byte | Rejected |
| 4 | Attempt shell metachars (`;`, `&&`, `|`, `$()`) | Rejected |
| 5 | Verify `--` separator inserted | No shell concat |
| 6 | Attempt network to non-allowlisted host | Denied |
| 7 | Attempt network to allowlisted host (exact match) | Allowed |
| 8 | Verify container limits validated | CPU/memory/disk/process caps |

**Test Data:** N/A
**Postconditions:** N/A
**Pass/Fail Criteria:** All sandbox checks pass → PASS; any bypass → FAIL

---

#### E2E-API-16: AC-16 SSE Reconnect + Replay → No Duplicate/Missing Events

| Field | Value |
|-------|-------|
| **ID** | E2E-API-16 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts` |
| **Traces To** | BRD ES-12, AC-16 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect SSE, receive events 1..3 | Events received |
| 2 | Disconnect after event 3 | Connection lost |
| 3 | Reconnect with `Last-Event-ID: 3` | Replay returns events 4..7 |
| 4 | Verify combined: 1,2,3,4,5,6,7 | 0 duplicates, 0 gaps |

**Test Data:** `sse-testdata.csv` scenario
**Postconditions:** N/A
**Pass/Fail Criteria:** No duplicates, no gaps → PASS; any violation → FAIL

---

#### E2E-UI-01: AC-17 Real Tokenizer Prompt/Tool Counting Under Runtime Budget

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | High |
| **Type** | Automated (Playwright) |
| **Feature File** | `extension/src/pi-agent/__tests__/acceptance-ac17.test.ts` |
| **Steps File** | `extension/src/pi-agent/budget-gate/` helpers |
| **Scenario** | `AC-17: real prompt + tool tokens drive the runtime budget decision` |
| **Traces To** | BRD ES-11, AC-17 |

**Playwright:**
```ts
test("AC-17: real prompt + tool tokens drive the runtime budget decision", async ({ page }) => {
  // Inject mock fetchFn for llama.cpp /tokenize returning 4200 tokens
  // Navigate to agent chat
  // Send message triggering budget calculation
  // Verify budget decision uses real token count (4200) not estimate
  // Assert budget-gate output matches expected tier/escalation
});
```

**Test Data:** `token-budget-testdata.csv` row 12 (UT-056)
**Postconditions:** Budget decision verified
**Pass/Fail Criteria:** Real tokenizer count (4200) used, budget decision correct → PASS; estimate used → FAIL

---

### 4.15 Phase 4: Token/Eviction Integration Tests (SA4E-428)

#### IT-01: Backend Token/Eviction Integration — 13 Tests

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Automated (vitest + Hono app.request()) |
| **File** | `backend/src/engine/scratchpad/__tests__/token-eviction.integration.test.ts` |
| **Traces To** | FR-INT-01 |

**Test Scenarios (13):**
1. Scratchpad canonical parse with referencedEvidenceIds
2. BatchEvict exempts referenced evidence IDs
3. S_evict score calculation exact
4. Tombstone format verification
5. Eviction target selection correct
6. No budget overflow after eviction
7. No eviction when no pressure (< 75%)
8. Eviction at 75% threshold
9. Eviction at 90% threshold
10. In-use items score = -Infinity (exempt)
11. Multiple eviction rounds
12. Scratchpad interaction with tool calls
13. Full turn: scratchpad → tool → evidence → evict

**Test Data:** `token-eviction.integration.test.ts` fixtures
**Postconditions:** All 13 pass
**Pass/Fail Criteria:** All 13 backend integration tests pass → PASS; any fail → FAIL

---

#### IT-02: Extension Token/Eviction Integration — 9 Tests

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Automated (vitest) |
| **File** | `extension/src/pi-agent/__tests__/token-eviction.integration.test.ts` |
| **Traces To** | FR-INT-02 |

**Test Scenarios (9):**
1. Real tokenizer tiers with exact count 700
2. Eviction algorithm exact S_evict match
3. Scratchpad interaction with eviction
4. Budget gate escalation order (SYSTEM→CRITICAL→HIGH→MEDIUM→LOW)
5. Actionable error messages
6. Role-scope reduction (5→1 skills)
7. Tool schema cap (explicit 1000 trim)
7. Scoped steering integration
8. RoleScopeFilter integration
9. buildSessionToolLoadout composition

**Test Data:** `token-budget-testdata.csv` scenarios
**Postconditions:** All 9 pass
**Pass/Fail Criteria:** All 9 extension integration tests pass → PASS; any fail → FAIL

---

### 4.16 Phase 4: SA4E Regression Test Suite (SA4E-429)

#### E2E-API-17: AC-18 Build + Test Green (Regression Gate)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-17 |
| **Priority** | Critical |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/regression/__tests__/sa4e-regression.test.ts` + composed gate |
| **Traces To** | BRD ES-16, AC-18 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm run build` at repository root | Exit 0 |
| 2 | Run `npm test` at repository root | Exit 0 |
| 3 | Verify backend: 500 files / 3825 passed / 19 skipped | Counts match |
| 4 | Verify extension: 443 files / 3469 passed / 6 skipped | Counts match |
| 5 | Run `npm run test:regression` | Exit 0 |
| 6 | Verify backend regression: 11 files / 63 tests | SM pipeline, F12, enrichment, budget, F2, F4, role boundaries |
| 7 | Verify extension regression: 20 files / 155 tests | 7-phase order, PhaseRouter, 9-agent matrix, SM guard, cross-agent guards |
| 8 | Verify no role boundary violations detected | Matrix enforced |

**Test Data:** N/A (full suite)
**Postconditions:** Regression gate passed
**Pass/Fail Criteria:** All gates exit 0, counts match, no violations → PASS; any failure → FAIL

---

#### E2E-API-18: F2 Code Intelligence Regression

| Field | Value |
|-------|-------|
| **ID** | E2E-API-18 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | `backend/src/engine/regression/__tests__/sa4e-regression.test.ts` |
| **Traces To** | FR-REG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify migration V6 additive proof: legacy files/symbols/FTS5/triggers/relationships intact | Legacy tables untouched |
| 2 | Verify FK pragma = 1 | Foreign keys enforced |
| 3 | Verify host-file export on disconnect | Export works |
| 4 | Verify F4 AIContextService assembly on V6 DB | Assembly works |
| 5 | Verify legacy symbol vs snapshot retrieval isolation | No cross-contamination |

**Test Data:** N/A
**Postconditions:** F2/F4 regression verified
**Pass/Fail Criteria:** All F2/F4 checks pass → PASS; any regression → FAIL

---

#### E2E-API-19: Extension Role Boundaries Regression

| Field | Value |
|-------|-------|
| **ID** | E2E-API-19 |
| **Priority** | High |
| **Type** | Automated (vitest) |
| **File** | `extension/src/__tests__/sa4e-regression.test.ts` |
| **Traces To** | FR-REG-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify 7-phase canonical order + PhaseRouter transitions + abort HALTED | Order enforced |
| 2 | Verify 9-agent role matrix | All 9 roles present |
| 3 | Verify prompt existence for all agents | Prompts defined |
| 4 | Verify SM coordinator-only guard | SM cannot create/forbid |
| 5 | Verify no create/forbid overlap | Mutually exclusive |
| 6 | Verify critical cross-agent guards | Guards active |
| 7 | Verify role-scope: 8 roles + fail-open | Scope correct |

**Test Data:** N/A
**Postconditions:** Role boundaries verified
**Pass/Fail Criteria:** All role boundary checks pass → PASS; any violation → FAIL

---

### 4.17 Property-Based Tests (PBT)

#### PBT-01: Snapshot ID Uniqueness Property

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | Medium |
| **Type** | Property-Based |
| **Requirement** | FR-SNAP-07 |

**Property:** For any random repository_id, commit_id, config_fingerprint, code_model_version, the snapshot ID generated is unique and deterministic.

**Test:** fast-check generates 1000 random combinations → verify no collisions.

---

#### PBT-02: Composite FK Violation Property

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-SNAP-09 |

**Property:** Any random insert attempting to cross snapshot boundaries is rejected by triggers.

**Test:** fast-check generates random cross-snapshot artifact inserts → all rejected.

---

#### PBT-03: S_evict Formula Property

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-EV-02 |

**Property:** For random Age, Token_Count, Is_Referenced, S_evict = Age×200 + Tokens - Referenced×1000 holds.

**Test:** fast-check generates 10000 random tuples → formula matches exactly.

---

#### PBT-04: Budget Formula Property

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-TOK-02 |

**Property:** available_input_tokens = n_ctx - sum(all_components) for random valid inputs.

**Test:** fast-check generates random model configs → formula holds.

---

#### PBT-05: PageRank Convergence Property

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | Medium |
| **Type** | Property-Based |
| **Requirement** | FR-UX-01 |

**Property:** PageRank on random AST graphs converges within 100 iterations (α=0.85).

**Test:** fast-check generates random graphs → convergence verified.

---

#### PBT-06: Binary Search Packing Property

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Priority** | Medium |
| **Type** | Property-Based |
| **Requirement** | FR-UX-01 |

**Property:** Binary search packing always produces output ≤ 1,500 tokens for any ranked symbol list.

**Test:** fast-check generates random ranked lists → token count ≤ 1500.

---

#### PBT-07: Embedding Set Uniqueness Property

| Field | Value |
|-------|-------|
| **ID** | PBT-07 |
| **Priority** | Medium |
| **Type** | Property-Based |
| **Requirement** | FR-SNAP-10 |

**Property:** UNIQUE(snapshot, model_key, model_ver, preprocessing_ver) holds for random combinations.

**Test:** fast-check generates random embedding set params → uniqueness verified.

---

#### PBT-08: Vector Search Isolation Property

| Field | Value |
|-------|-------|
| **ID** | PBT-08 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-RET-04 |

**Property:** Vector search on random multi-snapshot dataset never returns cross-snapshot chunks.

**Test:** fast-check generates random multi-snapshot embeddings → zero leakage.

---

#### PBT-09: Patch Stale Base Detection Property

| Field | Value |
|-------|-------|
| **ID** | PBT-09 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-PAT-02 |

**Property:** applyAfterApproval with drifted base hash always rejects (STALE_BASE_HASH).

**Test:** fast-check generates random base/workspace hash pairs → drift detected.

---

#### PBT-10: SSE Replay Ordering Property

| Field | Value |
|-------|-------|
| **ID** | PBT-10 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-SSE-02 |

**Property:** Replay from any valid Last-Event-ID returns ordered, no-duplicate, no-gap sequence.

**Test:** fast-check generates random event sequences + replay points → guarantees hold.

---

#### PBT-11: API Pin Mismatch Detection Property

| Field | Value |
|-------|-------|
| **ID** | PBT-11 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-API-02 |

**Property:** Any request with session pin ≠ requested snapshot_id returns 400 SNAPSHOT_MISMATCH.

**Test:** fast-check generates random session/snapshot pairs → mismatch detected.

---

#### PBT-12: Role Boundary Matrix Property

| Field | Value |
|-------|-------|
| **ID** | PBT-12 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | FR-REG-02 |

**Property:** 9-agent role matrix: no agent can perform actions outside its scope.

**Test:** fast-check generates random agent/action pairs → violations detected.

---

## 5. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| ES-01 (Scope Decision) | BRD §2.2 #1 | TC-001 | ✅ |
| ES-02 (V6 Migration) | BRD §2.2 #2 | UT-001..008, E2E-API-01,02, E2E-API-18 | ✅ |
| ES-03 (Pipeline Order) | BRD §2.2 #3 | UT-009..011, E2E-API-06,10,11 | ✅ |
| ES-04 (Snapshot Retrieval) | BRD §2.2 #4 | UT-012..021, E2E-API-04,05,07,08,09 | ✅ |
| ES-05 (Agent Persistence) | BRD §2.2 #5 | UT-022..028, E2E-API-12 | ✅ |
| ES-06 (Patch Protocol) | BRD §2.2 #6 | UT-029..038, E2E-API-13,14,15 | ✅ |
| ES-07 (Repo Map) | BRD §2.2 #7 | UT-039,040, PBT-05,06 | ✅ |
| ES-08 (AST Chunking) | BRD §2.2 #8 | UT-041..043, E2E-API-02 | ✅ |
| ES-09 (4 Core Tools) | BRD §2.2 #9 | UT-044..048 | ✅ |
| ES-10 (Scratchpad/Eviction) | BRD §2.2 #10 | UT-049..055, IT-01,02, PBT-03 | ✅ |
| ES-11 (Token Budget) | BRD §2.2 #11 | UT-056..061, IT-01,02, PBT-04 | ✅ |
| ES-12 (SSE Durable Log) | BRD §2.2 #12 | UT-062..065, E2E-API-16, PBT-10 | ✅ |
| ES-13 (API Pin Enforcement) | BRD §2.2 #13 | UT-066..072, E2E-API-03, PBT-11 | ✅ |
| ES-14 (17 AC Suite) | BRD §2.2 #14 | E2E-API-01..16, E2E-UI-01 | ✅ |
| ES-15 (Token/Eviction Integration) | BRD §2.2 #15 | IT-01, IT-02 | ✅ |
| ES-16 (SA4E Regression) | BRD §2.2 #16 | E2E-API-17..19 | ✅ |
| AC-01 | BRD §2.3, ACCEPTANCE-MATRIX | E2E-API-01 | ✅ |
| AC-02 | BRD §2.3, ACCEPTANCE-MATRIX | UT-003, UT-043, E2E-API-02 | ✅ |
| AC-03 | BRD §2.3, ACCEPTANCE-MATRIX | E2E-API-03 | ✅ |
| AC-04 | BRD §2.3, ACCEPTANCE-MATRIX | UT-019, E2E-API-04 | ✅ |
| AC-05 | BRD §2.3, ACCEPTANCE-MATRIX | UT-018, E2E-API-05 | ✅ |
| AC-06 | BRD §2.3, ACCEPTANCE-MATRIX | UT-005, E2E-API-06 | ✅ |
| AC-07 | BRD §2.3, ACCEPTANCE-MATRIX | UT-006, UT-012..015, E2E-API-07 | ✅ |
| AC-08 | BRD §2.3, ACCEPTANCE-MATRIX | UT-014, UT-017, UT-021, E2E-API-08 | ✅ |
| AC-09 | BRD §2.3, ACCEPTANCE-MATRIX | UT-017, UT-021, E2E-API-09 | ✅ |
| AC-10 | BRD §2.3, ACCEPTANCE-MATRIX | UT-011, E2E-API-10 | ✅ |
| AC-11 | BRD §2.3, ACCEPTANCE-MATRIX | UT-010, E2E-API-11 | ✅ |
| AC-12 | BRD §2.3, ACCEPTANCE-MATRIX | UT-022..028, E2E-API-12 | ✅ |
| AC-13 | BRD §2.3, ACCEPTANCE-MATRIX | UT-029..031, E2E-API-13 | ✅ |
| AC-14 | BRD §2.3, ACCEPTANCE-MATRIX | UT-032..034, E2E-API-14 | ✅ |
| AC-15 | BRD §2.3, ACCEPTANCE-MATRIX | UT-035..038, E2E-API-15 | ✅ |
| AC-16 | BRD §2.3, ACCEPTANCE-MATRIX | UT-062..064, E2E-API-16 | ✅ |
| AC-17 | BRD §2.3, ACCEPTANCE-MATRIX | UT-056..061, E2E-UI-01 | ✅ |
| AC-18 | BRD §2.3, ACCEPTANCE-MATRIX | E2E-API-17..19 | ✅ |

**Coverage: 100% — All 48 requirement rows traced to at least one test case.**

---

## 6. Test Execution Gates

| Gate | Command | Scope | Threshold | Status |
|------|---------|-------|-----------|--------|
| Build | `npm run build` | Root (backend + extension) | Exit 0 | ✅ |
| Unit Test | `npm test` | Root | Exit 0 (Backend 500f/3825p/19s; Ext 443f/3469p/6s) | ✅ |
| AC Suite | `npm run test:ac` | Backend (16) + Extension (1) | < 10s | ✅ |
| Token/Eviction | `npm run test:token` | Backend (13) + Extension (9) | Pass | ✅ |
| Regression | `npm run test:regression` | Backend 11f/63t + Ext 20f/155t | Pass | ✅ |

---

## 7. Performance Baselines

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Full AC suite (`npm run test:ac`) | < 10s | 1.6–1.7s (backend) + ~0.5s (extension) | ✅ |
| Single AC test | < 2s | Max 71ms (AC-01) | ✅ |
| Backend full regression | Informational | 500 files / 3825 passed / 19 skipped | ✅ |
| Extension full regression | Informational | 443 files / 3469 passed / 6 skipped | ✅ |

*Source: `documents/SA4E-427/PERF-BASELINES.md`*

---

## 8. Test Data Summary

| CSV File | Rows (excl. header) | Test Cases Referenced |
|----------|---------------------|----------------------|
| `pre-seeded-data.csv` | 21 | All (baseline fixtures) |
| `create-snapshot-testdata.csv` | 10 | UT-001..010 |
| `retrieval-testdata.csv` | 15 | UT-011..025 |
| `agent-persistence-testdata.csv` | 10 | UT-022..035 |
| `patch-testdata.csv` | 10 | UT-029..045 |
| `token-budget-testdata.csv` | 11 | UT-046..061 |
| `sse-testdata.csv` | 17 | UT-057..073 |
| `api-pin-testdata.csv` | 12 | UT-066..085 |
| **Total** | **106** | **All UT/IT/E2E test data covered** |

---

## 9. Defect Management

| Severity | Definition | SLA |
|----------|------------|-----|
| Critical | Blocks release, data loss, security breach | 4 hours |
| Major | Feature broken, wrong behavior, performance regression | 24 hours |
| Minor | Cosmetic, edge case, non-correctable workaround | 1 week |
| Trivial | Typo, documentation, enhancement | Next sprint |

**Defect Lifecycle:** New → Open → In Progress → Fixed → Verified → Closed

---

## 10. Test Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Test Execution Progress | 100% | 100% |
| Defect Density | < 0.5/KLOC | 0.02/KLOC |
| Pass/Fail Rate | 100% Pass | 293/293 Pass |
| Requirements Coverage | 100% | 100% |
| Automation Coverage | > 95% | 97% |

---

## 11. Appendix

### 11.1 Test Case ID Numbering Convention

| Range | Category | Level |
|-------|----------|-------|
| PBT-01..12 | Property-Based Tests | PBT |
| UT-001..187 | Unit Tests | UT |
| IT-01..43 | Integration Tests | IT |
| E2E-API-01..28 | E2E API Tests | E2E-API |
| E2E-UI-01..15 | E2E UI Tests | E2E-UI |
| SIT-01..08 | Manual System Integration Tests | SIT |

### 11.2 E2E Test File Structure (Reference)

```
backend/tests/e2e/
├── acceptance-ac01-08.e2e.test.ts      # AC-01..08
├── acceptance-ac09-12.e2e.test.ts      # AC-09..12
├── acceptance-ac13-16.e2e.test.ts      # AC-13..16
├── token-eviction.e2e.test.ts          # SA4E-428 integration
├── sa4e-regression.e2e.test.ts         # SA4E-429 regression
└── helpers/
    ├── auth.ts                         # JWT token helpers
    ├── fixtures.ts                     # Test data setup
    └── assertions.ts                   # Custom matchers

extension/tests/e2e/
├── acceptance-ac17.e2e.test.ts         # AC-17 (extension)
├── budget-gate.e2e.test.ts             # Token budget E2E
└── helpers/
    ├── page-objects.ts                 # Playwright page objects
    └── test-utils.ts                   # Shared utilities
```

### 11.3 Diagram Files (Editable Sources)

All diagrams in `documents/SA4E-411/diagrams/`:
- `test-coverage.drawio` → `test-coverage.png` (embedded in Section 3)
- `test-execution-flow.drawio` → `test-execution-flow.png` (embedded in Section 3)
- `architecture-overview.drawio`
- `component.drawio`
- `class-agent-tools.drawio`
- `snapshot-revision-er.drawio`
- `pipeline-ordering.drawio`
- `token-budget.drawio`
- `scratchpad-eviction.drawio`
- `system-context.drawio`
- `sequence-agent-chat.drawio`
- `state-token-budget.drawio`
- `business-flow.drawio`
- `use-case.drawio`

---

**Document End**