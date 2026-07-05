# Business Requirements Document (BRD)

## SA4E Memory / Knowledge Base — F1-MEMORY-KB

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F1-MEMORY-KB |
| Title | Memory / Knowledge Base Module |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial BRD — generated from source analysis of backend/src/modules/memory/ |

---

## 1. Introduction

### 1.1 Scope

The Memory / Knowledge Base (KB) module provides persistent, intelligent knowledge storage and retrieval for the SA4E (SDLC Agents 4 Enterprise) multi-agent system. It serves as the shared memory layer enabling AI agents (BA, TA, SA, QA, DEV, DevOps) to store decisions, architecture patterns, error resolutions, procedures, and project context — then retrieve them through hybrid search combining BM25 full-text search, vector similarity (ONNX embeddings), and knowledge graph traversal.

Key capabilities:
- **Hybrid Search**: BM25 (FTS5) + vector cosine similarity + graph neighbor expansion
- **Scope-based Isolation**: USER → PROJECT → SHARED visibility hierarchy with automatic promotion
- **Data Masking**: PII detection, credential masking, role-based access control on sensitive entries
- **Knowledge Graph**: Entity relationships with typed edges enabling contextual discovery
- **Tiered Memory**: WORKING → EPISODIC → SEMANTIC → PROCEDURAL consolidation lifecycle
- **ONNX Embeddings**: Local embedding generation via paraphrase-multilingual-MiniLM-L12-v2 model

### 1.2 Out of Scope

- External vector database integration (Pinecone, Weaviate) — uses local SQLite + ONNX
- Real-time collaborative editing of KB entries
- Multi-tenant SaaS deployment (single workspace focus)
- Natural language generation / summarization (LLM calls handled by separate LLM module — except for AI-assisted tagging which uses LLM internally)
- Frontend UI for KB browsing (all access via MCP tool calls)

### 1.3 Preliminary Requirements

- SQLite with FTS5 extension available (better-sqlite3 npm package)
- ONNX Runtime for local embedding model execution
- Node.js runtime (backend server)
- MCP (Model Context Protocol) tool registration infrastructure
- File system access for workspace-relative document ingestion

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Memory module operates as a middleware knowledge layer between AI agents and persistent storage:

1. **Agent ingests knowledge** → content classified → embeddings generated → stored with scope/tier
2. **Agent searches KB** → hybrid query (BM25 + vector + graph) → scope-filtered → ranked results
3. **Background processes** → staleness detection → tier consolidation → scope promotion → lifecycle management

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Category |
|---|-----------------|----------|----------|
| 1 | Hybrid Search — agent searches KB with combined BM25 + vector + graph ranking | MUST HAVE | Core Search |
| 2 | Knowledge Ingestion — agent stores decisions, patterns, requirements into KB | MUST HAVE | Core Storage |
| 3 | File Ingestion — zero-context document ingestion from file path | MUST HAVE | Core Storage |
| 4 | Scope Isolation — entries visible based on USER/PROJECT/SHARED hierarchy | MUST HAVE | Access Control |
| 5 | Scope Promotion — automatic/manual entry promotion USER→PROJECT→SHARED | MUST HAVE | Access Control |
| 6 | Data Masking — PII/credential detection and role-based masking | MUST HAVE | Security |
| 7 | Knowledge Graph — entity relationships with graph traversal | SHOULD HAVE | Discovery |
| 8 | Tier Consolidation — lifecycle management WORKING→EPISODIC→SEMANTIC→PROCEDURAL | SHOULD HAVE | Lifecycle |
| 9 | Pinned Memory (Core Memory) — persistent context always available to agents | SHOULD HAVE | Context |
| 10 | Conversation History — structured turn storage with session management | SHOULD HAVE | Context |
| 11 | Quality Scoring — entry quality assessment and feedback | COULD HAVE | Quality |
| 12 | Citation Tracking — track which agents use which entries | COULD HAVE | Analytics |
| 13 | AI-Assisted Tagging — dùng chat model phân tích content và gợi ý/gán tags theo đúng nghiệp vụ | MUST HAVE | Intelligence |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** AI agent (BA, SA, DEV, etc.) calls `mem_ingest` or `mem_ingest_file` with content + metadata

**Step 2:** System classifies content type (DECISION, ERROR_PATTERN, ARCHITECTURE, etc.) and assigns tier (WORKING)

**Step 3:** ONNX embedding model generates vector representation (384-dim)

**Step 4:** Entry stored in SQLite with FTS5 index auto-updated, vector stored in knowledge_vectors table

**Step 5:** Knowledge graph edges auto-linked to related entries (if `auto_link` enabled)

**Step 6:** When agent searches via `mem_search`, system executes parallel: FTS5 BM25 query + vector cosine similarity + graph neighbor expansion

**Step 7:** Results merged, deduplicated, scope-filtered (user sees own USER + all PROJECT + all SHARED), ranked by combined score

**Step 8:** If masking enabled, results pass through MaskingMiddleware (PII/credential detection → role-based masking)

**Step 9:** Background hourly cycle: ScopePromotionService scans for promotion candidates based on access_count, confidence, citations

> **Note:** All operations are audited (memory_audit table). Sessions tracked for agent attribution.

---

#### STORY 1: Hybrid Search

> As an AI agent, I want to search the Knowledge Base using a natural language query so that I can find relevant decisions, patterns, and context for my current task.

**Requirement Details:**

1. Search combines three retrieval methods: BM25 full-text (FTS5 with porter stemming + unicode61), vector cosine similarity (ONNX embeddings), and knowledge graph neighbor expansion
2. Results ranked by combined score with configurable weights
3. Results filtered by scope visibility (user sees USER own + PROJECT all + SHARED all)
4. Progressive disclosure: default returns summary only; `detail=true` includes content preview
5. Filterable by tier (WORKING, EPISODIC, SEMANTIC, PROCEDURAL), type (DECISION, ERROR_PATTERN, etc.), scope

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| query | string | Yes | Natural language search query | "authentication flow design" |
| limit | number | No | Maximum results (default 10) | 10 |
| tier | string | No | Filter by memory tier | "SEMANTIC" |
| type | string | No | Filter by entry type | "ARCHITECTURE" |
| scope | string | No | Filter scope: USER, PROJECT, SHARED, all | "PROJECT" |
| detail | boolean | No | Include content preview | true |

**Acceptance Criteria:**

1. Given a query "authentication", when agent calls mem_search, then results include entries with "auth" in content/summary/tags (stemming)
2. Given scope=USER for user "dev1", results include only entries where scope=USER AND user_id="dev1", plus all PROJECT and SHARED entries
3. Given limit=5, exactly 5 or fewer results returned sorted by relevance score descending
4. Given detail=false (default), response contains only summary, id, type, score — NOT full content
5. Search completes within 100ms for KB with ≤10,000 entries
6. FTS5 query sanitizes special characters (removes non-word/space/quote/asterisk chars)

**Error Handling:**

- Invalid FTS5 query syntax: fallback to wildcard search (`*`), return empty rather than crash
- Empty query: return empty results
- Database locked: retry once, then return error

---

#### STORY 2: Knowledge Ingestion

> As an AI agent, I want to store a knowledge entry (decision, error pattern, architecture note) into the KB so that other agents can discover and reuse it.

**Requirement Details:**

1. Agent provides content (required) + optional metadata (summary, type, scope, tags, source, agent_name)
2. System auto-generates summary if not provided (via LLM service)
3. System generates ONNX embedding vector (384 dimensions)
4. Entry inserted into knowledge_entries table with FTS5 triggers auto-updating search index
5. Default tier = WORKING, default scope = USER
6. Audit log records INGEST operation with session context

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| content | string | Yes | Full knowledge content | "Decision: Use JWT for API auth..." |
| summary | string | No | Brief summary (auto-generated if omitted) | "JWT auth decision" |
| type | string | No | Entry type classification | "DECISION" |
| scope | string | No | Visibility: USER/PROJECT/SHARED (default USER) | "PROJECT" |
| user_id | string | No | Owner (auto from context) | "dev-agent-001" |
| source | string | No | Source identifier | "TDD-KSA-14.md" |
| tags | string | No | Comma-separated tags | "auth,jwt,security" |
| agent_name | string | No | Originating agent | "SA" |

**Acceptance Criteria:**

1. Given content "Auth decision: use JWT", when mem_ingest called, then entry stored with id returned
2. Entry searchable via mem_search immediately after ingest (FTS5 trigger fired)
3. If scope=USER, only the owning user can find the entry; other users cannot
4. Duplicate content (exact match) does not create duplicate entry — upserts or returns existing ID
5. Tags stored as comma-separated string, searchable via FTS5
6. Audit log contains INGEST record with entry_id, session_id, timestamp

---

#### STORY 3: File Ingestion (Zero-Context)

> As an AI agent, I want to ingest a document from disk by providing only the file path so that I save context tokens (only ~80 tokens for path vs thousands for content).

**Requirement Details:**

1. Agent sends only `file_path` — server reads file directly from disk
2. Token cost: ~80 tokens (path string) vs 2000-10000 tokens (full content in prompt)
3. Server auto-detects format: markdown → chunk by sections (## headers), text → single entry
4. Each chunk becomes a separate KB entry with source_ref linking back to file path
5. Supports relative paths (from workspace root) and absolute paths

**Acceptance Criteria:**

1. Given file_path="documents/F1-memory-kb/BRD.md", server reads file and ingests content
2. Markdown files chunked by ## headings — each section = 1 KB entry
3. All chunks share same source=file_path for traceability
4. If file not found → clear error message with path attempted
5. If file too large (>1MB) → chunk into segments, ingest iteratively

---

#### STORY 4: Scope-based Isolation

> As a system administrator, I want KB entries isolated by visibility scope (USER/PROJECT/SHARED) so that private agent data doesn't leak to unauthorized users while shared knowledge is accessible to all.

**Requirement Details:**

1. Three scope levels: USER (private to one user), PROJECT (visible to all project members), SHARED (visible company-wide)
2. Scope visibility rule: user sees `own USER entries + all PROJECT entries + all SHARED entries`
3. Scope enforced at query time via SQL WHERE clause
4. Each entry has exactly one scope at any time
5. Scope stored as TEXT column with CHECK constraint

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| scope | enum | Yes | USER / PROJECT / SHARED | "PROJECT" |
| user_id | string | Conditional | Required when scope=USER | "dev-agent-001" |

**Acceptance Criteria:**

1. User "alice" with scope=USER entry → only alice can find it via search
2. Entry with scope=PROJECT → all users in project can find it
3. Entry with scope=SHARED → all users across all projects can find it
4. Scope enforcement is mandatory — no query bypasses scope filtering
5. Scope transition follows strict order: USER→PROJECT→SHARED (never skip levels)

---

#### STORY 5: Scope Promotion

> As a team lead, I want high-value USER entries automatically promoted to PROJECT scope when they meet quality criteria so that useful knowledge is shared without manual intervention.

**Requirement Details:**

1. ScopePromotionService runs hourly scan for promotion candidates
2. Promotion criteria: high access_count (≥5), high confidence (≥0.8), has citations, used by multiple agents
3. Valid transitions: USER→PROJECT (auto-approvable), PROJECT→SHARED (requires manual approval)
4. Promotion queue table tracks pending approvals
5. `promoteOnMerge(ticketKey)` — batch-promotes all USER entries tagged with a ticket when that ticket merges to master

**Acceptance Criteria:**

1. Entry with access_count≥5, confidence≥0.8, ≥2 citations → auto-promoted USER→PROJECT
2. Entry promoted PROJECT→SHARED only after explicit approve(entryId, reviewerId, comment)
3. Rejected promotions logged with reviewer comment; entry stays at current scope
4. promoteOnMerge("KSA-14") → all USER entries with source containing "KSA-14" promoted to PROJECT
5. Promotion logged in consolidation_log with from/to scope and reason

---

#### STORY 6: Data Masking

> As a security officer, I want PII and credentials automatically detected and masked based on requester role so that sensitive data in KB is protected.

**Requirement Details:**

1. MaskingMiddleware pipeline: detect PII (emails, phones, SSN) + detect credentials (API keys, tokens, passwords)
2. Role-based access matrix:
   - ADMIN: sees PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED (can reveal credentials)
   - DEVELOPER: sees PUBLIC only (PII/creds masked)
   - USER: sees PUBLIC only
   - EXTERNAL: sees PUBLIC only
3. Sensitivity classification: PUBLIC (no PII/creds) → INTERNAL (has PII) → CONFIDENTIAL (summary only for non-admin) → RESTRICTED (hidden for non-admin)
4. Allowlist: specific entries can be exempted from masking
5. All masking events audited with requester_id, role, action, patterns_matched

**Acceptance Criteria:**

1. Entry containing email "user@example.com" → classified INTERNAL → masked for DEVELOPER role
2. Entry containing API key "sk-abc123..." → classified RESTRICTED → hidden for non-ADMIN
3. ADMIN with reveal=true can see unmasked credentials
4. CONFIDENTIAL entries: non-ADMIN sees summary only (not content)
5. Allowlisted entries bypass detection entirely
6. Audit log records every mask/hide/reveal action

---

#### STORY 7: Knowledge Graph

> As an AI agent, I want to explore relationships between KB entries via a knowledge graph so that I can discover contextually related information beyond keyword matching.

**Requirement Details:**

1. Typed edges: RELATES_TO, DEPENDS_ON, IMPLEMENTS, CONTRADICTS, SUPERSEDES, etc.
2. Operations: add_edge, neighbors, path (shortest path), ego (subgraph within radius), auto_link (backfill orphans)
3. Weighted edges (0.0 - 1.0) for relevance scoring during graph traversal
4. Auto-link: scans orphan entries and creates edges based on entity overlap / tag similarity

**Acceptance Criteria:**

1. add_edge(source=1, target=2, relation="IMPLEMENTS") creates edge with weight=1.0
2. neighbors(node_id=1) returns all entries connected to entry 1 (both directions)
3. ego(node_id=1, radius=2) returns subgraph 2 hops from entry 1
4. auto_link processes up to 50 orphan entries per invocation
5. Graph edges deleted when source or target entry is deleted (ON DELETE CASCADE)

---

#### STORY 8: Tier Consolidation

> As the system, I want entries to progress through memory tiers (WORKING→EPISODIC→SEMANTIC→PROCEDURAL) based on access patterns and quality so that frequently-used knowledge is elevated and stale knowledge expires.

**Requirement Details:**

1. Tiers: WORKING (short-term, recent), EPISODIC (event-based), SEMANTIC (conceptual, long-lived), PROCEDURAL (how-to, permanent)
2. Promotion criteria: high access_count, high quality_score, high confidence, recent access
3. Demotion criteria: no access in 90 days, low quality_score, expired (expires_at passed)
4. Consolidation runs on demand via mem_consolidate (not automatic background)
5. Dry-run mode previews changes without applying
6. Merge capability: combine duplicate entries (survivor keeps content, merged IDs redirect)

**Acceptance Criteria:**

1. Entry in WORKING tier with access_count≥10 → promoted to EPISODIC
2. Entry in EPISODIC with quality_score≥80 and confidence≥0.9 → promoted to SEMANTIC
3. Entry with no access for 90+ days and confidence<0.5 → demoted one tier
4. dry_run=true returns what WOULD change without modifying data
5. Merge: survivor_id content appended with merge_ids content; merge_ids entries deleted

---

#### STORY 9: Pinned Memory (Core Memory)

> As an AI agent, I want to pin critical entries to my "core memory" so that they are always included in my context window automatically.

**Requirement Details:**

1. Pinned entries auto-included in agent context (up to 2000 token budget)
2. Pin order determines inclusion priority (lower order = higher priority)
3. Actions: pin, unpin, list, reorder, get_context (returns pinned content within budget), budget (shows usage)
4. Only entries within scope visibility can be pinned

**Acceptance Criteria:**

1. pin(entry_id=5) → entry marked pinned=1, assigned next pin_order
2. get_context() returns all pinned entries concatenated, truncated at 2000 tokens
3. reorder(entry_id=5, order=1) → entry moves to position 1, others shift
4. unpin(entry_id=5) → entry marked pinned=0
5. budget() returns {used_tokens, max_tokens=2000, entries_count}

---

#### STORY 10: Conversation History

> As an AI agent, I want to store and retrieve structured conversation turns so that I can maintain context across sessions.

**Requirement Details:**

1. Each turn: session_id, turn_number, role (user/assistant/system/tool), content, tool_calls
2. Actions: save_turn, get_session (all turns), list_sessions, search (FTS across turns), summarize
3. Summarization marks turns as summarized=1 (can be excluded from detailed retrieval)
4. Sessions auto-created on first save_turn for a session_id

**Acceptance Criteria:**

1. save_turn(session="s1", role="user", content="How to auth?") → stored with turn_number=1
2. get_session("s1") returns all turns in order
3. search("authentication") finds turns containing "auth" across all sessions
4. list_sessions returns recent sessions with turn count and last activity

---

#### STORY 11: Quality Scoring

> As a team lead, I want KB entries scored for quality so that I can identify low-quality entries needing improvement and high-quality entries for promotion.

**Requirement Details:**

1. Quality dimensions: completeness, accuracy, relevance, freshness
2. Total score 0-100 computed from weighted dimensions
3. Actions: quality_score (compute for entry), quality_stats (aggregate), low_quality (find problematic), validate (check content quality before ingest)
4. Feedback: users can rate entries (+1 thumbs up, -1 thumbs down) with optional comment

**Acceptance Criteria:**

1. quality_score(entry_id=5) computes and stores score in quality_scores table
2. low_quality(threshold=40) returns entries with score < 40
3. feedback_submit(entry_id=5, rating=1, comment="Useful!") records feedback
4. top_rated(limit=10) returns highest-rated entries by feedback

---

#### STORY 12: Citation Tracking

> As a system analyst, I want to track which agents cite which KB entries so that I can identify the most valuable knowledge and detect unused entries.

**Requirement Details:**

1. Record citation: entry_id, cited_by (agent name), context (what was the agent doing)
2. Analytics: most_cited, uncited, by_agent
3. Citation count influences scope promotion decisions

**Acceptance Criteria:**

1. record(entry_id=5, cited_by="SA", context="TDD design") → citation stored
2. most_cited(limit=10) returns top 10 cited entries
3. uncited(limit=20) returns entries never cited (candidates for cleanup)
4. Unique constraint: same entry + same cited_by + same context = no duplicate

---

#### STORY 13: AI-Assisted Tagging (LLM-based Tag Analysis via Internal API)

> As the system, I want to automatically analyze ingested content using a chat model (LLM) via an internal API call (not MCP tool) and assign tags aligned with business domain taxonomy so that entries are consistently categorized without consuming agent context tokens.

**Requirement Details:**

1. Tag analysis is an **internal API call** within the backend — NOT exposed as MCP tool (saves context tokens for agents)
2. Triggered automatically inside `mem_ingest` flow when `tags` not provided or `auto_tag=true`
3. Backend calls LLM internally (no round-trip through agent context window) to analyze content
4. LLM receives: content + pre-defined tag taxonomy (business domains, technical categories, SDLC phases)
5. LLM returns structured tag suggestions with confidence scores
6. Tags above confidence threshold (≥0.7) auto-assigned; below threshold discarded
7. Tag taxonomy loaded from `kb-tag-taxonomy.json` configuration file
8. Domain-specific tag categories:
   - **Business Domain**: authentication, payment, notification, reporting, user-management
   - **Technical Category**: architecture, api-design, database, security, performance, testing
   - **SDLC Phase**: requirements, design, implementation, testing, deployment
   - **Document Type**: decision, error-pattern, procedure, architecture-note
9. **NOT an MCP tool** — agents never call this directly, avoiding context bloat
10. Fallback: if LLM unavailable, use keyword extraction (regex + heuristics) as degraded mode
11. Tag count per entry capped at **max 5 tags** to avoid noise

**Design Rationale (API vs MCP Tool):**

| Approach | Context Cost | Latency | Agent Complexity |
|----------|-------------|---------|-----------------|
| MCP Tool (❌ rejected) | ~200 tokens per call + response | Agent must orchestrate | Agent must know taxonomy |
| Internal API (✅ chosen) | 0 tokens (invisible to agent) | Async within ingest | Zero agent involvement |

**Acceptance Criteria:**

1. Given content "Decision: Use JWT for API auth", when mem_ingest called without tags, then system internally calls LLM and assigns tags like `authentication`, `api-design`, `decision`
2. Agent context window is NOT consumed by tag analysis (zero token overhead for agents)
3. Tag analysis adds ≤500ms to ingest latency (async/parallel with embedding generation)
4. Max 5 tags per entry (prevents over-tagging)
5. If LLM unavailable, ingest still succeeds (tags left empty or keyword-extracted)
6. Tag taxonomy changes take effect on next ingest (no re-tag of existing entries required)

**Error Handling:**

- LLM timeout (>5s): skip tagging, ingest proceeds without tags
- LLM returns invalid response: fallback to keyword extraction
- Empty content: no tags generated

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| better-sqlite3 | Infrastructure | SQLite database with FTS5 support |
| ONNX Runtime | Infrastructure | Local embedding model execution |
| paraphrase-multilingual-MiniLM-L12-v2 | AI Model | 384-dim multilingual embedding model |
| MCP Tool Registry | System | Tool registration for agent access |
| File System | System | Workspace-relative file access for mem_ingest_file |
| Pino Logger | System | Structured logging framework |
| DatabaseManager | Internal | Shared database lifecycle management |
| QueryLayer | Internal | Common query utilities |
| LLMService | Internal | Auto-summary generation, **AI-assisted tag analysis** |

### LLM Configuration for Backend

Backend đã có sẵn `LLMService` (multi-provider) được cấu hình qua environment variables:

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | Provider: ollama, openai, anthropic, gemini, lmstudio, copilot |
| `LLM_MODEL` | `qwen2.5:7b-instruct-q4_K_M` | Model name |
| `LLM_BASE_URL` | `http://localhost:11434` | API base URL |
| `LLM_API_KEY` | (empty) | API key (required for openai/anthropic) |

TagAnalyzerService reuse cùng LLMService instance — không cần config riêng.

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| AI Agents (BA, SA, DEV, QA, DevOps) | Consumers | Primary users of KB via MCP tools |
| System Administrator | Operations | Manages scope promotions, masking config |
| Security Officer | Security | Defines masking rules, reviews audit logs |
| Product Owner | Management | Approves SHARED scope promotions |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SQLite performance degradation at scale (>100K entries) | High | Medium | Implement pagination, archive old entries, consider migration path |
| ONNX model loading time impacts cold start | Medium | Low | Lazy-load model on first search, cache in memory |
| FTS5 query injection via malformed queries | High | Low | Input sanitization (remove special chars before FTS5 query) |
| Scope leakage if SQL clause incorrectly constructed | High | Low | Parameterized queries, unit tests for scope enforcement |
| Knowledge graph cycles causing infinite traversal | Medium | Medium | Depth limit on path/ego operations |

### 5.2 Assumptions

- Single workspace deployment (one SQLite DB per workspace instance)
- Agents identified by stable user_id provided by authentication layer
- ONNX model file available on disk at startup (downloaded during build)
- FTS5 porter stemming sufficient for English; multilingual handled by vector similarity
- 2000-token budget for pinned memory is adequate for agent context needs
- Hourly promotion scan frequency is sufficient (not real-time)

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Search latency (BM25) | < 50ms for ≤10K entries |
| Performance | Search latency (hybrid BM25+vector) | < 200ms for ≤10K entries |
| Performance | Ingest latency (with embedding) | < 500ms per entry |
| Performance | File ingest (1MB markdown) | < 5s total |
| Scalability | Max entries per workspace | 100,000 |
| Scalability | Max graph edges | 500,000 |
| Reliability | Data durability | SQLite WAL mode, no data loss on crash |
| Security | PII detection accuracy | ≥95% for common patterns (email, phone, SSN) |
| Security | Credential detection accuracy | ≥99% for API keys, tokens |
| Security | Audit coverage | 100% of data access operations logged |
| Availability | Module startup time | < 2s including DB migration |
| Maintainability | Code coverage (unit tests) | ≥80% for core engine |
| Token Efficiency | mem_ingest_file cost | ~80 tokens (path only, no content in prompt) |
| Token Efficiency | Pinned memory budget | ≤2000 tokens auto-recall |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| BM25 | Best Match 25 — probabilistic ranking function used by FTS5 |
| FTS5 | Full-Text Search extension 5 for SQLite |
| ONNX | Open Neural Network Exchange — runtime for ML model inference |
| MCP | Model Context Protocol — standard for AI tool registration |
| Tier | Memory maturity level: WORKING → EPISODIC → SEMANTIC → PROCEDURAL |
| Scope | Visibility level: USER (private) → PROJECT (team) → SHARED (company) |
| Embedding | Dense vector representation of text for similarity search |
| Knowledge Graph | Network of typed relationships between KB entries |
| Core Memory | Pinned entries automatically included in agent context |
| Progressive Disclosure | Returning summary first, full content on demand |

### Tool API Surface (14+ Tools)

| Tool | Tier | Description |
|------|------|-------------|
| mem_search | T1 (High-freq) | Hybrid search (BM25 + vector + graph) |
| mem_ingest | T1 | Store knowledge entry |
| mem_ingest_file | T1 | Zero-context file ingestion |
| mem_pin | T2 (Medium-freq) | Core memory management |
| mem_map | T2 | Structured metadata management |
| mem_crud | T2 | CRUD operations |
| mem_graph | T2 | Knowledge graph queries |
| mem_consolidate | T2 | Tier consolidation |
| mem_lifecycle | T2 | Entry lifecycle management |
| mem_templates | T2 | Content templates |
| mem_attachments | T2 | File attachments |
| mem_discover | T2 | Discovery/suggestions |
| mem_tags | T2 | Tag taxonomy |
| mem_citations | T2 | Citation tracking |
| mem_conversation | T3 (Low-freq) | Conversation history |
| mem_scoring | T3 | Quality scoring |
| mem_admin | T3 | System administration |
| mem_promote | Alias | Scope promotion |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
