# RUN-LOG.md — SA4E-411 Epic

**Epic:** SA4E-411 [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX  
**Branch:** dnguyenminh/SA4E-411 (19 commits ahead of main)  
**Worktree:** C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-411  
**Last Updated:** 2026-11-09

---

## Phase Summary

| Phase | Goal | Stories | Status |
|-------|------|---------|--------|
| **0** | Scope Decision | SA4E-412 | ✅ done |
| **1** | CR-01..06 Data Model + Ordering + Retrieval + Persistence + Patch | SA4E-413..417 | ✅ in-review |
| **2** | Agent UX: Repo Map, Chunking, Core Tools, Scratchpad/Eviction, Token Budget | SA4E-418..422 | ✅ in-review |
| **3** | Hardening: Recovery, Sandbox, SSE, API Pin | SA4E-423..426 | ✅ in-review |
| **4** | Validation: AC Suite, Token/Eviction Integration, SA4E Regression | SA4E-427..429 | ✅ in-review |

**Total:** 18/18 child stories implemented, all In Review.

---

## Chronological Log

### 2026-11-08 — Phase 0: Scope Decision
- **SA4E-412** — ADR-001: Engine store = SQLite embedded per-workspace; PostgreSQL platform DB unchanged; Language MVP = 17 Tier A + 7 Tier B grammars
- **Commit:** f599de04
- **Agent:** BA + Dev (scope decision with stakeholder)
- **Jira:** Transitioned to Done (41)
- **Evidence:** `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md`

### 2026-11-08 — Phase 1: Data Model (CR-01..06)
- **SA4E-413** — V6 additive migration (28→29 tables), composite FK triggers, dual-dialect SQLite+PG
  - Commit: edb96c66 | Tests: migration-v6.test.ts (8 tests) | Jira: In Review (31)
- **SA4E-414** — 10-stage dependency-before-semantic pipeline (A–J), per-language isolation
  - Commit: 0285134e | Tests: index-pipeline.order/isolation.test.ts | Jira: In Review (31)
- **SA4E-415** — Snapshot-scoped hybrid retrieval (lexical/vector/graph/exact), composite FK ownership
  - Commit: 6733271f | Tests: snapshot-retrieval tests + acceptance-ac01-08/09-12 | Jira: In Review (31)
- **SA4E-416** — Agent persistence: plan/step/approval/transition/tool-execution/retrieval-evidence
  - Commit: 5c11b4f8 | Tests: agent-persistence tests + AC-12 | Jira: In Review (31)
- **SA4E-417** — Staged patch (stage→approve→apply), sandbox validation, base-hash revalidation
  - Commit: b94cb915 | Tests: staged-patch/sandbox tests + AC-13,14,15 | Jira: In Review (31)

### 2026-11-08..09 — Phase 2: Agent UX
- **SA4E-418** — PageRank repo map, query personalization, binary-search token packing (~1,500 tokens)
  - Commit: cc2ecf06 | Tests: repo-map tests | Jira: In Review (31)
- **SA4E-419** — AST skeleton/body chunking, embedding set (model-swap without reparse)
  - Commit: 7b95a52f | Tests: chunking/embedding tests | Jira: In Review (31)
- **SA4E-420** — 4 core tools (search_symbols, get_file_skeleton, read_code_block, query_call_graph) with session pinning
  - Commit: 34b7c8dd | Tests: core-tools tests (7) | Jira: In Review (31)
- **SA4E-421** — Canonical scratchpad format + S_evict algorithm + tombstones
  - Commit: cd7d6dc4 | Tests: token-eviction.integration.test.ts (13 backend + 9 ext) | Jira: In Review (31)
- **SA4E-422** — Runtime tokenizer (llama.cpp /tokenize), budget formula, tier resolution
  - Commit: 2bd396fb | Tests: budget-gate tests + AC-17 | Jira: In Review (31)

### 2026-11-09 — Phase 3: Hardening
- **SA4E-423** — Agent state recovery: summarizeForResume() from zero in-memory state
  - Commit: f5a2aa55 | Tests: agent-state-recovery tests (4) + AC-12 | Jira: In Review (31)
- **SA4E-424** — Staged patch stale-base revalidation, sandbox policy (paths/shell/network/container)
  - Commit: 6514c9fc | Tests: staged-patch/sandbox tests + AC-13,14,15 | Jira: In Review (31)
- **SA4E-425** — SSE durable event log, Last-Event-ID replay, gap detection (SseGapError)
  - Commit: ae5aa60e | Tests: sse-stream tests (7) + AC-16 | Jira: In Review (31)
- **SA4E-426** — API guard: requires session_id + index_snapshot_id; 400 on missing/mismatch
  - Commit: 17a819f3 | Tests: pinned-snapshot-guard tests (5) | Jira: In Review (31)

### 2026-11-09 — Phase 4: Validation
- **SA4E-427** — 17 AC acceptance suite (16 backend + 1 extension), shared fixture (2 repos, 5 commits, 8 snapshots, 2 embedding models)
  - Commit: 4a74a11f | Tests: ACCEPTANCE-MATRIX.md + PERF-BASELINES.md | Jira: In Review (31), comment 12322
  - Gate: `npm run test:ac` (backend 1.6–1.7s, ext ~0.5s)
- **SA4E-428** — Token/eviction integration: real tiers, escalation order, role-scope reduction (5→1), tool schema cap
  - Commit: 7976e7af | Tests: 2 integration test files | Jira: In Review (31), comment 12323
  - Gate: `npm run test:token`
- **SA4E-429** — SA4E regression suite: SM pipeline, F12, enrichment, budget, F2, F4, role boundaries + build/test green
  - Commit: 04f1f077 | Tests: 2 regression files + composed gate (backend 63t + ext 155t) | Jira: In Review (31)
  - Gate: `npm run test:regression`
  - **Critical fix:** EntraConfig root cause — Zod `.default('')` bypassed validation; fixed with `httpsUrl.optional()` + blank→undefined normalization. Entra tests 11/11.

---

## Agent Invocations & Handoffs

| Step | Agent | Action | Output |
|------|-------|--------|--------|
| 1 | BA | Create ADR-001 + TDD-01-data-model | Scope decision documented |
| 2 | Dev | Implement V6 migration + pipeline | 28→29 tables, 10-stage pipeline |
| 3 | Dev | Implement retrieval + persistence | Snapshot-scoped retrieval, agent persistence |
| 4 | Dev | Implement patch protocol + sandbox | Staged patch + sandbox validation |
| 5 | Dev | Implement repo map + chunking + core tools | PageRank, AST chunking, 4 tools |
| 6 | Dev | Implement scratchpad + token budget | S_evict, runtime tokenizer, budget gate |
| 7 | Dev | Implement recovery + SSE + API pin | State recovery, SSE replay, API guard |
| 8 | QA | Create 17 AC suite + integration + regression | All gates passing |
| 9 | SM | Coordinate all phases, verify gates | STATUS.json, Jira transitions |
| 10 | SM | Create epic documentation set | BRD, FSD, TDD, STATUS, RUN-LOG, diagrams |

---

## Jira Transitions

| Ticket | From | To | Transition ID | Comment |
|--------|------|----|---------------|---------|
| SA4E-412 | To Do | Done | 41 | ADR-001 accepted |
| SA4E-413 | To Do | In Review | 31 | V6 migration + tests |
| SA4E-414 | To Do | In Review | 31 | Pipeline ordering + tests |
| SA4E-415 | To Do | In Review | 31 | Snapshot retrieval + tests |
| SA4E-416 | To Do | In Review | 31 | Agent persistence + tests |
| SA4E-417 | To Do | In Review | 31 | Patch protocol + tests |
| SA4E-418 | To Do | In Review | 31 | Repo map + tests |
| SA4E-419 | To Do | In Review | 31 | Chunking + tests |
| SA4E-420 | To Do | In Review | 31 | Core tools + tests |
| SA4E-421 | To Do | In Review | 31 | Scratchpad/eviction + tests |
| SA4E-422 | To Do | In Review | 31 | Token budget + tests |
| SA4E-423 | To Do | In Review | 31 | State recovery + tests |
| SA4E-424 | To Do | In Review | 31 | Sandbox + tests |
| SA4E-425 | To Do | In Review | 31 | SSE + tests |
| SA4E-426 | To Do | In Review | 31 | API pin + tests |
| SA4E-427 | To Do | In Review | 31 | 17 AC suite + comment 12322 |
| SA4E-428 | To Do | In Review | 31 | Token/eviction integration + comment 12323 |
| SA4E-429 | To Do | In Review | 31 | Regression suite + comment 12324 |

---

## Build & Test Evidence (Final)

```
$ npm run build
> exit 0

$ npm test
> backend: 500 test files | 3,825 passed | 19 skipped
> extension: 443 test files | 3,469 passed | 6 skipped
> exit 0

$ npm run test:ac
> backend: 16 tests (1.6–1.7s)
> extension: 1 test (~0.5s)

$ npm run test:token
> backend: 13 integration tests
> extension: 9 integration tests

$ npm run test:regression
> backend: 11 files / 63 tests (2 skipped)
> extension: 20 files / 155 tests
```

---

## Memory Ingestion

| Entry ID | Type | Source | Tags |
|----------|------|--------|------|
| 620929 | LESSON_LEARNED | SA4E-427 | sa4e-411,acceptance,ac-matrix,proven-pattern |
| 620930 | LESSON_LEARNED | SA4E-428 | sa4e-411,integration,token-eviction,proven-pattern |
| 620931 | LESSON_LEARNED | SA4E-429 | sa4e-411,regression,test-gate,zod,root-cause,proven-pattern |

---

## Epic Documentation Created (2026-11-09)

| Document | Location | Status |
|----------|----------|--------|
| BRD.md | `documents/SA4E-411/BRD.md` | ✅ Complete |
| FSD.md | `documents/SA4E-411/FSD.md` | ✅ Complete |
| TDD.md | `documents/SA4E-411/TDD.md` | ✅ Complete (references TDD-01 + ADR-001) |
| STATUS.json | `documents/SA4E-411/STATUS.json` | ✅ Complete |
| RUN-LOG.md | `documents/SA4E-411/RUN-LOG.md` | ✅ Complete |
| Architecture Overview | `documents/SA4E-411/diagrams/architecture-overview.drawio` | ✅ Source created |
| Snapshot/Revision ER | `documents/SA4E-411/diagrams/snapshot-revision-er.drawio` | ✅ Source created |
| Pipeline Ordering | `documents/SA4E-411/diagrams/pipeline-ordering.drawio` | ✅ Source created |
| Token Budget | `documents/SA4E-411/diagrams/token-budget.drawio` | ✅ Source created |
| Scratchpad/Eviction | `documents/SA4E-411/diagrams/scratchpad-eviction.drawio` | ✅ Source created |

---

## Known Deferred Gaps (Unchanged)

1. **CoreAgentTools MCP tools/list registration** (SA4E-420) — deferred to e2e
2. **tiktoken plug-in for non-llama.cpp providers** (SA4E-422) — deferred
3. **AC-09 exact SQLite cosine scan (no ANN)** (SA4E-427) — per ADR-001; HNSW/pgvector path open

---

## Root Cause Fix: EntraConfig Zod `.default('')` Bypass

**Problem:** Optional fields `authority/issuer/jwksUri` declared as `z.string().url().default('')`. When env vars absent, Zod returned unvalidated empty string `''` (defaults bypass inner validation). `applyDerivedDefaults` used `??` which never fired on `''`. Meanwhile `http://...` passed because `httpsUrl` (https-only) wasn't applied.

**Fix:** Schema → `httpsUrl.optional()`; env parser → blank optional vars normalized to `undefined` (ENTRA_SCOPES stays strict). Entra tests 11/11 pass.

**Memory:** Entry 620931 (LESSON_LEARNED, PROJECT scope, tags: sa4e-411,regression,test-gate,zod,root-cause,proven-pattern)

---

## Final Commit

```
04f1f077 test(SA4E-429): SA4E regression suite - 7-phase SM, F12, enrichment, budget, F2/F4, role boundaries + build/test green
```

**Branch:** `dnguyenminh/SA4E-411` — 19 commits ahead of `main`, no upstream configured.  
**Uncommitted (other session):** `documents/SA4E-190/BRD.md`, `documents/SA4E-190/STATUS.json` — NOT TOUCHED.