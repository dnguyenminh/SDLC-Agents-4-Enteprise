# Functional Specification Document (FSD)

## Code Intelligence System — SA4E-45: Refactor engine layer — DatabaseAdapter abstraction cho IndexingEngine, MemoryEngine, GraphSync

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-45 |
| Title | Refactor engine layer — DatabaseAdapter abstraction |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |
| Related BRD | documents/SA4E-45/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | BA Agent | Initiate FSD from BRD SA4E-45 |
| 1.1 | 2026-07-18 | TA Agent | Technical enrichment: Appendices A-H (edge cases, API contracts, integration, pseudocode, data model fixes, NFRs, open issues, security) |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior for refactoring all engine layer modules (IndexingEngine, MemoryEngine, GraphSyncService, TreeSitterIndexer) to use the DatabaseAdapter interface instead of directly importing better-sqlite3.

### 1.2 Scope

- Refactor constructor signatures of engine modules to accept DatabaseAdapter
- Replace all direct `db.prepare()`, `db.transaction()` calls with adapter methods
- Extend MigrationService to handle engine tables
- Maintain zero regression in SQLite mode (default)
- Handle SQL dialect differences between SQLite and PostgreSQL

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| DatabaseAdapter | Sync interface providing unified DB access (run, get, all, exec, transaction, prepare) |
| Engine Layer | Core modules: IndexingEngine, MemoryEngine, GraphSyncService, TreeSitterIndexer |
| DI | Dependency Injection — passing adapter via constructor |
| Dialect | SQL syntax differences between database engines |
| FTS | Full-Text Search (SQLite FTS5 vs PostgreSQL tsvector) |
| PreparedStatement | Cross-engine prepared statement interface (run, get, all) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-45/BRD.md |
| DatabaseAdapter Interface | backend/src/database/adapters/DatabaseAdapter.ts |
| SqliteDbAdapter Bridge | backend/src/modules/memory/task-queue/SqliteDbAdapter.ts |
| DatabaseAdapterFactory | backend/src/database/factory/DatabaseAdapterFactory.ts |
| MigrationService | backend/src/database/migration/MigrationService.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Code Intelligence system consists of:
- **Admin Portal** — UI for managing database configuration (already uses DatabaseAdapter via SA4E-44)
- **Engine Layer** — Core processing modules (IndexingEngine, MemoryEngine, GraphSyncService, TreeSitterIndexer) that currently hardcode better-sqlite3
- **DatabaseAdapter Layer** — Abstraction interface with implementations for SQLite, PostgreSQL, MySQL
- **DatabaseAdapterFactory** — Creates adapter instances based on active configuration
- **MigrationService** — Handles data transfer between database engines

After refactor, all engine modules receive a DatabaseAdapter instance via constructor injection, eliminating direct better-sqlite3 dependency.

### 2.2 System Architecture

The target architecture follows a layered approach:

1. **Application Layer**: Engine modules (IndexingEngine, MemoryEngine, GraphSyncService)
2. **Adapter Layer**: DatabaseAdapter interface + PreparedStatement interface
3. **Implementation Layer**: SqliteAdapter (wraps better-sqlite3), PostgresAdapter, MysqlAdapter
4. **Factory Layer**: DatabaseAdapterFactory creates the correct implementation based on config

---

## 3. Functional Requirements

### 3.1 Feature: IndexingEngine Adapter Injection

**Source:** BRD Story 2, Story 6

#### 3.1.1 Use Case UC-1: Index Files Using DatabaseAdapter

**Use Case ID:** UC-1
**Actor:** IndexingEngine (internal system)
**Preconditions:** DatabaseAdapter connected, schema ready
**Postconditions:** Files and symbols stored via adapter

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | IndexingEngine | | Receives DatabaseAdapter via constructor (injected by DatabaseManager or DI container) |
| 2 | | IndexingEngine | Calls `adapter.prepare(INSERT INTO files ...)` to get PreparedStatement |
| 3 | | IndexingEngine | Uses `stmt.run(...)` to insert file records |
| 4 | | IndexingEngine | Calls `adapter.transaction(() => { ... })` for batch symbol inserts |
| 5 | | IndexingEngine | Calls `adapter.prepare(DELETE FROM symbols WHERE file_id = ?)` for cleanup |
| 6 | | Adapter | Routes SQL to underlying engine (SQLite or PostgreSQL) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | PostgreSQL mode active | Adapter translates dialect-specific SQL (e.g., `datetime('now')` to `NOW()`) |
| AF-2 | Large batch (>200 files) | Transaction batching via `adapter.transaction()` wraps each batch of 200 |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Adapter disconnected | Throw Error('Database not connected'), IndexingEngine logs and stops |
| EF-2 | Schema mismatch | SQL exec fails, adapter propagates error, IndexingEngine retries after migration |
| EF-3 | Constraint violation (duplicate path) | INSERT OR REPLACE handled by adapter.run(), no exception |

#### 3.1.2 Use Case UC-2: Incremental File Indexing via Adapter

**Use Case ID:** UC-2
**Actor:** FileWatcher (internal system trigger)
**Preconditions:** Adapter connected, file change detected
**Postconditions:** Single file updated in database via adapter

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | FileWatcher | | Detects file change event (create/modify) |
| 2 | | IndexingEngine | Calls `adapter.get(SELECT content_hash FROM files WHERE ...)` to check staleness |
| 3 | | IndexingEngine | If unchanged, skip. If changed, upsert via `adapter.run(INSERT OR REPLACE ...)` |
| 4 | | IndexingEngine | Invokes TreeSitterIndexer (which also uses adapter) to parse symbols |
| 5 | | IndexingEngine | Calls `adapter.run(DELETE FROM files WHERE ...)` for unlink events |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | File deleted (unlink event) | IndexingEngine calls `adapter.run(DELETE FROM files ...)` and `graphRepo.deleteFileRelationships()` |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | File read error | Log warning, skip file, continue watching |

---

### 3.2 Feature: MemoryEngine Adapter Injection

**Source:** BRD Story 2, Story 4

#### 3.2.1 Use Case UC-3: CRUD Operations via Adapter

**Use Case ID:** UC-3
**Actor:** MCP Tool Handler (internal system)
**Preconditions:** Adapter connected, knowledge_entries table exists
**Postconditions:** Knowledge entries managed via adapter

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | MCP Handler | | Calls MemoryEngine.insert(entry) |
| 2 | | MemoryEngine | Calls `adapter.prepare(INSERT INTO knowledge_entries ...)` |
| 3 | | MemoryEngine | Returns `result.lastInsertRowid` from RunResult |
| 4 | MCP Handler | | Calls MemoryEngine.findById(id) |
| 5 | | MemoryEngine | Calls `adapter.get(SELECT * FROM knowledge_entries WHERE id = ?)` |
| 6 | MCP Handler | | Calls MemoryEngine.deleteEntry(id) |
| 7 | | MemoryEngine | Calls `adapter.run(DELETE FROM knowledge_entries WHERE id = ?)` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Update tags | `adapter.run(UPDATE knowledge_entries SET tags = ?, updated_at = {dialect_now} ...)` |
| AF-2 | Record access | `adapter.run(UPDATE knowledge_entries SET access_count = access_count + 1 ...)` |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Entry not found | `adapter.get()` returns undefined, caller handles gracefully |
| EF-2 | Invalid entry data | Constraint violation propagated from adapter |

#### 3.2.2 Use Case UC-4: FTS Search via Adapter

**Use Case ID:** UC-4
**Actor:** MCP Tool Handler
**Preconditions:** Adapter connected, FTS index exists
**Postconditions:** Search results returned

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | MCP Handler | | Calls MemoryEngine.search(query, limit, tier, type) |
| 2 | | MemoryEngine | Checks `adapter.getEngine()` to determine FTS dialect |
| 3 | | MemoryEngine (SQLite) | Executes `SELECT ... FROM knowledge_fts WHERE knowledge_fts MATCH ?` |
| 4 | | MemoryEngine (PostgreSQL) | Executes `SELECT ... WHERE to_tsvector('english', content) @@ plainto_tsquery(?)` |
| 5 | | MemoryEngine | Applies CompositeScorer to rank results |
| 6 | | MemoryEngine | Returns sorted SearchResult[] |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Empty query | Returns wildcard results (all entries sorted by created_at) |
| AF-2 | FTS syntax error | Catch error, return empty results (existing behavior) |
| AF-3 | PostgreSQL mode | Use tsvector/tsquery instead of FTS5 MATCH |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | FTS table not available | Catch error, return empty array, log warning |

#### 3.2.3 Use Case UC-5: Session Management via Adapter

**Use Case ID:** UC-5
**Actor:** Agent Session Controller
**Preconditions:** Adapter connected, memory_sessions table exists
**Postconditions:** Session lifecycle tracked

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Controller | | Calls MemoryEngine.startSession(agentName) |
| 2 | | MemoryEngine | Generates session ID, calls `adapter.run(INSERT INTO memory_sessions ...)` |
| 3 | | MemoryEngine | Calls `adapter.run(INSERT INTO memory_audit ...)` for audit log |
| 4 | Controller | | Calls MemoryEngine.endSession() |
| 5 | | MemoryEngine | Calls `adapter.run(UPDATE memory_sessions SET ended_at = {dialect_now} ...)` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | No active session on endSession | No-op, return silently |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Duplicate session_id | Extremely unlikely (timestamp+random), adapter constraint error logged |

---

### 3.3 Feature: GraphSyncService Adapter Injection

**Source:** BRD Story 2

#### 3.3.1 Use Case UC-6: Sync Code Symbols to Graph Nodes

**Use Case ID:** UC-6
**Actor:** IndexingEngine (post-index trigger)
**Preconditions:** indexDb adapter and adminDb adapter connected, symbols exist in indexDb
**Postconditions:** graph_nodes in adminDb updated for project

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | IndexingEngine | | Calls `GraphSyncService.syncProjectSymbols(projectId)` |
| 2 | | GraphSyncService | Calls `indexAdapter.all(SELECT s.id, s.name, s.kind, f.relative_path FROM symbols s JOIN files f ...)` |
| 3 | | GraphSyncService | Calls `adminAdapter.transaction(() => { ... })` to replace code nodes |
| 4 | | GraphSyncService | Inside transaction: `adminAdapter.run(DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'code:%')` |
| 5 | | GraphSyncService | Inside transaction: `adminAdapter.run(INSERT OR IGNORE INTO graph_nodes ...)` for each symbol |
| 6 | | GraphSyncService | Logs sync count |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | No symbols found | Skip insert, only delete stale nodes |
| AF-2 | Limit exceeded (>2000) | Only top symbols synced (bounded by SQL LIMIT) |
| AF-3 | PostgreSQL mode | `INSERT OR IGNORE` becomes `INSERT ... ON CONFLICT DO NOTHING` |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | adminDb adapter error | Non-fatal: catch, log error, indexing continues |
| EF-2 | Empty projectId | Fail-closed: return immediately without any DB operations |

---

### 3.4 Feature: TreeSitterIndexer Adapter Injection

**Source:** BRD Story 2, Story 6

#### 3.4.1 Use Case UC-7: Parse and Store Symbols via Adapter

**Use Case ID:** UC-7
**Actor:** IndexingEngine (delegating symbol extraction)
**Preconditions:** Adapter connected, file parsed successfully
**Postconditions:** Symbols stored in database via adapter

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | IndexingEngine | | Calls `TreeSitterIndexer.indexFile(filePath, relativePath, projectId)` |
| 2 | | TreeSitterIndexer | Parses file using tree-sitter grammar |
| 3 | | TreeSitterIndexer | Calls `adapter.prepare(DELETE FROM symbols WHERE file_id = ?)` for cleanup |
| 4 | | TreeSitterIndexer | Calls `adapter.prepare(INSERT INTO symbols ...)` for each parsed symbol |
| 5 | | TreeSitterIndexer | Calls `adapter.transaction()` to batch insert |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | No grammar available | Falls back to regex extraction, still via adapter |
| AF-2 | File too large (>1MB) | Skip tree-sitter, use regex fallback |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Parse error | Return result with parseErrors count, no symbols stored |

---

### 3.5 Feature: Database Engine Switch (Migration)

**Source:** BRD Story 1, Story 3

#### 3.5.1 Use Case UC-8: Switch Database Engine with Full Data Migration

**Use Case ID:** UC-8
**Actor:** System Administrator
**Preconditions:** Source DB has data, target DB reachable
**Postconditions:** All data (admin + engine tables) migrated to target engine

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | | Selects target engine (PostgreSQL) in Admin Portal |
| 2 | | System | Validates target connection via `DatabaseAdapterFactory.create(config)` |
| 3 | | System | Calls `adapter.connect()` to verify connectivity |
| 4 | | MigrationService | Reads ALL table names from source: `adapter.getTableNames()` |
| 5 | | MigrationService | Creates schema in target (translated DDL) |
| 6 | | MigrationService | Copies data in batches (500 rows) for ALL tables including engine tables |
| 7 | | MigrationService | Verifies row counts match: `source.getRowCount(table) === target.getRowCount(table)` |
| 8 | | System | Updates active config via ConfigService |
| 9 | | System | Reinitializes engine modules with new adapter instance |
| 10 | Admin | | Sees success confirmation |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Target already has tables | `CREATE TABLE IF NOT EXISTS` — skip schema if exists |
| AF-2 | FTS tables encountered | Skip FTS virtual tables (`_fts` suffix) — recreated by engine on restart |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Target unreachable | Return error, no migration started, source unchanged |
| EF-2 | Migration fails mid-way | Rollback: drop all target tables, revert config to source engine |
| EF-3 | Row count mismatch in verify | Throw error, rollback triggered |
| EF-4 | User cancels | Set cancelled flag, stop after current batch, rollback |

#### 3.5.2 Use Case UC-9: Reinitialize Engines After DB Switch

**Use Case ID:** UC-9
**Actor:** System (internal, post-migration)
**Preconditions:** Migration completed successfully
**Postconditions:** All engine modules use new adapter

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | System | Creates new DatabaseAdapter via Factory using new config |
| 2 | | System | Calls `newAdapter.connect()` |
| 3 | | System | Recreates IndexingEngine with new adapter |
| 4 | | System | Recreates MemoryEngine with new adapter |
| 5 | | System | Recreates GraphSyncService with new adapter (both indexDb and adminDb) |
| 6 | | System | Recreates TreeSitterIndexer with new adapter |
| 7 | | System | Recreates FTS indexes if needed (engine-specific) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | SQLite to SQLite (path change only) | Adapter swap with new path, no dialect change |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | New adapter fails to connect | Revert to old adapter, report error to admin |

---

## 4. Business Rules

| Rule ID | Rule | Source | Enforcement |
|---------|------|--------|-------------|
| BR-1 | All engine modules MUST receive DatabaseAdapter via constructor injection — no direct `better-sqlite3` import | BRD Story 2, Story 6 | Compile-time (TypeScript type check) |
| BR-2 | Default mode MUST be SQLite with zero regression | BRD Story 4 | Integration tests |
| BR-3 | Migration MUST be atomic — complete transfer or full rollback | BRD Story 1 | MigrationService rollback logic |
| BR-4 | MigrationService MUST copy ALL tables (admin + engine) | BRD Story 3 | getTableNames() returns all tables |
| BR-5 | SQL dialect differences MUST be abstracted — engine modules write engine-agnostic SQL where possible | BRD Risk 5.1 | DialectHelper utility |
| BR-6 | FTS queries MUST use engine-specific implementation (FTS5 for SQLite, tsvector for PostgreSQL) | BRD Risk 5.1 | Conditional branching on `adapter.getEngine()` |
| BR-7 | `adapter.prepare()` MUST return PreparedStatement with run/get/all methods | SA4E-44 interface | Interface contract |
| BR-8 | `adapter.transaction()` MUST execute callback atomically | SA4E-44 interface | Interface contract |
| BR-9 | GraphSyncService MUST accept TWO separate adapter instances (indexDb, adminDb) | Current architecture | Constructor signature |
| BR-10 | Adapter overhead in SQLite mode MUST be < 1ms per query | BRD NFR | Benchmark verification |
| BR-11 | Migration MUST handle large datasets: 10,000+ files, 100,000+ symbols | BRD Story 3 | Batch processing (500 rows) |
| BR-12 | No engine table data may remain on old DB after successful migration | BRD Story 1 | Verify phase in MigrationService |
| BR-13 | FTS virtual tables (`*_fts`) MUST be skipped during migration — recreated on engine restart | Implementation detail | Table name filter |
| BR-14 | `INSERT OR REPLACE` (SQLite) MUST translate to `INSERT ... ON CONFLICT DO UPDATE` (PostgreSQL) | Dialect difference | DialectHelper |
| BR-15 | `datetime('now')` (SQLite) MUST translate to `NOW()` (PostgreSQL) | Dialect difference | DialectHelper |

---

## 5. Data Model

### 5.1 Engine Tables (Managed via DatabaseAdapter after refactor)

#### Table: files

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| project_id | TEXT | Y | Tenant/project identifier |
| path | TEXT | Y | Absolute file path |
| relative_path | TEXT | Y | Path relative to workspace |
| language | TEXT | N | Detected programming language |
| module | TEXT | N | Detected module/package |
| content_hash | TEXT | Y | SHA-256 of file content |
| size_bytes | INTEGER | Y | File size |
| line_count | INTEGER | Y | Number of lines |
| last_indexed | TEXT | Y | Timestamp of last indexing |
| file_created_at | TEXT | N | File creation date |
| file_author | TEXT | N | File author (from git) |
| file_version | TEXT | N | File version (from git) |

#### Table: symbols

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| project_id | TEXT | Y | Tenant/project identifier |
| file_id | INTEGER FK | Y | References files.id |
| name | TEXT | Y | Symbol name |
| kind | TEXT | Y | Symbol kind (class, function, method, etc.) |
| signature | TEXT | N | Full signature |
| start_line | INTEGER | N | Start line in file |
| end_line | INTEGER | N | End line in file |
| parent_symbol | TEXT | N | Parent symbol name |
| visibility | TEXT | N | public/private/protected |
| doc_comment | TEXT | N | Documentation comment |

#### Table: knowledge_entries

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| content | TEXT | Y | Entry content |
| summary | TEXT | N | Short summary |
| type | TEXT | Y | Entry type |
| tier | TEXT | Y | WORKING / REFERENCE / ARCHIVED |
| scope | TEXT | Y | USER / PROJECT / SHARED |
| user_id | TEXT | N | Owner user ID |
| project_id | TEXT | N | Associated project |
| source | TEXT | N | Origin source |
| source_ref | TEXT | N | Source reference |
| tags | TEXT | N | Comma-separated tags |
| confidence | REAL | Y | Confidence score (0.0-1.0) |
| agent_name | TEXT | N | Creating agent |
| owner | TEXT | N | Owner identifier |
| archived | INTEGER | Y | 0=active, 1=archived |
| access_count | INTEGER | Y | Times accessed |
| last_accessed_at | TEXT | N | Last access timestamp |
| expires_at | TEXT | N | Expiration timestamp |
| created_at | TEXT | Y | Creation timestamp |
| updated_at | TEXT | Y | Last update timestamp |

#### Table: memory_sessions

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| session_id | TEXT UNIQUE | Y | Generated session identifier |
| agent_name | TEXT | N | Agent that started session |
| started_at | TEXT | Y | Session start timestamp |
| ended_at | TEXT | N | Session end timestamp |
| status | TEXT | Y | active / ended |

#### Table: memory_audit

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| operation | TEXT | Y | Operation name (INSERT, DELETE, SESSION_START, etc.) |
| entry_id | INTEGER | N | Related entry ID |
| session_id | TEXT | N | Related session ID |
| created_at | TEXT | Y | Timestamp |

#### Table: tool_usage

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| tool_name | TEXT UNIQUE | Y | Tool identifier |
| call_count | INTEGER | Y | Number of invocations |
| last_called_at | TEXT | Y | Last invocation timestamp |

#### Table: graph_nodes

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| entry_id | TEXT | Y | Node identifier (e.g., `code:123`) |
| label | TEXT | Y | Display label |
| type | TEXT | Y | Node type (CODE_ENTITY, etc.) |
| tier | TEXT | Y | Node tier (CODE, etc.) |
| project_id | TEXT | Y | Owning project |
| x | REAL | N | 3D position x |
| y | REAL | N | 3D position y |
| z | REAL | N | 3D position z |
| level | TEXT | N | Hierarchy level |
| cluster_id | TEXT | N | Cluster identifier |


#### Table: graph_edges

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| source_id | TEXT | Y | Source node entry_id |
| target_id | TEXT | Y | Target node entry_id |
| relation | TEXT | Y | Edge type |
| weight | REAL | N | Edge weight |
| project_id | TEXT | Y | Owning project |

#### Table: knowledge_graph_edges

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| source_id | INTEGER FK | Y | Source knowledge_entries.id |
| target_id | INTEGER FK | Y | Target knowledge_entries.id |
| relation | TEXT | Y | Relationship type (RELATES_TO, etc.) |
| weight | REAL | Y | Edge weight (default 1.0) |

#### Table: consolidation_log

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| entry_id | INTEGER | Y | Related entry ID |
| from_tier | TEXT | Y | Source tier/scope |
| to_tier | TEXT | Y | Target tier/scope |
| reason | TEXT | N | Reason for consolidation |
| created_at | TEXT | Y | Timestamp |

#### Table: decay_config

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| key | TEXT PK | Y | Configuration key |
| value | TEXT | Y | Configuration value |

#### Table: mcp_tools

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| id | INTEGER PK AUTOINCREMENT | Y | Auto-generated row ID |
| name | TEXT | Y | Tool name |
| description | TEXT | N | Tool description |
| schema | TEXT | N | JSON schema |
| registered_at | TEXT | Y | Registration timestamp |

### 5.2 Table Relationships

| From | To | Cardinality | Description |
|------|-----|-------------|-------------|
| symbols | files | N:1 | Each symbol belongs to one file (file_id FK) |
| knowledge_graph_edges | knowledge_entries | N:1 | source_id and target_id reference entries |
| memory_audit | knowledge_entries | N:1 | entry_id references entries (nullable) |
| memory_audit | memory_sessions | N:1 | session_id references sessions (nullable) |
| consolidation_log | knowledge_entries | N:1 | entry_id references entries |
| graph_nodes | (standalone) | - | Identified by entry_id + project_id |
| graph_edges | graph_nodes | N:1 | source_id/target_id match graph_nodes.entry_id |

---

## 6. API Contracts — Adapter Injection

### 6.1 How Modules Receive Adapter Instances

#### 6.1.1 IndexingEngine Constructor Change

**Current (AS-IS):**
```typescript
constructor(dbManager: DatabaseManager, config: AppConfig) {
  this.db = dbManager.getDb(); // returns Database.Database
}
```

**Target (TO-BE):**
```typescript
constructor(adapter: DatabaseAdapter, config: AppConfig) {
  this.adapter = adapter;
}
```

**Caller Change (server bootstrap):**
```typescript
// Before:
const engine = new IndexingEngine(dbManager, config);
// After:
const adapter = new SqliteDbAdapter(dbManager.getDb());
const engine = new IndexingEngine(adapter, config);
```

#### 6.1.2 MemoryEngine Constructor Change

**Current (AS-IS):**
```typescript
// MemoryEngineCrud (base class)
constructor(db: Database.Database) {
  this.db = db;
}
// MemoryEngine
constructor(db: Database.Database) {
  super(db);
  this.compositeScorer = new CompositeScorer(db);
}
```

**Target (TO-BE):**
```typescript
// MemoryEngineCrud (base class)
constructor(adapter: DatabaseAdapter) {
  this.adapter = adapter;
}
// MemoryEngine
constructor(adapter: DatabaseAdapter) {
  super(adapter);
  this.compositeScorer = new CompositeScorer(adapter);
}
```

#### 6.1.3 GraphSyncService Constructor Change

**Current (AS-IS):**
```typescript
constructor(
  private readonly indexDb: Database.Database,
  private readonly adminDb: Database.Database,
  private readonly log: Logger
) {}
```

**Target (TO-BE):**
```typescript
constructor(
  private readonly indexAdapter: DatabaseAdapter,
  private readonly adminAdapter: DatabaseAdapter,
  private readonly log: Logger
) {}
```

#### 6.1.4 TreeSitterIndexer Constructor Change

**Current (AS-IS):**
```typescript
constructor(registry: GrammarRegistry, db: Database.Database, maxFileSize: number) {
  this.db = db;
}
```

**Target (TO-BE):**
```typescript
constructor(registry: GrammarRegistry, adapter: DatabaseAdapter, maxFileSize: number) {
  this.adapter = adapter;
}
```

### 6.2 DatabaseAdapter Interface (Existing — No Changes)

```typescript
export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStatus(): ConnectionStatus;
  run(sql: string, params?: unknown[]): RunResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  prepare(sql: string): PreparedStatement;
  getEngine(): DatabaseEngine;
  getVersion(): Promise<string>;
  getTableNames(): Promise<string[]>;
  getRowCount(table: string): Promise<number>;
}

export interface PreparedStatement {
  run(...params: unknown[]): RunResult;
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}
```

### 6.3 Method Call Translation Reference

| Current Pattern (better-sqlite3) | Adapter Equivalent |
|----------------------------------|--------------------|
| `db.prepare(sql).run(...params)` | `adapter.prepare(sql).run(...params)` OR `adapter.run(sql, params)` |
| `db.prepare(sql).get(...params)` | `adapter.prepare(sql).get(...params)` OR `adapter.get(sql, params)` |
| `db.prepare(sql).all(...params)` | `adapter.prepare(sql).all(...params)` OR `adapter.all(sql, params)` |
| `db.exec(sql)` | `adapter.exec(sql)` |
| `db.transaction(fn)()` | `adapter.transaction(fn)` |
| `db.pragma(...)` | Not in adapter — handled internally by SqliteAdapter |

---

## 7. SQL Dialect Abstraction

### 7.1 Dialect Differences Requiring Abstraction

| Feature | SQLite | PostgreSQL | Abstraction Strategy |
|---------|--------|------------|---------------------|
| Current timestamp | `datetime('now')` | `NOW()` | DialectHelper.now() returns engine-appropriate string |
| Upsert | `INSERT OR REPLACE INTO` | `INSERT INTO ... ON CONFLICT DO UPDATE SET` | DialectHelper.upsert(table, columns, conflictKey) |
| Insert ignore | `INSERT OR IGNORE INTO` | `INSERT INTO ... ON CONFLICT DO NOTHING` | DialectHelper.insertIgnore(table, columns, conflictKey) |
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | DDL translation in migration only |
| Boolean | 0/1 (INTEGER) | true/false (BOOLEAN) | Use 0/1 in both (PG accepts integer for boolean) |
| FTS Match | `WHERE fts MATCH ?` | `WHERE to_tsvector(...) @@ plainto_tsquery(?)` | Conditional branch on `adapter.getEngine()` |
| BLOB type | `BLOB` | `BYTEA` | DDL translation in migration only |
| String concatenation | `\|\|` | `\|\|` | Same — no abstraction needed |
| LIMIT/OFFSET | Supported | Supported | Same — no abstraction needed |
| Parameter placeholder | `?` | `?` (adapter translates to $1, $2 internally) | Adapter handles internally |

### 7.2 DialectHelper Utility (New Module)

```typescript
export class DialectHelper {
  constructor(private engine: DatabaseEngine) {}

  /** Returns SQL expression for current timestamp */
  now(): string {
    return this.engine === 'sqlite' ? "datetime('now')" : 'NOW()';
  }

  /** Builds upsert SQL */
  upsert(table: string, columns: string[], conflictKey: string, updateColumns: string[]): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    const setClauses = updateColumns.map(c => `${c} = EXCLUDED.${c}`).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO UPDATE SET ${setClauses}`;
  }

  /** Builds insert-ignore SQL */
  insertIgnore(table: string, columns: string[], conflictKey: string): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO NOTHING`;
  }
}
```

### 7.3 FTS Abstraction Strategy

FTS requires fundamentally different approaches per engine:

**SQLite (FTS5):**
- Virtual table: `knowledge_fts` using FTS5
- Query: `SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ?`
- Created automatically by schema migration

**PostgreSQL (tsvector):**
- GIN index on computed column: `tsvector_content`
- Query: `SELECT id, ts_rank(tsvector_content, query) FROM knowledge_entries, plainto_tsquery(?) query WHERE tsvector_content @@ query`
- Requires trigger to maintain tsvector column

**Decision:** MemoryEngine.search() checks `adapter.getEngine()` and uses the appropriate query pattern. This is the ONE place where engine-specific SQL is acceptable.

---

## 8. Error Handling Specifications

### 8.1 Adapter Connection Errors

| Scenario | Detection | Response | Recovery |
|----------|-----------|----------|----------|
| Adapter not connected | `adapter.isConnected() === false` | Throw `DatabaseNotConnectedError` | Caller reconnects or fails fast |
| Connection lost mid-operation | SQL execution throws | Propagate error to caller | Caller retries or reports to user |
| Target DB unreachable (migration) | `adapter.connect()` throws | Return error to admin UI | User fixes connection params |

### 8.2 Data Integrity Errors

| Scenario | Detection | Response | Recovery |
|----------|-----------|----------|----------|
| FK constraint violation | Adapter throws constraint error | Propagate to caller | Caller ensures parent exists first |
| Unique constraint violation | Adapter throws constraint error | Handled by UPSERT logic | No recovery needed — expected for idempotent ops |
| Row count mismatch (migration) | Verify phase comparison | Rollback entire migration | User retries or investigates |

### 8.3 Dialect Errors

| Scenario | Detection | Response | Recovery |
|----------|-----------|----------|----------|
| Invalid SQL syntax for engine | Adapter execution throws | Log full SQL + engine type | Developer fixes DialectHelper |
| Unsupported feature on engine | Feature check before use | Skip feature or use alternative | Graceful degradation |
| FTS not available (PG without extension) | Query throws | Fallback to LIKE-based search | Reduced search quality, logged |

---

## 9. Processing Logic

### 9.1 Adapter Lifecycle

![Adapter Lifecycle](diagrams/state-adapter.png)

**States:**
1. **Created** — Factory instantiates adapter, not yet connected
2. **Connected** — `connect()` called successfully, ready for queries
3. **Active** — Processing queries from engine modules
4. **Disconnecting** — `disconnect()` called, flushing pending operations
5. **Disconnected** — Connection closed, no further queries accepted

**Transitions:**
- Created → Connected: `adapter.connect()` succeeds
- Connected → Active: First query executed
- Active → Active: Subsequent queries
- Active → Disconnecting: `adapter.disconnect()` called
- Disconnecting → Disconnected: All pending ops complete
- Any → Error: Unrecoverable connection failure

### 9.2 Database Switch Sequence

![DB Switch Sequence](diagrams/sequence-db-switch.png)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Admin requests DB switch via UI | Validate config before proceeding |
| 2 | Factory creates target adapter | If creation fails, abort with error message |
| 3 | Target adapter connects | If connection fails, abort — source unchanged |
| 4 | MigrationService creates schema in target | If DDL fails, rollback (drop created tables) |
| 5 | MigrationService copies data in batches | If copy fails, rollback |
| 6 | MigrationService verifies row counts | If mismatch, rollback |
| 7 | ConfigService updates active engine | If config write fails, rollback |
| 8 | Engine modules reinitialized with new adapter | If reinit fails, revert config |
| 9 | Old adapter disconnected | Best-effort, non-fatal if fails |

---

## 10. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Performance | Adapter overhead in SQLite mode | < 1ms per query (benchmark vs direct better-sqlite3) |
| Performance | Migration throughput | < 5 minutes for 10,000 files + 100,000 symbols |
| Compatibility | Zero regression in SQLite mode | All existing unit tests pass without modification |
| Compatibility | Existing DB files compatible | No re-indexing needed after refactor |
| Reliability | Atomic DB switch | Migration either completes fully or rolls back |
| Maintainability | No better-sqlite3 imports in engine layer | grep returns 0 matches (except adapter implementations) |
| Testability | Mock adapter for unit tests | All engine modules testable with in-memory adapter mock |
| Security | PG credentials via env vars | No hardcoded credentials in source code |

---

## 11. Appendix

### 11.1 Sequence Diagram — DB Switch Flow

![Sequence DB Switch](diagrams/sequence-db-switch.png)

### 11.2 State Diagram — Adapter Lifecycle

![State Adapter](diagrams/state-adapter.png)

### 11.3 System Context Diagram

![System Context](diagrams/system-context.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — DB Switch | [sequence-db-switch.png](diagrams/sequence-db-switch.png) | [sequence-db-switch.drawio](diagrams/sequence-db-switch.drawio) |
| 3 | State — Adapter Lifecycle | [state-adapter.png](diagrams/state-adapter.png) | [state-adapter.drawio](diagrams/state-adapter.drawio) |


## 12. Technical Appendix A - Use Case Edge Cases (TA Enrichment)

### 12.1 Additional Exception Flows for UC-1 (Indexing)

| ID | Condition | Steps |
|----|-----------|-------|
| EF-4 | adapter.prepare() fails due to memory pressure (SQLite statement cache full) | SqliteDbAdapter delegates to better-sqlite3 which LRU-evicts cached statements. No special handling needed. For PostgreSQL, prepared statement pool may exhaust max_prepared_transactions - adapter MUST catch and retry with un-prepared fallback (adapter.run() instead of adapter.prepare().run()) |
| EF-5 | Concurrent indexing + search (read during write) | SQLite WAL mode: readers never block writers. PostgreSQL MVCC: same guarantee. No adapter-level locking needed. Per-project guard (indexing Set) prevents concurrent full-index for same project. |
| EF-6 | Index corruption (FTS5 table corrupted) | Detection: FTS query throws "database disk image is malformed". Recovery: adapter.exec("INSERT INTO symbols_fts(symbols_fts) VALUES('rebuild')"). If rebuild fails - drop + recreate FTS virtual table + re-trigger population from base table. |

### 12.2 Additional Exception Flows for UC-8 (Migration)

| ID | Condition | Steps |
|----|-----------|-------|
| EF-5 | Migration cancelled mid-batch (cancel() called) | cancelled flag checked before each batch. Current batch completes (atomic transaction), then CancelledError thrown. Rollback drops all target tables. Source DB unchanged. |
| EF-6 | Target PostgreSQL connection pool exhausted | MigrationService uses single connection for migration (not pooled). If connection drops - rollback. Pool exhaustion only affects concurrent app queries. |
| EF-7 | DDL translation produces invalid SQL | translateDDL() errors caught per-table. Logged with original + translated DDL. Migration aborted, rollback triggered. |
| EF-8 | Source DB locked by active indexing during migration | Migration reads source with SELECT (non-blocking in WAL). Verify phase allows plus/minus 5% tolerance for actively-written tables (files, symbols). |

---

## 13. Technical Appendix B - Detailed API Contracts and Injection Points (TA Enrichment)

### 13.1 Refactoring Order (Dependency Chain)

Modules MUST be refactored in this order to avoid circular dependency issues:

| Order | Module | File | Reason |
|-------|--------|------|--------|
| 1 | SqliteDbAdapter | src/modules/memory/task-queue/SqliteDbAdapter.ts | Already exists (SA4E-44). No changes needed. |
| 2 | TreeSitterIndexer | src/engine/parsers/tree-sitter-indexer.ts | Leaf - no downstream deps on constructor. |
| 3 | GraphSyncService | src/engine/graph/graph-sync-service.ts | Used only inside IndexingEngine. |
| 4 | MemoryEngineCrud + MemoryEngine | src/modules/memory/engine/crud.ts + core.ts | Base class first, then subclass. |
| 5 | IndexingEngine | src/engine/indexer/indexing-engine.ts | Most complex - uses all above. |
| 6 | CodeIntelModule (caller) | src/modules/code-intel/CodeIntelModule.ts | Injection point for IndexingEngine. |
| 7 | MemoryModule (caller) | src/modules/memory/MemoryModule.ts | Injection point for MemoryEngine. |

### 13.2 Import Changes Per Module

**TreeSitterIndexer** (src/engine/parsers/tree-sitter-indexer.ts):
- REMOVE: import Database from 'better-sqlite3'
- ADD: import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js'
- Constructor: (registry, db: Database.Database, maxFileSize) to (registry, adapter: DatabaseAdapter, maxFileSize)
- Internal: storeResults(this.db, ...) to storeResults(this.adapter, ...)
- NOTE: src/engine/parsers/indexer/storage.ts also needs refactor to accept DatabaseAdapter

**GraphSyncService** (src/engine/graph/graph-sync-service.ts):
- REMOVE: import type Database from 'better-sqlite3'
- ADD: import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js'
- Constructor: (indexDb: Database.Database, adminDb: Database.Database, log) to (indexAdapter: DatabaseAdapter, adminAdapter: DatabaseAdapter, log)
- this.indexDb.prepare(sql).all(...) to this.indexAdapter.all(sql, params)
- this.adminDb.prepare(sql).run(...) to this.adminAdapter.run(sql, params)
- this.adminDb.transaction(fn)() to this.adminAdapter.transaction(fn)

**MemoryEngineCrud + MemoryEngine** (src/modules/memory/engine/crud.ts + core.ts):
- REMOVE: import Database from 'better-sqlite3'
- ADD: import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js'
- constructor(db: Database.Database) to constructor(adapter: DatabaseAdapter)
- Field: protected readonly db to protected readonly adapter
- BREAKING: getDb() method must be removed or deprecated
- CompositeScorer constructor also changes to accept DatabaseAdapter

**IndexingEngine** (src/engine/indexer/indexing-engine.ts):
- REMOVE: import Database from 'better-sqlite3'; import { DatabaseManager } from '../db/database-manager.js'
- ADD: import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js'
- Constructor: (dbManager: DatabaseManager, config) to (adapter: DatabaseAdapter, config)
- Field: private db: Database.Database to private adapter: DatabaseAdapter
- All this.db.prepare(sql).run(...) to this.adapter.run(sql, params) or this.adapter.prepare(sql).run(...)
- this.db.transaction(fn)(args) to this.adapter.transaction(() => fn(args))

### 13.3 Caller Code Changes at ALL Injection Points

**CodeIntelModule.ts** (src/modules/code-intel/CodeIntelModule.ts):
- ADD import: import { SqliteDbAdapter } from '../../modules/memory/task-queue/SqliteDbAdapter.js'
- Change: this.indexer = new IndexingEngine(this.dbManager, config)
- To: const adapter = new SqliteDbAdapter(this.dbManager.getDb()); this.indexer = new IndexingEngine(adapter, config)

**MemoryModule.ts** (src/modules/memory/MemoryModule.ts):
- SqliteDbAdapter already imported (used for TaskWorker)
- Change: this.engine = new MemoryEngine(this.dbManager.getDb())
- To: const memAdapter = new SqliteDbAdapter(this.dbManager.getDb()); this.engine = new MemoryEngine(memAdapter)

**IndexingEngine.syncGraphNodes()** (internal to IndexingEngine):
- ADD import: import { SqliteDbAdapter } from '../../modules/memory/task-queue/SqliteDbAdapter.js'
- Change: new GraphSyncService(this.db, adminDb, logger)
- To: new GraphSyncService(this.adapter, new SqliteDbAdapter(adminDb), logger)

**IndexingEngine.initTreeSitter()** (internal):
- Change: this.treeSitterIndexer = new TreeSitterIndexer(this.grammarRegistry, this.db, this.config.maxFileSize)
- To: this.treeSitterIndexer = new TreeSitterIndexer(this.grammarRegistry, this.adapter, this.config.maxFileSize)

---

## 14. Technical Appendix C - Integration Requirements (TA Enrichment)

### 14.1 How DatabaseManager.getDb() Calls Are Replaced

Current pattern (used in 15+ locations):
- DatabaseManager.getDb() returns raw better-sqlite3 Database instance
- Modules use this for ALL operations (queries, transactions, prepared statements)

Replacement strategy:
- DatabaseManager KEEPS getDb() for backward compat (admin routes, migrations)
- Engine modules receive SqliteDbAdapter wrapping the same Database instance
- SqliteDbAdapter.constructor(db: Database.Database) creates adapter from existing connection
- NO new connection opened - same in-memory reference, zero overhead

Shared connection safety:
- SqliteDbAdapter wraps (does not own) the Database instance
- connect()/disconnect() are no-ops on SqliteDbAdapter
- The underlying Database lifecycle is still managed by DatabaseManager
- Multiple SqliteDbAdapter instances can wrap the same Database safely (stateless wrapper)

### 14.2 SqliteDbAdapter Backward Compatibility

SqliteDbAdapter already implements full DatabaseAdapter interface (SA4E-44):
- run(), get(), all(), exec() - direct delegation to db.prepare().run/get/all
- transaction() - wraps db.transaction(fn)() pattern
- prepare() - returns PreparedStatement wrapper around Statement
- getEngine() returns 'sqlite'
- getTableNames(), getRowCount() - working implementations

What SqliteDbAdapter does NOT handle (and does not need to):
- Connection pooling (single connection, managed by DatabaseManager)
- Reconnection logic (SQLite file is always available)
- Parameter translation (SQLite uses ? natively)
- Async operations (all SQLite ops are synchronous)

### 14.3 Transaction Nesting Behavior

**SQLite (via SqliteDbAdapter):**
- better-sqlite3 does NOT support nested transactions
- Calling adapter.transaction() inside another transaction() WILL throw
- Workaround: Use SAVEPOINT for sub-transactions (not in current adapter interface)
- Current engine code does NOT nest transactions - verified by code audit

**PostgreSQL (via future PostgresAdapter):**
- PostgreSQL supports SAVEPOINT for nested transactions
- PostgresAdapter.transaction() should detect if already in transaction and use SAVEPOINT
- Implementation: maintain internal _inTransaction flag
- Nested call: BEGIN -> SAVEPOINT sp_N -> ... -> RELEASE SAVEPOINT sp_N -> COMMIT

**Recommendation for BR-8:**
- Add to DatabaseAdapter interface: isInTransaction(): boolean
- PostgresAdapter uses SAVEPOINTs automatically for nested calls
- SqliteDbAdapter.isInTransaction() returns false always (no nesting)
- Engine modules should NEVER nest transactions explicitly

### 14.4 Dual-Database Pattern (GraphSyncService)

GraphSyncService currently receives TWO Database instances:
- indexDb: the index.db file (files, symbols tables)
- adminDb: the admin.db file (graph_nodes, graph_edges)

After refactor, it receives TWO DatabaseAdapter instances:
- indexAdapter: wraps index.db (may be SQLite or PostgreSQL)
- adminAdapter: wraps admin.db (may be SQLite or PostgreSQL)

Critical constraint:
- Both adapters CAN be different engines (e.g., indexDb=PostgreSQL, adminDb=SQLite)
- This is unlikely but architecturally valid
- GraphSyncService must NOT assume same engine for both
- DialectHelper must be instantiated per-adapter: new DialectHelper(adapter.getEngine())

---

## 15. Technical Appendix D - Pseudocode for Complex Business Logic (TA Enrichment)

### 15.1 DialectHelper.buildFtsQuery() - Full Branch Logic

```
function buildFtsQuery(adapter: DatabaseAdapter, query: string, options: FtsOptions): FtsQueryResult {
  const engine = adapter.getEngine();
  const sanitized = sanitizeFtsInput(query);  // remove special chars except * and "

  if (engine === 'sqlite') {
    // SQLite FTS5 path
    const ftsQuery = sanitized.trim() || '*';  // empty -> wildcard
    const sql = `
      SELECT ke.*, f.rank
      FROM (SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ?) f
      JOIN knowledge_entries ke ON f.rowid = ke.id
      WHERE ${buildWhereClause(options)}
      ORDER BY f.rank
      LIMIT ?
    `;
    const params = [ftsQuery, ...buildWhereParams(options), options.limit];
    return { sql, params };
  }

  if (engine === 'postgresql') {
    // PostgreSQL tsvector path
    if (!sanitized.trim()) {
      // Empty query -> return all ordered by created_at
      return buildAllEntriesQuery(options);
    }
    const sql = `
      SELECT ke.*, ts_rank(ke.tsvector_content, query) as rank
      FROM knowledge_entries ke, plainto_tsquery('english', ?) query
      WHERE ke.tsvector_content @@ query
        AND ${buildWhereClause(options)}
      ORDER BY rank DESC
      LIMIT ?
    `;
    const params = [sanitized, ...buildWhereParams(options), options.limit];
    return { sql, params };
  }

  // MySQL path (future)
  if (engine === 'mysql') {
    const sql = `
      SELECT ke.*, MATCH(content, summary) AGAINST(? IN NATURAL LANGUAGE MODE) as rank
      FROM knowledge_entries ke
      WHERE MATCH(content, summary) AGAINST(? IN NATURAL LANGUAGE MODE)
        AND ${buildWhereClause(options)}
      ORDER BY rank DESC
      LIMIT ?
    `;
    const params = [sanitized, sanitized, ...buildWhereParams(options), options.limit];
    return { sql, params };
  }

  throw new Error(`Unsupported engine: ${engine}`);
}

function sanitizeFtsInput(query: string): string {
  // Keep: alphanumeric, spaces, *, quotes (for phrase search)
  // Remove: all other special chars that break FTS syntax
  return query.replace(/[^\w\s*":.]/g, ' ').trim();
}
```

### 15.2 MigrationService.migrateEngineTables() - Batch Copy Flow

```
async function migrateEngineTables(source: DatabaseAdapter, target: DatabaseAdapter, onProgress): MigrationResult {
  const BATCH_SIZE = 500;
  let cancelled = false;

  // Phase 1: Discover tables
  const allTables = await source.getTableNames();
  const migratables = allTables.filter(t =>
    !t.includes('_fts') &&           // Skip FTS virtual tables
    !t.startsWith('sqlite_') &&      // Skip SQLite internals
    t !== 'schema_version'           // Skip version tracking
  );

  // Phase 2: Create schema in target
  for (const table of migratables) {
    if (cancelled) throw new CancelledError();
    onProgress({ phase: 'schema', table });

    const ddl = source.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table]);
    if (!ddl) continue;

    const cleanDDL = removeForeignKeys(ddl.sql);
    const translatedDDL = translateDDL(cleanDDL, target.getEngine());

    try {
      target.exec(translatedDDL);
    } catch (err) {
      if (!err.message.includes('already exists')) throw err;
      // Table exists - skip (CREATE TABLE IF NOT EXISTS semantics)
    }
  }

  // Phase 3: Copy data in batches
  for (const table of migratables) {
    if (cancelled) throw new CancelledError();

    const total = await source.getRowCount(table);
    if (total === 0) { onProgress({ phase: 'data', table, percent: 100 }); continue; }

    let copied = 0;
    while (copied < total) {
      if (cancelled) throw new CancelledError();

      // Read batch from source
      const rows = source.all(`SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${copied}`);
      if (rows.length === 0) break;

      // Write batch to target (atomic per batch)
      target.transaction(() => {
        for (const row of rows) {
          const cols = Object.keys(row);
          const placeholders = cols.map(() => '?').join(', ');
          target.run(
            `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
            Object.values(row)
          );
        }
      });

      copied += rows.length;
      onProgress({ phase: 'data', table, rowsCopied: copied, totalRows: total, percent: Math.round(copied/total*100) });
    }
  }

  // Phase 4: Verify
  for (const table of migratables) {
    const srcCount = await source.getRowCount(table);
    const tgtCount = await target.getRowCount(table);
    if (srcCount !== tgtCount) {
      throw new Error(`Row count mismatch for ${table}: source=${srcCount}, target=${tgtCount}`);
    }
  }

  return { success: true, tablesProcessed: migratables.length };
}
```

### 15.3 Module Reinitialization After DB Switch (Hot-Swap)

```
async function reinitializeEngineModules(newConfig: DatabaseConnectionConfig): void {
  // Strategy: HOT-SWAP (no server restart needed)
  // Modules are recreated with new adapter, old adapter disconnected after

  // Step 1: Create and connect new adapter
  const newAdapter = DatabaseAdapterFactory.create(newConfig);
  await newAdapter.connect();

  // Step 2: Verify schema exists in new DB
  const tables = await newAdapter.getTableNames();
  const required = ['files', 'symbols', 'knowledge_entries', 'memory_sessions'];
  const missing = required.filter(t => !tables.includes(t));
  if (missing.length > 0) {
    throw new Error(`Target DB missing tables: ${missing.join(', ')}`);
  }

  // Step 3: Stop current engines (drain active operations)
  const oldIndexer = codeIntelModule.getIndexer();
  oldIndexer.stop();  // stops file watcher, waits for current index to finish

  const oldEngine = memoryModule.getEngine();
  oldEngine.endSession();

  // Step 4: Recreate engines with new adapter
  // CodeIntelModule: new IndexingEngine(newAdapter, config)
  // MemoryModule: new MemoryEngine(newAdapter)
  // GraphSyncService: gets new adapters when syncProjectSymbols() is called

  // Step 5: Recreate FTS indexes (engine-specific)
  if (newConfig.engine === 'postgresql') {
    // Create tsvector column + GIN index if not exists
    newAdapter.exec(`
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS tsvector_content tsvector;
      CREATE INDEX IF NOT EXISTS idx_ke_fts ON knowledge_entries USING GIN(tsvector_content);
      UPDATE knowledge_entries SET tsvector_content = to_tsvector('english', coalesce(summary,'') || ' ' || coalesce(content,''));
    `);
    // Create trigger to maintain tsvector on INSERT/UPDATE
    newAdapter.exec(`
      CREATE OR REPLACE FUNCTION ke_tsvector_trigger() RETURNS trigger AS $$
      BEGIN
        NEW.tsvector_content := to_tsvector('english', coalesce(NEW.summary,'') || ' ' || coalesce(NEW.content,''));
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS ke_tsvector_update ON knowledge_entries;
      CREATE TRIGGER ke_tsvector_update BEFORE INSERT OR UPDATE ON knowledge_entries
      FOR EACH ROW EXECUTE FUNCTION ke_tsvector_trigger();
    `);
  }

  // Step 6: Start new session
  // MemoryEngine.startSession(sessionName) on new adapter

  // Step 7: Disconnect old adapter (best-effort)
  try { await oldAdapter.disconnect(); } catch { /* non-fatal */ }
}
```

---

## 16. Technical Appendix E - Data Model Corrections (TA Enrichment)

### 16.1 Missing Tables in FSD Section 5

The following tables exist in the codebase but were MISSING from FSD Section 5:

| Table | Source File | Description |
|-------|------------|-------------|
| modules | src/engine/db/schema.ts | Module groupings with pattern metadata |
| embeddings | src/engine/db/schema.ts | Vector embeddings for semantic search |
| knowledge_vectors | src/modules/memory/schema/tables.ts | Entry-level embedding vectors (384-dim) |
| conversation_turns | src/modules/memory/schema/tables.ts | Session conversation history |
| entity_index | src/modules/memory/schema/tables.ts | Named entity extraction index |
| agent_scope_config | src/modules/memory/schema/tables.ts | Per-agent tag/scope configuration |
| quality_scores | src/modules/memory/schema/tables.ts | Entry quality scoring dimensions |
| tags | src/modules/memory/schema/tables.ts | Tag taxonomy with hierarchy |
| entry_tags | src/modules/memory/schema/tables.ts | Many-to-many entry-tag junction |
| citations | src/modules/memory/schema/tables.ts | Citation tracking |
| attachments | src/modules/memory/schema/tables.ts | File attachments for entries |
| templates | src/modules/memory/schema/tables.ts | Ingest templates |
| feedback | src/modules/memory/schema/tables.ts | Entry feedback/ratings |
| reminders | src/modules/memory/schema/tables.ts | Review reminders |
| search_log | src/modules/memory/schema/tables.ts | Search query history |
| popular_queries | src/modules/memory/schema/tables.ts | Popular query aggregation |
| kb_shared_grants | src/modules/memory/schema/tables.ts | Project sharing grants |
| symbols_fts | src/engine/db/schema.ts | FTS5 virtual table for symbols |
| knowledge_fts | src/modules/memory/schema/tables.ts | FTS5 virtual table for KB entries |
| schema_version | src/engine/db/schema.ts | Schema version tracking |

### 16.2 Missing Columns in FSD Data Model

**symbols table** - missing columns (added by migrator.ts):
- is_exported: INTEGER DEFAULT 0 (used by GraphSyncService ORDER BY)
- complexity: INTEGER (cyclomatic complexity score)
- parent_symbol_id: INTEGER (FK to symbols.id for hierarchy)
- decorators: TEXT (JSON array of decorator names)
- is_async: INTEGER DEFAULT 0
- doc_comment_full: TEXT (full doc comment, not truncated)
- modifiers: TEXT (JSON array)

**knowledge_entries table** - missing columns vs actual DDL:
- pinned: INTEGER NOT NULL DEFAULT 0
- pin_order: INTEGER NOT NULL DEFAULT 0
- structured_map: TEXT NOT NULL DEFAULT '{}'
- quality_score: INTEGER DEFAULT NULL
- NOTE: summary is NOT NULL in actual DDL (FSD says nullable)

**memory_audit table** - missing columns:
- agent_name: TEXT (which agent performed the operation)
- details: TEXT (JSON details of the operation)

**memory_sessions table** - missing columns:
- observation_count: INTEGER NOT NULL DEFAULT 0

**graph_nodes (admin.db)** - corrections:
- id column does NOT exist - entry_id is the PRIMARY KEY (TEXT, not INTEGER)
- created_at: TEXT NOT NULL DEFAULT (datetime('now')) - missing from FSD
- level is INTEGER (not TEXT) - default 2

**graph_edges (admin.db)** - corrections:
- Column names differ: source (not source_id), target (not target_id), rel_type (not relation)
- weight default is 0.5 (not NULL)
- UNIQUE(source, target) constraint exists
- project_id column does NOT exist on graph_edges

### 16.3 PostgreSQL Column Type Translation Map

| SQLite Type | PostgreSQL Type | Notes |
|-------------|-----------------|-------|
| INTEGER PRIMARY KEY AUTOINCREMENT | SERIAL PRIMARY KEY | Or BIGSERIAL for large tables |
| TEXT | TEXT | Same |
| REAL | DOUBLE PRECISION | Or NUMERIC for exact precision |
| INTEGER (boolean) | INTEGER | Keep as integer (PG accepts 0/1 for boolean) |
| BLOB | BYTEA | Binary data |
| TEXT DEFAULT (datetime('now')) | TIMESTAMPTZ DEFAULT NOW() | Or keep as TEXT for compatibility |
| INTEGER DEFAULT 0 | INTEGER DEFAULT 0 | Same |
| TEXT NOT NULL UNIQUE | TEXT NOT NULL UNIQUE | Same |

---

## 17. Technical Appendix F - Non-Functional Requirements (Quantified) (TA Enrichment)

### 17.1 Performance Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Adapter overhead per simple query (SQLite mode) | < 500ns | Benchmark: adapter.run() vs db.prepare().run() for INSERT |
| Adapter overhead per prepared statement | < 200ns | Benchmark: adapter.prepare(sql).run() vs db.prepare(sql).run() |
| Adapter overhead per transaction wrapper | < 1us | Benchmark: adapter.transaction(fn) vs db.transaction(fn)() |
| Migration throughput (data copy) | > 2000 rows/sec per table | Measured with BATCH_SIZE=500 |
| Full migration (10K files + 100K symbols) | < 5 minutes | End-to-end including verify phase |
| FTS query latency (SQLite, 10K entries) | < 50ms | Measured at MemoryEngine.search() level |
| FTS query latency (PostgreSQL, 10K entries) | < 100ms | Measured with GIN index on tsvector |
| Module reinitialization (hot-swap) | < 2 seconds | From adapter.connect() to first query served |

### 17.2 Memory Overhead

| Component | Target | Notes |
|-----------|--------|-------|
| SqliteDbAdapter instance | < 100 bytes | Stateless wrapper - single reference to Database |
| PreparedStatement wrapper | < 200 bytes | Wrapper around Statement object |
| DialectHelper instance | < 50 bytes | Holds single engine string |
| PostgresAdapter connection pool (idle) | < 5MB | Shared across all engine modules |
| PostgresAdapter per-connection | ~2MB | Based on pg library baseline |

### 17.3 Connection Pool Sizing (PostgreSQL)

| Parameter | Recommended Value | Rationale |
|-----------|-------------------|-----------|
| pool.max | 10 | Ceiling for single-tenant backend; admin + engine modules share pool |
| pool.min | 2 | Warm connections: 1 for engine queries, 1 for admin |
| pool.idleTimeout | 30000ms | Release idle connections after 30s |
| pool.connectionTimeout | 5000ms | Fail fast if DB unreachable |
| pool.statementCacheSize | 100 | LRU cache for prepared statements per connection |
| max_prepared_transactions (PG server) | 0 (disabled) | Not using 2PC; prepared statements use unnamed protocol |

### 17.4 Scalability Limits

| Dimension | Tested Limit | Expected Behavior |
|-----------|-------------|-------------------|
| Concurrent indexing projects | 5 (via indexing Set guard) | Projects queued, not parallel |
| Max files per project | 50,000 | Full index < 10 minutes |
| Max symbols per project | 500,000 | GraphSync limits to top 2000 |
| Max knowledge_entries | 100,000 | FTS performance degrades > 100K; recommend archival |
| Max concurrent search queries | 50 (SQLite WAL readers) | No write blocking |
| Migration batch memory | ~50MB peak | 500 rows * avg 100KB per row |

---

## 18. Technical Appendix G - Open Issues and Unresolved Decisions (TA Enrichment)

### 18.1 Sync vs Async DatabaseAdapter

**Issue:** Current DatabaseAdapter interface is SYNCHRONOUS (run/get/all/transaction return values directly). Should engine modules migrate to AsyncDatabaseAdapter?

**Current State:**
- DatabaseAdapter (sync): used by engine modules (IndexingEngine, MemoryEngine, GraphSyncService)
- MigrationService already uses async patterns internally (execAsync, runAsync, transactionAsync)
- SQLite operations are inherently synchronous (better-sqlite3 is sync by design)
- PostgreSQL operations are inherently asynchronous (pg library is async)

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| A: Keep sync interface, PG adapter blocks internally | Zero change to engine modules. Simple. | PG adapter must use synchronous wrapper (deasync/sync-rpc) - fragile, no event loop yielding |
| B: Add AsyncDatabaseAdapter, engine modules migrate | True async for PG. Event loop friendly. | MASSIVE refactor: every engine method becomes async. 200+ call sites change. |
| C: Hybrid - sync for SQLite, async for PG with separate code paths | Best of both worlds for perf | Code duplication. Two code paths to maintain. |
| D: Keep sync for engine, async only for migration/admin | Migration already async. Engine stays sync. PG adapter uses pg-native (sync binding). | pg-native has limited support. Blocks thread for PG queries. |

**RECOMMENDATION:** Option A for SA4E-45 (sync interface + sync PG wrapper). Defer Option B to SA4E-46 if performance testing shows blocking is problematic. Rationale: SA4E-45 scope is abstraction refactor, not async migration.

### 18.2 Index.db Separation

**Issue:** Should indexing tables (files, symbols, embeddings, modules) remain in a separate SQLite file (index.db) or merge into the main admin.db when migrating to PostgreSQL?

**Current State:**
- index.db: files, symbols, symbols_fts, modules, embeddings, schema_version
- admin.db: graph_nodes, graph_edges, users, sessions, config, etc.
- These are TWO separate SQLite files with separate Database instances
- GraphSyncService reads from index.db and writes to admin.db

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| A: Keep separate - both migrate independently | Matches current architecture. Isolates concerns. | Two PG databases/schemas. Two connection pools. Cross-DB joins impossible. |
| B: Merge into single PG database, separate schemas | Single connection pool. Can join if needed. | Schema ownership unclear. Migration more complex. |
| C: Merge into single PG database, single schema | Simplest PG setup. One pool. One migration. | Table name collisions possible (unlikely). Mixed concerns in one schema. |

**RECOMMENDATION:** Option C for PostgreSQL target. Rationale: all tables have unique names, PG has one database with one schema. SQLite mode remains as-is (two files). The adapter factory creates one PostgresAdapter for the combined schema.

### 18.3 GraphSyncService Dual-Adapter Engine Mismatch

**Issue:** Can GraphSyncService operate with indexAdapter=PostgreSQL and adminAdapter=SQLite (or vice versa)?

**Analysis:**
- Technically possible - both implement same DatabaseAdapter interface
- SQL dialect differences could cause issues if INSERT OR IGNORE is used across adapters
- GraphSyncService uses dialect-specific SQL (INSERT OR IGNORE for adminDb)

**DECISION:** Support same-engine only for both adapters in SA4E-45. Add runtime check:
```
if (indexAdapter.getEngine() !== adminAdapter.getEngine()) {
  log.warn('Mixed engine mode for GraphSync - ensure SQL compatibility');
}
```
In practice, when both migrate to PG, they will both be PG. Mixed mode is only during migration window.

### 18.4 MemoryEngineCrud.getDb() Breaking Change

**Issue:** MemoryEngineCrud exposes getDb(): Database.Database which returns the raw better-sqlite3 instance. Some callers (promotion service, scheduler) may use this.

**Analysis:**
- getDb() is used by: ScopePromotionService, startScheduler, CompositeScorer, migration scripts (001, 002, 003)
- After refactor, getDb() cannot return raw db if module holds adapter

**Options:**
| Option | Approach |
|--------|----------|
| A | Remove getDb() entirely - all callers refactored to use adapter |
| B | Keep getDb() but delegate to adapter.getUnderlyingConnection() (leaky abstraction) |
| C | Keep getDb() on MemoryEngineCrud for backward compat, gradually deprecate |

**RECOMMENDATION:** Option C for SA4E-45. Add `@deprecated` annotation. Callers that need raw db (migration scripts) continue working. New code uses adapter. Remove in follow-up ticket.

### 18.5 Pending Tasks Table (pending_tasks) Not Listed

**Issue:** The pending_tasks table (added by migrate003PendingTasks) is used by TaskWorker but missing from FSD data model.

**Resolution:** Add to Section 5 data model. Schema:
- id: INTEGER PK AUTOINCREMENT
- task_type: TEXT NOT NULL (e.g., 'tag_analysis', 'embedding')
- entry_id: INTEGER NOT NULL (references knowledge_entries.id)
- status: TEXT NOT NULL DEFAULT 'pending' (pending/processing/done/failed)
- attempts: INTEGER NOT NULL DEFAULT 0
- created_at: TEXT NOT NULL DEFAULT (datetime('now'))
- updated_at: TEXT NOT NULL DEFAULT (datetime('now'))
- error: TEXT DEFAULT NULL

---

## 19. Technical Appendix H - Security Review (TA Enrichment)

### 19.1 Security Considerations for DatabaseAdapter Abstraction

| Category | Risk | Mitigation |
|----------|------|------------|
| SQL Injection | Adapter interface passes raw SQL strings | All engine modules use parameterized queries (? placeholders). DialectHelper generates SQL with placeholders, never string interpolation. |
| Credential Exposure | PostgreSQL connection string contains password | Credentials via environment variables (PG_PASSWORD). Never in source code or config files. ConfigService stores engine type + host/port/dbname only. |
| Connection String Logging | Adapter status/errors may log connection details | ConnectionStatus.details MUST NOT include password. Log sanitizer strips credentials from error messages. |
| Privilege Escalation | Single DB user for all operations | PostgreSQL adapter should use least-privilege role: SELECT/INSERT/UPDATE/DELETE on app tables only. No CREATE/DROP in production (migrations run with elevated role). |
| Data Leakage During Migration | Data transmitted between databases | Migration runs on same host (localhost). If remote PG, use TLS (sslmode=require in connection config). |
| Denial of Service | Unbounded query results | adapter.all() without LIMIT could return millions of rows. Engine modules MUST always include LIMIT clause. Adapter does NOT enforce this (too restrictive). |
| Transaction Timeout | Long-running transaction locks resources | PostgreSQL adapter should set statement_timeout (default 30s). SQLite has no timeout (single-writer, fast). |
| Prepared Statement Cache Poisoning | Cached prepared statement with wrong schema | After migration/schema change, adapter.disconnect() + reconnect() clears statement cache. Hot-swap flow handles this. |

### 19.2 Sensitive Data Handling

- knowledge_entries.content may contain sensitive project information
- During migration, data is transferred in-memory (not written to temp files)
- Migration progress events do NOT include row content (only table name + counts)
- Rollback drops ALL data from target (no orphaned sensitive data)

### 19.3 Access Control

- DatabaseAdapter has no built-in access control (it's a low-level interface)
- Access control is enforced at the module level (IsolationLayer, ScopeContext)
- After refactor, access control remains unchanged (adapter is transparent to auth)

---

## Revision History (Updated)

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | BA Agent | Initial FSD from BRD SA4E-45 |
| 1.1 | 2026-07-18 | TA Agent | Technical enrichment: Appendices A-H (edge cases, injection points, integration specs, pseudocode, data model corrections, NFRs, open issues, security review) |

