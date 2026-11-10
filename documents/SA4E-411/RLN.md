# Release Notes (RLN)

## SA4E — SA4E-411: [EPIC] Code Agent 16K — Deterministic Code Intelligence + Agent UX

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | v1.0.0 |
| Release Date | 2026-11-10 |
| Jira Ticket | SA4E-411 |
| Environment | DEV → SIT → UAT → PROD |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-10 | DevOps Agent | Initiate document — consolidated from 18 child story commits, AC validation, and performance baselines |

---

## 1. What's New

### 1.1 Feature Summary

This release delivers the **Code Agent 16K** — a deterministic Code Intelligence engine and LLM Agent UX layer built on top of existing SA4E F2 (Code Intelligence) and F4 (Context Assembly) capabilities. The implementation spans **four phases** decomposed into **18 child stories (SA4E-412..429)**:

- **Phase 0**: Scope Decision — SQLite embedded per-workspace engine store; PostgreSQL platform DB unchanged; 17 Tier A + 7 Tier B language grammars
- **Phase 1**: CR-01..06 — V6 additive migration (28→29 tables), 10-stage dependency-before-semantic pipeline, snapshot-scoped retrieval, agent persistence, staged patch protocol
- **Phase 2**: Agent UX — PageRank Repository Map, AST skeleton/body chunking, 4 core tools with session pinning, structured scratchpad with S_evict eviction, runtime token budget with real llama.cpp tokenizer
- **Phase 3**: Hardening — Agent state recovery (summarizeForResume), security sandbox (Zod validation, path traversal, network deny-by-default, rootless containers), SSE durable log with Last-Event-ID replay, API pinned-snapshot enforcement
- **Phase 4**: Validation — 17 AC acceptance suite, token/eviction integration tests, SA4E regression gate (SM pipeline, F12, enrichment, context budget, F2, F4, role boundaries)

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Immutable Snapshot-Based Code Intelligence | All code queries now operate against pinned, immutable snapshots — no drift when branch heads move | High |
| 2 | 4 Core Agent Tools | `search_symbols`, `get_file_skeleton`, `read_code_block`, `query_call_graph` with mandatory session pinning | High |
| 3 | Dynamic Repository Map | PageRank-powered relevance graph packed into ~1,500 tokens per query | High |
| 4 | AST Skeleton/Body Chunking | Skeleton embedded for search; body retrieved on-demand — model swap without reparse | Medium |
| 5 | Structured Scratchpad + Eviction | Canonical XML format (Goal, DeadEnds, Facts, Plan) + S_evict algorithm with tombstones | High |
| 6 | Runtime Token Budget | Real llama.cpp tokenizer replaces estimates; tier escalation (SYSTEM→CRITICAL→HIGH→MEDIUM→LOW) | High |
| 7 | Staged Patch Protocol | Stage (validate) → Approve → Apply with stale-base revalidation; working tree unchanged pre-approval | High |
| 8 | SSE Durable Event Log | Last-Event-ID replay with zero duplicates/gaps; gap detection throws SseGapError | Medium |
| 9 | API Pinned Snapshot Enforcement | All chat/search endpoints require session_id + index_snapshot_id; 400 on mismatch | High |
| 10 | Agent State Recovery | `summarizeForResume()` reconstructs full context from zero in-memory state after restart | High |
| 11 | Security Sandbox | Zod schema validation, path traversal rejection, network deny-by-default, rootless containers | High |
| 12 | 17 Acceptance Criteria Tests | Automated AC suite covering all 16K architecture §19 criteria | Medium |
| 13 | Token/Eviction Integration Tests | Real tier budgets, escalation order, role-scope reduction (5→1), tool schema cap | Medium |
| 14 | SA4E Regression Gate | SM pipeline, F12, enrichment, context budget, F2, F4, role boundaries preserved | High |

### 1.3 Screenshots

Diagrams are available in the Diagram Index (Section 12) and embedded in the Deployment Guide (DPG).

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| New | `/api/index/source` | POST | Trigger repository indexing for a commit |
| New | `/api/chat` | POST | Agent chat with mandatory session_id + index_snapshot_id |
| New | `/api/tools/search_symbols` | POST | Hybrid symbol search (pinned snapshot) |
| New | `/api/tools/get_file_skeleton` | POST | Class/interface structure without body (pinned) |
| New | `/api/tools/read_code_block` | POST | Bounded code block read (max 120 lines, pinned) |
| New | `/api/tools/query_call_graph` | POST | CALLERS/CALLEES/IMPLEMENTATIONS graph query (pinned) |
| New | `/api/patch/stage` | POST | Stage patch for validation (no apply) |
| New | `/api/patch/apply` | POST | Apply patch after approval (stale-base revalidation) |
| New | `/events/stream` | GET | SSE stream with Last-Event-ID replay |
| Modified | All chat/search endpoints | * | Now require `session_id` + `index_snapshot_id` headers; reject with 400 if missing/mismatched |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| New Table | `repository` | Root tenant for code intelligence data |
| New Table | `git_commit` | Immutable commit record with SHA |
| New Table | `git_commit_parent` | Merge commit parent tracking with parent_order |
| New Table | `git_ref` | Mutable branch/tag pointers |
| New Table | `source_file_revision` | Immutable file revision per commit (UNIQUE commit+path) |
| New Table | `code_index_snapshot` | Immutable index generation boundary (READY/PENDING/FAILED) |
| New Table | `code_module` | Module within snapshot |
| New Table | `code_symbol` | Symbol definitions scoped to snapshot (composite FK) |
| New Table | `symbol_occurrence` | Symbol references (DEF/REF/IMPORT) with confidence [0,1] |
| New Table | `symbol_occurrence_resolution` | Resolution of occurrences to definitions |
| New Table | `symbol_relationship` | CALLS/EXTENDS/IMPLEMENTS relationships |
| New Table | `relationship_evidence` | Evidence for relationships |
| New Table | `code_chunk` | Chunks for embedding/retrieval |
| New Table | `code_chunk_fts` | FTS5 shadow table for lexical search |
| New Table | `dependency_resolution_snapshot` | Resolved classpath/toolchain per language |
| New Table | `embedding_set` | Embedding model config (decoupled from snapshot) |
| New Table | `code_embedding` | Vector embeddings per chunk/model (BLOB float32[]) |
| New Table | `repository_ref_index_state` | Active snapshot per ref (branch/tag) |
| New Table | `chat_session` | Agent chat bound to pinned snapshot |
| New Table | `agent_run` | Agent execution run |
| New Table | `agent_plan` | Versioned objective + AC + status |
| New Table | `agent_step` | Step with dependencies, refs, attempts, status |
| New Table | `agent_state_transition` | Full state history |
| New Table | `agent_tool_execution` | Tool execution log |
| New Table | `retrieval_evidence` | Evidence linked to steps |
| New Table | `agent_workspace` | Workspace metadata |
| New Table | `change_set` | Staged patch changeset (OPEN/APPLIED/DISCARDED) |
| New Table | `approval_request` | Human approval gate (PENDING/APPROVED/REJECTED) |
| New Table | `execution_run` | Patch execution tracking |
| New Table | `agent_event` | SSE durable event log (monotonic event_id) |

**Migration Strategy**: Additive-only V6 migration (28→29 tables) — legacy F2 tables untouched. Dual-dialect: SQLite DDL + PostgreSQL via `ddl-translator.ts`. Idempotent per-table. FTS5 content-less shadow table on `code_chunk`.

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-------------|-------------|
| `engine.store` | New | `sqlite` (embedded per-workspace) |
| `engine.sqlite.path` | New | `.code-intel/index.db` |
| `engine.sqlite.wal` | New | `true` (WAL mode) |
| `migration.version` | Modified | `5` → `6` |
| `migration.dual_dialect` | New | `true` |
| `agent.tools.pinning_required` | New | `true` (mandatory session pinning) |
| `agent.scratchpad.format` | New | `canonical_xml` |
| `agent.eviction.algorithm` | New | `S_evict` |
| `agent.token_budget.tokenizer` | Modified | `estimate` → `llama.cpp` |
| `api.pinned_snapshot.enforcement` | New | `strict` |
| `sse.durable_log` | New | `true` |
| `sandbox.network_policy` | New | `deny_by_default` |
| `sandbox.container_limits` | New | `cpu:2,mem:4g,procs:100` |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Backend Service | Modified | Node.js 22.23.4 Hono/MCP server with 18 new modules |
| VS Code Extension | Modified | Extension host integration for agent tools, chat, SSE, budget gate |
| SQLite Engine Store | New | `.code-intel/index.db` per workspace (WAL, immutable snapshots) |
| Database Migration | New | V6 dual-dialect migration (SQLite + PostgreSQL) — 29 tables |
| PostgreSQL Platform DB | Unchanged | Existing multi-tenant platform DB — no engine store changes |
| MCP Child Servers | New | markitdown-mcp (0.0.1a7) and markdown-exporter-mcp-local built as isolated Python venvs |
| llama.cpp | External Dependency | Runtime tokenizer endpoint (/tokenize) — injected via `LLAMA_CPP_URL` |
| CI/CD Gates | New | `test:ac`, `test:token`, `test:regression` commands added |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|-------------|---------|----------|
| 1 | SA4E-429 | EntraConfig Zod `.default('')` bypassed validation — optional fields `authority/issuer/jwksUri` accepted empty string and `http://` URLs; fixed with `httpsUrl.optional()` + blank→undefined normalization | Major |

> No other bug fixes included in this release — all 17 ACs pass and regression suite is green.

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | CoreAgentTools not registered in MCP `tools/list` | Extension cannot auto-discover the 4 core tools via MCP | Manual tool registration or defer to e2e integration | Next iteration (e2e) |
| 2 | tiktoken plug-in for non-llama.cpp providers deferred | Only llama.cpp `/tokenize` endpoint supported for runtime token counting | Use llama.cpp compatible endpoint | Future release |
| 3 | AC-09 uses exact SQLite cosine scan (no ANN) | Vector search is exact scan on SQLite per ADR-001; may be slower at scale | Acceptable for MVP; HNSW/pgvector path kept open | When ANN needed |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E F2 Code Intelligence | Operational | Deployed | This release (reuse, not rewrite) |
| SA4E F4 Context Assembly | Operational | Deployed | This release (wire, don't rewrite) |
| Context Budget Governance | Operational | Deployed | This release (wire `DefaultResourceLoader`) |
| SA4E-335 Docker Volume Protection | Guardrail | Active | All environments |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| llama.cpp | Expose `/tokenize` endpoint; URL provided via `LLAMA_CPP_URL` | Required | DevOps |
| VS Code Extension Host | MCP stdio transport for agent tools/chat/SSE | Required | Extension Team |
| Git Repository | libgit2/CLI access for commit discovery, patch apply | Required | DevOps |
| PostgreSQL (platform) | Existing multi-tenant DB; V6 migration runs on same instance | Required | DBA |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| V6 Additive Migration (SQLite) | Creates 29 new tables with composite FK triggers, FTS5 shadow table | Yes (on backend startup) | ~30s |
| V6 Additive Migration (PostgreSQL) | Dual-dialect via `ddl-translator.ts`; same 29 tables | Yes (on backend startup with PG) | ~45s |
| Schema Version Bump | `migrations.ts` registers version 6; idempotent per-table | Yes | ~5s |

### 6.2 Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|----------------|
| All retrieval operations now require `index_snapshot_id` | Clients without snapshot pin will receive 400 | Update clients to pin session to snapshot via `chat_session.pinned_code_index_snapshot_id` |
| Tool calls now require mandatory session pinning (`repository_id`, `commit_id`, `index_snapshot_id`) | Existing tool callers without pins will fail | Update callers to include session pin from active chat session |
| API endpoints reject requests missing `session_id` + `index_snapshot_id` | Unpinned requests return 400 | Ensure all chat/search requests include both identifiers |
| Vector search now scoped by `embedding_set` (model + snapshot) | Queries without embedding model key fail | Include `embedding_model_key` for vector search |

> **Note**: No breaking changes for existing F2/F4 functionality — V6 is additive-only, legacy tables untouched. Fully backward compatible for non-Code Agent 16K features.

### 6.3 Backward Compatibility

**Fully backward compatible** for existing SA4E features (F2 Code Intelligence, F4 Context Assembly, Context Budget Governance, SM pipeline, enrichment, role boundaries). The V6 migration adds new tables without modifying existing 28 F2 tables. All existing retrieval, indexing, and context assembly paths continue to work unchanged.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | 7,294 | 7,294 | 0 | 25 | 100% |
| Integration Tests | 22 | 22 | 0 | 0 | 100% |
| AC Suite | 17 | 17 | 0 | 0 | 100% |
| Token/Eviction Integration | 22 | 22 | 0 | 0 | 100% |
| Regression Suite | 218 | 218 | 0 | 0 | 100% |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 1 | 1 | 0 | 0 |
| Minor | 0 | 0 | 0 | 3 |

**Test Gates Verified:**
- `npm run build` — exit 0 ✅
- `npm test` — exit 0 (backend 500 files/3,825 passed/19 skipped; extension 443 files/3,469 passed/6 skipped) ✅
- `npm run test:ac` — exit 0 (backend 16 tests + extension 1 test, < 10s) ✅
- `npm run test:token` — exit 0 (backend 13 + extension 9 integration tests) ✅
- `npm run test:regression` — exit 0 (backend 11 files/63 tests + extension 20 files/155 tests) ✅

---

## 8. Deployment Instructions

See the **Deployment Guide** for detailed steps: [DPG-v1.0.0-SA4E-411.docx](DPG-v1.0.0-SA4E-411.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Database backup (PostgreSQL + SQLite) | 5 min |
| 2 | Database migration (V6 dual-dialect) | 1 min |
| 3 | Application deployment (Docker) | 2 min |
| 4 | Configuration update | 1 min |
| 5 | Verification (health + smoke tests) | 5 min |
| **Total** | | **~14 min** |

---

## 9. Rollback Plan

See the **Deployment Guide** for detailed rollback steps: [DPG-v1.0.0-SA4E-411.docx](DPG-v1.0.0-SA4E-411.docx)

**Rollback Decision Criteria:**
- Critical defect found in production (data loss, security breach)
- Performance degradation > 50% (p95 latency, error rate)
- Data integrity issue (corrupt snapshots, FK violations)
- MCP child servers failing to spawn
- llama.cpp tokenizer unavailable causing agent failures

**Estimated Rollback Time:** ~13 min (stop container 30s + DB rollback 5 min + deploy previous version 2 min + config restore 1 min + verification 5 min)

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | DevOps Agent | devops@sa4e.enterprise | Release coordination |
| Dev Lead | Dev Agent | dev@sa4e.enterprise | Technical issues |
| QA Lead | QA Agent | qa@sa4e.enterprise | Testing sign-off |
| DevOps | DevOps Agent | devops@sa4e.enterprise | Deployment execution |
| Business Owner | PG Owner | pm@sa4e.enterprise | Business sign-off |
| Security Lead | Security Agent | security@sa4e.enterprise | Security review |
| DBA | Platform DBA | dba@sa4e.enterprise | Database migration/backup |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |

---

## 12. Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Deployment Flow | `diagrams/deployment-flow.png` | `diagrams/deployment-flow.drawio` |
| 2 | Rollback Flow | `diagrams/rollback-flow.png` | `diagrams/rollback-flow.drawio` |
| 3 | Architecture Overview | `diagrams/architecture-overview.png` | `diagrams/architecture-overview.drawio` |
| 4 | Snapshot/Revision ER Diagram | `diagrams/snapshot-revision-er.png` | `diagrams/snapshot-revision-er.drawio` |
| 5 | Pipeline Ordering (A–J) | `diagrams/pipeline-ordering.png` | `diagrams/pipeline-ordering.drawio` |
| 6 | Agent UX Token Budget | `diagrams/token-budget.png` | `diagrams/token-budget.drawio` |
| 7 | Scratchpad & Eviction | `diagrams/scratchpad-eviction.png` | `diagrams/scratchpad-eviction.drawio` |
| 8 | System Context | `diagrams/system-context.png` | `diagrams/system-context.drawio` |
| 9 | Agent Chat Sequence | `diagrams/sequence-agent-chat.png` | `diagrams/sequence-agent-chat.drawio` |
| 10 | Token Budget State Machine | `diagrams/state-token-budget.png` | `diagrams/state-token-budget.drawio` |
| 11 | Business Flow | `diagrams/business-flow.png` | `diagrams/business-flow.drawio` |
| 12 | Use Case | `diagrams/use-case.png` | `diagrams/use-case.drawio` |

*All diagrams stored in `documents/SA4E-411/diagrams/`. Source `.drawio` files are the editable format; `.png` files are rendered exports.*

---

**Document End**