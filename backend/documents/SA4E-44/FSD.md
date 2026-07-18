# Functional Specification Document (FSD)

## SA4E — SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Title | Persistent Task Queue cho KB Ingest + Remove CodeIntelModule from Backend |
| Author | BA Agent |
| Version | 2.2 |
| Date | 2026-07-17 |
| Status | Draft |
| Related BRD | BRD-v3-SA4E-44.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-17 | BA Agent | Initial FSD — Task Queue only |
| 2.0 | 2026-07-17 | BA Agent | **FULL REWRITE** — Dual scope: Part 1 (Task Queue) + Part 2 (Code Intel Migration) |
| 2.1 | 2026-07-17 | BA Agent | Add `timestamp` field per BRD v3.0 — UC-01, UC-06, UC-07, UC-09 + BR-09 + Data Model + API Contracts |
| 2.2 | 2026-07-17 | TA Agent | **Technical Enrichment** — UC edge cases, detailed API contracts (status codes, rate limiting, error format), pseudocode (TaskWorker, atomic ingest, timestamp resolution, hash dedup), integration specs (MCP StreamableHTTP, Task Worker ↔ LLM/ONNX), data model validation (indexes, constraints, FKs), open issues & technical decisions |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior for two interrelated changes to the SA4E backend:
1. **Part 1** — Persistent Task Queue: database-backed enrichment queue with atomic ingest, background worker, crash recovery, monitoring, and retry/dead letter.
2. **Part 2** — Code Intelligence Migration: remove CodeIntelModule from backend, extension handles local scan/index via Tree-sitter, uploads structured data to backend via API, backend stores in PostgreSQL and serves queries.

### 1.2 Scope

**In Scope:**
- Persistent `pending_tasks` table via DatabaseAdapter (PostgreSQL)
- Atomic `mem_ingest` flow: entry + tasks in one transaction
- Background TaskWorker with exponential backoff and crash recovery
- Task monitoring API and retry/dead letter mechanism
- Remove CodeIntelModule, IndexingEngine, chokidar, Tree-sitter from backend
- New `code_intel_upload` tool for extension to backend data transfer
- Re-implement code_search, code_symbols, code_modules, code_traverse as DB queries
- New DB tables: code_files, code_symbols, code_dependencies, code_call_graph
- Enrichment tasks: CALL_GRAPH_BUILD, IMPACT_ANALYSIS via Task Queue
- Incremental re-index on file change (hash-based dedup)

**Out of Scope:**
- Extension UI/UX changes, in-memory queue, real-time streaming, frontend webview panels, LangGraph pipeline changes

### 1.3 Architecture Principles (HARD RULES)

| # | Rule | Rationale |
|---|------|-----------|
| 1 | Backend KHÔNG access filesystem | Backend runs on remote server |
| 2 | Extension reads files, sends structured data to backend | Extension runs on user machine |
| 3 | Backend only receives data, stores DB, processes enrichment | Single responsibility |
| 4 | PostgreSQL via DatabaseAdapter for task queue | Persistent, crash-safe, transactional |
| 5 | Code Intelligence data stored in DB only | No filesystem dependency |

### 1.4 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Persistent Task Queue | Database-backed queue surviving server restart |
| Atomic Transaction | All-or-nothing DB operation |
| Stale Task | PROCESSING task exceeding staleThreshold (likely crashed) |
| Dead Letter | Task failed > max_retries permanently |
| Exponential Backoff | Poll interval doubles each idle cycle (2s to 30s max) |
| DatabaseAdapter | Interface abstraction for SQLite/PostgreSQL/MySQL |
| TaskWorker | Background polling loop processing tasks |
| CodeIntelScanner | Extension-side Tree-sitter parser |
| code_intel_upload | Backend tool receiving code intelligence data |
| UPSERT | INSERT or UPDATE if exists |

### 1.5 References

| Document | Location |
|----------|----------|
| BRD v3.0 | BRD-v3-SA4E-44.docx |
| DatabaseAdapter | backend/src/database/adapters/DatabaseAdapter.ts |
| MemoryModule | backend/src/modules/memory/MemoryModule.ts |
| RemoteBackendClient | extension/src/backend/RemoteBackendClient.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

**Actors and Systems:**
- **VS Code Extension** — scans workspace files locally, uploads code intelligence, triggers mem_ingest
- **Backend Server** — receives data via MCP/HTTP, stores in DB, enrichment via Task Queue
- **PostgreSQL Database** — persistent storage for all data
- **LLM Provider** (optional) — tag analysis enrichment
- **ONNX Runtime** (optional) — vector embedding generation

### 2.2 System Architecture

**Part 1 — Task Queue Subsystem:**
- TaskPersistenceLayer — atomic task creation with entry INSERT
- TaskWorker — background polling, claim, process, complete/fail
- TaskMonitor — queue statistics and diagnostics

**Part 2 — Code Intelligence (Backend receives + stores + queries):**
- CodeIntelReceiver — validates upload, UPSERT to DB tables
- CodeIntelQueryService — serves code_search/code_symbols/code_modules/code_traverse
- EnrichmentTaskCreator — creates CALL_GRAPH_BUILD, IMPACT_ANALYSIS tasks

**Part 2 — Code Intelligence (Extension scans + uploads):**
- CodeIntelScanner — Tree-sitter parse, extract symbols/imports/exports/call sites
- CodeIntelUploader — batch upload to backend via RemoteBackendClient
- FileChangeWatcher — incremental re-index on file change

---

## 3. Functional Requirements

### 3.1 Feature: Atomic Ingest with Task Creation (Part 1)

**Source:** BRD Story 1

#### UC-01: Atomic KB Ingest with Task Persistence

**Use Case ID:** UC-01
**Actor:** MCP Client (Extension or Agent via `mem_ingest` tool)
**Preconditions:** Server running, database connected, MemoryModule initialized
**Postconditions:** Knowledge entry AND enrichment task(s) persisted in same transaction

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Client calls `mem_ingest` | | Provides content, type, tags, source, summary, timestamp |
| 2 | | Validate input | Check content non-empty, type valid |
| 3 | | BEGIN transaction | Open DB transaction via DatabaseAdapter |
| 4 | | INSERT knowledge_entries | Insert entry with timestamp, obtain entry_id |
| 5 | | INSERT pending_tasks (TAG_ENRICHMENT) | If TagAnalyzer available |
| 6 | | INSERT pending_tasks (VECTOR_EMBEDDING) | If EmbeddingService available |
| 7 | | COMMIT transaction | Atomic persist |
| 8 | | Return success | Return entry_id to client (< 100ms) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01.1 | TagAnalyzer not initialized | Skip TAG_ENRICHMENT task; only VECTOR_EMBEDDING |
| AF-01.2 | EmbeddingService not initialized | Skip VECTOR_EMBEDDING; only TAG_ENRICHMENT |
| AF-01.3 | Both services unavailable | No tasks created; entry still persisted (degraded) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01.1 | DB transaction fails | ROLLBACK all; return error to client |
| EF-01.2 | Content empty/invalid | Return validation error; no transaction started |
| EF-01.3 | Database connection lost | Return 503; no data persisted |

---

### 3.2 Feature: Background Task Processing (Part 1)

**Source:** BRD Story 2

#### UC-02: Worker Polls and Processes Tasks

**Use Case ID:** UC-02
**Actor:** System (TaskWorker — internal background process)
**Preconditions:** Server started, TaskWorker initialized, pending tasks exist
**Postconditions:** Task processed — COMPLETED or FAILED

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Poll database | SELECT WHERE status='PENDING' ORDER BY created_at ASC LIMIT 1 |
| 2 | | Claim task | UPDATE status='PROCESSING', started_at=now() (optimistic lock) |
| 3 | | Load payload | Parse JSON payload, resolve entry_id |
| 4 | | Execute by type | TAG_ENRICHMENT or VECTOR_EMBEDDING or CALL_GRAPH_BUILD or IMPACT_ANALYSIS |
| 5 | | Mark COMPLETED | UPDATE status='COMPLETED', completed_at=now() |
| 6 | | Reset backoff | Set interval = baseInterval, poll again |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02.1 | No PENDING tasks | Exponential backoff: interval = min(base * 2^idle_count, 30s) |
| AF-02.2 | Task found after idle | Reset interval to baseInterval (2s) |
| AF-02.3 | Concurrent claim (0 rows updated) | Skip, poll again |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-02.1 | Enrichment service error (retryable) | Increment retry_count; if < max → PENDING; else → FAILED |
| EF-02.2 | Entry deleted before processing | FAILED with error='entry_not_found' (non-retryable) |
| EF-02.3 | Invalid payload JSON | FAILED immediately (non-retryable) |
| EF-02.4 | DB error during update | Log; task stays PROCESSING → recovered by UC-03 |
| EF-02.5 | Service not initialized (TagAnalyzer/Embedding null) | Reset task to PENDING; service may initialize later |
| EF-02.6 | Unknown task_type | FAILED immediately with error='unknown_task_type: {type}' (non-retryable) |

---

### 3.3 Feature: Crash Recovery (Part 1)

**Source:** BRD Story 3

#### UC-03: Recover Stale Tasks on Startup

**Use Case ID:** UC-03
**Actor:** System (Server startup)
**Preconditions:** Server restarting, pending_tasks table exists
**Postconditions:** Stale PROCESSING tasks reset to PENDING

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Detect stale | SELECT WHERE status='PROCESSING' AND started_at < (now - staleThreshold) |
| 2 | | Reset tasks | UPDATE status='PENDING', started_at=NULL |
| 3 | | Log recovery | Log "Recovered {N} stale tasks" |
| 4 | | Start worker | Begin normal polling (UC-02) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03.1 | No stale tasks | Log "clean startup", proceed |
| AF-03.2 | Stale task with retry_count >= max_retries | Mark FAILED instead of reset |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-03.1 | Database unavailable at startup | Retry connection with backoff; block worker until connected |

---

### 3.4 Feature: Task Status Monitoring (Part 1)

**Source:** BRD Story 4

#### UC-04: Query Task Queue Statistics

**Use Case ID:** UC-04
**Actor:** Developer/Operator (via diagnostic API)
**Preconditions:** Server running
**Postconditions:** Statistics returned

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Operator calls stats endpoint | | GET /internal/tasks/stats |
| 2 | | Count by status | GROUP BY status query |
| 3 | | Get worker info | isRunning, lastPollAt |
| 4 | | Return response | JSON with counts + worker status |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04.1 | Request failed tasks list | Return tasks WHERE status='FAILED' ORDER BY completed_at DESC |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04.1 | DB query fails | Return 500 with error message |

---

### 3.5 Feature: Failed Task Retry & Dead Letter (Part 1)

**Source:** BRD Story 5

#### UC-05: Retry Failed Task or Dead Letter

**Use Case ID:** UC-05
**Actor:** System (TaskWorker on failure) / Operator (manual retry)
**Preconditions:** Task processing has failed
**Postconditions:** Task retried or permanently failed

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Catch error | Enrichment throws exception |
| 2 | | Increment retry_count | retry_count += 1 |
| 3 | | Check eligibility | retry_count < max_retries? |
| 4 | | Reset to PENDING | Store error for diagnostics; await next poll |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-05.1 | retry_count >= max_retries | Mark FAILED permanently (dead letter) |
| AF-05.2 | Non-retryable error | FAILED immediately (entry_not_found, invalid_payload) |
| AF-05.3 | Operator calls manual retry | Reset status to PENDING, clear retry_count |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-05.1 | DB error during failure recording | Log; task stays PROCESSING → UC-03 recovery |

---

### 3.6 Feature: Extension Local Scan & Index (Part 2)

**Source:** BRD Story 7

#### UC-06: Extension Scans Workspace and Extracts Code Intelligence

**Use Case ID:** UC-06
**Actor:** VS Code Extension (CodeIntelScanner)
**Preconditions:** Workspace open, extension activated, Tree-sitter WASM loaded
**Postconditions:** Structured code intelligence data extracted for all code files

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Extension activates | | Workspace open event |
| 2 | | Discover code files | Walk workspace, filter by language (ts, kt, py, etc.), skip non-code |
| 3 | | Compute file hashes | SHA-256 of each file content |
| 4 | | Compare with last upload | Query backend for known hashes (or local cache) |
| 5 | | Parse changed files | Tree-sitter parse → extract symbols, imports, exports, call sites |
| 6 | | Resolve timestamp per file | Priority: git last commit time → fs modified time → Date.now() (BR-09) |
| 7 | | Batch results | Group into batches of max 100 files |
| 8 | | Upload to backend | Call code_intel_upload for each batch (UC-07) |
| 9 | | Log completion | "Indexed {N} files, {M} symbols" |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-06.1 | File unchanged (same hash) | Skip — no re-parse, no upload |
| AF-06.2 | Non-code file (.png, .md) | Skip entirely |
| AF-06.3 | Large workspace (>1000 files) | Process in chunks, yield between chunks for UI responsiveness |
| AF-06.4 | User triggers "Re-index workspace" | Full scan ignoring cached hashes |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-06.1 | Tree-sitter parse fails for file | Log warning, skip file, continue |
| EF-06.2 | Backend unreachable | Queue locally, retry on reconnection |
| EF-06.3 | File deleted during scan | Skip, continue |
| EF-06.4 | Git command fails (no git repo) | Fallback to fs modified time for timestamp resolution |
| EF-06.5 | Workspace too large (>10K files) | Warn user, apply language filter, limit to top-level dirs first |
| EF-06.6 | Tree-sitter WASM loading fails | Fallback to regex-based symbol extraction (degraded mode) |

---

### 3.7 Feature: Extension Uploads Index Data to Backend (Part 2)

**Source:** BRD Story 8

#### UC-07: Upload Code Intelligence Batch to Backend

**Use Case ID:** UC-07
**Actor:** VS Code Extension (CodeIntelUploader)
**Preconditions:** Scan completed, batch of file results ready, backend reachable
**Postconditions:** Code intelligence data persisted in backend DB

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Extension calls `code_intel_upload` | | Sends projectId + files[] batch |
| 2 | | Backend validates payload | Check required fields (filePath, language, hash, symbols) |
| 3 | | BEGIN transaction | |
| 4 | | For each file: check hash | Compare with stored last_indexed_hash |
| 5 | | Skip unchanged files | hash matches → increment skipped count |
| 6 | | UPSERT code_files | Insert/update file metadata including timestamp |
| 7 | | DELETE old symbols for file | Remove previous symbols |
| 8 | | INSERT new symbols | Bulk insert all symbols for file |
| 9 | | UPSERT code_dependencies | Update import/export relationships |
| 10 | | COMMIT transaction | |
| 11 | | Create enrichment tasks | CALL_GRAPH_BUILD if dependencies changed |
| 12 | | Return response | { accepted, skipped, errors } |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-07.1 | All files have unchanged hash | Return { accepted: 0, skipped: N, errors: [] } |
| AF-07.2 | Partial failure (some files invalid) | Process valid files, report invalid in errors[] |
| AF-07.3 | File deletion notification | Delete file data from code_files, code_symbols, code_dependencies |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-07.1 | Missing required field (filePath) | Reject entire file entry, include in errors[] |
| EF-07.2 | Transaction fails | ROLLBACK; return 500 with error |
| EF-07.3 | Payload too large | Return 413; extension should reduce batch size |

---

### 3.8 Feature: Backend Serves Code Intelligence Queries (Part 2)

**Source:** BRD Story 9

#### UC-08: Agent Queries Code Intelligence from DB

**Use Case ID:** UC-08
**Actor:** Agent (via code_search, code_symbols, code_modules, code_traverse tools)
**Preconditions:** Code intelligence data uploaded by extension, stored in DB
**Postconditions:** Query results returned from database (backward compatible format)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls code_search(query) | | Full-text + vector similarity search |
| 2 | | Query code_symbols table | WHERE name ILIKE or signature ILIKE |
| 3 | | Rank results | By relevance (text match + vector if available) |
| 4 | | Return results | Same format as previous version |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-08.1 | No data uploaded yet | Return empty result with message "No code indexed" |
| AF-08.2 | code_symbols(filePath) called | SELECT * FROM code_symbols WHERE file_path = ? |
| AF-08.3 | code_modules() called | Aggregate code_files by directory → project structure tree |
| AF-08.4 | code_traverse(symbol, direction) called | Traverse code_call_graph table |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-08.1 | Database query error | Return error with message |
| EF-08.2 | Invalid query parameter | Return validation error |
| EF-08.3 | Query timeout (complex join) | Return partial results with timeout warning |
| EF-08.4 | code_call_graph table empty (enrichment pending) | Return "call graph not yet built" with available symbols |

---

### 3.9 Feature: Incremental Re-index on File Change (Part 2)

**Source:** BRD Story 10

#### UC-09: Re-index Single File on Save

**Use Case ID:** UC-09
**Actor:** VS Code Extension (FileChangeWatcher)
**Preconditions:** Extension active, file saved/created/deleted
**Postconditions:** Only changed file re-indexed and uploaded

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer saves file | | onDidSaveTextDocument event |
| 2 | | Compute new hash | SHA-256 of saved content |
| 3 | | Compare with cached hash | Last upload hash for this file |
| 4 | | If changed: re-parse | Tree-sitter extract symbols/imports/exports |
| 5 | | Resolve timestamp | git last commit time → fs modified time → Date.now() (BR-09) |
| 6 | | Upload single file | Call code_intel_upload with 1-file batch (includes timestamp) |
| 7 | | Update local cache | Store new hash |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-09.1 | Hash unchanged | No upload triggered |
| AF-09.2 | File deleted | Notify backend to remove file data |
| AF-09.3 | New file created | Full parse + upload |
| AF-09.4 | Dependencies changed | Backend creates CALL_GRAPH_BUILD enrichment task |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-09.1 | Backend unreachable | Queue change locally, retry later |
| EF-09.2 | Parse fails | Log warning, skip |

---

### 3.10 Feature: Remove CodeIntelModule from Backend (Part 2)

**Source:** BRD Story 6

#### UC-10: Backend Starts Without CodeIntelModule

**Use Case ID:** UC-10
**Actor:** System (Backend startup)
**Preconditions:** CodeIntelModule removed from codebase
**Postconditions:** Backend functional with zero filesystem access

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Server starts | No CodeIntelModule initialization |
| 2 | | Register code_* tools | code_search, code_symbols, code_modules, code_traverse — query DB |
| 3 | | Register code_intel_upload | Receives extension uploads |
| 4 | | Event loop unblocked | No startBackgroundIndexing call |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-10.1 | No workspace path configured | All systems functional (no filesystem needed) |
| AF-10.2 | Agent calls code_search before any upload | Return empty result gracefully |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-10.1 | DB migration fails for new tables | Log error, code_* tools return "not available" |

---

## 4. Business Rules

| ID | Rule | Description | Source |
|----|------|-------------|--------|
| BR-01 | Atomic Ingest | Entry + enrichment tasks MUST be persisted in a single DB transaction | BRD Story 1 |
| BR-02 | FIFO Processing | Tasks processed in FIFO order (created_at ASC) | BRD Story 2 |
| BR-03 | Exponential Backoff | Worker poll interval doubles each idle cycle: base 2s → max 30s | BRD Story 2 |
| BR-04 | Stale Task Threshold | Task PROCESSING > 5 min without completion → marked stale | BRD Story 3 |
| BR-05 | Max Retries | Task failed > 3 times → dead letter (permanent FAILED) | BRD Story 5 |
| BR-06 | Hash-Based Dedup | File with unchanged SHA-256 hash → skip re-upload/re-index | BRD Story 10 |
| BR-07 | Backend No Filesystem | Backend MUST NOT access filesystem directly — all file data comes from extension | BRD §1.2 |
| BR-08 | Backward Compatible Queries | code_search, code_symbols, code_modules, code_traverse return same format as previous version | BRD Story 9 |
| BR-09 | Timestamp Resolution Priority | Extension MUST resolve timestamp before sending. Priority: (1) git last commit time of file → (2) file system modified time → (3) Date.now(). Backend CANNOT access filesystem, so it CANNOT resolve git/fs times itself. If caller omits timestamp, backend uses server time as fallback. | BRD v3.0 Story 1, 7, 8 |
| BR-10 | Timestamp Usage | Backend stores `timestamp` in knowledge_entries and code_files. Used for sort, filter, and freshness ranking in query results. | BRD v3.0 |

---

## 5. Data Model

### 5.1 knowledge_entries (modified)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID / SERIAL | No | auto | Primary key |
| content | TEXT | No | — | Knowledge entry content |
| type | VARCHAR(50) | No | 'CONTEXT' | Entry type (CONTEXT, DECISION, PATTERN) |
| tags | TEXT | Yes | NULL | Comma-separated tags |
| source | VARCHAR(500) | Yes | NULL | Source identifier |
| summary | VARCHAR(120) | Yes | NULL | Short summary |
| timestamp | TIMESTAMPTZ | No | NOW() | **NEW** — Source data timestamp. Resolved by caller per BR-09. Fallback: server time. |
| created_at | TIMESTAMPTZ | No | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | No | NOW() | Last update time |
| vector | VECTOR(384) | Yes | NULL | Embedding vector (populated by enrichment) |

### 5.2 pending_tasks

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID / SERIAL | No | auto | Primary key |
| entry_id | UUID | Yes | NULL | Reference to knowledge_entries or code_files |
| task_type | VARCHAR(50) | No | — | TAG_ENRICHMENT, VECTOR_EMBEDDING, CALL_GRAPH_BUILD, IMPACT_ANALYSIS |
| status | VARCHAR(20) | No | 'PENDING' | PENDING, PROCESSING, COMPLETED, FAILED |
| payload | JSONB | Yes | NULL | Task-specific data |
| retry_count | INTEGER | No | 0 | Number of retries attempted |
| error | TEXT | Yes | NULL | Last error message |
| created_at | TIMESTAMPTZ | No | NOW() | Task creation time |
| started_at | TIMESTAMPTZ | Yes | NULL | When processing started |
| completed_at | TIMESTAMPTZ | Yes | NULL | When processing finished |

### 5.3 code_files (modified)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID / SERIAL | No | auto | Primary key |
| project_id | VARCHAR(100) | No | — | Project identifier |
| file_path | VARCHAR(500) | No | — | Relative path from workspace root |
| language | VARCHAR(50) | No | — | File language (typescript, kotlin, python, etc.) |
| last_indexed_hash | VARCHAR(64) | No | — | SHA-256 hash of file content at last index |
| timestamp | TIMESTAMPTZ | No | NOW() | **NEW** — File source timestamp. Resolved by extension per BR-09. Fallback: server time. |
| created_at | TIMESTAMPTZ | No | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | No | NOW() | Last update time |

**Unique constraint:** (project_id, file_path)

### 5.4 code_symbols

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID / SERIAL | No | auto | Primary key |
| file_id | UUID | No | — | FK → code_files.id |
| name | VARCHAR(200) | No | — | Symbol name |
| kind | VARCHAR(50) | No | — | function, class, interface, variable, method, property |
| start_line | INTEGER | No | — | Start line (1-indexed) |
| end_line | INTEGER | No | — | End line |
| signature | TEXT | Yes | NULL | Full signature text |
| doc_comment | TEXT | Yes | NULL | JSDoc/KDoc if present |

### 5.5 code_dependencies

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID / SERIAL | No | auto | Primary key |
| source_file_id | UUID | No | — | FK → code_files.id (importer) |
| target_file_path | VARCHAR(500) | No | — | Imported file path (may not exist in DB yet) |
| import_name | VARCHAR(200) | No | — | Imported symbol name |
| import_type | VARCHAR(20) | No | — | named, default, namespace |

### 5.6 code_call_graph

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID / SERIAL | No | auto | Primary key |
| caller_symbol_id | UUID | No | — | FK → code_symbols.id |
| callee_symbol_id | UUID | No | — | FK → code_symbols.id |
| call_line | INTEGER | No | — | Line number of call site |

---

## 6. API Contracts

### 6.1 mem_ingest (MCP Tool)

**Transport:** MCP StreamableHTTP (JSON-RPC 2.0 over HTTP POST)
**Endpoint:** `POST http://localhost:48721/mcp` (backend) or `POST http://localhost:9181/mcp` (extension local wrapper)

**Input Schema:**

```json
{
  "content": "string (required) — Knowledge entry content",
  "type": "string (optional, default: CONTEXT) — CONTEXT | DECISION | PATTERN",
  "tags": "string (optional) — Comma-separated tags",
  "source": "string (optional) — Source identifier",
  "summary": "string (optional, max 120 chars) — Short summary",
  "timestamp": "string (optional, ISO 8601) — Source data timestamp. Extension resolves per BR-09. If omitted, backend uses server time."
}
```

**Output Schema:**

```json
{
  "entry_id": "string — UUID of created entry",
  "tasks_created": "number — Count of enrichment tasks created"
}
```

**HTTP Status Codes (via MCP JSON-RPC response):**

| Status | MCP Error Code | Condition | Description |
|--------|---------------|-----------|-------------|
| 200 | (none) | Success | Entry + tasks created atomically |
| 200 | -32602 | Invalid params | Missing `content`, invalid `type` enum, `summary` > 120 chars |
| 200 | -32603 | Internal error | DB transaction failed / connection lost |
| 503 | -32000 | Service unavailable | Database not connected |

**Error Response Format (MCP JSON-RPC):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Validation error: content is required",
    "data": {
      "field": "content",
      "constraint": "non-empty string"
    }
  }
}
```

**Rate Limiting:**
- No explicit rate limit (internal tool, trusted callers only)
- Backend uses DatabaseAdapter.transaction() — SQLite serializes writes naturally
- For PostgreSQL: connection pool max 10 concurrent connections (configurable)
- Implicit throughput limit: ~500 ingests/sec (transaction overhead)

**Timestamp Behavior:**
- If `timestamp` provided → stored as-is in knowledge_entries.timestamp
- If `timestamp` omitted → backend stores `NOW()` (server time fallback)
- Extension SHOULD always provide timestamp when ingesting file/document content (per BR-09)

### 6.2 code_intel_upload (MCP Tool)

**Transport:** MCP StreamableHTTP (JSON-RPC 2.0 over HTTP POST)
**Endpoint:** `POST http://localhost:48721/mcp` (backend) or `POST http://localhost:9181/mcp` (extension local wrapper)

**Input Schema:**

```json
{
  "projectId": "string (required) — Project identifier",
  "files": [
    {
      "filePath": "string (required) — Relative path from workspace root",
      "language": "string (required) — File language",
      "hash": "string (required) — SHA-256 of file content",
      "timestamp": "string (required, ISO 8601) — File source timestamp resolved by extension per BR-09",
      "symbols": "Symbol[] (required) — Extracted symbols",
      "imports": "Import[] (required) — Import statements",
      "exports": "Export[] (required) — Exported declarations",
      "callSites": "CallSite[] (optional) — Function call locations"
    }
  ]
}
```

**Symbol Schema (detailed):**

```json
{
  "name": "string (required) — Symbol name",
  "kind": "string (required) — function | class | interface | variable | method | property",
  "startLine": "number (required) — Start line (1-indexed)",
  "endLine": "number (required) — End line",
  "signature": "string (optional) — Full signature text",
  "docComment": "string (optional) — JSDoc/KDoc if present"
}
```

**Import Schema:**

```json
{
  "source": "string (required) — Import source path or module name",
  "names": "string[] (required) — Imported symbol names",
  "importType": "string (required) — named | default | namespace"
}
```

**Export Schema:**

```json
{
  "name": "string (required) — Exported symbol name",
  "kind": "string (required) — function | class | interface | variable | type",
  "isDefault": "boolean (required) — Whether it's a default export"
}
```

**CallSite Schema:**

```json
{
  "callerName": "string (required) — Caller function/method name",
  "calleeName": "string (required) — Called function/method name",
  "line": "number (required) — Call site line number",
  "calleeSource": "string (optional) — Module where callee is defined (if resolvable)"
}
```

**Output Schema:**

```json
{
  "accepted": "number — Files successfully processed",
  "skipped": "number — Files skipped (hash unchanged)",
  "errors": "string[] — Error messages for rejected files"
}
```

**HTTP Status Codes (via MCP JSON-RPC response):**

| Status | MCP Error Code | Condition | Description |
|--------|---------------|-----------|-------------|
| 200 | (none) | Success | Batch processed (check `accepted`/`skipped`/`errors`) |
| 200 | -32602 | Invalid params | Missing `projectId`, empty `files[]`, missing required fields |
| 200 | -32603 | Internal error | Transaction ROLLBACK (DB failure) |
| 200 | -32000 | Payload too large | `files.length > 100` — reduce batch size |
| 503 | -32000 | Service unavailable | Database not connected |

**Error Response Format (MCP JSON-RPC):**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32000,
    "message": "Payload too large: 150 files exceeds max batch size of 100",
    "data": {
      "max_batch_size": 100,
      "received": 150
    }
  }
}
```

**Partial Success Response (valid files processed, invalid reported):**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"accepted\": 95, \"skipped\": 3, \"errors\": [\"file src/broken.ts: missing symbols field\", \"file src/bad.kt: invalid language value\"]}"
      }
    ]
  }
}
```

**Rate Limiting:**
- Max batch size: 100 files per request (BR-06 enforcement)
- Recommended interval between batches: 200ms (avoid connection pool exhaustion)
- For large workspaces (>1000 files): chunk into 10 batches with 200ms delays
- Backend processes one transaction per request — no concurrent upload overlap guaranteed

**Timestamp Behavior:**
- `timestamp` field is REQUIRED in code_intel_upload (unlike mem_ingest where it's optional)
- Extension resolves per BR-09: git last commit time → fs modified time → Date.now()
- Backend stores in code_files.timestamp column
- Used for freshness ranking in code_search results

### 6.3 Task Status API (Internal HTTP — Diagnostic)

**Transport:** HTTP REST (not MCP)
**Endpoint:** `GET http://localhost:48721/internal/tasks/stats`
**Auth:** Internal only (no auth required — localhost binding)

**Response Schema:**

```json
{
  "pending": "number",
  "processing": "number",
  "completed": "number",
  "failed": "number",
  "isRunning": "boolean — TaskWorker polling status",
  "lastPollAt": "string | null — ISO 8601 timestamp of last poll"
}
```

**Failed Tasks List:**
**Endpoint:** `GET http://localhost:48721/internal/tasks/failed?limit=20`

```json
{
  "tasks": [
    {
      "id": "number",
      "task_type": "string",
      "entry_id": "number",
      "status": "FAILED",
      "error": "string — Last error message",
      "retry_count": "number",
      "created_at": "string — ISO 8601",
      "completed_at": "string — ISO 8601"
    }
  ]
}
```

**Manual Retry:**
**Endpoint:** `POST http://localhost:48721/internal/tasks/{id}/retry`
**Effect:** Reset status=PENDING, clear retry_count, clear error

---

## 7. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | mem_ingest response time | < 100ms |
| Performance | code_intel_upload (100 files) | < 2s |
| Performance | Worker non-blocking | Event loop never blocked |
| Reliability | Crash recovery | 100% pending tasks recovered |
| Reliability | Atomic persistence | Entry + tasks in same transaction |
| Reliability | Upload idempotency | Same hash → skip (no duplicates) |
| Scalability | Backoff | 2s → 30s max idle |
| Scalability | Large workspace | Handle >1000 files incrementally |
| Data Integrity | Timestamp accuracy | Extension-resolved, ≤ 1s deviation from source |
| Backward Compat | code_* tools | Same interface and response format |

---


---

## 8. Technical Appendix A — Pseudocode for Complex Logic

### 8.1 TaskWorker Polling Loop with Exponential Backoff

```pseudocode
CLASS TaskWorker:
  STATE:
    running: boolean = false
    consecutiveEmpty: number = 0
    processing: boolean = false
    config: { baseInterval: 2000ms, maxInterval: 30000ms, staleThreshold: 300000ms, maxRetries: 3 }

  METHOD start():
    IF running THEN RETURN
    running = true
    LOG "TaskWorker started"
    schedulePoll(delay = 0)

  METHOD stop(): Promise<void>
    running = false
    clearTimeout(pollTimer)
    IF NOT processing THEN RETURN resolve()
    ELSE RETURN new Promise(resolve => shutdownResolve = resolve)

  METHOD schedulePoll(delayMs):
    IF NOT running THEN RETURN
    pollTimer = setTimeout(poll, delayMs)

  METHOD poll(): async
    IF NOT running THEN finishShutdown(); RETURN
    lastPollAt = now()

    TRY:
      task = repo.claimNext()  // SELECT + UPDATE atomic (optimistic lock)

      IF task == null:
        consecutiveEmpty++
        delay = MIN(baseInterval * 2^consecutiveEmpty, maxInterval)
        // Example: 2s, 4s, 8s, 16s, 30s, 30s, 30s...
        schedulePoll(delay)
        RETURN

      // Task found — reset backoff
      consecutiveEmpty = 0
      processing = true
      AWAIT processTask(task)
      processing = false

      IF NOT running THEN finishShutdown(); RETURN
      schedulePoll(baseInterval)  // Poll again quickly

    CATCH err:
      processing = false
      LOG error(err)
      schedulePoll(baseInterval * 2)  // Brief cooldown on error
```


### 8.2 Atomic Ingest Transaction Flow

```pseudocode
FUNCTION handleIngest(content, type, tags, source, summary, timestamp, dbAdapter):
  // Validation
  IF content IS empty THEN RETURN error("content required")
  IF type NOT IN ['CONTEXT', 'DECISION', 'PATTERN'] THEN RETURN error("invalid type")
  IF summary AND len(summary) > 120 THEN summary = summary[0:120]

  // Resolve timestamp (BR-09 — server-side fallback)
  resolvedTimestamp = timestamp ?? NOW()

  tasksCreated = 0
  entryId = null

  // BR-01: Atomic transaction — all or nothing
  dbAdapter.transaction(() => {
    // Step 1: Insert knowledge entry
    entryId = engine.insert({
      content, summary, type, timestamp: resolvedTimestamp,
      tier: tierForType(type),
      scope: scopeCtx.scope ?? 'USER',
      source, tags, user_id: scopeCtx.userId
    })

    // Step 2: Create TAG_ENRICHMENT task (if service available)
    IF tagAnalyzer IS initialized:
      taskRepo.create({
        task_type: 'TAG_ENRICHMENT',
        entry_id: entryId,
        payload: { content: content[0:2000], existing_tags: tags, options: { threshold: 0.7 } }
      })
      tasksCreated++

    // Step 3: Create VECTOR_EMBEDDING task (if service available)
    IF embeddingService IS initialized:
      taskRepo.create({
        task_type: 'VECTOR_EMBEDDING',
        entry_id: entryId,
        payload: { text: (summary + ' ' + content)[0:4000] }
      })
      tasksCreated++
  })
  // If transaction throws -> ROLLBACK -> nothing persisted -> return error

  RETURN { entry_id: entryId, tasks_created: tasksCreated }
```


### 8.3 Timestamp Resolution Algorithm (Extension Side)

```pseudocode
FUNCTION resolveTimestamp(filePath: string, workspaceRoot: string): string
  // Priority 1: Git last commit time for this file
  TRY:
    gitTime = exec("git log -1 --format=%cI -- " + relativePath(filePath, workspaceRoot))
    IF gitTime IS valid ISO 8601:
      RETURN gitTime.trim()
  CATCH:
    // Git not available or not a git repo — continue to fallback

  // Priority 2: File system modified time
  TRY:
    stat = fs.statSync(filePath)
    IF stat.mtime IS valid:
      RETURN stat.mtime.toISOString()
  CATCH:
    // File stat failed — continue to fallback

  // Priority 3: Current time (last resort)
  RETURN new Date().toISOString()

// Usage in CodeIntelScanner:
FOR EACH file IN changedFiles:
  timestamp = resolveTimestamp(file.absolutePath, workspaceRoot)
  uploadPayload.files.push({
    filePath: relativePath(file.absolutePath, workspaceRoot),
    language: detectLanguage(file),
    hash: sha256(file.content),
    timestamp: timestamp,  // REQUIRED field
    symbols: extractSymbols(file),
    imports: extractImports(file),
    exports: extractExports(file),
    callSites: extractCallSites(file)
  })
```


### 8.4 Hash-Based Dedup Logic

```pseudocode
// Extension-side: Decide whether to upload a file
FUNCTION shouldUpload(filePath, content, localHashCache): boolean
  newHash = SHA256(content)
  cachedHash = localHashCache.get(filePath)
  IF cachedHash == newHash:
    RETURN false  // No change -- skip upload (AF-09.1)
  ELSE:
    RETURN true   // Changed -- need to upload

// Backend-side: code_intel_upload handler per file
FUNCTION processFileUpload(file, projectId, db):
  existing = db.get(
    "SELECT id, last_indexed_hash FROM code_files WHERE project_id=? AND file_path=?",
    [projectId, file.filePath]
  )
  IF existing AND existing.last_indexed_hash == file.hash:
    RETURN 'skipped'  // Hash unchanged -- no-op (BR-06)

  db.transaction(() => {
    IF existing:
      db.run("UPDATE code_files SET language=?, last_indexed_hash=?, timestamp=?, updated_at=NOW() WHERE id=?",
        [file.language, file.hash, file.timestamp, existing.id])
      fileId = existing.id
    ELSE:
      result = db.run("INSERT INTO code_files (...) VALUES (...)", [...])
      fileId = result.lastInsertRowid

    db.run("DELETE FROM code_symbols WHERE file_id = ?", [fileId])
    FOR EACH symbol IN file.symbols:
      db.run("INSERT INTO code_symbols (...) VALUES (...)", [...])

    db.run("DELETE FROM code_dependencies WHERE source_file_id = ?", [fileId])
    FOR EACH imp IN file.imports:
      FOR EACH name IN imp.names:
        db.run("INSERT INTO code_dependencies (...) VALUES (...)", [...])
  })
  RETURN 'accepted'
```


---

## 9. Technical Appendix B — Integration Requirements

### 9.1 Extension to Backend Communication Protocol (MCP StreamableHTTP)

**Protocol:** MCP (Model Context Protocol) over StreamableHTTP transport
**Specification:** JSON-RPC 2.0 encapsulated in HTTP POST

**Connection Architecture:**

```
VS Code Extension Process
  +-- RemoteBackendClient
  |     connects to backend at http://localhost:48721/mcp
  |     transport: StreamableHTTP (persistent HTTP connection)
  +-- Local MCP Wrapper Server
        listens on http://localhost:9181/mcp
        proxies tools/call requests to backend
```

**Request Format (tools/call):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "mem_ingest",
    "arguments": {
      "content": "...",
      "type": "CONTEXT",
      "timestamp": "2026-07-17T10:30:00Z"
    }
  }
}
```


**Connection Lifecycle:**

| Phase | Behavior |
|-------|----------|
| Extension activates | RemoteBackendClient.connect() to :48721 |
| Connection established | tools/list fetched, local wrapper starts on :9181 |
| Backend unreachable | Retry with exponential backoff (1s, 2s, 4s... max 30s) |
| Backend restarts | Client auto-reconnects (StreamableHTTP session resume) |
| Extension deactivates | Graceful disconnect, local wrapper stops |

**Timeout Configuration:**

| Operation | Timeout | Behavior on Timeout |
|-----------|---------|---------------------|
| tools/call (standard) | 30s | Return error to caller |
| code_intel_upload (batch) | 120s | Longer timeout for large batches |
| Connection handshake | 10s | Retry with backoff |

**Retry Policy (Extension side):**

| Condition | Action |
|-----------|--------|
| Network error (ECONNREFUSED) | Queue request, retry on reconnect |
| Timeout | Retry once, then return error |
| HTTP 503 | Retry after 5s |
| MCP error -32603 | Do NOT retry (server internal error) |


### 9.2 Task Worker to LLM/ONNX Service Interaction

**TAG_ENRICHMENT (TaskWorker to TagAnalyzerService):**

```
TaskWorker.processTask(task)
  -> TagAnalyzerService.analyzeTags(content, options)
       -> LLM Provider API (Anthropic/OpenAI)
       -> Returns: { appliedTags: string[], confidence: number }
  -> engine.updateTags(entry_id, mergedTags)
  -> repo.markCompleted(task.id)
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| content | task.payload.content (max 2000 chars) | Truncated entry content |
| options.threshold | 0.7 | Minimum confidence for tag application |
| options.autoApply | true | Automatically merge with existing tags |
| LLM timeout | 30s | Per-call timeout |
| Retry on LLM failure | Reset task to PENDING | Retried on next poll cycle |

**VECTOR_EMBEDDING (TaskWorker to EmbeddingService):**

```
TaskWorker.processTask(task)
  -> EmbeddingService.generateEmbedding(text)
       -> ONNX Runtime (all-MiniLM-L6-v2, local inference)
       -> Returns: Float32Array[384]
  -> DB UPDATE knowledge_entries SET vector = ? WHERE id = ?
  -> repo.markCompleted(task.id)
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| text | task.payload.text (max 4000 chars) | summary + content |
| model | all-MiniLM-L6-v2 | 384-dimensional embeddings |
| runtime | ONNX Runtime (local, no network) | Zero external dependency |
| vector storage | BLOB / vector(384) | SQLite: raw bytes; PG: pgvector |

**CALL_GRAPH_BUILD (internal DB logic):**

```
TaskWorker.processTask(task)
  -> Load code_symbols for changed files
  -> Match callSites calleeName against known symbols
  -> UPSERT code_call_graph (caller_symbol_id, callee_symbol_id, call_line)
  -> repo.markCompleted(task.id)
```

**IMPACT_ANALYSIS (internal graph traversal):**

```
TaskWorker.processTask(task)
  -> Identify changed symbols from payload
  -> Traverse code_call_graph REVERSE (who calls this symbol?)
  -> Traverse code_dependencies REVERSE (who imports this file?)
  -> Store impact set in task result
  -> repo.markCompleted(task.id)
```


---

## 10. Technical Appendix C — Data Model Validation

### 10.1 Indexes

| Table | Index Name | Columns | Type | Rationale |
|-------|-----------|---------|------|-----------|
| pending_tasks | idx_tasks_status_created | (status, created_at) | B-tree | Worker poll query |
| pending_tasks | idx_tasks_entry_id | (entry_id) | B-tree | FK lookup |
| pending_tasks | idx_tasks_stale | (status, started_at) | B-tree | Stale detection |
| code_files | idx_code_files_project_path | (project_id, file_path) | UNIQUE | Dedup + lookup |
| code_files | idx_code_files_hash | (project_id, last_indexed_hash) | B-tree | Hash comparison |
| code_symbols | idx_symbols_file_id | (file_id) | B-tree | FK cascade |
| code_symbols | idx_symbols_name | (name) | B-tree | code_search |
| code_symbols | idx_symbols_kind | (kind) | B-tree | Filter by type |
| code_dependencies | idx_deps_source | (source_file_id) | B-tree | Forward traversal |
| code_dependencies | idx_deps_target | (target_file_path) | B-tree | Reverse lookup |
| code_call_graph | idx_callgraph_caller | (caller_symbol_id) | B-tree | Forward call |
| code_call_graph | idx_callgraph_callee | (callee_symbol_id) | B-tree | Reverse call |
| knowledge_entries | idx_entries_timestamp | (timestamp) | B-tree | Freshness sort |
| knowledge_entries | idx_entries_source | (source) | B-tree | Source dedup |

### 10.2 Foreign Key Constraints

| FK Name | From | To | ON DELETE |
|---------|------|----|-----------|
| fk_tasks_entry | pending_tasks.entry_id | knowledge_entries.id | SET NULL |
| fk_symbols_file | code_symbols.file_id | code_files.id | CASCADE |
| fk_deps_source | code_dependencies.source_file_id | code_files.id | CASCADE |
| fk_callgraph_caller | code_call_graph.caller_symbol_id | code_symbols.id | CASCADE |
| fk_callgraph_callee | code_call_graph.callee_symbol_id | code_symbols.id | CASCADE |


**ON DELETE Rationale:**
- `SET NULL` on pending_tasks.entry_id: Task becomes orphaned but remains for audit. Worker handles entry_not_found gracefully (EF-02.2).
- `CASCADE` on code_symbols/deps/call_graph: File deletion cleans all associated data.

### 10.3 Constraints Validation

| Table | Constraint | Type |
|-------|-----------|------|
| pending_tasks | status IN ('PENDING','PROCESSING','COMPLETED','FAILED') | CHECK |
| pending_tasks | task_type IN ('TAG_ENRICHMENT','VECTOR_EMBEDDING','CALL_GRAPH_BUILD','IMPACT_ANALYSIS') | CHECK |
| pending_tasks | retry_count >= 0 | CHECK |
| code_files | (project_id, file_path) UNIQUE | UNIQUE |
| code_symbols | start_line > 0 AND end_line >= start_line | CHECK |
| code_dependencies | import_type IN ('named','default','namespace') | CHECK |

### 10.4 SQLite vs PostgreSQL Considerations

| Feature | SQLite (current) | PostgreSQL (target) |
|---------|------------------|---------------------|
| Transactions | Serialized (single writer) | MVCC (concurrent) |
| Vector column | BLOB (Float32Array) | pgvector vector(384) |
| UPSERT | INSERT OR REPLACE | INSERT ON CONFLICT DO UPDATE |
| Timestamp | TEXT (ISO 8601) | Native TIMESTAMPTZ |
| JSON payload | TEXT + JSON.parse | JSONB native |
| Full-text search | FTS5 | tsvector + GIN |
| Stale detection | datetime('now','-N seconds') | NOW() - INTERVAL |

DatabaseAdapter abstracts these differences at application level.


---

## 11. Technical Appendix D — Open Issues and Technical Decisions

### 11.1 Open Issues

| ID | Issue | Options | Recommendation | Status |
|----|-------|---------|----------------|--------|
| OI-01 | Batch size tuning | 50/100/200 files | 100 default, configurable via env | Decided: 100 |
| OI-02 | PG connection pool size | 5/10/20 | 10 (1 worker + 9 API) | Decided: 10 |
| OI-03 | Completed task cleanup | Never/TTL 7d/30d | TTL 30d, lazy cleanup on poll | Open |
| OI-04 | Code search ranking | BM25/Vector/Hybrid | Hybrid RRF (like mem_search) | Open |
| OI-05 | Cross-project call graph | Ignore/Best-effort | Best-effort, single-project first | Deferred |
| OI-06 | Extension offline queue max | Unbounded/500/1000 | 1000 items, drop oldest beyond | Open |
| OI-07 | Worker concurrency | Single/Pool | Single for v1, no distributed lock | Decided |

### 11.2 Technical Decisions Log

| ID | Decision | Rationale |
|----|----------|-----------|
| TD-01 | DatabaseAdapter.transaction() sync for atomic ingest | SQLite sync; PG adapter wraps BEGIN/COMMIT |
| TD-02 | Optimistic locking for task claim | Single worker = no contention |
| TD-03 | Tag payload truncated to 2000 chars | LLM context efficiency |
| TD-04 | Embedding text = summary+content, max 4000 chars | Captures intent within token budget |
| TD-05 | Extension resolves timestamp, not backend | Backend has no fs access (Rule #1) |
| TD-06 | Transaction per batch (not per file) | Reduces overhead, batch is atomic |
| TD-07 | DELETE+INSERT for symbols (not UPSERT) | No stable natural key across edits |


---

## 12. Technical Appendix E — Security Considerations

### 12.1 Input Validation

| Endpoint | Field | Validation | Max Length |
|----------|-------|-----------|-----------|
| mem_ingest | content | Non-empty string | Unlimited (TEXT) |
| mem_ingest | type | Enum whitelist | 50 chars |
| mem_ingest | summary | Optional | 120 chars (truncated) |
| mem_ingest | timestamp | ISO 8601 or null | 30 chars |
| code_intel_upload | projectId | Non-empty, alphanum+dash | 100 chars |
| code_intel_upload | filePath | Relative, no traversal | 500 chars |
| code_intel_upload | hash | Hex, exactly 64 chars | 64 chars |
| code_intel_upload | files[] | Array, max 100 items | N/A |

### 12.2 Path Traversal Prevention

- filePath MUST NOT contain `../`, absolute paths, or null bytes
- Backend stores paths as-is but NEVER accesses filesystem (Rule #1)
- Normalize with forward slashes before storage

### 12.3 Payload Size Limits

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Max batch size | 100 files | Application check |
| Max symbols per file | 10000 | Application check |
| Max HTTP body | 10MB | Hono server |

### 12.4 Authentication

- MCP on localhost only (:48721, :9181) — no external exposure
- /internal/tasks/* diagnostic API: localhost binding only
- Extension auth: SSO/PKCE (existing flow)

---

## End of Document
