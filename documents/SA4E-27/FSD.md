# Functional Specification Document (FSD)

## SA4E Code Intelligence — SA4E-27: Redesign Multi-Tenant Project Isolation cho KB

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-27 |
| Title | Redesign Multi-Tenant Project Isolation cho KB |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-10 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-27.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-10 | BA Agent | Initiate document — redesign FSD derived from BRD and codebase analysis |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior for the **complete redesign** of multi-tenant project isolation in the Knowledge Base (KB) memory system. Unlike SA4E-26 (incremental patch), this document specifies a centralized IsolationLayer module that encapsulates ALL scope/project filtering logic, end-to-end context threading, and a versioned schema migration system.

### 1.2 Scope

**In Scope:**
- New `IsolationLayer` module — centralized scope filtering logic
- `ProjectContext` creation and E2E threading from extension to DB
- Versioned schema migration system (`schema_migrations` table)
- PROJECT-scope isolation by `project_id`
- SHARED-scope cross-project visibility
- USER-scope unchanged (user_id only)
- Legacy entry backward compatibility (NULL project_id)
- Comprehensive test matrix for all isolation scenarios

**Out of Scope:**
- FTS5 virtual table internal structure (filter at JOIN level)
- Vector search / ONNX embedding logic
- Graph edges or graph service
- UI/frontend changes
- Cross-machine synchronization
- Multi-user concurrent access
- Data migration of existing entries (legacy entries stay NULL)

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| KB | Knowledge Base — FTS-indexed SQLite storage for structured knowledge entries |
| Scope | Visibility level: USER (personal), PROJECT (workspace), SHARED (global) |
| IsolationLayer | New centralized module responsible for ALL scope/project filtering logic |
| ProjectContext | Immutable session-level context containing projectId and userId |
| Project Isolation | Principle that PROJECT-scope data from one workspace must not leak into another |
| FTS5 | SQLite Full-Text Search extension used for knowledge entry indexing |
| MCP | Model Context Protocol — communication protocol between extension and backend |
| E2E Threading | End-to-end passing of context from extension to backend to DB layer without gaps |
| Migration | Versioned schema change tracked in schema_migrations table |
| Legacy Entry | Existing entry with project_id = NULL (pre-isolation), accessible everywhere |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-27.docx |
| SA4E-26 FSD (superseded approach) | documents/SA4E-26/FSD.md |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| Memory Module Schema | backend/src/modules/memory/schema.ts |
| Memory Engine | backend/src/modules/memory/MemoryEngine.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The KB Memory subsystem sits within the SA4E Backend Server. The redesign introduces the **IsolationLayer** as a mandatory intermediary between MemoryToolDispatcher and MemoryEngine. All scope/project filtering logic is consolidated in this single module.

**Key Actors:**
- **IDE Extension (Kiro)** — Derives projectId from workspace path, establishes MCP session with backend
- **AI Agent** — Invokes mem_* tools via MCP protocol
- **IsolationLayer** — NEW: Centralized scope enforcement module
- **MemoryEngine** — Data access layer (delegates scope logic to IsolationLayer)
- **SQLite DB** — Stores knowledge_entries with project_id column + indexes

### 2.2 System Architecture

**Architecture Pattern:** Plugin (IDE extension + backend server)

**Component Stack (top → bottom):**

1. **Extension Layer** — Derives ProjectContext from workspace path at activation
2. **MCP Transport** — StreamableHTTP JSON-RPC, carries session-level ProjectContext
3. **MemoryToolDispatcher** — Routes tool calls, injects ProjectContext into IsolationLayer
4. **IsolationLayer** (NEW) — Builds scope clauses, stamps writes, validates mutations
5. **MemoryEngine** — Executes SQL with IsolationLayer-provided filters
6. **SQLite** — better-sqlite3, stores knowledge_entries with project_id + composite indexes

**Key Difference from SA4E-26:** Steps 3-5 were previously interleaved — scope logic was scattered across MemoryEngine.buildScopeClause(), MemoryToolDispatcher.handleIngest(), and BackendConfig. Now ALL scope logic lives in IsolationLayer (step 4).

---

## 3. Functional Requirements

### 3.1 Feature: Centralized Isolation Layer Module

**Source:** BRD Story 1

#### 3.1.1 Description

A new `IsolationLayer` module is created as the SINGLE location for all scope/project filtering logic. MemoryEngine delegates ALL scope-related operations to this module. No other file constructs scope WHERE clauses or stamps project_id on entries.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Developer (via codebase interaction)
**Preconditions:**
- Backend server initialized
- ProjectContext available from session
**Postconditions:**
- All KB operations use IsolationLayer for scope enforcement
- No scope logic exists outside IsolationLayer

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | MemoryToolDispatcher | | Receives tool call (search/ingest/update/delete) |
| 2 | | MemoryToolDispatcher | Extracts ProjectContext from session |
| 3 | | MemoryToolDispatcher | Passes ProjectContext to IsolationLayer |
| 4 | | IsolationLayer | Constructs appropriate filter/decorator based on operation type |
| 5 | | MemoryEngine | Executes operation with IsolationLayer-provided constraints |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | ProjectContext missing (legacy client) | IsolationLayer falls back to permissive mode (all PROJECT entries visible), logs warning |
| AF-02 | scope = 'all' (admin/debug bypass) | IsolationLayer returns empty filter (no restriction) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | IsolationLayer module not initialized | System throws startup error — backend refuses to serve requests |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | ALL scope filtering logic MUST reside in IsolationLayer module — no other file constructs scope WHERE clauses | BRD Story 1, AC 1-2 |
| BR-02 | IsolationLayer MUST be stateless per-call — receives ProjectContext as parameter, holds no mutable state | BRD Story 1, AC 4 |
| BR-03 | IsolationLayer MUST expose: buildReadFilter(), buildWriteDecorator(), validateMutationOwnership() | BRD Story 1, AC 4 |
| BR-04 | MemoryEngine MUST NOT construct scope WHERE clauses directly — delegates to IsolationLayer | BRD Story 1, AC 2 |

#### 3.1.4 Data Specifications

**Input Data (IsolationLayer methods):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| ctx | ProjectContext | Yes | userId non-empty | Session context with projectId + userId |
| operation | OperationType | Yes | READ/WRITE/UPDATE/DELETE | Type of KB operation |
| scope | KBScope | No | USER/PROJECT/SHARED | Entry scope (for write operations) |
| tableAlias | string | No | Valid SQL identifier | Table alias for JOIN queries |

**Output Data (buildReadFilter):**

| Field | Type | Description |
|-------|------|-------------|
| clause | string | SQL WHERE clause fragment |
| params | unknown[] | Parameterized values for the clause |

#### 3.1.5 API Contract (Functional View)

**Module:** `IsolationLayer`
**Purpose:** Centralized scope enforcement for all KB operations

**Interface:**

```typescript
interface IsolationLayer {
  buildReadFilter(ctx: ProjectContext, tableAlias?: string): ScopeFilter;
  buildWriteDecorator(ctx: ProjectContext, scope: KBScope): WriteDecorator;
  validateMutationOwnership(ctx: ProjectContext, entryId: number): MutationValidation;
}

interface ScopeFilter {
  clause: string;       // SQL WHERE fragment
  params: unknown[];    // Parameterized values
}

interface WriteDecorator {
  project_id: string | null;  // Value to stamp on new entries
}

interface MutationValidation {
  allowed: boolean;
  reason?: string;      // If not allowed, why
}
```

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| IsolationLayer not initialized | "Internal error: isolation layer not ready" | Module failed to initialize at startup |
| Invalid ProjectContext | "Session context invalid — userId required" | ProjectContext.userId is empty |

---

### 3.2 Feature: End-to-End Context Threading

**Source:** BRD Story 2

#### 3.2.1 Description

ProjectContext (containing projectId + userId) is established ONCE at MCP session initialization and threaded through EVERY KB operation. No KB tool call can execute without a valid ProjectContext being available.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** IDE Extension (automatic on workspace open)
**Preconditions:**
- User opens workspace in IDE
- Extension activates
**Postconditions:**
- ProjectContext created and stored for session
- All subsequent KB tool calls use this context

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Extension | Activates when user opens workspace (e.g., /projects/my-app) |
| 2 | | Extension | Derives projectId from workspace path: last segment = "my-app" |
| 3 | | Extension | Reads userId from extension auth context |
| 4 | | Extension | Establishes MCP StreamableHTTP connection to backend, sends initialization with { projectId, userId } |
| 5 | | Backend | Creates immutable ProjectContext object: { projectId: "my-app", userId: "user-123" } |
| 6 | | Backend | Stores ProjectContext in session-level scope (per MCP connection) |
| 7 | | Backend | For every subsequent tool call, MemoryToolDispatcher accesses session ProjectContext |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Explicit projectId in backend config (override) | Use config value instead of derived from workspace path |
| AF-02 | Workspace path is root (/) or empty | Use "default" as projectId |
| AF-03 | Environment variable CODE_INTEL_PROJECT_ID set | Use env var value (priority 2, after explicit config) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Extension cannot determine workspace path | Log warning, use "default" as projectId — system still functional |
| EF-02 | MCP connection drops and reconnects | Re-establish ProjectContext from stored workspace path |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | ProjectContext MUST be established ONCE at session init — not per-call | BRD Story 2, AC 2 |
| BR-06 | ProjectContext is IMMUTABLE after creation — no mutation during session | BRD Design Principle 5 |
| BR-07 | No KB operation executes without valid ProjectContext — fail-safe to permissive mode with logged warning | BRD Story 2, AC 3 |
| BR-08 | projectId derivation priority: 1) explicit config, 2) env var, 3) workspace path last segment, 4) "default" | BRD Story 2 |
| BR-09 | Multiple workspace instances (separate backend processes) use independent ProjectContext | BRD Story 2, AC 4 |

#### 3.2.4 Data Specifications

**ProjectContext (immutable per session):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| projectId | string | Yes | Non-empty after init | Derived from workspace path or config |
| userId | string | Yes | Non-empty | User identifier from extension auth |
| sessionId | string | Optional | Auto-generated UUID | Unique session ID for audit trail |
| createdAt | string | Auto | ISO 8601 timestamp | When context was established |

---

### 3.3 Feature: Versioned Schema Migration System

**Source:** BRD Story 3

#### 3.3.1 Description

A proper versioned migration system replaces the fragile try/catch ALTER TABLE approach from SA4E-26. Migrations are tracked in a `schema_migrations` table, run sequentially on startup, and are idempotent.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** System (automatic on backend startup)
**Preconditions:**
- SQLite database file exists (or is created fresh)
- Migration files/definitions are registered in code
**Postconditions:**
- All pending migrations applied
- schema_migrations table records applied migrations
- Database schema is at latest version

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Backend | Starts up, opens SQLite database connection |
| 2 | | MigrationRunner | Creates schema_migrations table if not exists |
| 3 | | MigrationRunner | Reads all registered migrations (ordered by version) |
| 4 | | MigrationRunner | Queries schema_migrations for already-applied versions |
| 5 | | MigrationRunner | For each unapplied migration (in order): executes SQL |
| 6 | | MigrationRunner | Records each successful migration in schema_migrations |
| 7 | | Backend | Continues normal startup with fully-migrated schema |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Fresh database (no schema_migrations table) | Create table, then run ALL migrations from v1 |
| AF-02 | All migrations already applied | Version check only (O(1)), no schema changes |
| AF-03 | Database already has project_id column (SA4E-26 leftover) | Migration v1 detects existing column, marks as applied without error |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Migration SQL fails (invalid SQL) | Log error with: migration version, SQL that failed, SQLite error. Abort startup. |
| EF-02 | schema_migrations table corrupted | Attempt recreation, re-scan applied migrations from PRAGMA table_info |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-10 | Migrations MUST run in sequential version order — no gaps | BRD Story 3, Validation Rules |
| BR-11 | Migrations MUST be idempotent — running on already-migrated DB is a no-op | BRD Story 3, AC 2 |
| BR-12 | Migration failures MUST report: version, SQL, error message | BRD Story 3, AC 3 |
| BR-13 | No try/catch for migration logic — version tracking replaces error swallowing | BRD Story 3, AC 4 |
| BR-14 | Migrations are append-only — NEVER modify an applied migration | BRD Story 3, Validation Rules |
| BR-15 | Migration SQL MUST be deterministic — same result every time | BRD Story 3, Validation Rules |

#### 3.3.4 Data Specifications

**schema_migrations table:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| version | INTEGER | Yes (PK) | Sequential, no gaps | Migration version number |
| name | TEXT | Yes | Non-empty, descriptive | Human-readable migration name |
| applied_at | TEXT | Yes | ISO 8601 | Timestamp when migration was applied |
| checksum | TEXT | Optional | SHA-256 hash | Hash of migration SQL for drift detection |

**Migration v1 — add_project_id_column:**

```sql
ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);
```

---

### 3.4 Feature: PROJECT Scope Isolation

**Source:** BRD Story 4

#### 3.4.1 Description

When scope = PROJECT, entries are filtered by project_id matching the current session's projectId. Entries with matching project_id OR NULL project_id (legacy) are visible. Entries from other projects are hidden.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** Developer (via AI Agent)
**Preconditions:**
- Backend running with ProjectContext { projectId: "project-A" }
- KB contains entries from multiple projects
**Postconditions:**
- Search/list results contain only project-A entries + NULL entries + SHARED entries

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent | | Calls mem_search with query text |
| 2 | | MemoryToolDispatcher | Retrieves ProjectContext from session |
| 3 | | IsolationLayer | buildReadFilter(ctx) produces scope clause |
| 4 | | MemoryEngine | Executes FTS5 query with scope filter |
| 5 | | SQLite | Returns only entries matching: SHARED OR (PROJECT AND project_id = 'project-A' OR IS NULL) OR (USER AND user_id match) |
| 6 | | MemoryToolDispatcher | Returns filtered results to agent |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No PROJECT entries match current project | Return SHARED + USER entries only |
| AF-02 | All entries have NULL project_id (fresh migration) | All PROJECT entries visible (legacy compat) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | ProjectContext.projectId is null/undefined | IsolationLayer falls back to permissive — all PROJECT entries visible + logged warning |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-16 | PROJECT entries visible ONLY if project_id = current projectId OR project_id IS NULL | BRD Story 4, AC 1-3 |
| BR-17 | PROJECT entries from OTHER projects are NEVER visible | BRD Story 4, AC 2 |
| BR-18 | On ingestion, PROJECT entries MUST be stamped with current projectId | BRD Story 4, AC 3 |
| BR-19 | Filter applies to: search (FTS + semantic), list, get-by-id | BRD Story 4 |

---

![Scope Filter Sequence](diagrams/sequence-scope-filter.png)
*[Edit in draw.io](diagrams/sequence-scope-filter.drawio)*

---

### 3.5 Feature: SHARED Scope Cross-Project Visibility

**Source:** BRD Story 5

#### 3.5.1 Description

Entries with scope = SHARED are ALWAYS visible regardless of current projectId. The IsolationLayer explicitly exempts SHARED entries from project filtering.

#### 3.5.2 Use Case

**Use Case ID:** UC-05
**Actor:** Developer (via AI Agent)
**Preconditions:**
- SHARED entries exist from various projects
- User is in project-B context
**Postconditions:**
- SHARED entries from project-A are visible in project-B context

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent | | Calls mem_search |
| 2 | | IsolationLayer | buildReadFilter includes: scope = 'SHARED' (no project filter) |
| 3 | | SQLite | SHARED entries returned regardless of their project_id value |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-20 | SHARED entries ALWAYS visible — NO project_id filter applied | BRD Story 5, AC 1 |
| BR-21 | SHARED entries still store project_id (audit/origin tracking) — does NOT restrict visibility | BRD Story 5, AC 2-3 |

---

### 3.6 Feature: Legacy Entry Backward Compatibility

**Source:** BRD Story 6

#### 3.6.1 Description

After migration, existing entries have project_id = NULL. These entries pass ALL project filters (treated as "available everywhere"). No bulk data migration required — entries acquire project_id organically on re-ingest/update.

#### 3.6.2 Use Case

**Use Case ID:** UC-06
**Actor:** System (automatic behavior)
**Preconditions:**
- Database migrated (project_id column exists)
- Entries from before migration have project_id = NULL
**Postconditions:**
- NULL entries accessible from any project
- On update/re-ingest, entries acquire current projectId

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Backend | Migration adds project_id column with DEFAULT NULL |
| 2 | | SQLite | All existing entries now have project_id = NULL |
| 3 | Agent | | Searches from project-A |
| 4 | | IsolationLayer | WHERE clause includes: project_id = 'project-A' OR project_id IS NULL |
| 5 | | SQLite | Legacy NULL entries included in results |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Legacy entry re-ingested in project-A context | Entry updated: project_id set to "project-A" (organic migration) |
| AF-02 | Legacy entry updated (tags, content) in project-A | project_id stamped to "project-A" on update |

#### 3.6.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-22 | Entries with project_id = NULL pass ALL project filters | BRD Story 6, AC 1-2 |
| BR-23 | No bulk data migration — entries acquire project_id on next write operation | BRD Story 6, AC 3 |
| BR-24 | System MUST NOT error on NULL project_id values during any operation | BRD Story 6, AC 4 |

---

![Entry Lifecycle States](diagrams/state-entry-lifecycle.png)
*[Edit in draw.io](diagrams/state-entry-lifecycle.drawio)*

---

### 3.7 Feature: USER Scope Unchanged

**Source:** BRD Story 7

#### 3.7.1 Description

USER-scope entries are filtered by user_id ONLY. Project_id is NOT an additional filter for USER entries. A USER entry created in project-A is visible in project-B if same user.

#### 3.7.2 Use Case

**Use Case ID:** UC-07
**Actor:** Developer (via AI Agent)
**Preconditions:**
- USER-scope entry exists for user-X created in project-A
- User-X is now in project-B context
**Postconditions:**
- USER entry still visible (user_id match, no project filter)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent (user-X) | | Calls mem_search from project-B |
| 2 | | IsolationLayer | USER clause: scope = 'USER' AND user_id = 'user-X' (no project_id filter) |
| 3 | | SQLite | Returns user-X's USER entries regardless of project_id |

#### 3.7.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-25 | USER-scope filter: user_id only — project_id NOT applied | BRD Story 7, AC 1-3 |
| BR-26 | USER entries ARE personal across all projects for the same user | BRD Story 7 |

---

### 3.8 Feature: Comprehensive Test Coverage

**Source:** BRD Story 8

#### 3.8.1 Description

Test suite covers the FULL isolation matrix — all scope × project_id combinations from the Scope Truth Table. Tests verify E2E behavior from tool call through to DB query results.

#### 3.8.2 Use Case

**Use Case ID:** UC-08
**Actor:** Developer / CI system
**Preconditions:**
- Test framework (vitest) available
- IsolationLayer implemented
**Postconditions:**
- All 10 rows of Scope Truth Table have at least one passing test
- Migration tests pass for fresh and already-migrated databases

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Runs test suite: `npx vitest run` |
| 2 | | Test Runner | Executes IsolationLayer unit tests (mock DB) |
| 3 | | Test Runner | Executes integration tests (real SQLite in-memory) |
| 4 | | Test Runner | Executes migration tests (fresh DB + already-migrated) |
| 5 | | Test Runner | Reports: all scope truth table rows covered |

#### 3.8.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-27 | Every row of Scope Truth Table MUST have at least one test | BRD Story 8, AC 1 |
| BR-28 | Tests MUST be runnable in CI without external dependencies | BRD Story 8, AC 5 |
| BR-29 | Scope leakage (entry visible when it should not be) MUST be detectable by tests | BRD Story 8, AC 2 |

---

## 4. Data Model

### 4.1 Entity Relationship Diagram

*(Single-table modification — see Entity table above. No complex ER relationships introduced.)*

### 4.2 Logical Entities

#### Entity: knowledge_entries (existing — modified)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | INTEGER | Yes (PK) | Auto-increment | Primary key |
| content | TEXT | Yes | — | Entry content (up to 50,000 chars) |
| summary | TEXT | Yes | — | Brief summary (auto-generated if absent) |
| type | TEXT | Yes | — | Entry type (CONTEXT, DECISION, PATTERN, etc.) |
| tier | TEXT | Yes | Default 'WORKING' | WORKING / REFERENCE / ARCHIVE |
| scope | TEXT | Yes | Default 'USER' | USER / PROJECT / SHARED — determines visibility |
| user_id | TEXT | No | BR-25 | Owner user ID for USER-scope filtering |
| project_id | TEXT | No | BR-16, BR-18, BR-22 | Project identifier for PROJECT-scope isolation. NULL = legacy/accessible everywhere |
| source | TEXT | No | — | Source reference (file path, URL) |
| source_ref | TEXT | No | — | Additional source metadata |
| tags | TEXT | Yes | Default '' | Comma-separated tags |
| confidence | REAL | Yes | Default 1.0 | Confidence score (0.0 - 1.0) |
| access_count | INTEGER | Yes | Default 0 | Number of times accessed |
| created_at | TEXT | Yes | Auto ISO timestamp | Creation timestamp |
| updated_at | TEXT | Yes | Auto ISO timestamp | Last update timestamp |
| last_accessed_at | TEXT | No | — | Last access timestamp |
| expires_at | TEXT | No | — | Expiration timestamp |
| pinned | INTEGER | Yes | Default 0 | Whether entry is pinned |
| pin_order | INTEGER | Yes | Default 0 | Pin display order |
| structured_map | TEXT | Yes | Default '{}' | JSON structured metadata |
| quality_score | INTEGER | No | — | Quality assessment score |
| archived | INTEGER | Yes | Default 0 | Soft-delete flag |
| agent_name | TEXT | No | — | Which agent created this entry |
| owner | TEXT | No | — | Owner identifier |

#### Entity: schema_migrations (NEW)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| version | INTEGER | Yes (PK) | BR-10 | Sequential migration version number |
| name | TEXT | Yes | BR-14 | Human-readable migration description |
| applied_at | TEXT | Yes | — | ISO 8601 timestamp when migration was applied |
| checksum | TEXT | No | BR-15 | SHA-256 hash of migration SQL for drift detection |

#### Entity: ProjectContext (runtime — not persisted)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| projectId | string | Yes | BR-05, BR-08 | Derived from workspace path or config |
| userId | string | Yes | BR-07 | User identifier from extension auth |
| sessionId | string | No | — | Unique session ID for audit trail |
| createdAt | string | Auto | BR-06 | Immutable creation timestamp |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| knowledge_entries | knowledge_vectors | 1:1 | Each entry may have one embedding vector |
| knowledge_entries | knowledge_graph_edges | 1:N | Entry can be source/target of multiple edges |
| knowledge_entries | knowledge_fts (virtual) | 1:1 | FTS5 index mirrors entry content |

**Indexes (Project Isolation Specific):**

| Index | Columns | Purpose |
|-------|---------|---------|
| idx_ke_project_id | project_id | Fast filtering by project |
| idx_ke_scope_project | scope, project_id | Composite for scope clause — covers the primary query pattern |

---

## 5. Integration Specifications

### 5.1 External System: IDE Extension (Kiro/VS Code)

| Attribute | Value |
|-----------|-------|
| Purpose | Derives projectId from workspace path, establishes MCP session |
| Direction | Outbound (Extension → Backend) |
| Data Format | JSON (ProjectContext in MCP session initialization) |
| Frequency | Once per session (at connection init) |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| ProjectContext.projectId | workspace.rootPath (last segment) | Receive | BR-08 |
| ProjectContext.userId | Extension auth context | Receive | BR-07 |
| ProjectContext.sessionId | Generated UUID | Internal | — |

### 5.2 Internal Integration: MCP Tool Bridge → IsolationLayer

| Attribute | Value |
|-----------|-------|
| Purpose | Routes mem_* tool calls through IsolationLayer before reaching MemoryEngine |
| Direction | Bidirectional (internal) |
| Data Format | TypeScript function calls |
| Frequency | Every tool invocation |

**Data Flow:**

```
MCP JSON-RPC Request
  → MemoryToolDispatcher.dispatch(toolName, args)
    → dispatcher.setScopeContext(sessionCtx)
    → IsolationLayer.buildReadFilter(ctx) [for reads]
    → IsolationLayer.buildWriteDecorator(ctx) [for writes]
    → MemoryEngine.search/insert/update/delete(... , isolationFilter)
  ← Response
```

### 5.3 Internal Integration: IsolationLayer → SQLite

| Attribute | Value |
|-----------|-------|
| Purpose | IsolationLayer produces SQL fragments consumed by MemoryEngine queries |
| Direction | One-way (IsolationLayer → MemoryEngine → SQLite) |
| Data Format | SQL WHERE clause strings + parameterized values |
| Frequency | Every read/write operation |

**SQL Patterns Produced:**

| Operation | SQL Pattern |
|-----------|-------------|
| Read (with projectId) | `(scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR (scope = 'USER' AND user_id = ?))` |
| Read (no projectId — backward compat) | `(scope IN ('PROJECT', 'SHARED') OR (scope = 'USER' AND user_id = ?))` |
| Write decorator | `{ project_id: ctx.projectId }` stamped on INSERT |
| Mutation validation | `SELECT project_id, scope, user_id FROM knowledge_entries WHERE id = ?` |

---

## 6. Processing Logic

### 6.1 IsolationLayer.buildReadFilter()

**Trigger:** Every KB read operation (search, list, findById, findFiltered)
**Input:** ProjectContext { projectId, userId }
**Output:** ScopeFilter { clause: string, params: unknown[] }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check if ctx.projectId is present and non-empty | If absent → use permissive clause, log warning |
| 2 | Build SHARED clause: `scope = 'SHARED'` | Always included unconditionally |
| 3 | Build PROJECT clause: `scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)` | Include NULL for backward compat (BR-22) |
| 4 | Build USER clause: `scope = 'USER' AND user_id = ?` | Existing behavior unchanged (BR-25) |
| 5 | Combine with OR: `(SHARED) OR (PROJECT with filter) OR (USER)` | — |
| 6 | Prepend table alias if provided | — |
| 7 | Return { clause, params: [projectId, userId] } | — |

**Pseudocode:**

```typescript
buildReadFilter(ctx: ProjectContext, tableAlias?: string): ScopeFilter {
  const p = tableAlias ? `${tableAlias}.` : '';

  if (ctx.projectId) {
    return {
      clause: `(${p}scope = 'SHARED' OR (${p}scope = 'PROJECT' AND (${p}project_id = ? OR ${p}project_id IS NULL)) OR (${p}scope = 'USER' AND ${p}user_id = ?))`,
      params: [ctx.projectId, ctx.userId]
    };
  }

  // Backward compat: no projectId means all PROJECT entries visible
  return {
    clause: `(${p}scope IN ('PROJECT', 'SHARED') OR (${p}scope = 'USER' AND ${p}user_id = ?))`,
    params: [ctx.userId]
  };
}
```

### 6.2 IsolationLayer.buildWriteDecorator()

**Trigger:** Every KB write operation (ingest, update)
**Input:** ProjectContext { projectId }, scope: KBScope
**Output:** WriteDecorator { project_id: string | null }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Extract ctx.projectId | If absent → return { project_id: null } |
| 2 | Return { project_id: ctx.projectId } | — |

**Pseudocode:**

```typescript
buildWriteDecorator(ctx: ProjectContext, scope: KBScope): WriteDecorator {
  return {
    project_id: ctx.projectId ?? null
  };
}
```

**Note:** project_id is stored regardless of scope value (SHARED entries store originating project for audit — BR-21).

### 6.3 IsolationLayer.validateMutationOwnership()

**Trigger:** Update or delete operations on existing entries
**Input:** ProjectContext { projectId, userId }, entryId: number
**Output:** MutationValidation { allowed: boolean, reason?: string }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Fetch entry by ID from DB | If not found → { allowed: false, reason: "Entry not found" } |
| 2 | Check scope = USER → validate user_id matches | Mismatch → { allowed: false, reason: "Not owner" } |
| 3 | Check scope = PROJECT → validate project_id matches OR is NULL | Mismatch → { allowed: false, reason: "Wrong project" } |
| 4 | Check scope = SHARED → always allowed (shared entries are mutable by any project) | — |
| 5 | Return { allowed: true } | — |

**Pseudocode:**

```typescript
validateMutationOwnership(ctx: ProjectContext, entry: KnowledgeEntry): MutationValidation {
  if (entry.scope === 'USER') {
    if (entry.user_id !== ctx.userId) {
      return { allowed: false, reason: `USER entry owned by ${entry.user_id}, not ${ctx.userId}` };
    }
  }

  if (entry.scope === 'PROJECT') {
    if (entry.project_id !== null && entry.project_id !== ctx.projectId) {
      return { allowed: false, reason: `PROJECT entry belongs to ${entry.project_id}, not ${ctx.projectId}` };
    }
  }

  // SHARED entries: always mutable (any project can update shared knowledge)
  // PROJECT entries with NULL project_id: always mutable (legacy)
  return { allowed: true };
}
```

### 6.4 MigrationRunner — Schema Migration Execution

**Trigger:** Backend startup (before any tool calls are served)
**Input:** Database connection, registered migrations array
**Output:** Fully-migrated database

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Ensure schema_migrations table exists | CREATE TABLE IF NOT EXISTS |
| 2 | Read applied versions from schema_migrations | Empty set = fresh DB |
| 3 | Filter registered migrations to unapplied only | Compare version numbers |
| 4 | Sort unapplied by version (ascending) | — |
| 5 | For each unapplied migration: execute SQL within transaction | On error: rollback, log migration version + SQL + error, abort startup |
| 6 | Record successful migration in schema_migrations | INSERT version, name, applied_at, checksum |
| 7 | Log summary: "Applied N migrations (v{start} → v{end})" | — |

**Pseudocode:**

```typescript
class MigrationRunner {
  private migrations: Migration[] = [
    {
      version: 1,
      name: 'add_project_id_column',
      sql: `
        -- Check if column exists via PRAGMA, add if missing
        ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL;
      `,
      indexes: `
        CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
        CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);
      `
    }
  ];

  run(db: Database.Database): void {
    // Ensure tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT
      )
    `);

    const applied = db.prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r: any) => r.version);

    for (const m of this.migrations) {
      if (applied.includes(m.version)) continue;

      try {
        db.exec(m.sql);
        if (m.indexes) db.exec(m.indexes);
      } catch (err) {
        // Check if "duplicate column" — means SA4E-26 already added it
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('duplicate column')) {
          // Column exists from SA4E-26 — just ensure indexes and record
          if (m.indexes) db.exec(m.indexes);
        } else {
          throw new Error(
            `Migration v${m.version} (${m.name}) failed: ${msg}`
          );
        }
      }

      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)'
      ).run(m.version, m.name, new Date().toISOString(), null);
    }
  }
}
```

### 6.5 ProjectContext Derivation

**Trigger:** Extension activation / MCP connection initialization
**Input:** Workspace root path, config overrides, environment variables
**Output:** ProjectContext { projectId, userId }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check explicit config override (BackendConfig.projectId) | If set → use it (priority 1) |
| 2 | Check environment variable CODE_INTEL_PROJECT_ID | If set → use it (priority 2) |
| 3 | Read workspace root path from extension | If unavailable → use "default" |
| 4 | Derive: last non-empty segment of path (split by / or \\) | If empty after split → "default" |
| 5 | Construct immutable ProjectContext object | — |

**Pseudocode:**

```typescript
function deriveProjectId(workspace: string, config?: { projectId?: string }): string {
  // Priority 1: Explicit config override
  if (config?.projectId) return config.projectId;

  // Priority 2: Environment variable
  const envId = process.env.CODE_INTEL_PROJECT_ID;
  if (envId) return envId;

  // Priority 3: Derive from workspace path
  const segments = workspace.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : 'default';
}
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| Developer (via Agent) | Read/Write KB entries within own project scope | mem_search, mem_ingest, mem_crud within PROJECT boundary |
| System Admin (debug) | Read/Write all entries (scope = 'all' bypass) | All tools with admin override |
| IsolationLayer | Enforce scope boundaries — cannot be bypassed by regular tool calls | Internal enforcement |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| project_id | Internal | Project isolation boundary — prevents data leakage between workspaces |
| KB entry content | Internal | May contain code snippets, architecture details, business logic |
| user_id | Internal | User identification for USER-scope filtering |
| ProjectContext | Session-internal | Must not be exposed in API responses or logs |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Entry created | entry_id, project_id, scope, user_id, agent_name | Indefinite | Track project ownership |
| Entry mutated | entry_id, operation, project_id (before/after) | Indefinite | Audit scope changes |
| Scope promoted | entry_id, from_scope, to_scope, project_id | Indefinite | Track visibility escalation |
| Migration applied | version, name, applied_at | Indefinite | Schema change tracking |
| Isolation warning | operation, reason (missing ctx) | 30 days | Detect misconfigured clients |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Search latency increase < 5ms with project filter | Composite index (scope, project_id) ensures indexed lookup |
| Performance | Startup migration check < 10ms | Single indexed query on schema_migrations — O(1) for already-migrated DB |
| Backward Compatibility | Zero data loss | Existing entries retain NULL project_id, remain accessible from all projects |
| Backward Compatibility | Zero downtime migration | ALTER TABLE ADD COLUMN is instant in SQLite (no table rewrite) |
| Testability | 100% isolation matrix coverage | Every scope × project_id combination in truth table has at least one test |
| Maintainability | Single module for scope logic | All isolation rules in IsolationLayer — max 200 lines, single responsibility |
| Security | Project isolation at data layer | Enforced in SQL WHERE clause — cannot be bypassed by API parameter manipulation |
| Reliability | Migration idempotency | Re-running migrations never fails, never duplicates changes |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Missing userId in ProjectContext | Warning | (internal log only) | Fallback to showing all non-USER entries; log warning for developer debugging |
| Schema migration fails on startup | Critical | "Database migration failed: v{N} ({name}). Error: {msg}" | Backend logs error, refuses to serve requests, exits with non-zero code |
| Invalid projectId format (special chars) | Info | (none — sanitized internally) | Strip/normalize special characters, use sanitized value |
| IsolationLayer not initialized | Critical | "Internal error: isolation module not ready" | Reject all KB operations until restarted |
| Entry mutation rejected (wrong project) | Warning | "Cannot modify entry — belongs to different project" | Return error response to agent, do not modify entry |
| Entry mutation rejected (wrong user) | Warning | "Cannot modify entry — not the owner" | Return error response to agent, do not modify entry |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Migration applied | Developer | Server console log (INFO) | On startup |
| Migration failed | Developer | Server console log (ERROR) + exit | On startup |
| Scope filter with NULL projectId | Developer | Debug log (WARN) | Per query (first occurrence per session) |
| Mutation ownership rejected | Agent | Tool response (error) | Immediately |

---

## 10. Testing Considerations

### 10.1 Isolation Matrix Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | PROJECT entry visible to matching project | entry.project_id="A", ctx.projectId="A" | Entry IN results | High |
| TC-02 | PROJECT entry hidden from different project | entry.project_id="A", ctx.projectId="B" | Entry NOT in results | High |
| TC-03 | PROJECT entry (NULL) visible to any project | entry.project_id=NULL, ctx.projectId="A" | Entry IN results | High |
| TC-04 | SHARED entry visible cross-project | entry.scope=SHARED, entry.project_id="A", ctx.projectId="B" | Entry IN results | High |
| TC-05 | SHARED entry with NULL visible | entry.scope=SHARED, entry.project_id=NULL | Entry IN results | High |
| TC-06 | USER entry visible to owner | entry.user_id="X", ctx.userId="X" | Entry IN results | High |
| TC-07 | USER entry hidden from non-owner | entry.user_id="X", ctx.userId="Y" | Entry NOT in results | High |
| TC-08 | No projectId (backward compat) shows all PROJECT | ctx.projectId=undefined | All PROJECT entries visible | High |
| TC-09 | Ingest stamps project_id correctly | ctx.projectId="A", ingest entry | entry.project_id = "A" | High |
| TC-10 | Ingest without projectId stores NULL | ctx.projectId=undefined, ingest entry | entry.project_id = NULL | High |

### 10.2 Migration Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-11 | Fresh DB — all migrations run | Empty database | schema_migrations has all versions | High |
| TC-12 | Already migrated — skip | DB with v1 applied | No SQL executed, no error | High |
| TC-13 | SA4E-26 leftover (column exists) | DB with project_id but no schema_migrations | Migration records as applied (no error) | High |
| TC-14 | Invalid migration SQL | Corrupt migration definition | Clear error: version + SQL + error message | Medium |

### 10.3 IsolationLayer Unit Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-15 | buildReadFilter with projectId | ctx={projectId:"A", userId:"U"} | Clause includes project_id = ? | High |
| TC-16 | buildReadFilter without projectId | ctx={userId:"U"} | Permissive clause (no project filter) | High |
| TC-17 | buildWriteDecorator stamps project | ctx={projectId:"A"} | { project_id: "A" } | High |
| TC-18 | validateMutation — own USER entry | USER entry, user matches | { allowed: true } | High |
| TC-19 | validateMutation — other's USER entry | USER entry, user mismatch | { allowed: false } | High |
| TC-20 | validateMutation — own PROJECT entry | PROJECT entry, project matches | { allowed: true } | High |
| TC-21 | validateMutation — other PROJECT entry | PROJECT entry, project mismatch | { allowed: false } | High |
| TC-22 | validateMutation — legacy NULL entry | PROJECT entry, project_id=NULL | { allowed: true } | High |
| TC-23 | validateMutation — SHARED entry | SHARED entry, any project | { allowed: true } | Medium |

---

## 11. Appendix

### 11.1 Scope Clause Truth Table (Complete Reference)

| # | Entry Scope | Entry project_id | Query projectId | Query userId | Visible? | Rule |
|---|-------------|-----------------|-----------------|--------------|----------|------|
| 1 | SHARED | project-A | project-A | any | YES | BR-20: SHARED always visible |
| 2 | SHARED | project-A | project-B | any | YES | BR-20: SHARED always visible |
| 3 | SHARED | NULL | any | any | YES | BR-20: SHARED always visible |
| 4 | PROJECT | project-A | project-A | any | YES | BR-16: project_id matches |
| 5 | PROJECT | project-A | project-B | any | NO | BR-17: project_id mismatch |
| 6 | PROJECT | NULL | project-A | any | YES | BR-22: Legacy entry accessible |
| 7 | PROJECT | NULL | project-B | any | YES | BR-22: Legacy entry accessible |
| 8 | USER | any | any | user-X (owner) | YES | BR-25: user_id matches |
| 9 | USER | any | any | user-Y (not owner) | NO | BR-25: user_id mismatch |
| 10 | PROJECT | project-A | NULL (no ctx) | any | YES | BR-07: Backward compat permissive |

### 11.2 Affected Files Summary (Redesign)

| File | Change Type | Description |
|------|-------------|-------------|
| `IsolationLayer.ts` (NEW) | Create | Centralized scope filtering module — buildReadFilter, buildWriteDecorator, validateMutationOwnership |
| `MigrationRunner.ts` (NEW) | Create | Versioned schema migration system with schema_migrations tracking |
| `ProjectContext.ts` (NEW) | Create | Immutable context type + derivation logic |
| `MemoryEngine.ts` | Modify | Remove buildScopeClause/buildScopeParams — delegate to IsolationLayer |
| `MemoryToolDispatcher.ts` | Modify | Create ProjectContext at session init, pass to IsolationLayer |
| `schema.ts` | Modify | Remove migrateProjectId() function — replaced by MigrationRunner |
| `models.ts` | Modify | Add ProjectContext interface, ScopeFilter interface |
| `__tests__/IsolationLayer.test.ts` (NEW) | Create | Full isolation matrix test suite |
| `__tests__/MigrationRunner.test.ts` (NEW) | Create | Migration system tests |

### 11.3 Change Log from BRD

| Section | Clarification |
|---------|--------------|
| Migration handling | Added "duplicate column" detection for SA4E-26 coexistence — migration v1 handles gracefully |
| SHARED mutation | Clarified: SHARED entries are mutable by any project (write decorator still stamps project_id for audit) |
| validateMutationOwnership | Added as new method not in SA4E-26 FSD — ensures write/delete operations respect project boundaries |
| MigrationRunner vs migrateProjectId | Old function replaced entirely — MigrationRunner is extensible for future migrations |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Scope Filter Sequence | [sequence-scope-filter.png](diagrams/sequence-scope-filter.png) | [sequence-scope-filter.drawio](diagrams/sequence-scope-filter.drawio) |
| 3 | Entry Lifecycle State | [state-entry-lifecycle.png](diagrams/state-entry-lifecycle.png) | [state-entry-lifecycle.drawio](diagrams/state-entry-lifecycle.drawio) |


