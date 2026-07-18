# Technical Design Document (TDD)

## SA4E Code Intelligence — SA4E-26: KB Knowledge Base thiếu Project Isolation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Title | KB Knowledge Base thiếu Project Isolation — Data từ nhiều projects bị trộn lẫn |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-26.docx |
| Related FSD | FSD-v1-SA4E-26.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | SA Agent | Initiate document — auto-generated from BRD and FSD |

---

## 1. Introduction

> **Scope Boundary:** This TDD specifies HOW to implement the project isolation fix for the KB memory system. It does NOT repeat functional requirements — refer to the FSD for use cases, business rules, and data specifications.

### 1.1 Purpose

This TDD defines the technical implementation for adding `project_id` column-based isolation to the Knowledge Base (`knowledge_entries` table). The fix ensures PROJECT-scope entries are only visible within the originating workspace, while maintaining backward compatibility with legacy entries.

### 1.2 Scope

**Components modified:**
- `schema.ts` — DDL migration (add column + indexes)
- `MemoryEngine.ts` — `buildScopeClause()`, `buildScopeParams()`, `insert()`
- `MemoryToolDispatcher.ts` — `handleIngest()`, `handleIngestFile()` pass `project_id`
- `BackendConfig.ts` — `projectId` derivation from workspace path

**Pattern:** Plugin/Extension (IDE extension → backend server)

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x |
| Framework | Hono | 4.x |
| Database | SQLite (better-sqlite3) | 3.x |
| Search | FTS5 (SQLite extension) | built-in |
| Validation | Zod | 3.x |
| Build Tool | esbuild | 0.19+ |

### 1.4 Design Principles

- **Minimal change surface** — only touch the scope filter path, not FTS5 or vector search internals
- **Backward compatibility** — NULL `project_id` entries remain accessible (graceful degradation)
- **Zero downtime migration** — `ALTER TABLE ADD COLUMN` is online in SQLite
- **Single Responsibility** — each file change has one clear purpose

### 1.5 Constraints

- SQLite does not support `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS` — must handle via try/catch or pragma check
- FTS5 virtual table cannot be altered — `project_id` filter applied to the JOIN, not the FTS table itself
- better-sqlite3 is synchronous — no async migration concerns
- Backend instance serves ONE workspace at a time (single-project per process)

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-26.docx |
| FSD | FSD-v1-SA4E-26.docx |
| Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| Schema Source | backend/src/modules/memory/schema.ts |

---

## 2. System Architecture

### 2.1 Architecture Overview

The fix touches a vertical slice through the Memory Module — from config layer down to database schema. No new components are introduced; existing components are modified to thread `projectId` through the data path.

![Architecture Diagram](diagrams/architecture.png)

**Data flow for project-isolated search:**
```
IDE Extension (workspace path)
  → BackendConfig.projectId (derived on startup)
    → MemoryToolDispatcher.setScopeContext({userId, projectId})
      → MemoryEngine.buildScopeClause(ctx, alias)
        → SQLite WHERE clause with project_id filter
```

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Change Type |
|-----------|---------------|-------------|
| BackendConfig | Derive projectId from workspace path | **ADD** projectId field + derivation |
| MemoryToolDispatcher | Thread projectId from ScopeContext to engine calls | **MODIFY** handleIngest, handleIngestFile |
| MemoryEngine | Filter queries by project_id, store project_id on insert | **MODIFY** buildScopeClause, buildScopeParams, insert |
| schema.ts | Define DDL including project_id column + indexes | **MODIFY** add column + indexes |
| models.ts | ScopeContext.projectId already optional | **NO CHANGE** (already correct) |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| IDE Extension | Backend | MCP StreamableHTTP | Sync Request-Response | Tool calls carry ScopeContext |
| MemoryToolDispatcher | MemoryEngine | Direct method call | Sync | Thread projectId param |
| MemoryEngine | SQLite | better-sqlite3 | Sync | Prepared statements |

---

## 3. API Design

> **Prerequisite:** Functional API contracts (parameters, business errors) are defined in FSD §12. This section covers the internal implementation mechanics.

### 3.1 No New External APIs

This fix does not add new MCP tools or endpoints. It modifies the **internal behavior** of existing tools:
- `mem_search` — adds project_id filter to WHERE clause
- `mem_ingest` — stores project_id in new column
- `mem_ingest_file` — stores project_id in new column
- `mem_list` / `mem_crud` — filter by project_id via `findFiltered()`

### 3.2 Internal Method: MemoryEngine.buildScopeClause()

**Before (current — BROKEN):**
```typescript
buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `(${prefix}scope IN ('PROJECT', 'SHARED') OR (${prefix}scope = 'USER' AND ${prefix}user_id = ?))`;
}
```

**After (fixed):**
```typescript
buildScopeClause(ctx: ScopeContext, tableAlias?: string): string {
  const p = tableAlias ? `${tableAlias}.` : '';
  if (ctx.projectId) {
    return `(${p}scope = 'SHARED' OR (${p}scope = 'PROJECT' AND (${p}project_id = ? OR ${p}project_id IS NULL)) OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
  }
  // Backward compat: no projectId → all PROJECT entries visible
  return `(${p}scope IN ('PROJECT', 'SHARED') OR (${p}scope = 'USER' AND ${p}user_id = ?))`;
}
```

### 3.3 Internal Method: MemoryEngine.buildScopeParams()

**Before:**
```typescript
buildScopeParams(ctx: ScopeContext): unknown[] {
  return [ctx.userId];
}
```

**After:**
```typescript
buildScopeParams(ctx: ScopeContext): unknown[] {
  if (ctx.projectId) {
    return [ctx.projectId, ctx.userId];
  }
  return [ctx.userId];
}
```

### 3.4 Internal Method: MemoryEngine.insert()

**Before:**
```typescript
insert(entry: Partial<KnowledgeEntry>): number {
  const stmt = this.db.prepare(`
    INSERT INTO knowledge_entries
    (content, summary, type, tier, scope, user_id, source, source_ref, tags, confidence, agent_name, owner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // ... 12 params
}
```

**After:**
```typescript
insert(entry: Partial<KnowledgeEntry> & { project_id?: string | null }): number {
  const stmt = this.db.prepare(`
    INSERT INTO knowledge_entries
    (content, summary, type, tier, scope, user_id, project_id, source, source_ref, tags, confidence, agent_name, owner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    entry.content, entry.summary, entry.type,
    entry.tier ?? 'WORKING', entry.scope ?? 'USER',
    entry.user_id ?? null,
    entry.project_id ?? null,   // NEW: project isolation
    entry.source ?? null,
    entry.source_ref ?? null, entry.tags ?? '',
    entry.confidence ?? 1.0, entry.agent_name ?? null,
    entry.owner ?? null,
  );
  return result.lastInsertRowid as number;
}
```

---

## 4. Database Design

### 4.1 Schema Change

**Migration DDL (added to schema.ts and run as migration):**

```sql
-- Add project_id column (online migration — no table rebuild)
ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL;

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id);
```

### 4.2 Migration Strategy

SQLite `ALTER TABLE ADD COLUMN` is:
- **Non-blocking** — no table lock, no rebuild
- **Instant** — O(1) regardless of row count
- **Safe** — existing data untouched, new column gets DEFAULT NULL

**Implementation approach:**

```typescript
// In schema initialization (after CREATE TABLE IF NOT EXISTS)
try {
  db.exec('ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT DEFAULT NULL');
} catch (err: any) {
  // Column already exists — SQLite throws "duplicate column name"
  if (!err.message?.includes('duplicate column')) throw err;
}
db.exec('CREATE INDEX IF NOT EXISTS idx_ke_project_id ON knowledge_entries(project_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_ke_scope_project ON knowledge_entries(scope, project_id)');
```

### 4.3 Query Patterns

| Operation | Query Pattern | Expected Performance |
|-----------|--------------|---------------------|
| Search with project filter | `WHERE scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR (scope = 'USER' AND user_id = ?)` | < 5ms overhead (indexed) |
| Insert with project_id | `INSERT ... project_id = ?` | No change from current |
| List filtered by project | Same as search scope clause | < 5ms overhead |

### 4.4 Index Justification

| Index | Columns | Use Case | Query Pattern |
|-------|---------|----------|---------------|
| `idx_ke_project_id` | `project_id` | Direct project lookup | `WHERE project_id = ?` |
| `idx_ke_scope_project` | `scope, project_id` | Composite for scope clause | `WHERE scope = 'PROJECT' AND project_id = ?` |

---

## 5. Class / Module Design

### 5.1 Package Structure (affected files only)

```
backend/src/
├── config/
│   └── BackendConfig.ts        ← ADD projectId derivation
├── modules/memory/
│   ├── schema.ts               ← ADD column + indexes to DDL + migration
│   ├── models.ts               ← ADD project_id to KnowledgeEntry interface
│   ├── MemoryEngine.ts         ← MODIFY buildScopeClause, buildScopeParams, insert
│   └── MemoryToolDispatcher.ts ← MODIFY handleIngest, handleIngestFile
```

### 5.2 Key Interface Changes

**ScopeContext (models.ts — NO CHANGE, already correct):**
```typescript
export interface ScopeContext {
  userId: string;
  projectId?: string;  // Already optional — just needs to be populated
}
```

**KnowledgeEntry (models.ts — ADD field for type safety):**
```typescript
export interface KnowledgeEntry {
  // ... existing fields ...
  project_id: string | null;  // NEW — stored in DB, returned in queries
}
```

### 5.3 Design Patterns Used

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy (implicit) | buildScopeClause branching on ctx.projectId | Two clause strategies: with-project vs backward-compat |
| Facade | MemoryEngine as single entry point | All scope logic encapsulated in one class |
| Template Method | MemoryToolDispatcher → MemoryEngine | Dispatcher prepares context, engine executes |

### 5.4 Error Handling

| Scenario | Status | Error Code | Handling |
|----------|--------|------------|----------|
| Migration fails (non-duplicate error) | Server startup failure | MIGRATION_ERROR | Log error, exit process |
| Empty projectId in ScopeContext | N/A (valid) | — | Fallback to permissive clause |
| Invalid projectId characters | N/A (accepted) | — | No sanitization needed (TEXT column) |

---

## 6. Integration Design

### 6.1 Extension → Backend: ScopeContext Lifecycle

| Attribute | Value |
|-----------|-------|
| Protocol | MCP StreamableHTTP (JSON-RPC) |
| Direction | Extension → Backend |
| Data | ScopeContext { userId, projectId } per request |
| Timing | projectId set once on session init, reused for all calls |

**Sequence:**
1. Extension activates → reads `workspace.rootPath`
2. Derives `projectId` (last path segment or config override)
3. On MCP connection init → stores projectId in session
4. Each tool call → dispatcher reads projectId from session → constructs ScopeContext

### 6.2 BackendConfig.projectId Derivation

**Resolution Order (priority):**

| # | Source | Example | Implementation |
|---|--------|---------|----------------|
| 1 | Explicit config override | `loadConfig({ projectId: 'custom' })` | Check overrides param |
| 2 | Environment variable | `CODE_INTEL_PROJECT_ID=my-project` | `process.env.CODE_INTEL_PROJECT_ID` |
| 3 | Derived from workspace path | `/projects/my-app` → `my-app` | `path.basename(workspace)` |
| 4 | Fallback | — | `'default'` |

**Implementation:**
```typescript
// In BackendConfig.ts — add to loadConfig()
function deriveProjectId(workspace: string, overrides?: Partial<BackendConfig>): string {
  if (overrides?.projectId) return overrides.projectId;
  const envId = process.env.CODE_INTEL_PROJECT_ID;
  if (envId) return envId;
  const basename = path.basename(workspace);
  return basename || 'default';
}
```

---

## 7. Security Design

### 7.1 Data Isolation Enforcement

Project isolation is enforced at the **data access layer** (MemoryEngine), not at the API/transport layer. This means:
- Even if a client sends a crafted request, the WHERE clause prevents cross-project data access
- SHARED-scope entries are intentionally exempt (business rule BR-02)
- Legacy entries (NULL project_id) are accessible to all (business rule BR-03)

### 7.2 Threat Model

| Threat | Mitigation | Layer |
|--------|-----------|-------|
| Client spoofs projectId | Backend derives from workspace — client cannot override | Config |
| SQL injection via projectId | Parameterized queries (`?`) — not string interpolation | Engine |
| Data leakage via SHARED scope | By design — SHARED is cross-project | Business Rule |

### 7.3 No Sensitive Data

`project_id` is a workspace folder name (e.g., "my-app"). No encryption or masking required.

---

## 8. Performance & Scalability

### 8.1 Performance Impact Analysis

| Operation | Before | After | Delta | Reason |
|-----------|--------|-------|-------|--------|
| FTS search | ~2ms | ~2.5ms | +0.5ms | Additional WHERE on indexed column |
| Insert | ~1ms | ~1ms | ~0ms | One additional column value |
| List filtered | ~1ms | ~1.5ms | +0.5ms | Additional WHERE clause |

**Conclusion:** Impact negligible due to B-tree index on `project_id`.

### 8.2 Index Performance

- `idx_ke_project_id` — B-tree, O(log n) lookup
- `idx_ke_scope_project` — Composite covers `scope = 'PROJECT' AND project_id = ?`
- SQLite query planner will prefer composite index

### 8.3 No Caching Impact

No query-level caching exists. Fix does not introduce caching complexity.

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | When |
|-----------|-------|--------|------|
| Migration applied | INFO | `project_id column added` | Startup (first time) |
| Migration skipped | DEBUG | `column already exists` | Startup (subsequent) |
| Scope clause with project | DEBUG | `projectId={id}` | Each query (debug only) |
| Scope clause backward-compat | DEBUG | `no projectId` | Legacy client |

### 9.2 Audit Trail

Existing `memory_audit` table logs operations. No new audit entries needed for this fix.

---

## 10. Deployment Considerations

### 10.1 Rollback Strategy

1. Column cannot be easily removed from SQLite (no `DROP COLUMN` in older versions)
2. **Rollback approach:** revert code to old `buildScopeClause()` — column remains but is ignored
3. No data loss in either direction

### 10.2 Feature Flags

None needed — fix is backward compatible, deterministic, and low risk.

### 10.3 Migration Ordering

1. Schema migration runs during DB init (`schema.ts`)
2. Code changes activate immediately
3. Single atomic deployment — no staged rollout

---

## 11. Implementation Checklist

### Files to Modify

| # | File | Change | Complexity | Est. Lines |
|---|------|--------|-----------|------------|
| 1 | `backend/src/modules/memory/schema.ts` | Add `project_id` to CREATE TABLE + migration try/catch + indexes | Low | +10 |
| 2 | `backend/src/modules/memory/models.ts` | Add `project_id: string \| null` to KnowledgeEntry | Low | +1 |
| 3 | `backend/src/config/BackendConfig.ts` | Add `projectId` to schema + derivation function | Low | +12 |
| 4 | `backend/src/modules/memory/MemoryEngine.ts` | Modify `buildScopeClause()`, `buildScopeParams()`, `insert()` | Medium | +15, -5 |
| 5 | `backend/src/modules/memory/MemoryToolDispatcher.ts` | Pass `project_id: this.scopeCtx?.projectId` in handleIngest + handleIngestFile | Low | +4 |

### Implementation Order

1. **schema.ts** — Add column to DDL + migration logic
2. **models.ts** — Add `project_id` to KnowledgeEntry interface
3. **BackendConfig.ts** — Add `projectId` derivation
4. **MemoryEngine.ts** — Modify scope clause + insert
5. **MemoryToolDispatcher.ts** — Thread projectId through ingest calls

### Testing Verification

| Test | Verifies | Type |
|------|----------|------|
| Search returns only same-project entries | BR-01 | Integration |
| Search includes SHARED entries cross-project | BR-02 | Integration |
| Search includes NULL project_id entries | BR-03, BR-13 | Integration |
| Ingest stores project_id from ScopeContext | BR-06 | Unit |
| Ingest without ScopeContext stores NULL | BR-08 | Unit |
| Project ID derived from workspace path | BR-09 | Unit |
| Project ID override from config | BR-10 | Unit |
| Migration idempotent (no error on re-run) | BR-12 | Integration |

---

## 12. Appendix

### 12.1 Scope Clause Truth Table

| Entry Scope | Entry project_id | Query projectId | Visible? | Clause Branch |
|-------------|-----------------|-----------------|----------|---------------|
| SHARED | any | any | YES | `scope = 'SHARED'` |
| PROJECT | "app-A" | "app-A" | YES | `project_id = ?` match |
| PROJECT | "app-A" | "app-B" | NO | `project_id = ?` mismatch |
| PROJECT | NULL | "app-A" | YES | `project_id IS NULL` |
| PROJECT | "app-A" | NULL (no ctx) | YES | Backward compat clause |
| USER | any | any | Only if user_id matches | `scope = 'USER' AND user_id = ?` |

### 12.2 Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Should `handleIngestFile` also tag with project_id? | Resolved | YES — all ingest paths must tag |
| 2 | Should project_id be in FTS5 virtual table? | Resolved | NO — filter on JOIN |
| 3 | Need to update `findFiltered()`? | Resolved | Already passes scopeCtx — no change needed |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
