# Business Requirements Document (BRD)

## SA4E — SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Title | Persistent Task Queue cho KB Ingest + Remove CodeIntelModule from Backend |
| Author | BA Agent |
| Version | 3.0 |
| Date | 2026-07-17 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-20 | BA Agent | Initiate document (old scope — included file scanner) |
| 2.0 | 2025-07-27 | BA Agent | Rewrite — Persistent Task Queue only |
| 3.0 | 2026-07-17 | BA Agent | **FULL REWRITE** — Dual scope: (1) Persistent Task Queue, (2) Remove CodeIntelModule from backend, extension handles scan/index |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

SA4E-44 bao gồm **2 phần chính**:

**Part 1 — Persistent Task Queue cho KB Ingest:**
Implement database-backed task queue cho enrichment pipeline. Pattern "persist first, process later": khi `mem_ingest` được gọi, entry + pending tasks được write atomic trong 1 transaction. Background worker xử lý async. Crash recovery tự động.

**Part 2 — Remove CodeIntelModule khỏi Backend:**
Loại bỏ hoàn toàn `CodeIntelModule` khỏi backend server. Extension (IDE plugin) chịu trách nhiệm scan/index files locally, sau đó gửi kết quả (symbols, AST data, call graph) cho backend qua API/MCP để lưu vào database. Backend KHÔNG access filesystem.

### 1.2 Architecture Principles (HARD RULES)

| # | Rule | Rationale |
|---|------|-----------|
| 1 | Backend KHÔNG access filesystem | Backend chạy trên máy khác (remote server), không cùng filesystem với user workspace |
| 2 | Extension đọc files → gửi data cho backend | Extension chạy trên user machine, có filesystem access tự nhiên |
| 3 | Backend chỉ nhận data, lưu DB, xử lý enrichment | Single responsibility — backend là data store + enrichment engine |
| 4 | Dùng DatabaseAdapter/PostgreSQL cho task queue | Persistent, crash-safe, transaction support |
| 5 | Code Intelligence data lưu DB (không file-based) | Backend phục vụ queries từ DB, không cần filesystem |

### 1.3 Out of Scope

| Item | Reason |
|------|--------|
| Extension UI/UX changes | Chỉ thêm background indexing + API calls, không thay đổi UI |
| New database instance | Dùng PostgreSQL hiện có (sa4e_db via DatabaseAdapter) |
| In-memory queue | KHÔNG chấp nhận — queue PHẢI persistent trong database |
| Real-time streaming of index results | Batch upload sau khi scan xong, không stream từng file |
| Frontend webview panels | Không ảnh hưởng bởi thay đổi này |
| LangGraph pipeline changes | Pipeline vẫn gọi code_search/code_symbols — chỉ backend implementation thay đổi |

### 1.4 Preliminary Requirements

| Prerequisite | Status |
|-------------|--------|
| Bug fix: Server event loop blocking do `startBackgroundIndexing` — đã disable | ✅ Done |
| PostgreSQL database running (sa4e_db) | ✅ Available |
| DatabaseAdapter interface (multi-DB support) | ✅ Available (SA4E-33) |
| Extension codebase có RemoteBackendClient | ✅ Available |
| MCP StreamableHTTP transport working | ✅ Available |

---

## 2. Business Requirements

### 2.1 High Level Process Map

**Current State (problematic):**
- Backend có `CodeIntelModule` gọi `startBackgroundIndexing()` → blocks event loop
- Backend dùng `chokidar` file watcher → requires filesystem access → fails khi remote
- Code Intelligence tools (code_search, code_symbols) đọc từ local SQLite → tightly coupled

**Target State:**
- Extension scan workspace → gửi structured data (symbols, files, dependencies) → backend API
- Backend nhận data → lưu PostgreSQL → enrichment via Task Queue (vectors, tags)
- Backend phục vụ queries (code_search, code_symbols) từ DB — zero filesystem dependency
- Task Queue xử lý cả KB ingest enrichment VÀ code intelligence enrichment

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Part |
|---|-----------------|----------|------|
| 1 | Atomic Ingest with Task Creation | MUST HAVE | Part 1 |
| 2 | Background Task Processing (Worker) | MUST HAVE | Part 1 |
| 3 | Crash Recovery | MUST HAVE | Part 1 |
| 4 | Task Status Monitoring | SHOULD HAVE | Part 1 |
| 5 | Failed Task Retry & Dead Letter | SHOULD HAVE | Part 1 |
| 6 | Remove CodeIntelModule from Backend | MUST HAVE | Part 2 |
| 7 | Extension Local Scan & Index | MUST HAVE | Part 2 |
| 8 | Extension Uploads Index Data to Backend | MUST HAVE | Part 2 |
| 9 | Backend Stores & Serves Code Intelligence Queries | MUST HAVE | Part 2 |
| 10 | Incremental Re-index on File Change | SHOULD HAVE | Part 2 |

---

### 2.3 Details of User Stories

---

#### Business Flow (End-to-End)

**Part 1 — KB Ingest with Task Queue:**

**Step 1:** Extension/Agent gọi `mem_ingest` với content, type, tags, source

**Step 2:** Backend mở database transaction

**Step 3:** INSERT knowledge_entry → nhận `entry_id`

**Step 4:** INSERT pending task TAG_ENRICHMENT (nếu TagAnalyzer available)

**Step 5:** INSERT pending task VECTOR_EMBEDDING (nếu EmbeddingService available)

**Step 6:** COMMIT transaction (atomic)

**Step 7:** Return response cho caller (< 100ms)

**Step 8:** Background TaskWorker poll → claim → process → mark done/failed

**Step 9:** Server crash → restart → worker `recoverStaleTasks()` → resume

**Part 2 — Code Intelligence Migration:**

**Step 10:** Extension detects workspace open / file changes

**Step 11:** Extension runs local Tree-sitter parse → extract symbols, imports, exports, call sites

**Step 12:** Extension batches results → calls backend API `code_intel_upload`

**Step 13:** Backend receives batch → opens transaction → INSERT/UPSERT code_symbols, code_files, code_dependencies

**Step 14:** Backend creates enrichment tasks (CALL_GRAPH_BUILD, IMPACT_ANALYSIS) via Task Queue

**Step 15:** Worker processes enrichment tasks → updates derived tables

**Step 16:** Agents call `code_search`, `code_symbols` → backend queries DB → returns results

---

#### STORY 1: Atomic Ingest with Task Creation

> As a **backend service**, I want to **persist knowledge entries and their enrichment tasks in a single atomic transaction** so that **data is never in an inconsistent state**.

**Requirement Details:**

1. Khi `mem_ingest` được gọi, server mở 1 database transaction
2. INSERT knowledge_entry → nhận entry_id
3. INSERT pending task TAG_ENRICHMENT (nếu TagAnalyzer available)
4. INSERT pending task VECTOR_EMBEDDING (nếu EmbeddingService available)
5. COMMIT transaction — all or nothing
6. Response trả ngay cho caller SAU khi commit (< 100ms)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| content | string | Yes | Nội dung knowledge entry | "Function parseConfig reads YAML..." |
| type | string | No | Loại entry (default: CONTEXT) | "CONTEXT", "DECISION", "PATTERN" |
| tags | string | No | Comma-separated tags | "typescript,config,parser" |
| source | string | No | Source identifier | "src/config/parser.ts" |
| summary | string | No | Short summary (max 120 chars) | "Config parser implementation" |
| timestamp | string (ISO 8601) | No | Thời gian nguồn dữ liệu. Priority: git commit time > file modified time > current time | "2026-07-17T10:30:00Z" |

**Timestamp Resolution Rule:**
- Extension PHẢI gửi `timestamp` khi ingest file/document
- Priority: (1) git last commit time của file → (2) file system modified time → (3) Date.now()
- Backend lưu `timestamp` vào knowledge_entry, dùng cho sort/filter/freshness ranking
- Nếu caller không gửi timestamp → backend dùng server time (fallback)

**Acceptance Criteria:**

1. GIVEN valid `mem_ingest` request WHEN processed THEN entry + tasks created in SAME transaction
2. GIVEN database error during task INSERT WHEN transaction fails THEN entry also rolled back
3. GIVEN successful ingest WHEN response returned THEN latency < 100ms
4. GIVEN TagAnalyzer unavailable WHEN ingesting THEN TAG_ENRICHMENT task NOT created (graceful)
5. GIVEN EmbeddingService unavailable WHEN ingesting THEN VECTOR_EMBEDDING task NOT created (graceful)

---

#### STORY 2: Background Task Processing

> As a **backend service**, I want a **background worker polling pending tasks** so that **API remains responsive while heavy operations happen async**.

**Requirement Details:**

1. TaskWorker starts khi MemoryModule initialize
2. Worker poll `pending_tasks` table FIFO (created_at ASC)
3. Claim task: update status PENDING → PROCESSING (optimistic locking)
4. Process theo task_type:
   - TAG_ENRICHMENT → TagAnalyzerService → update tags
   - VECTOR_EMBEDDING → EmbeddingService → update vector
   - CALL_GRAPH_BUILD → build call graph from uploaded symbols
   - IMPACT_ANALYSIS → compute impact analysis for changed files
5. Mark COMPLETED hoặc FAILED
6. Exponential backoff khi idle (base 2s → max 30s)

**Acceptance Criteria:**

1. GIVEN pending tasks WHEN worker polls THEN processed FIFO order
2. GIVEN worker processing WHEN new API request arrives THEN API responds < 100ms
3. GIVEN no pending tasks WHEN polling THEN backoff increases (2s → 4s → 8s → ... → 30s max)
4. GIVEN tasks become available WHEN worker polls THEN backoff resets to base
5. GIVEN task takes > 5s WHEN API called THEN API NOT delayed

---

#### STORY 3: Crash Recovery

> As a **system administrator**, I want **stale tasks auto-recovered on restart** so that **no enrichment work is lost**.

**Requirement Details:**

1. On startup, TaskWorker gọi `recoverStaleTasks()`
2. Stale = PROCESSING tasks với started_at > staleThreshold (default 5 min)
3. Reset stale tasks → PENDING, clear started_at
4. PENDING tasks trước crash vẫn tồn tại — picked up naturally

**Acceptance Criteria:**

1. GIVEN server crashes with PROCESSING tasks WHEN restarts THEN stale tasks reset to PENDING
2. GIVEN PENDING tasks before crash WHEN restarts THEN they are processed normally
3. GIVEN staleThreshold=300000ms WHEN task PROCESSING > 5 min THEN marked stale
4. GIVEN recovery runs WHEN N tasks recovered THEN log "Recovered {N} stale tasks"

---

#### STORY 4: Task Status Monitoring

> As a **developer/operator**, I want to **query task queue statistics** so that **I can monitor health and identify bottlenecks**.

**Requirement Details:**

1. API/method returns counts per status (PENDING, PROCESSING, COMPLETED, FAILED)
2. Returns worker info: isRunning, lastPollAt
3. List failed tasks with error details

**Acceptance Criteria:**

1. GIVEN tasks in various states WHEN stats queried THEN return per-status counts
2. GIVEN worker running WHEN stats queried THEN isRunning=true, lastPollAt present
3. GIVEN failed tasks WHEN listFailed called THEN return tasks with errors, ordered by completed_at DESC

---

#### STORY 5: Failed Task Retry & Dead Letter

> As a **backend service**, I want **automatic retry with dead letter** so that **transient errors recover but permanent errors don't loop**.

**Requirement Details:**

1. Default max_retries = 3
2. On fail (retry_count < max_retries): reset to PENDING for retry
3. On fail (retry_count >= max_retries): permanent FAILED (dead letter)
4. Non-retryable errors (entry_not_found, invalid_payload): FAILED immediately

**Acceptance Criteria:**

1. GIVEN transient error AND retry_count < max THEN task reset to PENDING
2. GIVEN retry_count >= max THEN task stays FAILED permanently
3. GIVEN non-retryable error THEN FAILED immediately, no retry
4. GIVEN max_retries=3 AND task fails 3 times THEN dead letter

---

#### STORY 6: Remove CodeIntelModule from Backend

> As a **backend maintainer**, I want to **completely remove CodeIntelModule** so that **backend has zero filesystem dependency and no event loop blocking**.

**Requirement Details:**

1. Remove `CodeIntelModule` class and all imports
2. Remove `IndexingEngine`, `DatabaseManager` (code-intel specific), `chokidar` file watcher
3. Remove Tree-sitter dependency from backend (moves to extension)
4. Keep `code_search`, `code_symbols`, `code_modules`, `code_traverse` tool definitions — but re-implement to query PostgreSQL instead of local SQLite
5. Backend code_intel tools become "query-only" — they read from `code_files`, `code_symbols`, `code_dependencies` tables populated by extension uploads
6. Remove `startBackgroundIndexing()` call that blocked event loop

**Acceptance Criteria:**

1. GIVEN backend starts WHEN CodeIntelModule removed THEN no filesystem access attempted
2. GIVEN backend running WHEN no workspace path configured THEN all systems functional
3. GIVEN agent calls `code_search` WHEN data uploaded by extension THEN returns correct results from DB
4. GIVEN agent calls `code_search` WHEN NO data uploaded yet THEN returns empty result (graceful)
5. GIVEN backend process WHEN running THEN event loop never blocked (no `startBackgroundIndexing`)
6. GIVEN `package.json` WHEN reviewed THEN `chokidar`, `web-tree-sitter` NOT in backend dependencies

---

#### STORY 7: Extension Local Scan & Index

> As an **IDE extension**, I want to **scan workspace files and extract code intelligence locally** so that **backend receives structured data without needing filesystem access**.

**Requirement Details:**

1. Extension có `CodeIntelScanner` class chạy trong extension process
2. Scanner sử dụng Tree-sitter (hoặc TypeScript Compiler API) để parse files
3. Extract per-file: symbols (functions, classes, interfaces, variables), imports, exports, call sites
4. Extract cross-file: dependency graph (import → export relationships)
5. Scan triggered on:
   - Workspace open (full scan)
   - File save (incremental — single file re-parse)
   - User command "Re-index workspace" (full scan)
6. Results batched per file vào structured format trước khi upload

**Data Fields (per file upload):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filePath | string | Yes | Relative path from workspace root |
| language | string | Yes | File language (typescript, kotlin, python, etc.) |
| hash | string | Yes | SHA-256 of file content (for dedup/skip) |
| timestamp | string (ISO 8601) | Yes | Thời gian file. Priority: git commit time > fs modified time |
| symbols | Symbol[] | Yes | Extracted symbols with position info |
| imports | Import[] | Yes | Import statements |
| exports | Export[] | Yes | Exported declarations |
| callSites | CallSite[] | No | Function call locations |

**Symbol schema:**

| Field | Type | Description |
|-------|------|-------------|
| name | string | Symbol name |
| kind | enum | function, class, interface, variable, method, property |
| startLine | number | Start line (1-indexed) |
| endLine | number | End line |
| signature | string | Full signature text |
| docComment | string? | JSDoc/KDoc if present |

**Acceptance Criteria:**

1. GIVEN workspace opens WHEN extension activates THEN full scan starts (background, non-blocking)
2. GIVEN file saved WHEN extension detects change THEN only that file re-parsed and uploaded
3. GIVEN large workspace (>1000 files) WHEN scanning THEN UI remains responsive (async, chunked)
4. GIVEN file unchanged (same hash) WHEN scan runs THEN skip — no re-upload
5. GIVEN non-code file (.png, .md) WHEN scanning THEN skipped
6. GIVEN scan complete WHEN all files processed THEN log "Indexed {N} files, {M} symbols"

---

#### STORY 8: Extension Uploads Index Data to Backend

> As an **IDE extension**, I want to **upload scan results to backend via API** so that **backend can store and serve code intelligence queries**.

**Requirement Details:**

1. Extension calls backend MCP tool `code_intel_upload` (hoặc REST endpoint)
2. Upload payload: batch of files with their symbols, imports, exports
3. Backend receives → opens transaction → UPSERT code_files, code_symbols, code_dependencies
4. Backend optionally creates enrichment tasks (CALL_GRAPH_BUILD) via Task Queue
5. Upload supports partial/incremental: chỉ gửi files đã thay đổi (based on hash comparison)
6. Backend tracks `last_indexed_hash` per file → extension can query which files need re-upload

**API Contract:**

```
Tool: code_intel_upload
Input: {
  projectId: string,
  files: [{
    filePath: string,
    language: string,
    hash: string,
    timestamp: string (ISO 8601),  // git commit time or fs modified time
    symbols: Symbol[],
    imports: Import[],
    exports: Export[],
    callSites?: CallSite[]
  }]
}
Output: {
  accepted: number,
  skipped: number (hash unchanged),
  errors: string[]
}
```

**Acceptance Criteria:**

1. GIVEN extension uploads batch WHEN backend receives THEN data persisted in DB
2. GIVEN file hash unchanged WHEN uploaded THEN backend skips (returns in `skipped` count)
3. GIVEN upload of 100 files WHEN processed THEN response < 2s
4. GIVEN network error during upload WHEN extension retries THEN idempotent (no duplicates)
5. GIVEN invalid payload (missing filePath) WHEN uploaded THEN rejected with clear error

---

#### STORY 9: Backend Stores & Serves Code Intelligence Queries

> As a **backend service**, I want to **serve code_search/code_symbols/code_modules/code_traverse from database** so that **agents get code intelligence without backend filesystem access**.

**Requirement Details:**

1. `code_search(query)` → full-text search + vector similarity trên code_symbols table
2. `code_symbols(filePath)` → return all symbols cho file from DB
3. `code_modules()` → return project structure (directories, file counts) from DB
4. `code_traverse(symbol, direction)` → traverse call graph from DB relationships
5. All tools query PostgreSQL — zero filesystem dependency
6. Results same format as trước (backward compatible for agents)

**Acceptance Criteria:**

1. GIVEN data uploaded WHEN `code_search("parseConfig")` called THEN returns matching symbols
2. GIVEN data uploaded WHEN `code_symbols("src/config.ts")` called THEN returns file's symbols
3. GIVEN data uploaded WHEN `code_modules()` called THEN returns project structure tree
4. GIVEN no data uploaded WHEN any code_* tool called THEN returns empty/graceful message
5. GIVEN agent using code_* tools WHEN results returned THEN format identical to previous version

---

#### STORY 10: Incremental Re-index on File Change

> As a **developer**, I want **only changed files re-indexed** so that **index stays fresh without full re-scan overhead**.

**Requirement Details:**

1. Extension watches file changes (VS Code `workspace.onDidSaveTextDocument`)
2. On save: re-parse single file → compare hash with last upload
3. If changed: upload new data for that file only
4. Backend UPSERT: replace old symbols/imports/exports for that file
5. Backend creates CALL_GRAPH_BUILD task if dependencies changed

**Acceptance Criteria:**

1. GIVEN file edited + saved WHEN extension detects THEN only that file re-indexed
2. GIVEN file saved but unchanged (same hash) WHEN checked THEN no upload triggered
3. GIVEN file deleted WHEN extension detects THEN notify backend to remove file data
4. GIVEN new file created WHEN extension detects THEN index and upload
5. GIVEN incremental update WHEN call graph affected THEN enrichment task created

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| PostgreSQL Database | Infrastructure | N/A | sa4e_db at localhost:5432 |
| DatabaseAdapter Interface | System | SA4E-33 | Abstract DB layer (SQLite/Postgres/MySQL) |
| TagAnalyzerService (LLM) | External | N/A | LLM cho tag enrichment (optional) |
| EmbeddingService (ONNX) | External | N/A | Vector embedding generation (optional) |
| MemoryModule | System | N/A | KB module — task queue integrates here |
| RemoteBackendClient | System | N/A | Extension → Backend communication layer |
| Tree-sitter (extension-side) | Library | N/A | AST parsing for code indexing (moves from backend to extension) |
| VS Code API | Platform | N/A | File system events, workspace access |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Developer | Backend Team | Implement task queue, refactor code_intel tools |
| Developer | Extension Team | Implement scanner, uploader |
| System Admin | Ops Team | Monitor queue health |
| End User (indirect) | IDE Extension users | Benefit from faster API + local indexing |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM service unavailable | Medium | Medium | Worker skips TAG_ENRICHMENT, retry later |
| ONNX runtime not loaded | Medium | Medium | Worker skips VECTOR_EMBEDDING, retry later |
| Large workspace scan slow | Medium | High | Chunk processing, async, skip unchanged files (hash check) |
| Network latency for uploads | Low | Medium | Batch uploads, retry with backoff |
| Extension crashes mid-upload | Low | Low | Backend idempotent (hash-based dedup), extension retries on next activation |
| Database full / slow | High | Low | Monitor disk, cleanup old COMPLETED tasks |
| Worker crashes mid-task | Medium | Low | Stale recovery on restart (5 min threshold) |
| Breaking change in code_* tool output format | High | Low | Keep exact same response format (backward compat) |

### 5.2 Assumptions

- PostgreSQL always available khi server running
- FIFO processing acceptable (no priority queue needed)
- Single worker instance per server (no distributed locking)
- LLM + Embedding services optional — system functional without them
- Extension always has filesystem access (runs on user machine)
- Tree-sitter WASM works in VS Code extension context
- Upload batch size ≤ 100 files per request (chunked for larger workspaces)
- `code_*` tools backward-compatible — agents don't need changes

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | API response < 100ms | `mem_ingest` and `code_intel_upload` PHẢI respond quickly |
| Performance | Non-blocking worker | Worker KHÔNG block event loop |
| Performance | Extension scan non-blocking | UI responsive during background indexing |
| Reliability | Crash recovery | 100% pending tasks recovered on restart |
| Reliability | Atomic persistence | Entry + tasks trong cùng 1 transaction |
| Reliability | Upload idempotency | Same hash → skip, no duplicates |
| Scalability | Exponential backoff | Base 2s → max 30s khi idle |
| Scalability | Large workspace support | Handle >1000 files incrementally |
| Data Integrity | No data loss | Persist first, process later |
| Data Integrity | No filesystem dependency | Backend passes without workspace path |
| Configurability | Worker tuning | baseInterval, maxInterval, staleThreshold, maxRetries (env vars) |
| Observability | Queue monitoring | Stats API: pending/processing/completed/failed + worker status |
| Backward Compat | code_* tools unchanged | Agents see same tool interface and response format |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-44 | Persistent Task Queue + Code Intel Migration | In Progress | Story | Main ticket |
| SA4E-33 | Multi-DB Support (DatabaseAdapter) | Done | Story | Dependency |
| SA4E-41 | Multi-project isolation | Done | Story | Related (projectId) |

---

## 8. Appendix

### 8.1 Diagrams

![Business Flow](diagrams/business-flow.png)

![Use Case Diagram](diagrams/use-case.png)

### 8.2 Glossary

| Term | Definition |
|------|------------|
| Persistent Task Queue | Database-backed queue — tasks survive server restart |
| Atomic Transaction | All-or-nothing DB operation |
| Stale Task | PROCESSING task exceeding staleThreshold — likely crashed |
| Dead Letter | Task failed > max_retries — permanently failed |
| Exponential Backoff | Poll interval doubles each idle cycle (2s→4s→8s→...→30s max) |
| DatabaseAdapter | Interface abstraction for SQLite/PostgreSQL/MySQL |
| KB Ingest | Process of writing knowledge entry to database |
| TaskWorker | Background process (same Node.js process) polling and processing tasks |
| CodeIntelScanner | Extension-side component that parses files using Tree-sitter |
| code_intel_upload | Backend API/tool receiving structured code intelligence data from extension |
| RemoteBackendClient | Extension module communicating with backend via MCP StreamableHTTP |

### 8.3 Task Types

| Task Type | Description | Service Required | Part |
|-----------|-------------|-----------------|------|
| TAG_ENRICHMENT | LLM analyzes content → auto-generate tags | TagAnalyzerService | Part 1 |
| VECTOR_EMBEDDING | Generate vector for semantic search | EmbeddingService (ONNX) | Part 1 |
| CALL_GRAPH_BUILD | Build/update call graph from uploaded symbols | Internal (DB queries) | Part 2 |
| IMPACT_ANALYSIS | Compute change impact for modified files | Internal (graph traversal) | Part 2 |

### 8.4 Task Status Lifecycle

```
PENDING → PROCESSING → COMPLETED
                     → FAILED → (retry if retryable) → PENDING
                     → FAILED (permanent — dead letter)
```

### 8.5 Configuration Reference

| Env Variable | Default | Description |
|-------------|---------|-------------|
| TASK_WORKER_BASE_INTERVAL | 2000ms | Base polling interval |
| TASK_WORKER_MAX_INTERVAL | 30000ms | Max backoff interval |
| TASK_WORKER_STALE_THRESHOLD | 300000ms (5 min) | Stale task detection threshold |
| TASK_WORKER_MAX_RETRIES | 3 | Max retry attempts per task |
| CODE_INTEL_UPLOAD_BATCH_SIZE | 100 | Max files per upload batch |

### 8.6 Database Tables (New/Modified)

| Table | Part | Purpose |
|-------|------|---------|
| pending_tasks | Part 1 | Task queue storage |
| knowledge_entries (existing) | Part 1 | KB entries — enriched by tasks |
| code_files | Part 2 | File metadata (path, language, hash, last_indexed) |
| code_symbols | Part 2 | Symbols per file (name, kind, position, signature) |
| code_dependencies | Part 2 | Import/export relationships between files |
| code_call_graph | Part 2 | Function call relationships (caller → callee) |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
