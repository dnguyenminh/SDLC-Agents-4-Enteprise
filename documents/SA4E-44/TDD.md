# Technical Design Document (TDD)

## SA4E — SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Title | Persistent Task Queue cho KB Ingest + Remove CodeIntelModule from Backend |
| Author | SA Agent |
| Version | 2.1 |
| Date | 2026-07-17 |
| Status | Draft |
| Related BRD | BRD-v3-SA4E-44.docx |
| Related FSD | FSD-v2.2-SA4E-44.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | BA Agent – Business Analyst | Review completeness vs requirements |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-17 | SA Agent | Initial TDD — Task Queue only |
| 2.0 | 2026-07-17 | SA Agent | **FULL REWRITE** — Dual scope aligned with FSD v2.2 |
| 2.1 | 2026-07-17 | SA Agent | Security fixes — SEC-01 (mandatory API key auth), SEC-02 (task payload schema validation), SEC-07 (git command injection prevention) |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies the technical design for SA4E-44: a dual-scope change implementing (1) a persistent, database-backed task queue for asynchronous enrichment, and (2) migration of code intelligence from backend-local processing to extension-driven scan+upload architecture.

### 1.2 Scope

**Part 1 — Persistent Task Queue:**
- TaskPersistenceLayer: atomic task creation within ingest transaction
- TaskWorker: background polling with exponential backoff, crash recovery
- TaskMonitor: diagnostic stats API

**Part 2 — Code Intelligence Migration:**
- Backend: CodeIntelReceiver (validate+UPSERT), CodeIntelQueryService (DB queries), EnrichmentTaskCreator
- Extension: CodeIntelScanner (Tree-sitter), CodeIntelUploader (batch), FileChangeWatcher (incremental)
- Remove existing CodeIntelModule, IndexingEngine, chokidar, Tree-sitter from backend

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language (Backend) | TypeScript / Node.js | ES2022 / Node 20+ |
| Framework | Hono | 4.x |
| Database | PostgreSQL via DatabaseAdapter | 15+ |
| Protocol | MCP StreamableHTTP (JSON-RPC 2.0) | 1.0 |
| Language (Extension) | TypeScript | 5.x |
| Extension Host | VS Code API | 1.85+ |
| Parser (Extension) | Tree-sitter WASM | 0.22+ |

### 1.4 Design Principles

- **Backend No Filesystem** — Backend NEVER accesses filesystem (HARD RULE)
- **Extension as Data Source** — Extension reads files, resolves timestamps, sends structured data
- **Persist First, Process Later** — Atomic write before async enrichment
- **Graceful Degradation** — System functional without LLM/ONNX services
- **Backward Compatibility** — code_* tools return same format as before

### 1.5 Constraints

- Single TaskWorker instance per server (no distributed locking)
- DatabaseAdapter abstraction must support SQLite AND PostgreSQL
- Extension must handle offline/disconnected gracefully
- Max batch size: 100 files per upload request
- Worker must never block the Node.js event loop

### 1.6 References

| Document | Location |
|----------|----------|
| BRD v3.0 | BRD-v3-SA4E-44.docx |
| FSD v2.2 | FSD-v2.2-SA4E-44.docx |
| DatabaseAdapter | backend/src/database/adapters/DatabaseAdapter.ts |
| MemoryModule | backend/src/modules/memory/MemoryModule.ts |
| RemoteBackendClient | extension/src/remote-backend-client.ts |

---

## 2. System Architecture

### 2.1 Architecture Overview

![Architecture Diagram](diagrams/architecture.png)

The system splits into two deployment units communicating via MCP StreamableHTTP:

**Backend Server (Node.js / Hono):**
- MemoryModule — KB ingest with atomic task creation
- TaskQueue — TaskWorker, TaskMonitor, PendingTaskRepository
- CodeIntelReceiver — validates and persists uploaded code intelligence
- CodeIntelQueryService — serves code_search/code_symbols/code_modules/code_traverse
- EnrichmentTaskCreator — creates CALL_GRAPH_BUILD, IMPACT_ANALYSIS tasks

**VS Code Extension:**
- CodeIntelScanner — Tree-sitter WASM parse, symbol extraction
- CodeIntelUploader — batch upload via RemoteBackendClient
- FileChangeWatcher — incremental re-index on file change

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| TaskPersistenceLayer | CRUD pending_tasks, atomic create in transactions | DatabaseAdapter |
| TaskWorker | Background polling, claim, process, retry/dead-letter | setTimeout loop |
| TaskMonitor | Stats API, failed task listing, manual retry | Hono REST |
| CodeIntelReceiver | Validate upload, UPSERT to DB tables | DatabaseAdapter |
| CodeIntelQueryService | Query code_files/symbols/deps/call_graph | DatabaseAdapter |
| EnrichmentTaskCreator | Create enrichment tasks on dependency changes | PendingTaskRepository |
| CodeIntelScanner | Parse files, extract symbols/imports/exports | Tree-sitter WASM |
| CodeIntelUploader | Batch upload, retry, offline queue | RemoteBackendClient |
| FileChangeWatcher | Watch saves, compute hash, trigger re-index | VS Code API |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern |
|------|----|----------|---------|
| Extension | Backend | MCP StreamableHTTP | Request/Response |
| Agent | Backend | MCP StreamableHTTP | Request/Response |
| TaskWorker | TagAnalyzer | Internal async | Await |
| TaskWorker | EmbeddingService | Internal async | Await |
| TaskWorker | DB | Internal sync | DatabaseAdapter |

---

## 3. Module Design

### 3.1 Part 1 — Task Queue Module Structure

**Location:** `backend/src/modules/memory/task-queue/`

`
task-queue/
├── models.ts                 # TaskType, TaskStatus, PendingTask, CreateTaskInput
├── PendingTaskRepository.ts  # CRUD operations via DatabaseAdapter
├── TaskWorker.ts             # Polling loop, exponential backoff, dispatch
├── TaskWorkerConfig.ts       # Config interface + defaults
├── TaskMonitor.ts            # NEW — Stats endpoint handlers
├── TaskProcessors.ts         # NEW — Strategy per task_type
├── admin-handlers.ts         # Admin API route handlers
└── index.ts                  # Barrel exports
`

**Key Design Decisions:**
- TaskWorker uses `setTimeout` (not `setInterval`) for backoff control
- PendingTaskRepository uses optimistic locking (SELECT then UPDATE WHERE status=PENDING)
- TaskProcessors use Strategy pattern — one processor per TaskType
- Atomic ingest handled in MemoryToolDispatcher via `DatabaseAdapter.transaction()`

### 3.2 Part 2 — Code Intelligence Module Structure (Backend)

**Location:** `backend/src/modules/code-intel/` (REWRITTEN — replaces old CodeIntelModule)

`
code-intel/
├── CodeIntelModule.ts          # IModule implementation, tool registration
├── receiver/
│   ├── CodeIntelReceiver.ts    # Validate + UPSERT logic
│   ├── PayloadValidator.ts     # Input validation (path traversal, schema)
│   └── models.ts               # Upload DTOs (FileUpload, Symbol, Import, etc.)
├── query/
│   ├── CodeIntelQueryService.ts # Query dispatcher
│   ├── CodeSearchHandler.ts     # code_search implementation (ILIKE + vector)
│   ├── CodeSymbolsHandler.ts    # code_symbols implementation
│   ├── CodeModulesHandler.ts    # code_modules implementation
│   └── CodeTraverseHandler.ts   # code_traverse implementation
├── enrichment/
│   ├── EnrichmentTaskCreator.ts # Creates CALL_GRAPH_BUILD, IMPACT_ANALYSIS
│   ├── CallGraphBuilder.ts      # Processes CALL_GRAPH_BUILD tasks
│   └── ImpactAnalyzer.ts        # Processes IMPACT_ANALYSIS tasks
└── index.ts                     # Barrel exports
`

### 3.3 Part 2 — Code Intelligence (Extension Side)

**Location:** `extension/src/code-intel/` (NEW directory)

`
code-intel/
├── CodeIntelScanner.ts        # Tree-sitter parse, extract symbols
├── CodeIntelUploader.ts       # Batch upload, retry logic
├── FileChangeWatcher.ts       # onDidSave/Create/Delete handlers
├── TimestampResolver.ts       # git > fs > now priority (BR-09)
├── HashCache.ts               # Local hash cache for dedup
├── OfflineQueue.ts            # Queue changes when backend unreachable
└── models.ts                  # Shared types (FileUploadPayload, Symbol, etc.)
`

#### 3.3.1 TimestampResolver — Command Injection Prevention (SEC-07)

`TimestampResolver` executes git commands with file paths. To prevent command injection via adversarial filenames:

**MUST use `execFile` (array-based args), NOT `exec` (shell interpolated):**

```typescript
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

// Metacharacter validation — reject paths with shell-dangerous characters
const SHELL_META_PATTERN = /[;&|`$(){}[\]!#~<>*?\n\r]/;

function validateFilePathForExec(filePath: string): boolean {
  if (SHELL_META_PATTERN.test(filePath)) return false;
  if (filePath.includes('..')) return false;
  if (filePath.includes('\0')) return false;
  return true;
}

export class TimestampResolver implements ITimestampResolver {
  async resolve(filePath: string, workspaceRoot: string): Promise<string> {
    // SEC-07: Validate filename before passing to git
    if (!validateFilePathForExec(filePath)) {
      // Fallback to fs.stat mtime for unsafe filenames
      return this.resolveFromFsStat(filePath, workspaceRoot);
    }

    return new Promise((resolve) => {
      // SEC-07: MUST use execFile (array args, no shell interpolation)
      execFile(
        'git',
        ['log', '-1', '--format=%aI', '--', filePath],
        { cwd: workspaceRoot, timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout.trim()) {
            // Fallback: fs.stat → now
            this.resolveFromFsStat(filePath, workspaceRoot).then(resolve);
            return;
          }
          resolve(stdout.trim());
        }
      );
    });
  }

  private async resolveFromFsStat(filePath: string, workspaceRoot: string): Promise<string> {
    try {
      const stat = await fs.stat(path.join(workspaceRoot, filePath));
      return stat.mtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}
```

**Rules:**
- ⛔ NEVER use `child_process.exec()` — shell interpolation enables injection
- ✅ ALWAYS use `child_process.execFile()` — args passed as array, no shell
- Validate filename does NOT contain shell metacharacters before passing to any subprocess
- If filename fails validation → fallback to `fs.stat` mtime (safe, no subprocess)
- Add `timeout: 5000` to prevent hung git processes

---

## 4. Class / Interface Design

### 4.1 Core Interfaces (Backend)

```typescript
// === Task Queue Interfaces ===

interface ITaskRepository {
  create(input: CreateTaskInput): number;
  claimNext(): PendingTask | null;
  markCompleted(id: number): void;
  markFailed(id: number, error: string): void;
  resetForRetry(id: number): void;
  recoverStaleTasks(thresholdMs: number): number;
  getStats(): TaskQueueStats;
  listFailed(limit?: number): PendingTask[];
  retryTask(id: number): void;
}

interface ITaskProcessor {
  readonly taskType: TaskType;
  canProcess(): boolean;           // Service available?
  process(task: PendingTask): Promise<void>;
}

interface ICodeIntelReceiver {
  uploadBatch(projectId: string, files: FileUploadPayload[]): UploadResult;
  deleteFile(projectId: string, filePath: string): void;
}

interface ICodeIntelQueryService {
  codeSearch(query: string, projectId?: string): SearchResult[];
  codeSymbols(filePath: string, projectId?: string): SymbolResult[];
  codeModules(projectId?: string): ModuleTree;
  codeTraverse(symbol: string, direction: 'callers' | 'callees', projectId?: string): TraverseResult[];
}

interface IEnrichmentTaskCreator {
  createCallGraphTask(fileIds: number[]): void;
  createImpactAnalysisTask(changedSymbolIds: number[]): void;
}
```

### 4.2 Task Queue Models (Extended)

```typescript
// backend/src/modules/memory/task-queue/models.ts

export enum TaskType {
  TAG_ENRICHMENT = 'TAG_ENRICHMENT',
  VECTOR_EMBEDDING = 'VECTOR_EMBEDDING',
  CALL_GRAPH_BUILD = 'CALL_GRAPH_BUILD',     // NEW — Part 2
  IMPACT_ANALYSIS = 'IMPACT_ANALYSIS',       // NEW — Part 2
}

export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface PendingTask {
  id: number;
  task_type: TaskType;
  entry_id: number | null;       // nullable for code-intel tasks
  status: TaskStatus;
  payload: string;               // JSON string
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CreateTaskInput {
  task_type: TaskType;
  entry_id?: number | null;
  payload: object;
  max_retries?: number;          // default: 3
}
```

### 4.3 Code Intelligence Upload DTOs

```typescript
// backend/src/modules/code-intel/receiver/models.ts

export interface FileUploadPayload {
  filePath: string;
  language: string;
  hash: string;                  // SHA-256 hex, 64 chars
  timestamp: string;             // ISO 8601, resolved by extension (BR-09)
  symbols: SymbolPayload[];
  imports: ImportPayload[];
  exports: ExportPayload[];
  callSites?: CallSitePayload[];
}

export interface SymbolPayload {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'method' | 'property';
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
}

export interface ImportPayload {
  source: string;
  names: string[];
  importType: 'named' | 'default' | 'namespace';
}

export interface ExportPayload {
  name: string;
  kind: string;
  isDefault: boolean;
}

export interface CallSitePayload {
  callerName: string;
  calleeName: string;
  line: number;
  calleeSource?: string;
}

export interface UploadResult {
  accepted: number;
  skipped: number;
  errors: string[];
}
```

### 4.4 Extension-Side Interfaces

```typescript
// extension/src/code-intel/models.ts

export interface ICodeIntelScanner {
  scanWorkspace(rootPath: string): Promise<FileUploadPayload[]>;
  scanFile(filePath: string): Promise<FileUploadPayload | null>;
}

export interface ICodeIntelUploader {
  uploadBatch(files: FileUploadPayload[]): Promise<UploadResult>;
  getProjectId(): string;
}

export interface IFileChangeWatcher {
  activate(context: vscode.ExtensionContext): void;
  dispose(): void;
}

export interface ITimestampResolver {
  resolve(filePath: string, workspaceRoot: string): Promise<string>;
}

export interface IHashCache {
  get(filePath: string): string | undefined;
  set(filePath: string, hash: string): void;
  clear(): void;
}
```

### 4.5 Design Patterns Applied

| Pattern | Where | Rationale |
|---------|-------|-----------|
| Strategy | TaskProcessors (one per TaskType) | Open/Closed — add task types without modifying worker |
| Repository | PendingTaskRepository, CodeIntelReceiver | Encapsulate DB access behind interface |
| Observer | FileChangeWatcher → CodeIntelUploader | Decoupled file events from upload logic |
| Facade | CodeIntelQueryService | Single entry for 4 query types |
| Template Method | BaseTaskProcessor | Shared error handling, specific process() |
| Factory | TaskProcessorFactory | Create correct processor for task_type |

---

## 5. API Design

### 5.1 MCP Tool Registration

| # | Tool Name | Module | Handler | Source |
|---|-----------|--------|---------|--------|
| 1 | mem_ingest | MemoryModule | MemoryToolDispatcher.handleIngest() | UC-01 |
| 2 | code_intel_upload | CodeIntelModule | CodeIntelReceiver.uploadBatch() | UC-07 |
| 3 | code_search | CodeIntelModule | CodeSearchHandler.handle() | UC-08 |
| 4 | code_symbols | CodeIntelModule | CodeSymbolsHandler.handle() | UC-08 |
| 5 | code_modules | CodeIntelModule | CodeModulesHandler.handle() | UC-08 |
| 6 | code_traverse | CodeIntelModule | CodeTraverseHandler.handle() | UC-08 |

### 5.2 Internal REST Endpoints (Diagnostic)

| # | Method | Path | Handler | Auth |
|---|--------|------|---------|------|
| 1 | GET | /internal/tasks/stats | TaskMonitor.getStats() | localhost only |
| 2 | GET | /internal/tasks/failed | TaskMonitor.listFailed() | localhost only |
| 3 | POST | /internal/tasks/:id/retry | TaskMonitor.retryTask() | localhost only |

### 5.3 Tool: mem_ingest (Enhanced — UC-01)

**Input additions (backward compatible):**

| Field | Type | Required | New? |
|-------|------|----------|------|
| content | string | Yes | No |
| type | string | No | No |
| tags | string | No | No |
| source | string | No | No |
| summary | string | No | No |
| timestamp | string (ISO 8601) | No | **YES** — BR-09 |

**Processing flow:**
1. Validate input (content non-empty, type enum, summary ≤120)
2. Resolve timestamp: use provided or fallback to NOW()
3. Open transaction via DatabaseAdapter.transaction()
4. INSERT knowledge_entries → get entry_id
5. IF TagAnalyzer available → INSERT pending_tasks (TAG_ENRICHMENT)
6. IF EmbeddingService available → INSERT pending_tasks (VECTOR_EMBEDDING)
7. COMMIT transaction
8. Return { entry_id, tasks_created }

### 5.4 Tool: code_intel_upload (NEW — UC-07)

**Input Schema:**
```json
{
  "projectId": "string (required)",
  "files": "FileUploadPayload[] (required, max 100)"
}
```

**Processing flow:**
1. Validate projectId non-empty, files.length ≤ 100
2. Validate each file: filePath (no traversal), hash (64 hex), timestamp (ISO 8601)
3. Open transaction
4. For each file:
   a. Check hash against stored last_indexed_hash
   b. If unchanged → skip, increment skipped counter
   c. UPSERT code_files (INSERT or UPDATE)
   d. DELETE old code_symbols for file
   e. BULK INSERT new code_symbols
   f. DELETE old code_dependencies for file
   g. INSERT new code_dependencies
5. COMMIT transaction
6. If any dependencies changed → EnrichmentTaskCreator.createCallGraphTask()
7. Return { accepted, skipped, errors }

### 5.5 Tool: code_search (Reimplemented — UC-08)

**Query strategy:**
```sql
SELECT cs.*, cf.file_path, cf.language
FROM code_symbols cs
JOIN code_files cf ON cs.file_id = cf.id
WHERE cf.project_id = ?
  AND (cs.name ILIKE ? OR cs.signature ILIKE ?)
ORDER BY cf.timestamp DESC
LIMIT 50
```

If vector search available (pgvector), combine with RRF ranking.

### 5.6 Endpoint: GET /internal/tasks/stats

**Response:**
```json
{
  "pending": 5,
  "processing": 1,
  "completed": 234,
  "failed": 2,
  "isRunning": true,
  "lastPollAt": "2026-07-17T10:30:00Z"
}
```

---

## 6. Database Design

### 6.1 Migration Scripts

#### Migration 003: pending_tasks (EXISTING — extend)

```sql
-- Already exists, add new task_types to CHECK constraint
ALTER TABLE pending_tasks DROP CONSTRAINT IF EXISTS chk_task_type;
ALTER TABLE pending_tasks ADD CONSTRAINT chk_task_type
  CHECK (task_type IN ('TAG_ENRICHMENT','VECTOR_EMBEDDING','CALL_GRAPH_BUILD','IMPACT_ANALYSIS'));

-- Make entry_id nullable (code-intel tasks don't reference knowledge_entries)
ALTER TABLE pending_tasks ALTER COLUMN entry_id DROP NOT NULL;
```

#### Migration 004: code_files

```sql
CREATE TABLE IF NOT EXISTS code_files (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  language VARCHAR(50) NOT NULL,
  last_indexed_hash VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_code_files_project_path UNIQUE (project_id, file_path)
);

CREATE INDEX idx_code_files_project_path ON code_files (project_id, file_path);
CREATE INDEX idx_code_files_hash ON code_files (project_id, last_indexed_hash);
```

#### Migration 005: code_symbols

```sql
CREATE TABLE IF NOT EXISTS code_symbols (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(50) NOT NULL,
  start_line INTEGER NOT NULL CHECK (start_line > 0),
  end_line INTEGER NOT NULL CHECK (end_line >= start_line),
  signature TEXT,
  doc_comment TEXT
);

CREATE INDEX idx_symbols_file_id ON code_symbols (file_id);
CREATE INDEX idx_symbols_name ON code_symbols (name);
CREATE INDEX idx_symbols_kind ON code_symbols (kind);
```

#### Migration 006: code_dependencies

```sql
CREATE TABLE IF NOT EXISTS code_dependencies (
  id SERIAL PRIMARY KEY,
  source_file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  target_file_path VARCHAR(500) NOT NULL,
  import_name VARCHAR(200) NOT NULL,
  import_type VARCHAR(20) NOT NULL CHECK (import_type IN ('named','default','namespace'))
);

CREATE INDEX idx_deps_source ON code_dependencies (source_file_id);
CREATE INDEX idx_deps_target ON code_dependencies (target_file_path);
```

#### Migration 007: code_call_graph

```sql
CREATE TABLE IF NOT EXISTS code_call_graph (
  id SERIAL PRIMARY KEY,
  caller_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
  callee_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
  call_line INTEGER NOT NULL
);

CREATE INDEX idx_callgraph_caller ON code_call_graph (caller_symbol_id);
CREATE INDEX idx_callgraph_callee ON code_call_graph (callee_symbol_id);
```

#### Migration 008: knowledge_entries timestamp column

```sql
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_entries_timestamp ON knowledge_entries (timestamp);
```

### 6.2 Index Strategy

| Table | Index | Purpose | Query Pattern |
|-------|-------|---------|---------------|
| pending_tasks | (status, created_at) | Worker poll FIFO | WHERE status='PENDING' ORDER BY created_at |
| pending_tasks | (status, started_at) | Stale detection | WHERE status='PROCESSING' AND started_at < threshold |
| code_files | (project_id, file_path) UNIQUE | Dedup + UPSERT | WHERE project_id=? AND file_path=? |
| code_symbols | (file_id) | FK cascade + bulk delete | DELETE WHERE file_id=? |
| code_symbols | (name) | code_search | WHERE name ILIKE ? |
| code_dependencies | (source_file_id) | Forward traversal | WHERE source_file_id=? |
| code_dependencies | (target_file_path) | Reverse lookup | WHERE target_file_path=? |
| code_call_graph | (caller_symbol_id) | Forward call | WHERE caller_symbol_id=? |
| code_call_graph | (callee_symbol_id) | Reverse call (impact) | WHERE callee_symbol_id=? |

### 6.3 DatabaseAdapter Usage Pattern

All DB operations go through the `DatabaseAdapter` interface:

```typescript
// Transaction usage (atomic ingest)
const result = this.db.transaction(() => {
  const entry = this.db.run('INSERT INTO knowledge_entries ...', [...]);
  this.db.run('INSERT INTO pending_tasks ...', [...]);
  return entry.lastInsertRowid;
});

// Prepared statement for bulk operations
const insertSymbol = this.db.prepare(
  'INSERT INTO code_symbols (file_id, name, kind, start_line, end_line, signature, doc_comment) VALUES (?,?,?,?,?,?,?)'
);
for (const sym of symbols) {
  insertSymbol.run(fileId, sym.name, sym.kind, sym.startLine, sym.endLine, sym.signature, sym.docComment);
}
```

### 6.4 SQLite Compatibility

For SQLite (development/testing), the MigrationRunner adapts SQL:
- `SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `TIMESTAMPTZ` → `TEXT` (ISO 8601 strings)
- `ILIKE` → `LIKE` (case-insensitive by default in SQLite)
- `ON CONFLICT DO UPDATE` → `INSERT OR REPLACE`

---

## 7. Error Handling & Resilience

### 7.1 Task Worker Retry Logic

#### 7.1.1 Task Payload Schema Validation (SEC-02 — Mandatory)

All task payloads are validated **at creation time** before persisting to the database. Invalid payloads are rejected immediately and never stored.

```typescript
// backend/src/modules/memory/task-queue/TaskSchemas.ts

import { z } from 'zod';

const TagEnrichmentSchema = z.object({
  entry_id: z.number().int().positive(),
  content_preview: z.string().max(500).optional(),
});

const VectorEmbeddingSchema = z.object({
  entry_id: z.number().int().positive(),
  content: z.string().min(1).max(50000),
  model: z.string().optional(),
});

const CallGraphBuildSchema = z.object({
  file_ids: z.array(z.number().int().positive()).min(1).max(100),
  project_id: z.string().min(1).max(100),
});

const ImpactAnalysisSchema = z.object({
  changed_symbol_ids: z.array(z.number().int().positive()).min(1).max(500),
  project_id: z.string().min(1).max(100),
});

export const TASK_SCHEMAS: Record<TaskType, z.ZodSchema> = {
  [TaskType.TAG_ENRICHMENT]: TagEnrichmentSchema,
  [TaskType.VECTOR_EMBEDDING]: VectorEmbeddingSchema,
  [TaskType.CALL_GRAPH_BUILD]: CallGraphBuildSchema,
  [TaskType.IMPACT_ANALYSIS]: ImpactAnalysisSchema,
};

/**
 * Validates task payload against its schema BEFORE persisting.
 * Throws ZodError with detailed path info on invalid payload.
 */
export function validateTaskPayload(taskType: TaskType, payload: object): void {
  const schema = TASK_SCHEMAS[taskType];
  if (!schema) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  schema.parse(payload); // throws ZodError if invalid
}
```

**Integration in TaskPersistenceLayer:**

```typescript
// PendingTaskRepository.create() — validation gate
create(input: CreateTaskInput): number {
  // SEC-02: Validate payload schema BEFORE inserting
  validateTaskPayload(input.task_type, input.payload);

  // Only reaches DB if validation passes
  const result = this.db.run(
    'INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries) VALUES (?,?,?,?,?)',
    [input.task_type, input.entry_id ?? null, 'PENDING', JSON.stringify(input.payload), input.max_retries ?? 3]
  );
  return result.lastInsertRowid as number;
}
```

**Behavior:**
- Invalid payload → `ZodError` thrown → caller receives error response → task NOT persisted
- Unknown `TaskType` → `Error` thrown → reject immediately
- Valid payload → proceed to INSERT
- Worker does NOT re-validate at processing time (already validated at creation)

#### 7.1.2 Retry Classification

```
On task failure:
  1. Determine if error is retryable:
     - NON-RETRYABLE: entry_not_found, invalid_json_payload, unknown_task_type
     - RETRYABLE: service_unavailable, timeout, transient_db_error
  2. If non-retryable → markFailed() immediately (dead letter)
  3. If retryable AND retry_count < max_retries → resetForRetry() (back to PENDING)
  4. If retryable AND retry_count >= max_retries → markFailed() (dead letter)
```

### 7.2 Circuit Pattern (TaskWorker ↔ External Services)

| Service | Failure Mode | Recovery |
|---------|-------------|----------|
| TagAnalyzer (LLM) | API timeout / rate limit | Reset task to PENDING, retry next cycle |
| EmbeddingService (ONNX) | Model not loaded | Reset task to PENDING, service may load later |
| Database | Connection lost | Worker enters error backoff (baseInterval * 2) |

**No formal circuit breaker in v1** — single worker with retry is sufficient. If LLM/ONNX unavailable, tasks accumulate as PENDING and process once service recovers.

### 7.3 Graceful Degradation Matrix

| Condition | System Behavior |
|-----------|----------------|
| TagAnalyzer unavailable | mem_ingest succeeds, TAG_ENRICHMENT task not created |
| EmbeddingService unavailable | mem_ingest succeeds, VECTOR_EMBEDDING task not created |
| Both services unavailable | Entries persisted, no enrichment tasks (AF-01.3) |
| Database connection lost | All tools return error 503 / -32000 |
| Extension offline | Changes queued in OfflineQueue, uploaded on reconnect |
| Backend unreachable from extension | Extension queues locally, retries with backoff |

### 7.4 Crash Recovery (UC-03)

On server startup, before TaskWorker.start():
```typescript
recoverStaleTasks():
  1. SELECT * FROM pending_tasks WHERE status='PROCESSING' AND started_at < (NOW - staleThreshold)
  2. For each stale task:
     a. If retry_count >= max_retries → mark FAILED (AF-03.2)
     b. Else → UPDATE status='PENDING', started_at=NULL
  3. Log "Recovered {N} stale tasks"
```

### 7.5 Extension Error Handling

| Error | Extension Action |
|-------|-----------------|
| Tree-sitter parse fails | Log warning, skip file, continue scan (EF-06.1) |
| Backend unreachable | Queue in OfflineQueue, retry on reconnect (EF-06.2) |
| Upload timeout (120s) | Retry once with smaller batch |
| Hash computation fails | Skip file, log error |
| Git command fails | Fallback to fs.stat mtime (EF-06.4) |
| Workspace > 10K files | Warn user, apply language filter (EF-06.5) |

---

## 8. Configuration

### 8.1 Environment Variables

| Variable | Default | Type | Description |
|----------|---------|------|-------------|
| TASK_WORKER_BASE_INTERVAL | 2000 | ms | Base polling interval |
| TASK_WORKER_MAX_INTERVAL | 30000 | ms | Max backoff interval |
| TASK_WORKER_STALE_THRESHOLD | 300000 | ms | Stale task detection (5 min) |
| TASK_WORKER_MAX_RETRIES | 3 | int | Max retry attempts per task |
| CODE_INTEL_UPLOAD_BATCH_SIZE | 100 | int | Max files per upload request |
| CODE_INTEL_MAX_SYMBOLS_PER_FILE | 10000 | int | Payload size guard |
| DB_POOL_MAX | 10 | int | PostgreSQL connection pool max |
| HTTP_BODY_LIMIT | 10485760 | bytes | 10MB max request body |

### 8.2 Extension Settings (VS Code)

| Setting | Default | Description |
|---------|---------|-------------|
| kiroSdlc.codeIntel.enabled | true | Enable/disable code intelligence scanning |
| kiroSdlc.codeIntel.languages | ["typescript","javascript","kotlin","python"] | Languages to index |
| kiroSdlc.codeIntel.excludePatterns | ["**/node_modules/**","**/dist/**"] | Glob patterns to skip |
| kiroSdlc.codeIntel.batchSize | 50 | Files per upload batch |
| kiroSdlc.codeIntel.debounceMs | 1000 | Debounce between file change and upload |
| kiroSdlc.mcpServerPort | 9181 | Local MCP wrapper port |

### 8.3 Configuration Validation

On startup, validate:
- TASK_WORKER_BASE_INTERVAL > 0 && ≤ TASK_WORKER_MAX_INTERVAL
- TASK_WORKER_MAX_RETRIES > 0 && ≤ 10
- TASK_WORKER_STALE_THRESHOLD ≥ 60000 (min 1 minute)
- CODE_INTEL_UPLOAD_BATCH_SIZE > 0 && ≤ 500

If invalid → log warning, use defaults.

---

## 9. Security Design

### 9.1 Input Validation

| Endpoint | Field | Validation |
|----------|-------|-----------|
| code_intel_upload | projectId | Non-empty, alphanumeric + dash, ≤100 chars |
| code_intel_upload | filePath | Relative only, no `../`, no null bytes, no absolute paths |
| code_intel_upload | hash | Exact 64 hex characters |
| code_intel_upload | timestamp | Valid ISO 8601 |
| code_intel_upload | files[] | Max 100 items |
| code_intel_upload | symbols per file | Max 10000 |
| mem_ingest | content | Non-empty string |
| mem_ingest | type | Enum whitelist: CONTEXT, DECISION, PATTERN |
| mem_ingest | summary | ≤120 chars (truncated if longer) |

### 9.2 Path Traversal Prevention

```typescript
function validateFilePath(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.startsWith('/') || /^[A-Z]:/i.test(path)) return false;
  if (path.includes('\0')) return false;
  return true;
}
```

### 9.3 Network Security

- Backend MCP endpoint binds to localhost only (:48721)
- Extension wrapper binds to localhost only (:9181)
- /internal/tasks/* diagnostic API: localhost binding, no auth
- All external communication via existing AuthManager (PKCE SSO)
- No secrets in request payloads or logs

#### 9.3.1 MCP Endpoint Authentication (SEC-01 — Mandatory)

API key authentication is **mandatory** for the MCP endpoint. There is no opt-out.

**Key Lifecycle:**
1. On server start, auto-generate a 256-bit random API key
2. Store key at `{data_dir}/.api-key` with file permissions `0600` (owner read/write only)
3. Key rotates on each server restart (forward secrecy)
4. Extension reads the key file on activation and caches in memory

**Authentication Flow:**
```typescript
// Server — key generation (runs on every start)
import { randomBytes, writeFileSync } from 'crypto';
import path from 'path';

function generateApiKey(dataDir: string): string {
  const key = randomBytes(32).toString('hex');
  const keyPath = path.join(dataDir, '.api-key');
  writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

// Server — request validation (apiKeyAuth middleware, NO bypass)
function apiKeyAuth(expectedKey: string) {
  return async (c: Context, next: Next) => {
    const bearer = c.req.header('Authorization')?.replace('Bearer ', '');
    const xApiKey = c.req.header('X-API-Key');
    const provided = bearer || xApiKey;
    if (!provided || !timingSafeEqual(Buffer.from(provided), Buffer.from(expectedKey))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  };
}

// Extension — reads key on activation, includes in all MCP requests
const apiKey = readFileSync(path.join(dataDir, '.api-key'), 'utf-8').trim();
// All MCP HTTP requests include: Authorization: Bearer {apiKey}
```

**Rules:**
- Server REJECTS all MCP requests without a valid API key (HTTP 401)
- No `CODE_INTEL_API_KEY` env var opt-out — key is always generated and enforced
- `timingSafeEqual` used for comparison (prevents timing attacks)
- Key file readable only by server process owner (mode 0600)

### 9.4 Rate Limiting

- No explicit rate limit for MCP tools (trusted internal callers)
- Implicit limit: PostgreSQL connection pool (10 connections)
- Upload batch cap: 100 files (rejects larger with -32000)
- Recommended 200ms between batches to avoid pool exhaustion

---

## 10. Performance & Scalability

### 10.1 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| mem_ingest response | < 100ms p95 | Transaction commit to response |
| code_intel_upload (100 files) | < 2s | Total processing time |
| code_search query | < 200ms | DB query to response |
| Worker poll (empty) | < 5ms | SELECT query time |
| Worker process (TAG_ENRICHMENT) | < 30s | LLM API call included |

### 10.2 Connection Pooling

| Resource | Min | Max | Idle Timeout |
|----------|-----|-----|-------------|
| PostgreSQL | 2 | 10 | 30s |

### 10.3 Scalability Notes

- Single worker design: adequate for single-user IDE use case
- If needed later: add `worker_id` column and distributed claim (SELECT FOR UPDATE SKIP LOCKED)
- Code intel upload is idempotent: safe to retry without side effects
- Bulk INSERT with prepared statements for symbol insertion performance

---

## 11. Monitoring & Observability

### 11.1 Logging

| Event | Level | Fields |
|-------|-------|--------|
| TaskWorker started | INFO | component=TaskWorker |
| Task claimed | DEBUG | taskId, taskType |
| Task completed | INFO | taskId, taskType, durationMs |
| Task failed | WARN | taskId, taskType, error, retryCount |
| Task dead-lettered | ERROR | taskId, taskType, error, retryCount |
| Stale tasks recovered | INFO | count |
| code_intel_upload received | INFO | projectId, fileCount |
| Upload completed | INFO | accepted, skipped, errors |

### 11.2 Health Checks

| Endpoint | Checks | Expected |
|----------|--------|----------|
| GET /health | DB connected | 200 OK |
| GET /internal/tasks/stats | Worker running | isRunning=true |

---

## 12. Deployment Considerations

### 12.1 Migration Order

Migrations MUST run in order before server starts:
1. migrate003_PendingTasks (existing)
2. migrate004_CodeFiles (new)
3. migrate005_CodeSymbols (new)
4. migrate006_CodeDependencies (new)
5. migrate007_CodeCallGraph (new)
6. migrate008_KnowledgeEntriesTimestamp (new)

### 12.2 Rollback Strategy

- Migrations are additive (CREATE TABLE) — rollback = DROP TABLE
- No data loss on rollback (new tables only)
- Task queue data loss acceptable on rollback (enrichment re-runs)
- Code intel data can be re-uploaded by extension on next activation

### 12.3 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| FEATURE_TASK_QUEUE | true | Enable/disable task worker |
| FEATURE_CODE_INTEL_UPLOAD | true | Enable/disable code_intel_upload tool |
| FEATURE_CODE_INTEL_ENRICHMENT | true | Enable/disable CALL_GRAPH_BUILD tasks |

---

## 13. Implementation Checklist

### Phase 1: Task Queue (Backend) — Priority: MUST HAVE

| # | Task | File(s) | Implements | Depends On |
|---|------|---------|-----------|------------|
| 1 | Extend TaskType enum with CALL_GRAPH_BUILD, IMPACT_ANALYSIS | models.ts | UC-02 | — |
| 2 | Make entry_id nullable in PendingTaskRepository.create() | PendingTaskRepository.ts | UC-07 | #1 |
| 3 | Add TaskProcessors (Strategy pattern) | TaskProcessors.ts | UC-02 | #1 |
| 4 | Wire TaskProcessors into TaskWorker.processTask() | TaskWorker.ts | UC-02 | #3 |
| 5 | Add TaskMonitor with stats/failed/retry routes | TaskMonitor.ts, admin-handlers.ts | UC-04, UC-05 | #2 |
| 6 | Add timestamp field to mem_ingest handler | MemoryToolDispatcher.ts | BR-09 | — |
| 7 | Migration: ALTER knowledge_entries ADD timestamp | migrate008.ts | BR-10 | — |
| 8 | Unit tests for TaskWorker, PendingTaskRepository | __tests__/ | — | #1-#5 |

### Phase 2: Code Intelligence Backend — Priority: MUST HAVE

| # | Task | File(s) | Implements | Depends On |
|---|------|---------|-----------|------------|
| 9 | Migration: CREATE code_files table | migrate004.ts | UC-07 | — |
| 10 | Migration: CREATE code_symbols table | migrate005.ts | UC-07 | #9 |
| 11 | Migration: CREATE code_dependencies table | migrate006.ts | UC-07 | #9 |
| 12 | Migration: CREATE code_call_graph table | migrate007.ts | UC-08 | #10 |
| 13 | Create PayloadValidator | PayloadValidator.ts | UC-07 | — |
| 14 | Create CodeIntelReceiver (UPSERT logic) | CodeIntelReceiver.ts | UC-07 | #9-#11, #13 |
| 15 | Create CodeSearchHandler | CodeSearchHandler.ts | UC-08 | #10 |
| 16 | Create CodeSymbolsHandler | CodeSymbolsHandler.ts | UC-08 | #10 |
| 17 | Create CodeModulesHandler | CodeModulesHandler.ts | UC-08 | #9 |
| 18 | Create CodeTraverseHandler | CodeTraverseHandler.ts | UC-08 | #12 |
| 19 | Create EnrichmentTaskCreator | EnrichmentTaskCreator.ts | UC-07 | #2, #14 |
| 20 | Create CallGraphBuilder (task processor) | CallGraphBuilder.ts | UC-02 | #3, #12 |
| 21 | Create ImpactAnalyzer (task processor) | ImpactAnalyzer.ts | UC-02 | #3, #12 |
| 22 | Rewrite CodeIntelModule (register tools, no filesystem) | CodeIntelModule.ts | UC-10 | #14-#18 |
| 23 | Remove old imports: DatabaseManager, IndexingEngine, chokidar, Tree-sitter | CodeIntelModule.ts, package.json | UC-10 | #22 |
| 24 | Unit + integration tests | __tests__/ | — | #14-#21 |

### Phase 3: Extension Code Intelligence — Priority: MUST HAVE

| # | Task | File(s) | Implements | Depends On |
|---|------|---------|-----------|------------|
| 25 | Create TimestampResolver (git > fs > now) | TimestampResolver.ts | BR-09 | — |
| 26 | Create HashCache (local file hash store) | HashCache.ts | BR-06 | — |
| 27 | Create CodeIntelScanner (Tree-sitter parse) | CodeIntelScanner.ts | UC-06 | #25, #26 |
| 28 | Create CodeIntelUploader (batch upload) | CodeIntelUploader.ts | UC-07 | — |
| 29 | Create FileChangeWatcher (incremental) | FileChangeWatcher.ts | UC-09 | #26, #27, #28 |
| 30 | Create OfflineQueue (queue when backend down) | OfflineQueue.ts | EF-06.2 | #28 |
| 31 | Wire into extension activation | extension.ts | UC-06 | #27-#30 |
| 32 | Extension tests | __tests__/ | — | #25-#30 |

### Phase 4: Cleanup & Verification

| # | Task | File(s) | Implements | Depends On |
|---|------|---------|-----------|------------|
| 33 | Remove chokidar, web-tree-sitter from backend package.json | package.json | UC-10 | #23 |
| 34 | Remove engine/indexer/, engine/db/database-manager.ts | Multiple files | UC-10 | #22 |
| 35 | Verify event loop not blocked (no startBackgroundIndexing) | Server startup | UC-10 | #22 |
| 36 | E2E test: extension scan → upload → backend query | e2e/ | All | All |

---

## 14. Appendix

### 14.1 Glossary

| Term | Definition |
|------|------------|
| Atomic Ingest | Entry + enrichment tasks persisted in single DB transaction |
| Dead Letter | Task failed > max_retries, permanently marked FAILED |
| Stale Task | PROCESSING task exceeding staleThreshold (5 min) |
| Exponential Backoff | Poll interval: min(base * 2^idle_count, maxInterval) |
| UPSERT | INSERT or UPDATE if record exists (ON CONFLICT DO UPDATE) |
| Hash-Based Dedup | Skip re-processing if SHA-256 hash unchanged |
| Timestamp Resolution | Priority: git commit time > fs mtime > Date.now() |

### 14.2 Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Completed task cleanup TTL | Open | Recommend 30 days, lazy cleanup |
| 2 | Code search ranking algorithm | Open | Start with text match, add hybrid RRF later |
| 3 | Cross-project call graph | Deferred | Single project first |
| 4 | Extension offline queue max size | Open | 1000 items, drop oldest |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

---

## End of Document
