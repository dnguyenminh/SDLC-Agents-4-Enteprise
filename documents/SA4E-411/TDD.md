# Technical Design Document (TDD) — Consolidated

## SA4E-411: [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-411 |
| Title | [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-11-09 |
| Status | Complete — All 18 child stories implemented and In Review |

---

## 1. Introduction

### 1.1 Purpose

This TDD consolidates the technical design across all 18 child stories (SA4E-412..429). It **references** (does not duplicate) the two foundational documents:

- **ADR-001**: `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md` — engine store = SQLite embedded per-workspace; PostgreSQL platform DB unchanged; language MVP = 17 Tier A + 7 Tier B grammars
- **TDD-01 Data Model**: `documents/SA4E-411/TDD-01-data-model.md` — 28→29 table additive V6 migration, snapshot/revision hierarchy, composite FK invariants, dual-dialect

### 1.2 Architecture Positioning

```
┌─────────────────────────────────────────────────────────────────┐
│  AGENT UX LAYER (Phase 2–3)                                     │
│  backend/src/engine/repo-map/, agent-tools/, scratchpad/        │
│  extension/src/pi-agent/, pi-workflow/, budget-gate/            │
├─────────────────────────────────────────────────────────────────┤
│  CODE INTELLIGENCE ENGINE (Phase 1)                             │
│  backend/src/engine/db/migration-v6.ts, index-pipeline/,        │
│  retrieval/, agent/ (persistence), security/ (patch, sandbox)   │
├─────────────────────────────────────────────────────────────────┤
│  SQLITE ENGINE STORE (ADR-001)                                  │
│  .code-intel/index.db per workspace | WAL | immutable file      │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Integration with Existing SA4E

| Existing Capability | Integration Approach | Stories |
|---------------------|---------------------|---------|
| **F2 Indexer** | Reuse SQLite + Tree-sitter + FTS5 + graph + incremental + WAL | 413, 414, 418, 419 |
| **F4 Context Assembly** | Keep `get_ai_context`/edit/curated; add `query_call_graph` only | 415, 420, 429 |
| **Context Budget Governance** | Wire `BudgetCalculator`/`ThresholdGate`/tiering; **don't rewrite** | 422, 428 |
| **Steering/AGENTS.md** | Subject to budget gate (`DefaultResourceLoader`) | 428, 429 |

---

## 2. Implemented Modules — Story → Path → Purpose

| Story | Module Path | Purpose |
|-------|-------------|---------|
| **SA4E-412** | (ADR doc only) | Scope decision: SQLite engine store, language MVP |
| **SA4E-413** | `backend/src/engine/db/migration-v6.ts` + `migration-v6-pg.ts` + `migrations.ts` + `__tests__/migration-v6.test.ts` | V6 additive migration (28 new tables), composite FK triggers, dual-dialect |
| **SA4E-414** | `backend/src/engine/pipeline/index-pipeline.ts` + `pipeline-types.ts` + `__tests__/index-pipeline.*.test.ts` | 10-stage dependency-before-semantic pipeline, per-language isolation |
| **SA4E-415** | `backend/src/engine/retrieval/snapshot-retrieval.ts` + `__tests__/` | Snapshot-scoped hybrid retrieval (lexical/vector/graph/exact) |
| **SA4E-416** | `backend/src/engine/agent/agent-persistence.ts` + `AgentEventLog` | Plan/step/approval/transition/tool-execution/retrieval-evidence persistence |
| **SA4E-417** | `backend/src/engine/security/patch-protocol.ts` + `staged-patch.ts` + `sandbox.ts` | Staged patch (stage → approve → apply), sandbox validation |
| **SA4E-418** | `backend/src/engine/repo-map/repo-map.ts` + `page-rank.ts` + `packer.ts` | PageRank repo map, query personalization, binary-search token packing |
| **SA4E-419** | `backend/src/engine/chunking/ast-chunker.ts` + `embedding-pipeline.ts` | AST skeleton/body chunking, embedding set (model-swap without reparse) |
| **SA4E-420** | `backend/src/engine/agent-tools/core-tools.ts` + `tool-context.ts` + `__tests__/` | 4 core tools (search_symbols, get_file_skeleton, read_code_block, query_call_graph) with session pinning |
| **SA4E-421** | `backend/src/engine/scratchpad/scratchpad.ts` + `eviction.ts` + `__tests__/token-eviction.integration.test.ts` | Canonical scratchpad format + S_evict algorithm + tombstones |
| **SA4E-422** | `backend/src/engine/token-budget/runtime-tokenizer.ts` + `budget-gate.ts` + `extension/src/pi-agent/budget-gate*.ts` | Real tokenizer (llama.cpp `/tokenize`), runtime budget formula, tier resolution |
| **SA4E-423** | `backend/src/engine/agent/agent-state-recovery.ts` + `__tests__/` | `summarizeForResume()` from zero in-memory state |
| **SA4E-424** | `backend/src/engine/security/staged-patch.ts` + `sandbox.ts` + `__tests__/` | Staged patch with stale-base revalidation, sandbox policy |
| **SA4E-425** | `backend/src/engine/events/sse-stream.ts` + `agent-event.ts` + `__tests__/` | SSE durable log, `Last-Event-ID` replay, gap detection |
| **SA4E-426** | `backend/src/engine/api/pinned-snapshot-guard.ts` + `__tests__/` | API guard requiring `session_id` + `index_snapshot_id` |
| **SA4E-427** | `backend/src/engine/acceptance/__tests__/` (3 files) + `extension/src/pi-agent/__tests__/acceptance-ac17.test.ts` | 17 AC acceptance suite + shared fixture |
| **SA4E-428** | `backend/src/engine/scratchpad/__tests__/token-eviction.integration.test.ts` + `extension/src/pi-agent/__tests__/token-eviction.integration.test.ts` | Token/eviction integration: tiers, escalation, role-scope, tool cap |
| **SA4E-429** | `backend/src/engine/regression/__tests__/sa4e-regression.test.ts` + `extension/src/__tests__/sa4e-regression.test.ts` | SA4E regression gate (SM, F12, enrichment, budget, F2, F4, role boundaries) |

---

## 3. Data Model Summary (from TDD-01)

**V6 Migration** (additive-only, 28→29 tables):

| Category | Tables |
|----------|--------|
| Repository/Commit | `repository`, `git_commit`, `git_commit_parent`, `git_ref` |
| Source Revisions | `source_file_revision` |
| Snapshot & Artifacts | `code_index_snapshot`, `code_module`, `code_symbol`, `symbol_occurrence`, `symbol_occurrence_resolution`, `symbol_relationship`, `relationship_evidence`, `code_chunk`, `code_chunk_fts` (FTS5), `dependency_resolution_snapshot` |
| Embedding | `embedding_set`, `code_embedding` |
| Active Pointer | `repository_ref_index_state` |
| Chat/Agent | `chat_session`, `agent_run`, `agent_plan`, `agent_step`, `agent_state_transition`, `agent_tool_execution`, `retrieval_evidence`, `agent_workspace` |
| Patch Workflow | `change_set`, `approval_request`, `execution_run` |
| SSE Events | `agent_event` (added by SA4E-425) |

**Key Invariants:**
- Composite FK ownership: all artifact tables reference `(id, snapshot_id)` via triggers
- `project_id` on all 16K tables (V5 multi-tenant)
- CHECK: `start_line <= end_line`, offsets ≥ 0, `confidence ∈ [0,1]`, status enums
- `chat_session.pinned_code_index_snapshot_id` must match session's `(repository_id, commit_id)`

---

## 4. Interfaces & Contracts

### 4.1 Core Agent Tools (SA4E-420)

| Tool | Input | Output | Session Pin Required |
|------|-------|--------|---------------------|
| `search_symbols` | `SearchSymbolsArgs { q, kind?, path_filter?, limit? }` | `ToolResult { resultId, summary, snippets[], evidenceIds[], truncated, cursor? }` | YES |
| `get_file_skeleton` | `GetFileSkeletonArgs { file_path }` | `ToolResult` (class/interface structure, signatures) | YES |
| `read_code_block` | `ReadCodeBlockArgs { file_path, start_line, end_line }` | `ToolResult` (max 120 lines) | YES |
| `query_call_graph` | `QueryCallGraphArgs { symbol_id, direction: CALLERS\|CALLEES\|IMPLEMENTATIONS }` | `ToolResult` | YES |

### 4.2 Retrieval Service (SA4E-415)

```typescript
interface SnapshotRetrievalService {
  pinOrThrow(snapshotId: string, repositoryId: string): Promise<SnapshotInfo>;
  symbolByName(snapshotId: string, name: string): Promise<SymbolHit[]>;
  lexicalSearch(snapshotId: string, query: string, limit: number): Promise<LexicalHit[]>;
  vectorSearch(embeddingSetId: string, queryEmbedding: Buffer, limit: number): Promise<VectorHit[]>;
  graphQuery(snapshotId: string, symbolId: string, direction: Direction): Promise<RelationshipHit[]>;
}
```

### 4.3 Patch Protocol (SA4E-417, 424)

```typescript
interface PatchProtocol {
  stage(patch: StructuredPatch): Promise<{ changeSetId: string; approvalId: string }>;
  applyAfterApproval(changeSetId: string, approvalId: string): Promise<ExecutionRun>;
}
```

### 4.4 SSE Stream (SA4E-425)

```typescript
interface SSEStream {
  append(event: AgentEvent): Promise<number>; // returns event_id
  replay(lastEventId: number): AsyncIterable<AgentEvent>;
  // throws SseGapError if gap detected
}
```

### 4.5 API Guard (SA4E-426)

```typescript
function resolvePinnedContext(
  sessionId: string,
  indexSnapshotId: string
): Promise<{ snapshot: SnapshotInfo; repositoryId: string }>;
// Throws 400 if missing, mismatched, or not READY
```

### 4.6 Runtime Tokenizer (SA4E-422)

```typescript
interface RuntimeTokenizer {
  countTokens(text: string): Promise<number>; // llama.cpp /tokenize
}
```

---

## 5. Security Boundaries

| Boundary | Enforcement | Story |
|----------|-------------|-------|
| Tool args schema | Zod validation; reject shell metachars, absolute paths, `..`, NUL | SA4E-424 |
| Patch base hash | Validated at `stage()` AND re-validated at `applyAfterApproval()` (stale-base) | SA4E-424 |
| Patch path | No workspace escape; symlink check; `--` separator | SA4E-424 |
| Network | Deny by default; registry allowlist exact host match | SA4E-424 |
| Container | Rootless, non-root, capability/mount/process/memory/CPU/disk limits | SA4E-424 |
| API snapshot pin | 400 if `session_id` + `index_snapshot_id` missing/mismatched/not READY | SA4E-426 |
| Role boundaries | 9-agent matrix enforced (SM coordinator-only, no create/forbid overlap) | SA4E-429 |

---

## 6. Runtime Profile

| Component | Command / Entry Point | Health Check |
|-----------|----------------------|--------------|
| Backend (indexer + API) | `npm run dev` (backend) → `tsx watch src/index.ts` | `GET /health` |
| Extension (agent host) | VS Code extension host → `pi-workflow` engine | MCP `initialize` |
| SQLite Engine Store | Embedded `better-sqlite3` / `sqlite-wasm` in backend | `PRAGMA journal_mode=WAL` |
| Tokenizer | llama.cpp `/tokenize` endpoint (injected `fetchFn`) | N/A (test-time mock) |

**No hardcoded `npm start` or fixed ports** — resolved from project config at runtime.

---

## 7. Story → Module → Test Traceability

| Story | Key Module(s) | Key Test(s) | AC Covered |
|-------|---------------|-------------|------------|
| SA4E-412 | ADR-001 (doc) | — | — |
| SA4E-413 | migration-v6.ts, migrations.ts | migration-v6.test.ts (8 tests) | AC-01,02,07 |
| SA4E-414 | index-pipeline.ts | index-pipeline.order/isolation.test.ts | AC-10,11 |
| SA4E-415 | snapshot-retrieval.ts | snapshot-retrieval tests + acceptance-ac01-08/09-12 | AC-07,08,09 |
| SA4E-416 | agent-persistence.ts | agent-persistence tests + acceptance-ac09-12 AC-12 | AC-12 |
| SA4E-417 | patch-protocol.ts, staged-patch.ts, sandbox.ts | staged-patch/sandbox tests + acceptance-ac13-16 | AC-13,14,15 |
| SA4E-418 | repo-map.ts, page-rank.ts, packer.ts | repo-map tests | — |
| SA4E-419 | ast-chunker.ts, embedding-pipeline.ts | chunking/embedding tests | AC-02 |
| SA4E-420 | core-tools.ts, tool-context.ts | core-tools tests (7) | — |
| SA4E-421 | scratchpad.ts, eviction.ts | token-eviction.integration.test.ts (13 backend, 9 ext) | — |
| SA4E-422 | runtime-tokenizer.ts, budget-gate.ts | budget-gate tests + acceptance-ac17.test.ts | AC-17 |
| SA4E-423 | agent-state-recovery.ts | agent-state-recovery tests (4) + AC-12 | AC-12 |
| SA4E-424 | staged-patch.ts, sandbox.ts | staged-patch/sandbox tests + AC-13,14,15 | AC-13,14,15 |
| SA4E-425 | sse-stream.ts, agent-event.ts | sse-stream tests (7) + AC-16 | AC-16 |
| SA4E-426 | pinned-snapshot-guard.ts | pinned-snapshot-guard tests (5) | — |
| SA4E-427 | acceptance-ac01-08/09-12/13-16.test.ts + ac17.test.ts | 16 backend + 1 ext tests | AC-01..17 |
| SA4E-428 | token-eviction.integration.test.ts (backend + ext) | 13 + 9 integration tests | — |
| SA4E-429 | sa4e-regression.test.ts (backend 3 + ext 9) + composed gate | 63 backend + 155 ext tests | AC-18 |

---

## 8. Gates & Verification

| Gate | Command | Scope | Threshold |
|------|---------|-------|-----------|
| Build | `npm run build` | root (backend + extension) | exit 0 |
| Unit Test | `npm test` | root | exit 0 (backend 500f/3825p/19s; ext 443f/3469p/6s) |
| AC Suite | `npm run test:ac` | backend (16) + extension (1) | < 10s |
| Token/Eviction | `npm run test:token` | backend (1) + extension (1) | pass |
| Regression | `npm run test:regression` | backend 11f/63t + ext 20f/155t | pass |

---

## 9. Known Deferred Gaps

| Gap | Story | Status |
|-----|-------|--------|
| CoreAgentTools registration into MCP `tools/list` | SA4E-420 | Deferred to e2e |
| tiktoken plug-in for non-llama.cpp providers | SA4E-422 | Deferred |
| AC-09 exact SQLite cosine scan (no ANN) | SA4E-427 | Per ADR-001; HNSW/pgvector path open |

---

## 10. Appendix

### 10.1 Reference Documents

| Document | Location |
|----------|----------|
| ADR-001 | `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md` |
| TDD-01 Data Model | `documents/SA4E-411/TDD-01-data-model.md` |
| BRD (epic) | `documents/SA4E-411/BRD.md` |
| FSD (epic) | `documents/SA4E-411/FSD.md` |
| AC Matrix | `documents/SA4E-427/ACCEPTANCE-MATRIX.md` |
| Perf Baselines | `documents/SA4E-427/PERF-BASELINES.md` |
| Regression Evidence | `documents/SA4E-429/STATUS.json` |

### 10.2 Diagram References

| Diagram | Source |
|---------|--------|
| Architecture Overview (4-layer) | `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` §1 |
| Snapshot/Revision ER | `documents/SA4E-411/TDD-01-data-model.md` §2 |
| Pipeline Ordering (A–J) | `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` §9 |
| Agent UX Token Budget | `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` §4 |
| Scratchpad/Eviction | `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` §8 |

---

**Note:** This TDD consolidates and references — it does not duplicate the full DDL, invariant list, or migration steps from TDD-01. For schema details, see `TDD-01-data-model.md`.