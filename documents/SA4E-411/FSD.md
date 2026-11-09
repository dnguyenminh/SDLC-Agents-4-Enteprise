# Functional Specification Document (FSD)

## SA4E-411: [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-411 |
| Title | [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX |
| Author | BA Agent (+ TA enrichment) |
| Version | 1.0 |
| Date | 2026-11-09 |
| Status | Complete — All 18 child stories implemented and In Review |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the **functional requirements and use cases** for the Code Agent 16K epic, decomposed into 18 child stories (SA4E-412..429). It translates the Business Requirements (BRD) and Architecture (16K Doc) into testable functional specifications with traceability to implementation.

### 1.2 Scope

Functional areas covered:
- **Snapshot/Revision Data Model** (CR-01..06): Repository, commit, source revision, code index snapshot, artifact tables, embedding set, active pointer
- **Indexing Pipeline**: Dependency-before-semantic ordering, 10-stage pipeline (A–J), language isolation
- **Snapshot-Scoped Retrieval**: Hybrid search (lexical + vector + graph), exact/proven/inferred ranking, cross-snapshot isolation
- **Agent Persistence**: Plan/step/approval/transition/tool-execution/retrieval-evidence/workspace
- **Patch Protocol & Security**: Staged patch (stage → approve → apply), sandbox validation, base-hash revalidation
- **Agent UX**: Repo map (PageRank), AST skeleton/body chunking, 4 core tools, scratchpad/eviction, runtime token budget
- **Hardening**: Agent state recovery, SSE durable log + replay, API pinned-snapshot enforcement
- **Validation**: 17 AC acceptance suite, token/eviction integration, SA4E regression gate

### 1.3 Document Conventions

- **Requirement IDs**: `FR-<area>-<nn>` (e.g., `FR-SNAP-01`, `FR-TOOL-04`)
- **Traceability**: Each FR maps to child story, 16K Doc section, and acceptance test
- **Priority**: MUST HAVE / SHOULD HAVE / COULD HAVE (MoSCoW)

---

## 2. Functional Requirements

### 2.1 Snapshot/Revision Data Model (CR-01..06) — Phase 1

#### 2.1.1 Repository & Commit (CR-01)

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-01 | Create `repository` table with `id` (uuid), `origin_url`, `display_name`, `created_at` | MUST | §10.1 | SA4E-413 | migration-v6.test.ts |
| FR-SNAP-02 | Create `git_commit` with `id` (uuid), `repository_id` FK, `commit_sha`, author/committer/committed_at; UNIQUE(repo, sha) | MUST | §10.1 | SA4E-413 | migration-v6.test.ts |
| FR-SNAP-03 | Create `git_commit_parent` for merge commits: `(commit_id, parent_commit_id, parent_order)` PK | MUST | §10.1 | SA4E-413 | AC-06 (merge commit) |
| FR-SNAP-04 | Create `git_ref` for mutable branch/tag refs: `(repository_id, ref_name)` PK, `target_commit_id` FK, `ref_type` BRANCH/TAG | MUST | §10.1 | SA4E-413 | migration-v6.test.ts |

#### 2.1.2 Source File Revisions (CR-02)

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-05 | Create `source_file_revision` with `id`, `repository_id`, `commit_id` FK, `relative_path`, `content_hash`, `language`, `file_type`, `is_generated`, `is_binary`, `line_count`; UNIQUE(commit_id, relative_path) | MUST | §10.2 | SA4E-413 | migration-v6.test.ts |
| FR-SNAP-06 | No mutable `repository_file` — path identity belongs to a revision; rename handled by indexer heuristic | MUST | §10.2 | SA4E-414 | AC-04 (rename) |

#### 2.1.3 Code Index Snapshot & Artifacts (CR-03)

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-07 | Create `code_index_snapshot` with `id`, `repository_id`, `commit_id`, `config_fingerprint`, `code_model_version`, `toolchain_manifest`, `status` (PENDING/BUILDING/READY/FAILED/SUPERSEDED), `diagnostics`, `created_at`; UNIQUE(repo, commit, config_fp, model_ver) | MUST | §10.3 | SA4E-413 | AC-01, AC-02 |
| FR-SNAP-08 | Create snapshot-scoped artifact tables: `code_symbol`, `symbol_occurrence`, `symbol_occurrence_resolution`, `symbol_relationship`, `relationship_evidence`, `code_chunk`, `dependency_resolution_snapshot` — all with `snapshot_id` FK | MUST | §10.3 | SA4E-413, 415 | AC-07, AC-08 |
| FR-SNAP-09 | Composite FK ownership: `code_symbol(parent_id, module_id)`, `code_chunk(symbol_id)`, `relationship_evidence` — all reference `(id, snapshot_id)` of parent table; enforced by SQLite triggers | MUST | §10.7 | SA4E-413 | AC-07 (DB-enforced) |

#### 2.1.4 Embedding Set (CR-04)

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-10 | Create `embedding_set` with `id`, `code_index_snapshot_id` FK, `model_key`, `model_version`, `dimensions`, `preprocessing_version`, `tokenizer_version`, `chunker_version`; UNIQUE(snapshot, model_key, model_ver, preprocessing_ver) | MUST | §10.4 | SA4E-413, 419 | AC-02 (two models) |
| FR-SNAP-11 | Create `code_embedding` with `embedding_set_id` FK, `chunk_id` FK, `embedding` BLOB (float32[] packed); PK(embedding_set_id, chunk_id) | MUST | §10.4 | SA4E-419 | AC-02 |

#### 2.1.5 Active Pointer (CR-05)

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-12 | Create `repository_ref_index_state` mapping `(repository_id, ref_name)` → `active_code_index_snapshot_id` + `generation` | MUST | §10.5 | SA4E-413 | migration-v6.test.ts |
| FR-SNAP-13 | Chat session pins commit + snapshot; trigger enforces `pinned_code_index_snapshot_id` belongs to session's `(repository_id, commit_id)` | MUST | §10.6, 10.7 | SA4E-416, 426 | AC-03, AC-26 |

#### 2.1.6 Chat Session & Agent Run (CR-06)

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-14 | Create `chat_session` with `id`, `repository_id`, `commit_id`, `pinned_code_index_snapshot_id`, `model_config_snapshot`, `created_at` | MUST | §10.6 | SA4E-416 | migration-v6.test.ts |
| FR-SNAP-15 | Create agent persistence tables: `agent_run`, `agent_plan` (version, objective, AC, status), `agent_step` (dependencies, input/output refs, attempts, timestamps), `agent_state_transition`, `agent_tool_execution`, `retrieval_evidence`, `agent_workspace` | MUST | §10.6, 15 | SA4E-416, 423 | AC-12 |
| FR-SNAP-16 | Create patch workflow tables: `change_set` (base_commit_id, summary, status OPEN/APPLIED/DISCARDED), `approval_request` (action, scope, proposed_changeset, decision PENDING/APPROVED/REJECTED), `execution_run` | MUST | §12, 13 | SA4E-417, 424 | AC-13, AC-14 |

#### 2.1.7 Invariants & Multi-Tenant

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SNAP-17 | All 16K tables include `project_id` (V5 multi-tenant); UNIQUE constraints include project_id where needed | MUST | §10.7 | SA4E-413 | migration-v6.test.ts |
| FR-SNAP-18 | CHECK constraints: `start_line <= end_line`, offsets ≥ 0, `confidence ∈ [0,1]`, status enums | MUST | §10.7 | SA4E-413 | migration-v6.test.ts |
| FR-SNAP-19 | Dual-dialect migration: SQLite DDL + PG via `ddl-translator.ts`; idempotent per-table (check pragma_table_info / information_schema) | MUST | §1, 3 | SA4E-413 | migration-v6.test.ts + PG smoke |

---

### 2.2 Indexing Pipeline (Dependency-Before-Semantic) — Phase 1

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-IDX-01 | 10-stage pipeline: A) Repo/revision discovery → B) File inventory & immutable revisions → C) Build/module config discovery → D) Syntax indexing (Tree-sitter) → E) Dependency & toolchain resolution → F) Semantic indexing (compiler/LSP) → G) Graph reconciliation → H) Chunk & embedding → I) Validation → J) Atomic publication | MUST | §9 | SA4E-414 | index-pipeline tests |
| FR-IDX-02 | Syntax indexing (D) can run before dependency resolution (E); semantic (F) MUST run after E completes | MUST | §9 | SA4E-414 | pipeline order test |
| FR-IDX-03 | Per-language isolation: one language's failure never aborts others; publish capability/coverage metadata | MUST | §9 | SA4E-414 | index-pipeline.isolation.test.ts |
| FR-IDX-04 | Incremental: file revision `content_hash` + `file_index` mtime/content_hash for change detection; WAL durability | MUST | §9, F2 | SA4E-414 | index-operation-manager tests |

---

### 2.3 Snapshot-Scoped Retrieval — Phase 1

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-RET-01 | All retrieval paths require `code_index_snapshot_id` as primary filter (lexical, vector, graph, exact symbol) | MUST | §11 | SA4E-415 | AC-07, AC-08 |
| FR-RET-02 | Hybrid ranking: exact definition > proven reference > text similarity; separate `direct` vs `inferred` evidence kinds | MUST | §11 | SA4E-415 | retrieval-types.ts |
| FR-RET-03 | Graph query: CALLERS/CALLEES/IMPLEMENTATIONS with cycle guard, node cap, snapshot filter, stable ordering | MUST | §11 | SA4E-415 | AC-07, AC-08 |
| FR-RET-04 | Vector query scoped by `embedding_set` (model + snapshot); filter-first contract preserved for future ANN | MUST | §11 | SA4E-415 | AC-08, AC-09 |
| FR-RET-05 | Build/config/test discovery as first-class retrieval category | MUST | §11 | SA4E-415 | acceptance-ac09-12.test.ts |

---

### 2.4 Agent Persistence & Recovery — Phase 1, 3

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-AGT-01 | `agent_plan`: versioned objective + AC + status (DRAFT/APPROVED/EXECUTING/DONE/REJECTED) | MUST | §15 | SA4E-416 | AC-12 |
| FR-AGT-02 | `agent_step`: dependency_ids (json array), input/output refs, attempts, status (PENDING/RUNNING/DONE/FAILED/SKIPPED), timestamps | MUST | §15 | SA4E-416 | AC-12 |
| FR-AGT-03 | `agent_state_transition`: full state history (old_state, new_state, reason, timestamp) | MUST | §15 | SA4E-416, 423 | AC-12 |
| FR-AGT-04 | Durable event log (SSE): append before publish; `Last-Event-ID` replay; `agent_event` table (SA4E-425) | MUST | §15 | SA4E-425 | AC-16 |
| FR-AGT-05 | Recovery: `summarizeForResume()` returns objective, APPROVED plan, next step index, pending approval; fresh service instance resumes with zero in-memory state | MUST | §15 | SA4E-423 | AC-12 |

---

### 2.5 Patch Protocol & Security Sandbox — Phase 1, 3

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-PAT-01 | Staged patch workflow: `stage()` validates (base hash, path, symlinks, size, ownership) WITHOUT applying; records `change_set` (OPEN) + `approval_request` (PENDING) + `execution_run` (validation) | MUST | §12, 13 | SA4E-417, 424 | AC-13, AC-14 |
| FR-PAT-02 | `applyAfterApproval()` ONLY on APPROVED decision: re-validates stale-base (base hash may drift), applies atomically via `PatchProtocol`; rejected apply keeps change_set OPEN | MUST | §12, 13 | SA4E-417, 424 | AC-13, AC-14 |
| FR-PAT-03 | Sandbox validation: reject absolute paths, `..`, symlink escape, NUL bytes, shell metachars; `--` separator; network denied by default; registry allowlist exact host match; container limits | MUST | §13 | SA4E-424 | AC-15 |
| FR-PAT-04 | Tool args schema validation (Zod); no shell concat; fixed executable + arg vector | MUST | §13 | SA4E-424 | AC-15, sandbox.test.ts |

---

### 2.6 Agent UX: Repository Map, Chunking, Core Tools — Phase 2

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-UX-01 | Dynamic Repository Map: build AST call graph → edge weight `W(A→B, s) = Multiplier(s) × sqrt(freq) × ln(N/(df+1))` → personalize by query match → PageRank(α=0.85) → binary-search pack into ~1,500 tokens DSL | MUST | §6 | SA4E-418 | repo-map tests |
| FR-UX-02 | AST Skeleton/Body Chunking: skeleton (class/interface, fields, signatures, no body) for embedding; body on demand; lib code → .d.ts/header signatures only | MUST | §5 | SA4E-419 | chunking tests |
| FR-UX-03 | `search_symbols`: hybrid BM25 + vector, lightweight signature + line range, session-pinned snapshot | MUST | §7 | SA4E-420 | core-tools tests |
| FR-UX-04 | `get_file_skeleton`: class structure, fields, signatures (no body), session-pinned | MUST | §7 | SA4E-420 | core-tools tests |
| FR-UX-05 | `read_code_block`: specific lines, max 120 lines/turn, session-pinned | MUST | §7 | SA4E-420 | core-tools tests |
| FR-UX-06 | `query_call_graph`: CALLERS/CALLEES/IMPLEMENTATIONS, session-pinned | MUST | §7 | SA4E-420 | core-tools tests |
| FR-UX-07 | Tool output DSL (not raw JSON): result ID, summary, snippets, evidence IDs, truncation flag, next-page cursor | MUST | §7 | SA4E-420 | tool-context.ts |

---

### 2.7 Scratchpad & Context Eviction — Phase 2

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-EV-01 | Scratchpad format (mandatory before each tool call): XML with Goal, DeadEnds, Facts, Plan | MUST | §8 | SA4E-421 | token-eviction.integration.test.ts |
| FR-EV-02 | Eviction priority: `S_evict = Age_in_Turns × 200 + Token_Count – Is_Referenced_In_Last_Thought × 1000` | MUST | §8 | SA4E-421 | token-eviction.integration.test.ts |
| FR-EV-03 | In-use/exempt items score = -Infinity; tombstone preserves `tool_call_id` with content `[evicted tool_call_id=<id>]` | MUST | §8 | SA4E-421 | token-eviction.integration.test.ts |
| FR-EV-04 | Batch evict at ~75% budget; no pressure → no eviction | MUST | §8 | SA4E-421 | token-eviction.integration.test.ts |

---

### 2.8 Runtime Token Budget (Real Tokenizer) — Phase 2

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-TOK-01 | Runtime tokenizer: injectable `fetchFn` → llama.cpp `/tokenize` endpoint; real count replaces estimate | MUST | §4 | SA4E-422 | acceptance-ac17.test.ts |
| FR-TOK-02 | Budget formula: `available_input_tokens = model_n_ctx - max_output - safety - system_prompt - tool_schemas - history - user_msg - framing - tool_results_must_remain` | MUST | §4 | SA4E-422 | budget-gate tests |
| FR-TOK-03 | Tier resolution: small (8,192) / medium (32,768) / large (128,000) from real `n_ctx`; staticTokens ≤ staticBudget | MUST | §4 | SA4E-422 | budget-gate-decisions/test.ts |
| FR-TOK-04 | Escalation order: compress → drop-steering → min-loadout; flags `shouldCompress`/`minLoadout` true; steeringBudget halved | MUST | §4 | SA4E-422, 428 | budget-gate-escalation.test.ts |

---

### 2.9 SSE Durable Event Log & Replay — Phase 3

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-SSE-01 | SSE transport over durable event log (`agent_event` table); each event has monotonically increasing `event_id` | MUST | §15 | SA4E-425 | sse-stream tests |
| FR-SSE-02 | Replay via `Last-Event-ID` header: returns combined sequence with 0 duplicates, 0 gaps | MUST | §15 | SA4E-425 | AC-16 |
| FR-SSE-03 | Gap detection: `SseGapError` thrown if client requests replay from non-existent ID | MUST | §15 | SA4E-425 | sse-stream tests |
| FR-SSE-04 | Retention: configurable; reconnect + replay stress tested | MUST | §15 | SA4E-425 | sse-stream tests |

---

### 2.10 API Pinned index_snapshot_id Enforcement — Phase 3

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-API-01 | All chat/search API endpoints MUST receive both `session_id` and `index_snapshot_id` | MUST | §17 | SA4E-426 | pinned-snapshot-guard tests |
| FR-API-02 | Reject with 400 if `index_snapshot_id` missing, mismatched with session pin, or not READY | MUST | §17 | SA4E-426 | AC-17 (backend) |

---

### 2.11 Acceptance Criteria Test Suite — Phase 4

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-AC-01 | 17 AC tests covering all §19 criteria + SA4E integration checks | MUST | §19 | SA4E-427 | ACCEPTANCE-MATRIX.md |
| FR-AC-02 | Backend: 3 files, 16 tests (`acceptance-ac01-08`, `ac09-12`, `ac13-16`); Extension: 1 file, 1 test (AC-17) | MUST | §19 | SA4E-427 | `npm run test:ac` |
| FR-AC-03 | Shared fixture: 2 repos, 5 commits (merge + delete), 8 snapshots (6 READY, 2 PENDING), 2 embedding models on 1 snapshot | MUST | §19 | SA4E-427 | ac-fixtures.ts |
| FR-AC-04 | Gate command: `npm run test:ac` (root = backend && extension); CI threshold < 10s | MUST | §19 | SA4E-427 | PERF-BASELINES.md |

---

### 2.12 Token/Eviction Integration Tests — Phase 4

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-INT-01 | Backend integration: scratchpad → `referencedEvidenceIds` → `batchEvict` (parse canonical, exempt refs, verify score/tombstone/target/no-overflow) | MUST | §4, 8 | SA4E-428 | token-eviction.integration.test.ts |
| FR-INT-02 | Extension integration: `resolveContextBudget` + `tryRuntimeTokenCount` + `runSessionBudgetGate` + `scopedSteering` + `RoleScopeFilter` + `buildSessionToolLoadout` composed per scenario | MUST | §4, 8 | SA4E-428 | token-eviction.integration.test.ts |
| FR-INT-03 | Scenarios: real tokenizer tiers (exact count 700), eviction algorithm exact, scratchpad interaction, budget gate escalation order, actionable error, role-scope reduction (5→1 skills), tool schema cap (explicit 1000 trim) | MUST | §4, 8 | SA4E-428 | SA4E-428 STATUS.json |
| FR-INT-04 | Gate: `npm run test:token` (root = backend && extension) | MUST | §4, 8 | SA4E-428 | STATUS.json |

---

### 2.13 SA4E Regression Test Suite — Phase 4

| ID | Requirement | Priority | 16K Doc | Child Story | Test |
|----|-------------|----------|---------|-------------|------|
| FR-REG-01 | Backend regression: migration V6 additive proof (legacy files/symbols/FTS5/triggers/relationships intact, FK pragma=1, host-file export on disconnect); F4 AIContextService assembly on V6 DB; legacy symbol vs snapshot retrieval isolation | MUST | §19 tail | SA4E-429 | sa4e-regression.test.ts (backend) |
| FR-REG-02 | Extension regression: 7-phase canonical order + PhaseRouter transitions + abort HALTED; 9-agent role matrix, prompt existence, SM coordinator guard, no create/forbid overlap, critical cross-agent guards, role-scope 8 roles + fail-open | MUST | §19 tail | SA4E-429 | sa4e-regression.test.ts (extension) |
| FR-REG-03 | Gate `npm run test:regression` composes: SM E2E, F12 connection, SA4E-155 enrichment, context budget, F2 indexer, F4 context, role boundaries — backend 11 files/63 tests, extension 20 files/155 tests | MUST | §19 tail | SA4E-429 | STATUS.json |
| FR-REG-04 | Root `npm run build` exit 0; root `npm test` exit 0 (backend 500 files/3825 passed/19 skipped; extension 443 files/3469 passed/6 skipped) | MUST | §19 tail | SA4E-429 | STATUS.json |

---

## 3. Use Case Scenarios

### 3.1 UC-01: Create New Index Snapshot for a Commit

**Actor**: Indexing Pipeline (system)
**Precondition**: Repository registered, commit exists, config fingerprint known
**Flow**:
1. Pipeline creates `code_index_snapshot` (PENDING)
2. Runs stages A–J with per-language isolation
3. On success: status → READY; artifacts committed under snapshot_id
4. On failure: status → FAILED; diagnostics captured; no partial artifacts
5. Atomic publication: `repository_ref_index_state` updated for relevant refs
**Postcondition**: Snapshot READY, all artifacts snapshot-scoped, composite FK valid

### 3.2 UC-02: Agent Chat Pinned to Old Commit Queries After Branch Moves

**Actor**: Developer (via extension)
**Precondition**: Chat session created with `pinned_code_index_snapshot_id` = S1 (commit c1); branch main moves to c2
**Flow**:
1. Developer sends query via extension
2. Extension includes `session_id` + `index_snapshot_id` (S1)
3. API guard (`pinned-snapshot-guard`) validates: snapshot S1 exists, is READY, belongs to session's repo+commit
4. Retrieval queries ONLY snapshot S1 (no leakage to S2 on c2)
5. Response returns symbols/chunks from S1
**Postcondition**: Query results from pinned snapshot; branch head change invisible to session

### 3.3 UC-03: Staged Patch with Approval Gate

**Actor**: Agent (via extension)
**Precondition**: Chat session active, agent has plan with edit steps
**Flow**:
1. Agent calls `stage(patch)` → validates base hash, paths, size, symlinks; records change_set (OPEN) + approval_request (PENDING); working tree UNCHANGED
2. Human reviewer approves via UI → approval_request.decision = APPROVED
3. Agent calls `applyAfterApproval()` → re-validates base hash (stale-base check); if changed → reject (change_set stays OPEN); if matches → atomic apply via PatchProtocol
4. execution_run records command/exit_code/log
**Postcondition**: Working tree modified ONLY after approval; stale-base rejected; audit trail complete

### 3.4 UC-04: Scratchpad Eviction Under Budget Pressure

**Actor**: Agent runtime (extension)
**Precondition**: Session budget gate active, tokenizer returning real counts
**Flow**:
1. Agent emits scratchpad before tool call
2. `batchEvict` parses scratchpad, extracts `referencedEvidenceIds` (exempt)
3. Computes `S_evict` for each entry; in-use = -Infinity
4. If tokens > 75% budget: evict highest `S_evict` entries; replace with tombstone
5. Next turn: scratchpad shows tombstones for evicted items; `tool_call_id` preserved
**Postcondition**: Budget respected; referenced evidence never evicted; tombstones maintain continuity

### 3.5 UC-05: SSE Reconnect with Replay

**Actor**: Extension (client)
**Precondition**: SSE connection established, event_ids 1..7 delivered
**Flow**:
1. Network disconnects after event 3
2. Client reconnects with `Last-Event-ID: 3`
3. Server replays events 4..7 from durable `agent_event` log
4. Client receives combined sequence 1..7 with 0 duplicates, 0 gaps
**Postcondition**: No missed events, no duplicates; `SseGapError` if gap detected

---

## 4. Non-Functional Requirements (Summary)

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | AC suite runtime | < 10s (measured 1.6–1.7s backend) |
| Performance | Single AC test | < 2s (max 71ms) |
| Security | Patch validation | Base hash + path traversal + symlink + shell + network |
| Reliability | SSE replay | 0 duplicates, 0 gaps |
| Reliability | Agent resume | Fresh instance from zero in-memory state |
| Compatibility | Build | `npm run build` exit 0 |
| Compatibility | Test | `npm test` exit 0 (all suites) |
| Regression | SA4E integration | SM pipeline, F12, enrichment, budget, F2, F4, role boundaries |

---

## 5. Traceability Matrix (Requirement → Child Story → Test)

| Req Area | Child Story | Key Test Files | AC Covered |
|----------|-------------|----------------|------------|
| Snapshot Model | SA4E-413 | migration-v6.test.ts, migration-v6-pg.ts | AC-01,02,03,04,05,06,07 |
| Pipeline Order | SA4E-414 | index-pipeline.order/isolation.test.ts | AC-10,11 |
| Retrieval | SA4E-415 | snapshot-retrieval tests, acceptance-ac01-08/09-12 | AC-07,08,09 |
| Agent Persistence | SA4E-416, 423 | agent-persistence tests, acceptance-ac09-12 AC-12 | AC-12 |
| Patch/Sandbox | SA4E-417, 424 | staged-patch/sandbox tests, acceptance-ac13-16 | AC-13,14,15 |
| Repo Map | SA4E-418 | repo-map tests | — |
| Chunking | SA4E-419 | chunking/embedding tests | AC-02 |
| Core Tools | SA4E-420 | core-tools tests | — |
| Scratchpad/Eviction | SA4E-421 | token-eviction.integration.test.ts | — |
| Token Budget | SA4E-422 | budget-gate tests, acceptance-ac17.test.ts | AC-17 |
| SSE | SA4E-425 | sse-stream tests, acceptance-ac13-16 AC-16 | AC-16 |
| API Pin | SA4E-426 | pinned-snapshot-guard tests | — |
| AC Suite | SA4E-427 | 3 backend + 1 extension test files | AC-01..17 |
| Token/Eviction Integration | SA4E-428 | 2 integration test files | — |
| Regression | SA4E-429 | 2 regression test files + composed gate | AC-18 |

---

## 6. Appendix

### 6.1 Reference Documents

| Document | Location |
|----------|----------|
| BRD (this epic) | `documents/SA4E-411/BRD.md` |
| Architecture (16K Doc) | `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` |
| ADR-001 | `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md` |
| TDD-01 Data Model | `documents/SA4E-411/TDD-01-data-model.md` |
| TDD (consolidated) | `documents/SA4E-411/TDD.md` |
| AC Matrix | `documents/SA4E-427/ACCEPTANCE-MATRIX.md` |
| Perf Baselines | `documents/SA4E-427/PERF-BASELINES.md` |

### 6.2 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview (4-layer) | `diagrams/architecture-overview.png` | `diagrams/architecture-overview.drawio` |
| 2 | Snapshot/Revision ER Diagram | `diagrams/snapshot-revision-er.png` | `diagrams/snapshot-revision-er.drawio` |
| 3 | Pipeline Ordering (A–J) | `diagrams/pipeline-ordering.png` | `diagrams/pipeline-ordering.drawio` |
| 4 | Agent UX Token Budget | `diagrams/token-budget.png` | `diagrams/token-budget.drawio` |
| 5 | Scratchpad & Eviction | `diagrams/scratchpad-eviction.png` | `diagrams/scratchpad-eviction.drawio` |

*All diagrams stored in `documents/SA4E-411/diagrams/`. Source `.drawio` files are the editable format; `.png` files are rendered exports (re-export from `.drawio` if needed).*

### 6.3 Glossary

| Term | Definition |
|------|------------|
| `code_index_snapshot_id` | Primary filter for all retrieval; identifies an immutable index generation |
| Composite FK | FK referencing `(id, snapshot_id)` pair on parent table |
| `S_evict` | Eviction priority score formula |
| Tombstone | Evicted scratchpad entry preserving `tool_call_id` |
| Staged Patch | Two-phase: `stage()` (validate only) → `applyAfterApproval()` (on APPROVED) |
| `Last-Event-ID` | SSE header for replay from specific event |
| `pinned_code_index_snapshot_id` | Chat session's bound snapshot; API enforces match |