# Technical Design Document (TDD)

## SA4E Code Intelligence — SA4E-27: Redesign Multi-Tenant Project Isolation cho KB

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-27 |
| Title | Redesign Multi-Tenant Project Isolation cho KB |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-10 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-27.docx |
| Related FSD | FSD-v1-SA4E-27.docx |
| Supersedes | SA4E-26 TDD (failed patch approach) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-10 | SA Agent | Initial TDD — ground-up redesign with IsolationLayer module |

---

## 1. Introduction

### 1.1 Purpose

This TDD defines the technical implementation for a **complete redesign** of multi-tenant project isolation in the KB memory system. Unlike SA4E-26 (incremental patch), this design introduces a centralized **IsolationLayer** module that encapsulates ALL scope/project filtering logic in a single file (max 200 lines), a proper **MigrationRunner** with version tracking, and end-to-end **ProjectContext** threading.

### 1.2 Scope

**New files created:**
- `backend/src/modules/memory/IsolationLayer.ts` — Centralized scope enforcement (NEW)
- `backend/src/modules/memory/MigrationRunner.ts` — Versioned schema migration (NEW)
- `backend/src/modules/memory/ProjectContext.ts` — Immutable context type (NEW)
- `backend/src/modules/memory/__tests__/IsolationLayer.test.ts` — Unit tests (NEW)
- `backend/src/modules/memory/__tests__/MigrationRunner.test.ts` — Migration tests (NEW)
- `backend/src/modules/memory/__tests__/isolation-integration.test.ts` — Integration tests (NEW)

**Files modified:**
- `backend/src/modules/memory/MemoryEngine.ts` — Remove buildScopeClause/Params, delegate to IsolationLayer
- `backend/src/modules/memory/MemoryToolDispatcher.ts` — Add validateMutationOwnership calls
- `backend/src/modules/memory/MemoryDb.ts` — Replace migrateProjectId with MigrationRunner
- `backend/src/modules/memory/schema.ts` — Remove migrateProjectId function
- `backend/src/modules/memory/models.ts` — Add ProjectContext export

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x |
| Framework | Hono | 4.x |
| Database | SQLite (better-sqlite3) | 11.x |
| Search | FTS5 (SQLite extension) | built-in |
| Validation | Zod | 3.x |
| Build | esbuild | 0.19+ |
| Test | Vitest | 1.x |

### 1.4 Design Principles

1. **Single Responsibility** — IsolationLayer ONLY handles scope filtering; nothing else
2. **Open/Closed** — New scope types can be added without modifying existing logic
3. **Dependency Inversion** — MemoryEngine depends on IsolationLayer interface, not implementation
4. **Immutability** — ProjectContext is frozen after creation
5. **Testability** — IsolationLayer is pure functions; can be tested without DB
6. **200-Line Limit** — IsolationLayer module enforced at max 200 lines (code standard)

### 1.5 Constraints

- SQLite: no `ALTER TABLE ADD COLUMN IF NOT EXISTS` — migration must handle "duplicate column" gracefully
- FTS5: virtual table cannot be altered — project_id filter applied at JOIN level
- better-sqlite3: synchronous — no async migration concerns
- Single-process: one backend instance serves ONE workspace (single-project per process)
- Existing `project_id` column and indexes already exist in schema.ts DDL

### 1.6 TA Review Decisions Resolved

| # | Decision | Resolution |
|---|----------|------------|
| 1 | findById() needs post-fetch scope validation | IsolationLayer.validateReadAccess() called after findById — returns null if entry not in scope |
| 2 | mem_promote/demote should stamp project_id on USER to PROJECT | promoteEntry() sets project_id = ctx.projectId when promoting USER to PROJECT |
| 3 | handleCrud mutation path must call validateMutationOwnership() | handleCrud 'delete' and 'update' actions call IsolationLayer.validateMutationOwnership() before mutation |
| 4 | mem_ingest_file deduplication must respect project boundaries | DELETE WHERE source=? AND project_id=? (scoped delete instead of global) |
| 5 | Migration downgrade scenario | MigrationRunner checks max(version) in DB vs max(registered). If DB > code, log WARNING but continue (forward-only) |
| 6 | IsolationLayer max 200 lines | Enforced by design — types in ProjectContext.ts, only pure logic in IsolationLayer.ts |

---

## 2. System Architecture

### 2.1 Architecture Overview

The redesign introduces the **IsolationLayer** as a mandatory intermediary between MemoryToolDispatcher and MemoryEngine. All scope/project filtering logic is consolidated in this single module.

![Architecture Diagram](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

**Data flow (read path):**
`
IDE Extension (workspace path)
  -> BackendConfig.projectId (derived on startup)
    -> MemoryToolDispatcher.setScopeContext({userId, projectId})
      -> IsolationLayer.buildReadFilter(ctx, tableAlias?)
        -> MemoryEngine.search/findFiltered/findById (with filter)
          -> SQLite WHERE clause with project_id filter
`

**Data flow (write path):**
`
IDE Extension
  -> MemoryToolDispatcher.handleIngest(args)
    -> IsolationLayer.buildWriteDecorator(ctx, scope)
      -> MemoryEngine.insert({...entry, project_id: decorator.project_id})
        -> SQLite INSERT with project_id value
`

**Data flow (mutation path — NEW):**
`
IDE Extension
  -> MemoryToolDispatcher.handleCrud({action: 'delete', id})
    -> MemoryEngine.findById(id)
      -> IsolationLayer.validateMutationOwnership(ctx, entry)
        -> IF allowed: proceed with mutation
        -> IF denied: return error response
`

### 2.2 Component Responsibilities

| Component | Responsibility | Change Type |
|-----------|---------------|-------------|
| BackendConfig | Derive projectId from workspace path (already exists) | NO CHANGE |
| MemoryToolDispatcher | Route tools, inject ProjectContext, call IsolationLayer for mutations | MODIFY |
| **IsolationLayer** (NEW) | ALL scope filtering: buildReadFilter, buildWriteDecorator, validateMutationOwnership, validateReadAccess | CREATE |
| **MigrationRunner** (NEW) | Versioned schema migrations with tracking table | CREATE |
| **ProjectContext** (NEW) | Immutable type definition + factory function | CREATE |
| MemoryEngine | Data access — delegates scope logic to IsolationLayer, removes buildScopeClause/Params | MODIFY |
| MemoryDb | Database initialization — uses MigrationRunner instead of migrateProjectId | MODIFY |
| schema.ts | Remove migrateProjectId function (replaced by MigrationRunner) | MODIFY |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern |
|------|----|----------|---------|
| IDE Extension | Backend | MCP StreamableHTTP | Sync Request-Response |
| MemoryToolDispatcher | IsolationLayer | Direct function call | Sync |
| MemoryToolDispatcher | MemoryEngine | Direct method call | Sync |
| MemoryEngine | SQLite | better-sqlite3 | Sync (prepared statements) |
| MigrationRunner | SQLite | better-sqlite3 | Sync (exec) |

---

## 3. API Design (Internal Module Interface)

### 3.1 IsolationLayer Interface

`	ypescript
// backend/src/modules/memory/IsolationLayer.ts

import type { ProjectContext, ScopeFilter, WriteDecorator, MutationValidation } from './ProjectContext.js';
import type { KnowledgeEntry, KBScope } from './models.js';

/**
 * IsolationLayer — centralized scope enforcement for all KB operations.
 * SINGLE source of truth for scope filtering logic.
 * Max 200 lines. Stateless per-call.
 */

export function buildReadFilter(ctx: ProjectContext, tableAlias?: string): ScopeFilter;
export function buildWriteDecorator(ctx: ProjectContext, scope: KBScope): WriteDecorator;
export function validateMutationOwnership(ctx: ProjectContext, entry: KnowledgeEntry): MutationValidation;
export function validateReadAccess(ctx: ProjectContext, entry: KnowledgeEntry | undefined): KnowledgeEntry | undefined;
export function buildIngestFileDeleteClause(ctx: ProjectContext, source: string): { clause: string; params: unknown[] };
`

### 3.2 Method Signatures — Detail

#### 3.2.1 buildReadFilter(ctx, tableAlias?)

**Purpose:** Construct SQL WHERE fragment for scope-aware reads.
**Implements:** BR-16, BR-17, BR-20, BR-22, BR-25

`	ypescript
export function buildReadFilter(ctx: ProjectContext, tableAlias?: string): ScopeFilter {
  const p = tableAlias ? tableAlias + '.' : '';

  if (ctx.projectId) {
    return {
      clause: (scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR (scope = 'USER' AND user_id = ?)),
      params: [ctx.projectId, ctx.userId],
    };
  }

  // Backward compat: no projectId -> all PROJECT entries visible
  return {
    clause: (scope IN ('PROJECT', 'SHARED') OR (scope = 'USER' AND user_id = ?)),
    params: [ctx.userId],
  };
}
`

#### 3.2.2 buildWriteDecorator(ctx, scope)

**Purpose:** Determine project_id value to stamp on new entries.
**Implements:** BR-18, BR-21

`	ypescript
export function buildWriteDecorator(ctx: ProjectContext, scope: KBScope): WriteDecorator {
  return { project_id: ctx.projectId ?? null };
}
`

#### 3.2.3 validateMutationOwnership(ctx, entry)

**Purpose:** Check if current context is allowed to mutate an entry.
**Implements:** UC-04 gap (TA Decision #1, #3)

`	ypescript
export function validateMutationOwnership(ctx: ProjectContext, entry: KnowledgeEntry): MutationValidation {
  if (entry.scope === 'USER') {
    if (entry.user_id !== ctx.userId) {
      return { allowed: false, reason: USER entry owned by  };
    }
  }
  if (entry.scope === 'PROJECT') {
    if (entry.project_id !== null && entry.project_id !== ctx.projectId) {
      return { allowed: false, reason: PROJECT entry belongs to  };
    }
  }
  // SHARED: always mutable. PROJECT with NULL: always mutable (legacy).
  return { allowed: true };
}
`

#### 3.2.4 validateReadAccess(ctx, entry)

**Purpose:** Post-fetch validation for findById — returns null if entry not in scope.
**Implements:** TA Decision #1 (UC-04 gap)

`	ypescript
export function validateReadAccess(ctx: ProjectContext, entry: KnowledgeEntry | undefined): KnowledgeEntry | undefined {
  if (!entry) return undefined;
  if (entry.scope === 'SHARED') return entry;
  if (entry.scope === 'USER') {
    return entry.user_id === ctx.userId ? entry : undefined;
  }
  if (entry.scope === 'PROJECT') {
    if (!ctx.projectId) return entry; // backward compat
    if (entry.project_id === null || entry.project_id === ctx.projectId) return entry;
    return undefined; // wrong project
  }
  return entry;
}
`

#### 3.2.5 buildIngestFileDeleteClause(ctx, source)

**Purpose:** Scoped deduplication for mem_ingest_file — only deletes entries in current project.
**Implements:** TA Decision #4

`	ypescript
export function buildIngestFileDeleteClause(ctx: ProjectContext, source: string): { clause: string; params: unknown[] } {
  if (ctx.projectId) {
    return {
      clause: 'DELETE FROM knowledge_entries WHERE source = ? AND (project_id = ? OR project_id IS NULL)',
      params: [source, ctx.projectId],
    };
  }
  return {
    clause: 'DELETE FROM knowledge_entries WHERE source = ?',
    params: [source],
  };
}
`

### 3.3 MigrationRunner Interface

`	ypescript
// backend/src/modules/memory/MigrationRunner.ts

export interface Migration {
  version: number;
  name: string;
  up: string;   // SQL to apply
}

export class MigrationRunner {
  constructor(db: Database.Database);
  run(): { applied: number; skipped: number; total: number };
  getAppliedVersions(): number[];
  getCurrentVersion(): number;
}
`

### 3.4 ProjectContext Type

`	ypescript
// backend/src/modules/memory/ProjectContext.ts

export interface ProjectContext {
  readonly projectId: string;
  readonly userId: string;
  readonly sessionId?: string;
  readonly createdAt: string;
}

export interface ScopeFilter {
  readonly clause: string;
  readonly params: readonly unknown[];
}

export interface WriteDecorator {
  readonly project_id: string | null;
}

export interface MutationValidation {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function createProjectContext(projectId: string, userId: string, sessionId?: string): ProjectContext {
  return Object.freeze({
    projectId,
    userId,
    sessionId,
    createdAt: new Date().toISOString(),
  });
}
`

---

## 4. Database Design

### 4.1 Schema Migrations Table (NEW)

`sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT
);
`

### 4.2 Migration v1: add_project_id_column

`sql
-- Migration v1: Add project_id column for project isolation
-- Note: Column may already exist from SA4E-26 patch or current schema.ts DDL.
-- MigrationRunner handles "duplicate column" gracefully.

ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);
`

### 4.3 Current State Analysis

**IMPORTANT:** The `project_id` column and indexes already exist in `schema.ts` DDL (added during SA4E-26). The `migrateProjectId()` function in schema.ts also adds them via try/catch. Migration v1 handles this by catching "duplicate column" error and recording as applied.

### 4.4 Index Strategy

| Index | Columns | Use Case | Performance |
|-------|---------|----------|-------------|
| idx_ke_project_id | project_id | Direct project lookup | O(log n) B-tree |
| idx_ke_scope_project | scope, project_id | Composite for scope clause (primary query) | Covers WHERE scope='PROJECT' AND project_id=? |
| idx_ke_scope_user | scope, user_id | USER scope queries (existing) | Already exists |
| idx_ke_scope | scope | Simple scope filter (existing) | Already exists |

### 4.5 Query Performance

| Operation | SQL Pattern | Index Used | Expected |
|-----------|-------------|-----------|----------|
| Search with project filter | `...WHERE (scope='SHARED' OR (scope='PROJECT' AND (project_id=? OR project_id IS NULL)) OR (scope='USER' AND user_id=?))` | idx_ke_scope_project + idx_ke_scope_user | < 5ms overhead |
| Insert with project_id | `INSERT ... project_id=?` | N/A (write) | No change |
| IngestFile scoped delete | `DELETE WHERE source=? AND (project_id=? OR project_id IS NULL)` | idx_ke_source + idx_ke_project_id | < 2ms |
| Migration version check | `SELECT version FROM schema_migrations` | PK index | < 1ms |

### 4.6 Migration Runner — Downgrade Scenario (TA Decision #5)

When the database has a higher `max(version)` than the code's registered migrations:

`	ypescript
// Example: DB has migrations 1,2,3 applied. Code only registers 1,2.
// This happens when rolling back to older code version.
//
// Resolution: Log WARNING, do NOT fail. Forward-only design.
// The extra migration is not harmful — column exists, that's fine.
// Code simply ignores columns it doesn't use.

const maxDbVersion = this.getMaxAppliedVersion(); // e.g., 3
const maxCodeVersion = this.migrations[this.migrations.length - 1]?.version ?? 0; // e.g., 2

if (maxDbVersion > maxCodeVersion) {
  console.warn(
    [MigrationRunner] DB schema version () is ahead of code ().  +
    This may indicate a rollback. Continuing with forward-only approach.
  );
}
`

---

## 5. Class/Module Design

### 5.1 Package Structure

`
backend/src/modules/memory/
+-- ProjectContext.ts          <- NEW: Types + factory (30 lines)
+-- IsolationLayer.ts          <- NEW: All scope logic (150-180 lines)
+-- MigrationRunner.ts         <- NEW: Versioned migrations (90-120 lines)
+-- migrations/
|   +-- 001-add-scope-columns.ts  (existing, unmodified)
|   +-- 002-add-project-id.ts     <- NEW: Migration v1 definition
+-- MemoryEngine.ts            <- MODIFY: Remove buildScopeClause/Params
+-- MemoryToolDispatcher.ts    <- MODIFY: Add mutation validation
+-- MemoryDb.ts                <- MODIFY: Use MigrationRunner
+-- schema.ts                  <- MODIFY: Remove migrateProjectId
+-- models.ts                  <- MODIFY: Re-export ProjectContext types
+-- ScopePromotionService.ts   <- MODIFY: Stamp project_id on promote
+-- __tests__/
    +-- IsolationLayer.test.ts        <- NEW: Unit tests
    +-- MigrationRunner.test.ts       <- NEW: Migration tests
    +-- isolation-integration.test.ts <- NEW: E2E integration tests
`

### 5.2 File-by-File Design

#### 5.2.1 ProjectContext.ts (NEW — ~30 lines)

`	ypescript
/**
 * ProjectContext — immutable session-level context for scope enforcement.
 * Types + factory function. Frozen after creation (BR-06).
 */

export interface ProjectContext {
  readonly projectId: string;
  readonly userId: string;
  readonly sessionId?: string;
  readonly createdAt: string;
}

export interface ScopeFilter {
  readonly clause: string;
  readonly params: readonly unknown[];
}

export interface WriteDecorator {
  readonly project_id: string | null;
}

export interface MutationValidation {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function createProjectContext(
  projectId: string,
  userId: string,
  sessionId?: string,
): ProjectContext {
  return Object.freeze({
    projectId,
    userId,
    sessionId,
    createdAt: new Date().toISOString(),
  });
}
`

#### 5.2.2 IsolationLayer.ts (NEW — ~170 lines, UNDER 200 limit)

`	ypescript
/**
 * IsolationLayer — centralized scope enforcement for ALL KB operations.
 * SINGLE source of truth. Max 200 lines enforced (TA Decision #6).
 *
 * Exports:
 * - buildReadFilter()          — SQL WHERE for reads
 * - buildWriteDecorator()      — project_id stamp for writes
 * - validateMutationOwnership() — pre-mutation ownership check
 * - validateReadAccess()       — post-fetch scope validation (UC-04 gap)
 * - buildIngestFileDeleteClause() — scoped deduplication (TA Decision #4)
 */

import type { ProjectContext, ScopeFilter, WriteDecorator, MutationValidation } from './ProjectContext.js';
import type { KnowledgeEntry, KBScope } from './models.js';

// ─── Read Operations ────────────────────────────────────────────────

export function buildReadFilter(ctx: ProjectContext, tableAlias?: string): ScopeFilter {
  const p = tableAlias ? ${tableAlias}. : '';

  if (ctx.projectId) {
    return {
      clause: (scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR (scope = 'USER' AND user_id = ?)),
      params: [ctx.projectId, ctx.userId],
    };
  }

  // Backward compat: no projectId -> permissive
  return {
    clause: (scope IN ('PROJECT', 'SHARED') OR (scope = 'USER' AND user_id = ?)),
    params: [ctx.userId],
  };
}

export function validateReadAccess(
  ctx: ProjectContext,
  entry: KnowledgeEntry | undefined,
): KnowledgeEntry | undefined {
  if (!entry) return undefined;
  if (entry.scope === 'SHARED') return entry;
  if (entry.scope === 'USER') {
    return entry.user_id === ctx.userId ? entry : undefined;
  }
  if (entry.scope === 'PROJECT') {
    if (!ctx.projectId) return entry; // backward compat
    if (entry.project_id === null || entry.project_id === ctx.projectId) return entry;
    return undefined;
  }
  return entry;
}

// ─── Write Operations ───────────────────────────────────────────────

export function buildWriteDecorator(ctx: ProjectContext, _scope: KBScope): WriteDecorator {
  return { project_id: ctx.projectId ?? null };
}

export function buildIngestFileDeleteClause(
  ctx: ProjectContext,
  source: string,
): { clause: string; params: unknown[] } {
  if (ctx.projectId) {
    return {
      clause: 'DELETE FROM knowledge_entries WHERE source = ? AND (project_id = ? OR project_id IS NULL)',
      params: [source, ctx.projectId],
    };
  }
  return {
    clause: 'DELETE FROM knowledge_entries WHERE source = ?',
    params: [source],
  };
}

// ─── Mutation Validation ────────────────────────────────────────────

export function validateMutationOwnership(
  ctx: ProjectContext,
  entry: KnowledgeEntry,
): MutationValidation {
  if (entry.scope === 'USER') {
    if (entry.user_id !== ctx.userId) {
      return { allowed: false, reason: USER entry owned by , not  };
    }
  }
  if (entry.scope === 'PROJECT') {
    if (entry.project_id !== null && entry.project_id !== ctx.projectId) {
      return { allowed: false, reason: PROJECT entry belongs to , not  };
    }
  }
  // SHARED: always mutable. PROJECT NULL: always mutable (legacy).
  return { allowed: true };
}
`

#### 5.2.3 MigrationRunner.ts (NEW — ~110 lines)

`	ypescript
/**
 * MigrationRunner — versioned schema migration system.
 * Replaces fragile try/catch ALTER TABLE approach (SA4E-26).
 * Implements BR-10 through BR-15.
 */

import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

const REGISTERED_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'add_project_id_column',
    up: [
      "ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL",
      "CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id)",
      "CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id)",
    ].join(';\n'),
  },
];

export class MigrationRunner {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  run(): { applied: number; skipped: number; total: number } {
    this.ensureTrackingTable();
    const applied = this.getAppliedVersions();
    let appliedCount = 0;
    let skippedCount = 0;

    // Downgrade detection (TA Decision #5)
    const maxDb = applied.length > 0 ? Math.max(...applied) : 0;
    const maxCode = REGISTERED_MIGRATIONS.length > 0
      ? REGISTERED_MIGRATIONS[REGISTERED_MIGRATIONS.length - 1].version
      : 0;
    if (maxDb > maxCode) {
      console.warn(
        [MigrationRunner] DB version () ahead of code (). Forward-only — continuing.
      );
    }

    for (const m of REGISTERED_MIGRATIONS) {
      if (applied.includes(m.version)) {
        skippedCount++;
        continue;
      }

      try {
        for (const stmt of m.up.split(';\n').filter(s => s.trim())) {
          this.db.exec(stmt);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('duplicate column')) {
          // SA4E-26 leftover — column already exists, just record it
          console.info([MigrationRunner] v (): column exists, recording as applied.);
        } else {
          throw new Error(Migration v () failed: );
        }
      }

      this.db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)'
      ).run(m.version, m.name, new Date().toISOString(), null);
      appliedCount++;
    }

    if (appliedCount > 0) {
      console.info([MigrationRunner] Applied  migration(s).);
    }

    return { applied: appliedCount, skipped: skippedCount, total: REGISTERED_MIGRATIONS.length };
  }

  getAppliedVersions(): number[] {
    try {
      return (this.db.prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as Array<{ version: number }>).map(r => r.version);
    } catch {
      return []; // Table doesn't exist yet
    }
  }

  getCurrentVersion(): number {
    const versions = this.getAppliedVersions();
    return versions.length > 0 ? Math.max(...versions) : 0;
  }

  private ensureTrackingTable(): void {
    this.db.exec(
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT
      )
    );
  }
}
`

### 5.3 MemoryEngine.ts Modifications

**Removed methods:**
- `buildScopeClause()` — moved to IsolationLayer.buildReadFilter()
- `buildScopeParams()` — merged into ScopeFilter.params

**Modified methods:**
- `findFiltered()` — accepts ScopeFilter instead of ScopeContext
- `search()` — accepts ScopeFilter instead of ScopeContext
- `promoteEntry()` — stamps project_id when promoting USER to PROJECT (TA Decision #2)
- `demoteEntry()` — unchanged (demotion doesn't change project_id)

**promoteEntry modification (TA Decision #2):**

`	ypescript
promoteEntry(entryId: number, targetScope: KBScope, projectId?: string): boolean {
  const entry = this.findById(entryId);
  if (!entry) return false;

  const currentScope = (entry.scope ?? 'USER') as KBScope;
  const validTransitions: Record<string, KBScope[]> = {
    USER: ['PROJECT'], PROJECT: ['SHARED'], SHARED: [],
  };
  if (!validTransitions[currentScope]?.includes(targetScope)) return false;

  // TA Decision #2: Stamp project_id when promoting USER -> PROJECT
  if (currentScope === 'USER' && targetScope === 'PROJECT' && projectId) {
    this.db.prepare(
      UPDATE knowledge_entries SET scope = ?, project_id = ?, updated_at = datetime('now') WHERE id = ?
    ).run(targetScope, projectId, entryId);
  } else {
    this.db.prepare(
      UPDATE knowledge_entries SET scope = ?, updated_at = datetime('now') WHERE id = ?
    ).run(targetScope, entryId);
  }

  this.auditLog('PROMOTE', entryId);
  return true;
}
`

### 5.4 MemoryToolDispatcher.ts Modifications

**handleCrud — add mutation validation (TA Decision #3):**

`	ypescript
private handleCrud(a: Args): string {
  const action = (a.action as string) || 'list';
  switch (action) {
    case 'get': {
      const id = a.id as number;
      if (!id) return 'Error: id required';
      const raw = this.engine.findById(id);
      // TA Decision #1: Post-fetch scope validation
      const e = this.scopeCtx
        ? validateReadAccess(this.scopeCtx as ProjectContext, raw)
        : raw;
      if (!e) return Not found: ;
      this.engine.recordAccess(id);
      return # [] ...;
    }
    case 'delete': {
      const id = a.id as number;
      if (!id) return 'Error: id required';
      const e = this.engine.findById(id);
      if (!e) return Not found: ;
      // TA Decision #3: Mutation ownership validation
      if (this.scopeCtx) {
        const v = validateMutationOwnership(this.scopeCtx as ProjectContext, e);
        if (!v.allowed) return Error: cannot delete — ;
      }
      this.engine.deleteEntry(id);
      this.engine.auditLog('DELETE', id);
      return Deleted #;
    }
    case 'list': { /* unchanged — uses buildReadFilter */ }
  }
}
`

**handleIngestFile — scoped deduplication (TA Decision #4):**

`	ypescript
private handleIngestFile(a: Args): string {
  // ... existing validation ...

  // TA Decision #4: Scoped deduplication — only delete entries in current project
  if (this.scopeCtx) {
    const { clause, params } = buildIngestFileDeleteClause(
      this.scopeCtx as ProjectContext, filePath
    );
    this.engine.getDb().prepare(clause).run(...params);
  } else {
    // Legacy behavior: delete all matching source
    this.engine.getDb().prepare('DELETE FROM knowledge_entries WHERE source = ?').run(filePath);
  }

  // ... rest of ingestion logic ...
}
`

### 5.5 MemoryDb.ts Modifications

`	ypescript
import { MigrationRunner } from './MigrationRunner.js';

function initializeSchema(db: Database.Database): void {
  // ... existing schema initialization (DDL from MEMORY_SCHEMA) ...

  // Replace migrateProjectId() with MigrationRunner
  const runner = new MigrationRunner(db);
  runner.run();
}
`

### 5.6 Design Patterns Used

| Pattern | Where | Rationale |
|---------|-------|-----------|
| Module Pattern | IsolationLayer as stateless exported functions | No class needed — pure functions are simpler, testable |
| Factory | createProjectContext() | Ensures Object.freeze (immutability) |
| Strategy (implicit) | buildReadFilter branches on ctx.projectId presence | Two strategies: with-project vs permissive |
| Template Method | MigrationRunner.run() orchestrates per-migration execution | Common flow with per-migration variation |
| Facade | MemoryEngine remains single entry point for data access | Delegates scope to IsolationLayer |

---

## 6. Integration Design

### 6.1 Extension to Backend — ProjectContext Lifecycle

| Step | Component | Action |
|------|-----------|--------|
| 1 | IDE Extension | Reads `workspace.rootPath` on activation |
| 2 | BackendConfig | `deriveProjectId()` — priority: config > env > path basename > "default" |
| 3 | MCP Session Init | Backend stores projectId + userId in session-level state |
| 4 | Per-Tool Call | `MemoryToolDispatcher.setScopeContext({userId, projectId})` |
| 5 | IsolationLayer | Receives context as parameter — stateless, no global state |

### 6.2 MigrationRunner to SQLite — Startup Sequence

`
Backend Start
  -> getMemoryDb() [singleton]
    -> Open SQLite file (WAL mode, FK enabled)
    -> Execute MEMORY_SCHEMA DDL (CREATE IF NOT EXISTS)
    -> MigrationRunner.run()
      -> CREATE schema_migrations IF NOT EXISTS
      -> SELECT applied versions
      -> For each unapplied: exec SQL, record in tracking table
      -> Log summary
  -> Backend ready to serve requests
`

### 6.3 IsolationLayer Integration Points

| Caller | Method Called | When |
|--------|-------------|------|
| MemoryEngine.search() | buildReadFilter(ctx, 'ke') | Every FTS search |
| MemoryEngine.findFiltered() | buildReadFilter(ctx) | List/filter queries |
| MemoryToolDispatcher.handleCrud('get') | validateReadAccess(ctx, entry) | Get by ID |
| MemoryToolDispatcher.handleCrud('delete') | validateMutationOwnership(ctx, entry) | Before delete |
| MemoryToolDispatcher.handleIngest() | buildWriteDecorator(ctx, scope) | Stamping project_id |
| MemoryToolDispatcher.handleIngestFile() | buildIngestFileDeleteClause(ctx, source) | Scoped dedup |
| ScopePromotionService.promoteOnMerge() | (indirect — calls MemoryEngine.promoteEntry with projectId) | On merge |

---

## 7. Security Design

### 7.1 Threat Model

| Threat | Attack Vector | Mitigation | Layer |
|--------|--------------|------------|-------|
| Cross-project data leakage | Crafted tool call bypasses filter | IsolationLayer enforces at data layer — WHERE clause always applied | IsolationLayer |
| ProjectId spoofing | Client sends fake projectId | Backend derives from workspace path — client cannot override | BackendConfig |
| SQL injection via projectId | Malicious projectId value | Parameterized queries (?) — never string interpolation | IsolationLayer |
| Mutation of foreign entries | Delete entry from other project | validateMutationOwnership() blocks unauthorized mutations | IsolationLayer |
| findById scope bypass | Direct ID access without filter | validateReadAccess() post-fetch check (TA Decision #1) | IsolationLayer |
| Dedup deletes cross-project | mem_ingest_file deletes other project entries | buildIngestFileDeleteClause scopes to current project (TA Decision #4) | IsolationLayer |

### 7.2 Isolation Enforcement Layers

`
Layer 1: BackendConfig (derives projectId from workspace — cannot be spoofed)
Layer 2: MemoryToolDispatcher (injects context into every operation)
Layer 3: IsolationLayer (constructs SQL filter — last line of defense)
Layer 4: SQLite (executes parameterized query — no bypass possible)
`

### 7.3 Data Sensitivity

| Data | Classification | Handling |
|------|---------------|----------|
| project_id | Internal identifier | Workspace folder name — not sensitive |
| user_id | Internal identifier | Not exposed in responses |
| KB entry content | May contain code/architecture | Protected by scope isolation |
| ProjectContext | Session metadata | Not persisted, not logged at INFO level |

---

## 8. Performance and Scalability

### 8.1 Performance Impact Analysis

| Operation | Before | After | Delta | Reason |
|-----------|--------|-------|-------|--------|
| FTS search | ~2ms | ~2.5ms | +0.5ms | Additional WHERE on indexed columns |
| findById | ~0.5ms | ~0.6ms | +0.1ms | Post-fetch validateReadAccess (in-memory check) |
| Insert | ~1ms | ~1ms | ~0ms | project_id already in INSERT statement |
| IngestFile dedup | ~1ms | ~1.2ms | +0.2ms | Scoped DELETE slightly more complex |
| Mutation validation | N/A | ~0.5ms | +0.5ms | New pre-mutation check (findById + in-memory) |
| Migration check (startup) | ~5ms | ~2ms | -3ms | Single SELECT vs try/catch ALTER TABLE |

### 8.2 Index Coverage

The scope clause `(scope='SHARED' OR (scope='PROJECT' AND (project_id=? OR project_id IS NULL)) OR (scope='USER' AND user_id=?))` uses:
- `idx_ke_scope_project` for PROJECT branch
- `idx_ke_scope_user` for USER branch
- `idx_ke_scope` for SHARED branch

SQLite query planner uses OR-optimization with these indexes.

### 8.3 Memory Usage

- IsolationLayer: stateless — zero memory footprint between calls
- ProjectContext: one frozen object per session (~100 bytes)
- MigrationRunner: runs once at startup, GC'd immediately after

### 8.4 Benchmark Expectations

| Metric | Target | Measurement |
|--------|--------|-------------|
| Search latency overhead | < 5ms | Vitest benchmark with 10,000 entries |
| Startup migration check | < 10ms | Fresh DB and already-migrated DB |
| IsolationLayer function call | < 0.1ms | Pure string construction |
| Memory overhead | < 1KB per session | ProjectContext object only |

---

## 9. Monitoring and Observability

### 9.1 Logging

| Event | Level | Message | When |
|-------|-------|---------|------|
| Migration applied | INFO | `[MigrationRunner] Applied v{N} ({name})` | Startup (first time) |
| Migration skipped | DEBUG | `[MigrationRunner] v{N} already applied` | Startup (subsequent) |
| DB version ahead of code | WARN | `[MigrationRunner] DB version ({N}) ahead of code ({M})` | Startup (rollback scenario) |
| Migration failed | ERROR | `Migration v{N} ({name}) failed: {msg}` | Startup (abort) |
| Mutation denied | WARN | `[IsolationLayer] Mutation denied: {reason}` | On unauthorized mutation attempt |
| Missing ProjectContext | WARN | `[IsolationLayer] No projectId — permissive mode` | First occurrence per session |

### 9.2 Audit Trail

Existing `memory_audit` table captures all operations. New entries added:
- `MUTATION_DENIED` — when validateMutationOwnership returns false
- `PROMOTE` — already exists, now includes project_id stamp info

---

## 10. Testing Strategy

### 10.1 Test Architecture

`
backend/src/modules/memory/__tests__/
+-- IsolationLayer.test.ts          <- Unit tests (pure functions, no DB)
+-- MigrationRunner.test.ts         <- Uses in-memory SQLite
+-- isolation-integration.test.ts   <- Full E2E with real SQLite
`

### 10.2 IsolationLayer Unit Tests (IsolationLayer.test.ts)

`	ypescript
import { describe, it, expect } from 'vitest';
import {
  buildReadFilter,
  buildWriteDecorator,
  validateMutationOwnership,
  validateReadAccess,
  buildIngestFileDeleteClause,
} from '../IsolationLayer.js';
import type { ProjectContext } from '../ProjectContext.js';
import type { KnowledgeEntry } from '../models.js';

// TC-15: buildReadFilter with projectId
// TC-16: buildReadFilter without projectId
// TC-17: buildWriteDecorator stamps project
// TC-18: validateMutation — own USER entry (allowed)
// TC-19: validateMutation — foreign USER entry (denied)
// TC-20: validateMutation — own PROJECT entry (allowed)
// TC-21: validateMutation — foreign PROJECT entry (denied)
// TC-22: validateMutation — SHARED entry (always allowed)
// TC-23: validateReadAccess — PROJECT entry wrong project (returns undefined)
// TC-24: validateReadAccess — PROJECT entry NULL project_id (returns entry)
// TC-25: buildIngestFileDeleteClause — scoped to project
`

### 10.3 MigrationRunner Tests (MigrationRunner.test.ts)

`	ypescript
// TC-11: Fresh DB — all migrations run
// TC-12: Already migrated — skip (idempotent)
// TC-13: SA4E-26 leftover (column exists, no schema_migrations) — records as applied
// TC-14: Invalid migration SQL — throws with version + name + error
// TC-26: Downgrade scenario — DB ahead of code — logs warning, continues
`

### 10.4 Integration Tests (isolation-integration.test.ts)

Full Scope Truth Table coverage with real SQLite in-memory DB:

`	ypescript
// TC-01: PROJECT entry visible to matching project
// TC-02: PROJECT entry hidden from different project
// TC-03: PROJECT entry (NULL) visible to any project
// TC-04: SHARED entry visible cross-project
// TC-05: SHARED entry with NULL project_id visible
// TC-06: USER entry visible to owner
// TC-07: USER entry hidden from non-owner
// TC-08: No projectId (backward compat) shows all PROJECT
// TC-09: Ingest stamps project_id correctly
// TC-10: Ingest without projectId stores NULL
`

### 10.5 Test Data Setup Pattern

`	ypescript
function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(MEMORY_SCHEMA);
  const runner = new MigrationRunner(db);
  runner.run();
  return db;
}

function seedEntries(db: Database.Database) {
  const insert = db.prepare(INSERT INTO knowledge_entries
    (content, summary, type, tier, scope, user_id, project_id, tags)
    VALUES (?, ?, 'CONTEXT', 'WORKING', ?, ?, ?, ''));

  // Multi-project seed data
  insert.run('Content A', 'Entry from project-A', 'PROJECT', 'user-1', 'project-A');
  insert.run('Content B', 'Entry from project-B', 'PROJECT', 'user-1', 'project-B');
  insert.run('Content NULL', 'Legacy entry', 'PROJECT', 'user-1', null);
  insert.run('Shared content', 'Shared entry', 'SHARED', 'user-1', 'project-A');
  insert.run('User content', 'User entry', 'USER', 'user-1', 'project-A');
  insert.run('Other user', 'Other user entry', 'USER', 'user-2', 'project-A');
}
`

---

## 11. Implementation Checklist

### Files to Create

| # | File | Purpose | Est. Lines |
|---|------|---------|------------|
| 1 | `backend/src/modules/memory/ProjectContext.ts` | Types + factory | ~30 |
| 2 | `backend/src/modules/memory/IsolationLayer.ts` | All scope logic | ~170 |
| 3 | `backend/src/modules/memory/MigrationRunner.ts` | Versioned migrations | ~110 |
| 4 | `backend/src/modules/memory/migrations/002-add-project-id.ts` | Migration v1 definition | ~15 |
| 5 | `backend/src/modules/memory/__tests__/IsolationLayer.test.ts` | Unit tests | ~200 |
| 6 | `backend/src/modules/memory/__tests__/MigrationRunner.test.ts` | Migration tests | ~120 |
| 7 | `backend/src/modules/memory/__tests__/isolation-integration.test.ts` | Integration tests | ~250 |

### Files to Modify

| # | File | Changes | Est. Delta |
|---|------|---------|------------|
| 8 | `MemoryEngine.ts` | Remove buildScopeClause/Params, modify promoteEntry | -30, +15 |
| 9 | `MemoryToolDispatcher.ts` | Add import IsolationLayer, validate mutations, scoped dedup | +25 |
| 10 | `MemoryDb.ts` | Replace migrateProjectId with MigrationRunner | +3, -2 |
| 11 | `schema.ts` | Remove migrateProjectId export | -10 |
| 12 | `models.ts` | Re-export ProjectContext types | +3 |
| 13 | `ScopePromotionService.ts` | Pass projectId to promoteEntry on USER->PROJECT | +5 |

### Implementation Order

1. **ProjectContext.ts** — Types first (no dependencies)
2. **IsolationLayer.ts** — Core logic (depends on ProjectContext + models)
3. **MigrationRunner.ts** — Migration system (standalone)
4. **migrations/002-add-project-id.ts** — Migration definition
5. **MemoryDb.ts** — Wire MigrationRunner into startup
6. **schema.ts** — Remove migrateProjectId
7. **MemoryEngine.ts** — Remove old scope methods, modify promoteEntry
8. **MemoryToolDispatcher.ts** — Wire IsolationLayer into dispatch flow
9. **ScopePromotionService.ts** — Stamp project_id on promote
10. **Tests** — IsolationLayer.test.ts, MigrationRunner.test.ts, integration

---

## 12. TA Review Decisions — Detailed Resolutions

### Decision #1: findById() post-fetch scope validation

**Problem:** `findById(id)` returns any entry regardless of scope — bypasses isolation.
**Solution:** New `validateReadAccess(ctx, entry)` function. Called in handleCrud 'get' action after findById.
**Rationale:** Adding WHERE clause to findById would break internal usage (e.g., MigrationRunner, ScopePromotionService need unrestricted access). Post-fetch validation is cleaner — only applied at the dispatcher layer where scope enforcement is needed.

### Decision #2: promote/demote stamps project_id

**Problem:** When promoting USER->PROJECT, the entry has no project_id (USER entries don't require one).
**Solution:** `promoteEntry(entryId, targetScope, projectId?)` — when promoting USER->PROJECT, stamp `project_id = ctx.projectId`.
**Rationale:** A USER entry becoming PROJECT-scoped must belong to a specific project. Without project_id, it would be a "legacy" NULL entry visible everywhere — defeating the purpose of promotion to PROJECT scope.

### Decision #3: handleCrud mutation validates ownership

**Problem:** `handleCrud 'delete'` action deletes any entry by ID without checking scope.
**Solution:** Call `validateMutationOwnership(ctx, entry)` before deletion. If `!allowed`, return error message.
**Rationale:** Prevents cross-project deletion. Aligns with BR-17 (entries from OTHER projects never accessible).

### Decision #4: mem_ingest_file scoped deduplication

**Problem:** Current code does `DELETE FROM knowledge_entries WHERE source = ?` — this deletes entries from ALL projects with the same file path.
**Solution:** New `buildIngestFileDeleteClause(ctx, source)` returns scoped DELETE: `WHERE source = ? AND (project_id = ? OR project_id IS NULL)`.
**Rationale:** Same file can be ingested by different projects. Each project should only delete its own entries, not wipe cross-project data.

### Decision #5: Migration downgrade scenario

**Problem:** If code is rolled back but DB has newer migrations, what happens?
**Solution:** MigrationRunner detects `maxDbVersion > maxCodeVersion`, logs WARNING, continues normally. Forward-only design — extra columns/indexes in DB are harmless.
**Rationale:** SQLite schema additions are non-destructive. Code ignores columns it doesn't reference. No need for down-migrations in a single-machine SQLite setup.

### Decision #6: IsolationLayer max 200 lines

**Problem:** Module could grow and become another "scattered scope logic" mess.
**Solution:** Types extracted to `ProjectContext.ts` (~30 lines). IsolationLayer.ts contains ONLY pure logic functions (~170 lines). Total well under 200.
**Rationale:** Aligns with code-standards.md file size limit. Types are stable definitions, not business logic — they belong in a separate file.

---

## 13. Appendix

### 13.1 Scope Clause Truth Table

| # | Scope | project_id | ctx.projectId | ctx.userId | Visible? | Rule |
|---|-------|-----------|---------------|-----------|----------|------|
| 1 | SHARED | project-A | project-A | any | YES | SHARED always visible |
| 2 | SHARED | project-A | project-B | any | YES | SHARED always visible |
| 3 | SHARED | NULL | any | any | YES | SHARED always visible |
| 4 | PROJECT | project-A | project-A | any | YES | project_id matches |
| 5 | PROJECT | project-A | project-B | any | NO | project_id mismatch |
| 6 | PROJECT | NULL | project-A | any | YES | Legacy — accessible everywhere |
| 7 | PROJECT | NULL | project-B | any | YES | Legacy — accessible everywhere |
| 8 | USER | any | any | user-X (owner) | YES | user_id matches |
| 9 | USER | any | any | user-Y (other) | NO | user_id mismatch |
| 10 | PROJECT | project-A | (none) | any | YES | Backward compat — no project filter |

### 13.2 Discrepancy Notes (FSD vs Actual Codebase)

| # | Item | FSD Description | Actual Codebase | Impact |
|---|------|----------------|-----------------|--------|
| 1 | Migration system | FSD describes new MigrationRunner | `migrations/001-add-scope-columns.ts` exists — uses PRAGMA check pattern | Low — new MigrationRunner supersedes, existing file stays for reference |
| 2 | migrateProjectId | FSD implies it doesn't exist | `schema.ts` already has `migrateProjectId()` function | Low — will be removed, replaced by MigrationRunner |
| 3 | project_id column | FSD implies it needs to be added | Already in `MEMORY_SCHEMA` DDL and indexes | None — Migration v1 handles "already exists" gracefully |
| 4 | ScopeContext vs ProjectContext | FSD uses ProjectContext | Codebase uses `ScopeContext` in models.ts | Low — ProjectContext extends ScopeContext; both types coexist |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
