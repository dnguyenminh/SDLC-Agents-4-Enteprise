# Functional Specification Document (FSD)

## SA4E-33: Multi-database Support with Admin Configuration & Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-33 |
| Version | 1.0 |
| Date | 2026-07-14 |
| Author | BA Agent + TA Agent |
| Status | Draft |

---

## 1. Use Cases

### UC-1: View Database Status

**Actor:** Admin
**Precondition:** Admin authenticated via admin panel
**Trigger:** Admin navigates to Database Configuration section

**Main Flow:**
1. Admin opens admin panel → Database Configuration tab
2. System reads `database.json` config file
3. System displays: engine name, connection status, database stats
4. For SQLite: file path, file size (bytes)
5. For PostgreSQL/MySQL: host:port/dbname, connection pool status

**Alternative Flow:**
- A1: Config file missing → system shows "SQLite (default)" with auto-detected paths
- A2: Connection lost → status shows "Disconnected" with error tooltip

**Exception Flow:**
- E1: Admin not authorized (missing CONFIG_EDIT permission) → 403 redirect

---

### UC-2: Switch Database Engine

**Actor:** Admin
**Precondition:** UC-1 completed, current status displayed
**Trigger:** Admin selects different engine from dropdown

**Main Flow:**
1. Admin selects engine from dropdown (SQLite / PostgreSQL / MySQL)
2. If non-SQLite → system renders connection form
3. Admin fills: host, port, username, password, database, ssl
4. System validates form (required fields check)
5. "Test Connection" button becomes enabled

**Alternative Flow:**
- A1: Admin selects SQLite → connection form hidden, "Switch to SQLite" button shown
- A2: Admin re-selects current engine → no form change, disabled state

**Exception Flow:**
- E1: Form validation fails → inline error messages per field

---

### UC-3: Test Database Connection

**Actor:** Admin
**Precondition:** UC-2 form filled with valid data
**Trigger:** Admin clicks "Test Connection"

**Main Flow:**
1. System sends POST `/api/admin/database/test-connection`
2. Backend creates temporary connection with provided params
3. Backend executes `SELECT 1` with 5s timeout
4. Backend returns success → UI shows green checkmark
5. "Start Migration" button becomes enabled

**Alternative Flow:**
- A1: Connection succeeds but DB empty → show info "Database exists, no tables"
- A2: Connection succeeds, tables exist → show warning "Target DB has existing data"

**Exception Flow:**
- E1: Auth failed → `{ success: false, error: { code: "AUTH_FAILED", message: "..." } }`
- E2: Host unreachable → `{ success: false, error: { code: "CONN_TIMEOUT", message: "..." } }`
- E3: DB not found → `{ success: false, error: { code: "DB_NOT_FOUND", message: "..." } }`
- E4: SSL error → `{ success: false, error: { code: "SSL_ERROR", message: "..." } }`

---

### UC-4: Migrate Data

**Actor:** Admin
**Precondition:** UC-3 test passed
**Trigger:** Admin clicks "Start Migration"

**Main Flow:**
1. System sends POST `/api/admin/database/migrate`
2. Backend creates schema in target DB (DDL statements)
3. Backend copies data table-by-table (batch of 500 rows)
4. Backend sends progress via SSE stream
5. After all tables → backend verifies row counts
6. If verified → backend updates `database.json`
7. Backend restarts affected modules
8. UI shows "Migration complete"

**Alternative Flow:**
- A1: Admin clicks "Cancel" → backend stops, drops target tables, reverts config
- A2: Some tables empty → skip with 0/0 progress

**Exception Flow:**
- E1: Schema creation fails → abort, no data touched
- E2: Data copy fails mid-table → rollback that table transaction, abort, revert
- E3: Row count mismatch → mark failed, keep SQLite active

---

### UC-5: Monitor Migration Progress

**Actor:** Admin
**Precondition:** UC-4 in progress

**Main Flow:**
1. UI establishes SSE to `/api/admin/database/migrate/progress`
2. Backend streams: `{ phase, table, rowsCopied, totalRows, percent }`
3. UI renders progress bar
4. On completion → final event

---

### UC-6: Rollback Migration

**Actor:** System (automatic) or Admin
**Trigger:** Error or cancel

**Main Flow:**
1. Stop copying
2. Drop created tables in target
3. Revert `database.json` to SQLite
4. Re-init SQLite connections
5. Show "Rolled back to SQLite"

---

## 2. Business Rules

| ID | Rule |
|----|------|
| BR-1 | Default engine is SQLite; zero config for fresh install |
| BR-2 | Migration requires successful connection test first |
| BR-3 | Migration is atomic per-table (batch within transaction) |
| BR-4 | SQLite files are NEVER deleted |
| BR-5 | Passwords encrypted at rest (AES-256-GCM) in database.json |
| BR-6 | Connection test timeout: 5 seconds |
| BR-7 | Batch size: 500 rows per INSERT |
| BR-8 | Only CONFIG_EDIT permission can access DB config |
| BR-9 | All config changes audit-logged |
| BR-10 | After migration, affected modules MUST restart |

---

## 3. API Specifications

### 3.1 GET /api/admin/database/status

Returns current database engine, connection status, and statistics.

**Response:** `{ success, data: { engine, status, details, stats } }`

### 3.2 POST /api/admin/database/test-connection

Tests connectivity to target database without modifying anything.

**Request:** `{ engine, host, port, username, password, database, ssl }`
**Response:** `{ success, data: { connected, serverVersion, existingTables, latencyMs } }`

### 3.3 POST /api/admin/database/migrate

Starts migration process. Returns SSE stream with progress events.

**Request:** `{ engine, host, port, username, password, database, ssl }`
**SSE Events:** `progress` (phase/table/percent) → `complete` or `error`

### 3.4 POST /api/admin/database/migrate/cancel

Cancels in-progress migration and triggers rollback.

### 3.5 POST /api/admin/database/switch-to-sqlite

Switches back to SQLite (no migration needed, just config change + module restart).

---

## 4. Data Model — database.json

```json
{
  "activeEngine": "sqlite",
  "engines": {
    "sqlite": { "adminDbPath": ".code-intel/admin.db", "indexDbPath": ".code-intel/index.db" },
    "postgresql": { "host": "", "port": 5432, "username": "", "password": "ENC:...", "database": "", "ssl": false, "pool": { "min": 2, "max": 10 } },
    "mysql": { "host": "", "port": 3306, "username": "", "password": "ENC:...", "database": "", "ssl": false, "pool": { "min": 2, "max": 10 } }
  },
  "migration": { "lastMigration": null, "backupSqlitePaths": [] }
}
```

---

## 5. Tables to Migrate

**admin.db:** users, access_groups, group_permissions, sessions, audit_log, config_changes, graph_nodes, graph_edges

**index.db:** files, symbols, modules, embeddings, mcp_tools, tool_usage, knowledge_entries, knowledge_vectors, knowledge_graph_edges, consolidation_log, memory_sessions, memory_audit, conversation_turns, entity_index, agent_scope_config, quality_scores, tags, entry_tags, citations, attachments, templates, feedback, reminders, search_log, popular_queries, kb_shared_grants

**NOT migrated (rebuilt):** FTS5 virtual tables, schema_version

---

## 6. Database Adapter Interface

```typescript
interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStatus(): ConnectionStatus;
  run(sql: string, params?: any[]): RunResult;
  get<T>(sql: string, params?: any[]): T | undefined;
  all<T>(sql: string, params?: any[]): T[];
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  getEngine(): 'sqlite' | 'postgresql' | 'mysql';
  getVersion(): Promise<string>;
  getTableNames(): Promise<string[]>;
  getRowCount(table: string): Promise<number>;
}
```

---

## 7. Error Codes

| Code | HTTP | Message | Recovery |
|------|------|---------|----------|
| AUTH_FAILED | 400 | Authentication failed | Fix credentials |
| CONN_TIMEOUT | 400 | Connection timed out | Check host/port |
| DB_NOT_FOUND | 400 | Database not found | Create DB first |
| SSL_ERROR | 400 | SSL connection failed | Check SSL config |
| MIGRATION_SCHEMA_FAIL | 500 | Schema creation failed | Check DDL permissions |
| MIGRATION_DATA_FAIL | 500 | Data copy failed | Check disk space |
| MIGRATION_VERIFY_FAIL | 500 | Row count mismatch | Report bug |
| CONFIG_WRITE_FAIL | 500 | Config save failed | Check fs permissions |

---

## 8. UI Specification

### Panel Location
Admin Panel → Settings → Database Configuration tab (new tab in existing settings)

### States
idle → engine_selected → test_passed → migrating → migration_done/failed

### Elements
- Engine dropdown (SQLite/PostgreSQL/MySQL)
- Connection form (conditional on non-SQLite)
- Test Connection button
- Start Migration button (enabled after test pass)
- Progress bar + migration log (during migration)
- Cancel button (during migration)

---

## 9. Module Restart Protocol

After migration:
1. `registry.shutdownAll()` on memory, code-intel, analytics modules
2. Update adapter in registry
3. `registry.initializeAll()` with new adapter
4. Verify all modules reach `ready` state
5. If module fails → rollback to SQLite

---

## 10. Security Considerations

- Passwords in database.json: AES-256-GCM encrypted with machine-specific key
- Connection params never logged (password masked)
- All DB config API endpoints require CONFIG_EDIT permission
- Audit log entry for every config change
- Migration audit entry with timestamp and result
