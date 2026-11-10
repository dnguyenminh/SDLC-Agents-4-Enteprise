# Business Requirements Document (BRD)

## SA4E-411: [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-411 |
| Title | [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-11-09 |
| Status | Complete — All 18 child stories implemented and In Review |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create epic BRD from Jira epic + 16K architecture doc + 18 child story evidence |
| Peer Reviewer | TA Agent – Technical Architect | Review for completeness and traceability |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-09 | BA Agent | Epic BRD consolidated from Jira SA4E-411, `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md`, and all 18 child story STATUS.json files |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This BRD documents the **Code Agent 16K** epic — a deterministic Code Intelligence engine + LLM agent UX layer built on top of existing SA4E F2 (Code Intelligence) and F4 (Context Assembly) capabilities, with new agent experience features (token budget, scratchpad/eviction, repo map, core tools, patch protocol, SSE, pinned-snapshot API).

The scope covers **four implementation phases** (0–4) decomposed into **18 child stories (SA4E-412..429)**:

| Phase | Goal | Child Stories |
|-------|------|---------------|
| **0** | Scope Decision: SQLite vs PostgreSQL, Language MVP | SA4E-412 |
| **1** | CR-01..06: Snapshot/Revision Data Model + Ordering + Retrieval + Persistence + Patch Hardening | SA4E-413, 414, 415, 416, 417 |
| **2** | Agent UX: PageRank Repo Map, AST Skeleton/Body, 4 Core Tools, Scratchpad/Eviction, Runtime Token Budget | SA4E-418, 419, 420, 421, 422 |
| **3** | Hardening: Agent State Recovery, Security Sandbox, SSE Durable Log, Pinned-Snapshot API | SA4E-423, 424, 425, 426 |
| **4** | Validation: 17 AC Acceptance Suite, Token/Eviction Integration, SA4E Regression | SA4E-427, 428, 429 |

**Out of Scope (per ADR-001 and arch doc):**
- Multi-repo centralized PostgreSQL engine (trigger: multi-team, cross-repo search, concurrent writers)
- New language grammar development (MVP reuses existing 17 Tier A + 7 Tier B grammars)
- Coding-agent autonomous mode (read-only Code Intelligence first; patch/approval gated)
- pgvector/HNSW ANN (exact cosine scan on SQLite per ADR-001)

### 1.2 Business Context

The SA4E platform already provides:
- **F2 Code Intelligence**: SQLite + Tree-sitter + FTS5 + graph + incremental indexing (WAL)
- **F4 Context Assembly**: `get_ai_context`/edit/curated with token budget governance
- **Context Budget Governance**: `BudgetCalculator`/`ThresholdGate`/tiering/steering

**Problem:** Current F2/F4 are read-only, snapshot-unaware, and lack agent-grade UX (real token counting, deterministic eviction, structured patch, session pinning, resume after restart).

**Solution:** Build a **deterministic Code Intelligence engine first** (immutable snapshots, hybrid retrieval, provenance), then layer an **agent UX** that is security-first, budget-aware, and traceable.

### 1.3 Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Product Owner | PG Owner (Stakeholder) | Scope decisions (SQLite vs PG, language MVP) — decided in SA4E-412 |
| Architecture | SA Agent | TDD-01 data model, ADR-001, integration design |
| Development | Dev Agent | Implementation of all 18 stories |
| Quality | QA Agent | SA4E-427 AC suite (17 criteria), SA4E-428 integration, SA4E-429 regression |
| DevOps | DevOps Agent | CI/CD gates (`test:ac`, `test:token`, `test:regression`), Docker volume protection |
| Security | Security Agent | Sandbox/patch validation review (SA4E-424, 426) |

---

## 2. Business Requirements

### 2.1 High-Level Process Map

The Code Agent 16K operates in two layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT UX LAYER (Phase 2–3)                       │
│  Repo Map (PageRank) → 4 Core Tools → Scratchpad/Eviction           │
│  Runtime Token Budget (real tokenizer) → SSE Durable Log            │
│  Agent State Recovery → Staged Patch → Pinned-Snapshot API          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ pins ↓ queries
┌─────────────────────────────────────────────────────────────────────┐
│              CODE INTELLIGENCE ENGINE (Phase 1)                     │
│  Snapshot/Revision Model → Dependency-Before-Semantic Ordering      │
│  Snapshot-Scoped Retrieval → Agent Persistence (plan/step/approval) │
│  Immutable Snapshots + Composite FK + Composite-FK Triggers         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ storage
┌─────────────────────────────────────────────────────────────────────┐
│                    SQLITE ENGINE STORE (ADR-001)                    │
│  .code-intel/index.db per workspace | WAL | Immutable file boundary │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Epic-Level User Stories / Use Cases

| # | Epic Story / Use Case | Priority | Source | Child Story |
|---|------------------------|----------|--------|-------------|
| ES-01 | As a stakeholder, I need a clear scope decision: SQLite embedded (per-workspace) for engine store; PostgreSQL unchanged for platform DB | MUST HAVE | SA4E-412 | SA4E-412 |
| ES-02 | As a developer, I want 28→29 table additive migration (V6) that creates snapshot/revision entities without touching legacy F2 tables | MUST HAVE | 16K Doc §10 | SA4E-413 |
| ES-03 | As a code indexer, I want dependency-before-semantic pipeline ordering so semantic indexing runs on a prepared environment | MUST HAVE | 16K Doc §9 | SA4E-414 |
| ES-04 | As a retrieval client, I want every query to require `index_snapshot_id` so results are provably from one immutable snapshot | MUST HAVE | 16K Doc §11 | SA4E-415 |
| ES-05 | As an agent runtime, I want plan/step/approval/transition persistence so I can resume after restart | MUST HAVE | 16K Doc §15 | SA4E-416, 423 |
| ES-06 | As an agent, I want a staged patch workflow: stage (validate) → approve → apply, with stale-base revalidation at apply | MUST HAVE | 16K Doc §12 | SA4E-417, 424 |
| ES-07 | As an agent, I want a dynamic repository map (PageRank + AST graph) packed into ~1,500 tokens | MUST HAVE | 16K Doc §6 | SA4E-418 |
| ES-08 | As an agent, I want AST skeleton/body chunking: skeleton for embed, body on demand | MUST HAVE | 16K Doc §5 | SA4E-419 |
| ES-09 | As an agent, I want 4 core tools (search_symbols, get_file_skeleton, read_code_block, query_call_graph) with session pinning | MUST HAVE | 16K Doc §7 | SA4E-420 |
| ES-10 | As an agent, I want a structured scratchpad + eviction algorithm (S_evict = Age×200 + Tokens – Referenced×1000) with tombstones | MUST HAVE | 16K Doc §8 | SA4E-421 |
| ES-11 | As an agent, I want a runtime token calculator using the real model tokenizer (not estimates) | MUST HAVE | 16K Doc §4 | SA4E-422 |
| ES-12 | As an agent, I want SSE durable event log with `Last-Event-ID` replay, no duplicates/no gaps | MUST HAVE | 16K Doc §15 | SA4E-425 |
| ES-13 | As an API consumer, I want the server to reject any request missing both `session_id` and `index_snapshot_id` | MUST HAVE | 16K Doc §17 | SA4E-426 |
| ES-14 | As a QA engineer, I want 17 mandatory acceptance criteria tests covering all §19 items | MUST HAVE | 16K Doc §19 | SA4E-427 |
| ES-15 | As a QA engineer, I want token/eviction integration tests measuring real tiers, escalation order, role-scope reduction, tool schema cap | MUST HAVE | 16K Doc §4,8 | SA4E-428 |
| ES-16 | As a SM, I want a regression gate ensuring no SA4E functionality broke (SM pipeline, F12, enrichment, context budget, F2, F4, role boundaries) | MUST HAVE | 16K Doc §19 tail | SA4E-429 |

---

## 3. Acceptance Criteria (Epic-Level)

All 17 mandatory ACs from 16K Doc §19 + the SA4E regression/build-test AC:

| AC | Criterion (from 16K Doc §19) | Validated By |
|----|------------------------------|--------------|
| **AC-01** | Re-index same commit with new adapter doesn't corrupt old snapshot | SA4E-427 `acceptance-ac01-08.test.ts` AC-01 |
| **AC-02** | Support 2 embedding models for same snapshot without mixing vectors | SA4E-427 AC-02 |
| **AC-03** | Chat pinned to old commit still queries after branch moves | SA4E-427 AC-03 |
| **AC-04** | Rename file: both old & new paths correct at respective commits | SA4E-427 AC-04 |
| **AC-05** | Delete file: queryable at old commit, not at new | SA4E-427 AC-05 |
| **AC-06** | Index merge commit with multiple parents | SA4E-427 AC-06 |
| **AC-07** | Every symbol/occurrence/edge/chunk/embedding belongs to required snapshot (DB-enforced) | SA4E-427 AC-07 |
| **AC-08** | Vector query never returns chunk from different repo/snapshot | SA4E-427 AC-08 |
| **AC-09** | Filtered ANN recall + result-count on multi-snapshot dataset | SA4E-427 AC-09 (exact cosine on SQLite per ADR-001) |
| **AC-10** | Semantic re-run after dependency/classpath change (source unchanged) | SA4E-427 AC-10 |
| **AC-11** | Dependency failure doesn't cascade to fake semantic coverage | SA4E-427 AC-11 |
| **AC-12** | Resume agent after restart from plan/step persist | SA4E-427 AC-12 |
| **AC-13** | Patch rejects stale base hash or path traversal | SA4E-427 AC-13 |
| **AC-14** | Original working tree unchanged before approval | SA4E-427 AC-14 |
| **AC-15** | Sandbox: no workspace escape, no unrestricted network | SA4E-427 AC-15 |
| **AC-16** | SSE reconnect + replay → no duplicate/missing events | SA4E-427 AC-16 |
| **AC-17** | Real tokenizer prompt/tool counting under runtime budget | SA4E-427 AC-17 (extension) |
| **AC-18** | **SA4E Regression**: `npm run build` + `npm test` green; no SM/F12/enrichment/budget/F2/F4/role-boundary regression | SA4E-429 |

---

## 4. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| ADR-001 | Architecture Decision | Engine store = SQLite embedded per-workspace; PostgreSQL platform DB unchanged |
| `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` | Architecture | 298-line authoritative spec (Phases 0–4, 17 ACs, integration points) |
| F2 Code Intelligence | Existing Capability | SQLite + Tree-sitter + FTS5 + graph + incremental hashing + WAL (reuse, not rewrite) |
| F4 Context Assembly | Existing Capability | `get_ai_context`/edit/curated + budget governance (wire, don't rewrite) |
| Context Budget Governance | Existing Capability | `BudgetCalculator`/`ThresholdGate`/tiering/steering (wire `DefaultResourceLoader`) |
| SA4E-335 Docker Volume Protection | Guardrail | No `docker compose down -v` on prod stack; test stack separate |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Multi-repo scaling trigger not met but code assumes it | Medium | Low | ADR-001 documents explicit trigger conditions (3 conditions) |
| ANNs needed but SQLite exact scan too slow | Medium | Low | ADR-001 accepts exact scan for MVP; HNSW/pgvector path kept open |
| Agent tools not registered in MCP `tools/list` (deferred) | Low | Medium | SA4E-420 AC notes deferred to e2e; tracked in STATUS.json |
| tiktoken plug-in for non-llama.cpp providers | Low | Medium | Deferred; current impl uses llama.cpp `/tokenize` contract |
| AC-09 exact SQLite cosine vs future ANN | Low | Low | Filter-first contract preserved; test remains recall oracle |

### 5.2 Assumptions

- SQLite WAL + embedded library provides durability + local-first + offline capability
- 17 Tier A languages already have Tree-sitter grammars working in F2
- Existing F2 indexer tests (3,500+) serve as regression baseline
- All 18 child stories independently verify via their STATUS.json evidence
- Build/test gates (`npm run build`, `npm test`, `test:ac`, `test:token`, `test:regression`) are the ultimate verification

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | AC suite < 10s | Measured 1.6–1.7s backend + ~0.5s extension |
| Performance | Single AC test < 2s | Max measured 71ms (AC-01 pipeline) |
| Security | Tool args have schema; no shell concat | SA4E-424 sandbox + patch validation |
| Security | Patch validates base hash + path traversal | SA4E-424/427 AC-13/14 |
| Reliability | SSE replay no duplicates/no gaps | SA4E-425/427 AC-16 verified with disconnect/replay |
| Reliability | Agent resume from zero in-memory state | SA4E-423/427 AC-12 verified |
| Compatibility | `tsc --noEmit` clean; vitest green | All 18 stories verify |
| Usability | Session pinning mandatory; no implicit branch-head shift | SA4E-426 API enforcement |

---

## 7. Related Tickets (Child Stories)

| Ticket | Title | Phase | Status | Commit |
|--------|-------|-------|--------|--------|
| SA4E-412 | [Phase 0] Scope Decision: SQLite vs PostgreSQL, Language MVP | 0 | done | f599de04 |
| SA4E-413 | [Phase 1] CR-01..06: Snapshot/Revision Data Model Redesign | 1 | in-review | edb96c66 |
| SA4E-414 | [Phase 1] CR-01..06: Dependency-Before-Semantic Indexing Order | 1 | in-review | 0285134e |
| SA4E-415 | [Phase 1] CR-01..06: Snapshot-Scoped Retrieval Implementation | 1 | in-review | 6733271f |
| SA4E-416 | [Phase 1] CR-01..06: Agent Plan/Step/Approval Persistence | 1 | in-review | 5c11b4f8 |
| SA4E-417 | [Phase 1] CR-01..06: Patch Protocol & Isolation Hardening | 1 | in-review | b94cb915 |
| SA4E-418 | [Phase 2] Dynamic Repository Map (PageRank + AST Graph) | 2 | in-review | cc2ecf06 |
| SA4E-419 | [Phase 2] AST Skeleton/Body Chunking & Embedding Strategy | 2 | in-review | 7b95a52f |
| SA4E-420 | [Phase 2] 4 Core Agent Tools | 2 | in-review | 34b7c8dd |
| SA4E-421 | [Phase 2] Scratchpad Format & Context Eviction Algorithm | 2 | in-review | cd7d6dc4 |
| SA4E-422 | [Phase 2] Token Budget Runtime Calculator (Real Tokenizer) | 2 | in-review | 2bd396fb |
| SA4E-423 | [Phase 3] Agent State Persistence Hardening | 3 | in-review | f5a2aa55 |
| SA4E-424 | [Phase 3] Security Sandbox & Patch Validation | 3 | in-review | 6514c9fc |
| SA4E-425 | [Phase 3] SSE Durable Event Log & Replay | 3 | in-review | ae5aa60e |
| SA4E-426 | [Phase 3] API Pinned index_snapshot_id Enforcement | 3 | in-review | 17a819f3 |
| SA4E-427 | [Phase 4] 17 Acceptance Criteria Test Suite | 4 | in-review | 4a74a11f |
| SA4E-428 | [Phase 4] Token/Eviction Integration Tests | 4 | in-review | 7976e7af |
| SA4E-429 | [Phase 4] SA4E Regression Test Suite | 4 | in-review | 04f1f077 |

---

## 8. Appendix

### 8.1 Reference Documents

| Document | Location |
|----------|----------|
| 16K Code Agent Architecture (authoritative) | `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` |
| ADR-001 Engine Storage & Language MVP | `documents/SA4E-411/ADR-001-engine-storage-and-language-mvp.md` |
| TDD-01 Data Model (Snapshot/Revision) | `documents/SA4E-411/TDD-01-data-model.md` |
| SA4E-427 Acceptance Matrix | `documents/SA4E-427/ACCEPTANCE-MATRIX.md` |
| SA4E-427 Performance Baselines | `documents/SA4E-427/PERF-BASELINES.md` |
| SA4E-429 Regression Evidence | `documents/SA4E-429/STATUS.json` |

### 8.2 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow (Phase 0–4 Stakeholder Swimlanes) | `business-flow.png` | `business-flow.drawio` |
| 2 | Use Case (16 Epic Stories + External Systems) | `use-case.png` | `use-case.drawio` |
| 3 | Architecture Overview (4-layer) | `architecture-overview.png` | `architecture-overview.drawio` |
| 4 | Snapshot/Revision ER Diagram | `snapshot-revision-er.png` | `snapshot-revision-er.drawio` |
| 5 | Pipeline Ordering (A–J) | `pipeline-ordering.png` | `pipeline-ordering.drawio` |
| 6 | Agent UX Token Budget | `token-budget.png` | `token-budget.drawio` |
| 7 | Scratchpad & Eviction | `scratchpad-eviction.png` | `scratchpad-eviction.drawio` |

*All diagrams stored in `documents/SA4E-411/diagrams/`. Source `.drawio` files are the editable format; `.png` files are rendered exports (re-export from `.drawio` if needed).*

### 8.3 Glossary

| Term | Definition |
|------|------------|
| Immutable Snapshot | An index generation that is never mutated; identified by `code_index_snapshot.id` |
| Composite FK | Foreign key referencing `(id, snapshot_id)` pair to enforce same-snapshot ownership |
| PageRank Repo Map | Dynamic relevance graph over AST symbols, personalized by query, packed to token budget |
| Scratchpad | Structured agent working memory (Goal, DeadEnds, Facts, Plan) emitted before each tool call |
| Tombstone | Evicted scratchpad entry preserving `tool_call_id` with content = `[evicted tool_call_id=<id>]` |
| S_evict | Eviction priority score = Age_in_Turns × 200 + Token_Count – Is_Referenced × 1000 |
| Runtime Token Budget | Token limit computed from actual model `n_ctx` + tokenizer count, not fixed table |
| Staged Patch | Two-phase workflow: `stage()` validates without applying; `applyAfterApproval()` only on APPROVED |
| Pinned Snapshot | Chat session binds to `pinned_code_index_snapshot_id`; API rejects mismatched requests |