# Technical Design Document (TDD)

## Code Intelligence — SA4E-CODEINTEL-MT: Multi-Tenant Isolation for Code Intelligence

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-CODEINTEL-MT (internal) |
| Title | Multi-Tenant Isolation for Code Intelligence (files/symbols/modules/graph) |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-13 |
| Status | Draft |
| Related | ADR-001 (documents/post-mortems/MULTI-TENANT-ISOLATION-BUG.md) |
| Related | KB isolation pattern (backend/src/modules/memory/IsolationLayer.ts) |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | BA Agent – Business Analyst | Review for completeness against requirements |
| Security Reviewer | Security Agent | Security architecture review (Phase 3.7) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-13 | SA Agent | Initial design — grounded in live code + index.db state |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

> **Scope Boundary:** This TDD specifies HOW to make Code Intelligence multi-tenant. It focuses on storage strategy, schema migration, indexer scoping, query filtering, graph sync, and API contract changes. It reuses the proven Knowledge Base isolation pattern (ADR-001).

### 1.1 Purpose

Knowledge Base (KB) is correctly multi-tenant via `project_id` + `IsolationLayer` (fail-closed). Code Intelligence is **not**: `files`, `symbols`, `modules`, `embeddings`, `relationships`, and `body_embeddings` carry **no `project_id`**, and the indexer/query/graph layers ignore tenant boundaries entirely. This causes cross-tenant leakage: for example, `codeCount` reports the SDLC workspace's symbols (~9K) when viewing an unrelated project such as `hello-agents`.

This TDD designs the fix so that Code Intelligence enforces the same per-project isolation guarantees as KB.

### 1.2 Scope

In scope (Code Intelligence only):

- Storage strategy decision (single-DB + `project_id` vs database-per-project).
- Schema migration adding `project_id` to `files`, `symbols`, `modules`, `embeddings`, `relationships`, `body_embeddings`, plus new uniqueness constraints and backfill.
- Indexer scoping so `runFullIndex` indexes the request workspace and stamps the request `project_id`.
- Query filtering (`code_search`, `code_symbols`, `get_curated_context`, `codeCount`, index status) — fail-closed like KB.
- Graph sync: code symbols → `graph_nodes` (admin.db) scoped by `project_id`.
- API contract: `/api/index/source` threading `project_id` into the indexer.

Out of scope: KB isolation (already fixed), authentication/JWT changes, UI redesign, embeddings generation pipeline.

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript (ESM, NodeNext) | 5.x |
| Runtime | Node.js | 22.x |
| HTTP | Hono | current |
| Storage | SQLite via better-sqlite3 (WAL) | current |
| Search | SQLite FTS5 (porter/unicode61) | bundled |
| Parsing | Tree-sitter (WASM) + regex fallback | current |

### 1.4 Design Principles

- Reuse the KB pattern (ADR-001): shared tables + `project_id` column + centralized, fail-closed isolation helper.
- Secure by default (opt-out, not opt-in): no `project_id` in context ⇒ `1=0` (return nothing).
- SOLID + code-standards: files ≤ 200 lines, functions ≤ 20 lines, model/logic separation, DI via constructor.
- Minimal blast radius: prefer additive migration; avoid rebuilding FTS5 where possible.

### 1.5 Constraints

- `DatabaseManager` uses a `static sharedDb` singleton — one connection to one `index.db`. The chosen design must respect or explicitly change this.
- `index.db` is a **shared file** that also hosts the Memory/KB tables (`knowledge_entries`, `knowledge_fts`, …). Migrations must not disturb KB tables.
- FTS5 `symbols_fts` is an **external-content** table (`content=symbols`); its rowids map to `symbols.id`. Any change touching `symbols.id` risks corrupting FTS mapping.
- Live baseline (measured): `files=2453`, `symbols=9269`, `modules=7`, `relationships=10776`, `body_embeddings=3410`, `embeddings=0`, `schema_version=4`.

### 1.6 References

| Document | Location |
|----------|----------|
| ADR-001 Multi-Tenant Isolation | documents/post-mortems/MULTI-TENANT-ISOLATION-BUG.md |
| KB Isolation Layer | backend/src/modules/memory/IsolationLayer.ts |
| KB Project Context | backend/src/modules/memory/ProjectContext.ts |
| Code standards | .kiro/steering/code-standards.md |

---

## 2. System Architecture

### 2.1 Architecture Overview

The fix introduces a **`project_id` scope column** across all Code Intelligence tables and a **`CodeIntelIsolation`** helper (mirroring KB's `IsolationLayer`) that is the single source of truth for building scoped SQL. The request's `project_id` (from `X-Project-Id` header via the ADR-001 injection path) and `workspace` (from `X-Workspace-Root`) flow from the API/MCP layer down through the indexer and query layer, and code nodes are synced into `graph_nodes` (admin.db) tagged by `project_id`.

The `DatabaseManager` `static sharedDb` singleton is **retained** (single `index.db`), because the recommended strategy is single-database multi-tenant (Option A1).

![Architecture Diagram](diagrams/architecture.png)

*[Edit in draw.io](diagrams/architecture.drawio)*

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

*[Edit in draw.io](diagrams/component.drawio)*

| Component | Responsibility | Change |
|-----------|---------------|--------|
| `api.ts` `/api/index/source` | Read `X-Project-Id`/`X-Workspace-Root`, write files, trigger index | Pass `{projectId, workspace}` scope into `runFullIndex` |
| `CodeIntelModule` | Wire DB + indexer + tool handlers | Extract `__projectId` from tool args; pass to dispatch |
| `IndexingEngine` | Scan workspace, index files/symbols | Accept `IndexScope`; stamp `project_id`; per-project index guard |
| `CodeIntelIsolation` (new) | Build fail-closed scope filter/decorator | New file (≤120 lines) |
| `QueryLayer` | FTS5 search, symbol/module lookup, status | All methods take `projectId`; add `WHERE project_id = ?` |
| `GraphSyncService` (new) | Sync symbols → `graph_nodes` per project | New file (≤150 lines) |
| `kb-graph-spatial.ts` | `codeCount`, node positions | Filter `symbols` count by `project_id` |
| `migrations.ts` | Versioned DDL | Add V5 migration (project_id) |
| `DatabaseManager` | SQLite lifecycle, migrations | Pass `legacyProjectId` into `runMigrations` |

### 2.3 Deployment Architecture

No topology change. Single backend process, single `index.db` (+ `admin.db`). The migration runs in-process at startup via `runMigrations`. Rollback = restore the pre-migration `index.db` backup (see §10.3).

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| MCP client | `/mcp/tools/call` | HTTP | Sync | Injects `__projectId`/`__workspaceRoot` into args (ADR-001) |
| Extension | `/api/index/source` | HTTP | Async index | Writes files, triggers scoped `runFullIndex` |
| Tool handler | `QueryLayer` | in-proc | Sync | Scoped reads with `project_id` |
| `IndexingEngine` | admin.db `graph_nodes` | in-proc | Sync | `GraphSyncService` upserts code nodes per project |

---

## 3. Design Decision D1 — Storage Strategy

**Decision to make:** how to isolate tenants physically/logically in Code Intelligence storage.

### 3.1 Option A1 — Single `index.db` + `project_id` column (ADR-001 model)

Add `project_id` to `files`, `symbols`, `modules`, `embeddings`, `relationships`, `body_embeddings`. Keep the `static sharedDb` singleton (one connection, one file). Isolate every read with `WHERE project_id = ?` and stamp every write. Identical to how KB works in this same DB.

| Aspect | Assessment |
|--------|-----------|
| FTS5 rebuild | **Not required.** `symbols` gets an additive `ALTER TABLE ADD COLUMN project_id` — `symbols.id`/rowids are preserved, so the external-content `symbols_fts` mapping stays valid. Filtering happens by JOIN to `symbols.project_id`, not inside FTS. |
| Migration | One in-process migration (V5). `ALTER ADD COLUMN` + backfill for most tables; `files` and `modules` recreated only because of new composite UNIQUE constraints. |
| `sharedDb` singleton | **Kept as-is** — no lifecycle rework. Lowest risk. |
| Cross-project search | Possible (admin/global views) by simply omitting the filter. |
| Disk / memory | One file, one WAL, one 64 MB page cache. Efficient. |
| Consistency w/ KB | **High** — same table file, same pattern, same mental model, reuses ADR-001 guardrails and tests. |
| Blast radius on bug | A missing filter leaks across tenants (mitigated by centralized fail-closed helper + tests). |

### 3.2 Option A2 — Database-per-project (`index-{projectId}.db`)

Each project gets a dedicated DB file. Physical isolation; no `project_id` column needed.

| Aspect | Assessment |
|--------|-----------|
| FTS5 rebuild | None per se, but every new project builds its own FTS from scratch. |
| Migration | Must migrate the existing shared `index.db`: split KB (stays shared) from code tables (move to per-project files), or rename current file to `index-22b039993db3.db`. **KB and code currently share one file** — splitting is invasive. |
| `sharedDb` singleton | **Must be removed** and replaced with a connection pool/registry keyed by `projectId`, with lifecycle + eviction. Touches `DatabaseManager`, `CodeIntelModule`, `IndexingEngine`, `QueryLayer`, and every tool dispatch. |
| Cross-project search | Hard — must open/fan-out across N DBs. |
| Disk / memory | N files, N WALs, N page caches (64 MB each by current pragma) — memory grows with tenant count; risk of file-handle exhaustion. |
| Consistency w/ KB | **Low** — KB stays single-DB; code becomes per-file. Two divergent models. |
| Blast radius on bug | Strong physical isolation (a query cannot reach another file). |

### 3.3 Recommendation — **Option A1 (single-DB + `project_id`)**

**Rationale:**

1. **Consistency with ADR-001 and KB.** KB already lives in the *same* `index.db` and is isolated by `project_id`. Adopting A1 means Code Intelligence follows one proven pattern, reuses the fail-closed philosophy, and lets the graph/positions endpoints query one file.
2. **Lowest risk to the `sharedDb` singleton.** A2 forces a connection-pool rewrite with lifecycle/eviction complexity; A1 keeps the singleton untouched.
3. **No FTS5 rebuild.** The additive `symbols.project_id` column preserves rowids, avoiding a full `symbols_fts` rebuild (~9K symbols today, growing).
4. **Cross-project/admin analytics remain trivial** (global counts, comparisons) — needed by the KB Graph/admin panels.

**Accepted trade-off:** logical (not physical) isolation. A forgotten filter would leak data. This is mitigated by (a) a single centralized `CodeIntelIsolation` helper, (b) fail-closed default (`1=0`), and (c) mandatory cross-project isolation tests per the ADR-001 guardrails. Physical isolation (A2) can be revisited later if a compliance requirement mandates it; A1 does not preclude a future migration.

---

## 4. Design Decision D2 — Schema Migration (V5)

> Logical model: every Code Intelligence row belongs to exactly one tenant identified by `project_id` (a 12-char derived id, e.g. SDLC = `22b039993db3`). Physical model below.

### 4.1 Target Schema Changes

| Table | Change | Uniqueness | Method |
|-------|--------|-----------|--------|
| `files` | + `project_id TEXT NOT NULL` | `UNIQUE(project_id, path)` (was `path UNIQUE`) | **Recreate** (constraint change) |
| `symbols` | + `project_id TEXT NOT NULL` | (indexed, not unique) | `ALTER ADD COLUMN` (preserves FTS) |
| `modules` | + `project_id TEXT NOT NULL` | `UNIQUE(project_id, name)` (was `name UNIQUE`) | **Recreate** (constraint change) |
| `embeddings` | + `project_id TEXT NOT NULL` | — | `ALTER ADD COLUMN` |
| `relationships` | + `project_id TEXT NOT NULL` | — | `ALTER ADD COLUMN` |
| `body_embeddings` | + `project_id TEXT NOT NULL` | — | `ALTER ADD COLUMN` |

New indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_files_project      ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_symbols_project    ON symbols(project_id);
CREATE INDEX IF NOT EXISTS idx_symbols_proj_kind  ON symbols(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_modules_project    ON modules(project_id);
CREATE INDEX IF NOT EXISTS idx_rel_project        ON relationships(project_id);
```

### 4.2 Why `files`/`modules` are recreated but `symbols` is not

The critical constraint is the FTS5 external-content mapping. `symbols_fts.content=symbols` uses `symbols.id` as `content_rowid`. `ALTER TABLE symbols ADD COLUMN project_id` keeps all `id` values and all triggers intact ⇒ **no FTS rebuild**. In contrast, `files` and `modules` need their UNIQUE constraint changed, which SQLite cannot do in place; those tables are rebuilt via the standard 12-step procedure. `symbols.file_id` FK values are preserved because copied `files.id` values are unchanged.

### 4.3 DDL — `files` table recreation (representative)

```sql
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE files_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  language TEXT NOT NULL,
  module TEXT,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  last_indexed TEXT NOT NULL DEFAULT (datetime('now')),
  line_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, path)
);

INSERT INTO files_new (id, project_id, path, relative_path, language, module,
                       content_hash, size_bytes, last_indexed, line_count)
SELECT id, @legacyProjectId, path, relative_path, language, module,
       content_hash, size_bytes, last_indexed, line_count
FROM files;

DROP TABLE files;
ALTER TABLE files_new RENAME TO files;

CREATE INDEX IF NOT EXISTS idx_files_path     ON files(relative_path);
CREATE INDEX IF NOT EXISTS idx_files_module   ON files(module);
CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);
CREATE INDEX IF NOT EXISTS idx_files_project  ON files(project_id);

COMMIT;
PRAGMA foreign_keys=ON;
```

### 4.4 DDL — additive columns + backfill

```sql
ALTER TABLE symbols          ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
ALTER TABLE embeddings       ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
ALTER TABLE relationships    ADD COLUMN project_id TEXT NOT NULL DEFAULT '';
ALTER TABLE body_embeddings  ADD COLUMN project_id TEXT NOT NULL DEFAULT '';

-- Backfill: derive scope from the file each row belongs to
UPDATE symbols
   SET project_id = (SELECT f.project_id FROM files f WHERE f.id = symbols.file_id)
 WHERE project_id = '';

UPDATE relationships
   SET project_id = (SELECT s.project_id FROM symbols s WHERE s.id = relationships.source_symbol_id)
 WHERE project_id = '';

UPDATE body_embeddings
   SET project_id = (SELECT s.project_id FROM symbols s WHERE s.id = body_embeddings.symbol_id)
 WHERE project_id = '';

UPDATE embeddings
   SET project_id = COALESCE(
        (SELECT s.project_id FROM symbols s WHERE s.id = embeddings.symbol_id),
        (SELECT f.project_id FROM files   f WHERE f.id = embeddings.file_id))
 WHERE project_id = '';
```

`@legacyProjectId` and the `files`/`modules` backfill value = the workspace `project_id` the server booted with (SDLC = `22b039993db3`). Any rows that cannot resolve a parent (orphans) fall back to `@legacyProjectId`, never to a blank — blanks would be invisible under fail-closed reads, which is acceptable but the fallback keeps existing data queryable.

### 4.5 Migration versioning

`schema_version` already tracks versions (live max = **4**). Add **V5 = "multi-tenant project_id"**:

- In `migrations.ts`, add `applyMigrationV5(db, legacyProjectId)` guarded by `if (current < 5)`.
- Update the early-return guard from `current >= 2` to `current >= 5`.
- `DatabaseManager.initialize()` passes `config.projectId` into `runMigrations(db, legacyProjectId)` so the backfill value is the booting workspace's derived id.
- V5 is idempotent: it checks `PRAGMA table_info` for `project_id` before acting (mirrors existing `getExistingColumns` usage), so re-runs are safe.

### 4.6 Migration Plan

| Order | Step | Est. time (9K symbols) | Rollback |
|-------|------|------------------------|----------|
| 0 | Backup `index.db` (+ `-wal`, `-shm`) | seconds | restore backup |
| 1 | Recreate `files` with `UNIQUE(project_id,path)` + backfill | < 1s | restore backup |
| 2 | Recreate `modules` with `UNIQUE(project_id,name)` + backfill | < 1s | restore backup |
| 3 | `ALTER ADD project_id` on symbols/embeddings/relationships/body_embeddings | < 1s | restore backup |
| 4 | Backfill symbols/relationships/body_embeddings/embeddings | 1–3s | restore backup |
| 5 | Create `project_id` indexes | < 1s | drop indexes |
| 6 | Stamp `schema_version = 5` | ms | delete row |

The whole V5 runs inside a single transaction (except the FTS-safe `ALTER`s which SQLite auto-commits); on any failure the transaction rolls back and the backup remains authoritative.

---

## 5. Design Decision D3 — Indexer Scoping

### 5.1 Problem

`runFullIndex()` calls `scanWorkspace(this.config)` — always the fixed boot workspace (SDLC) — and `indexFiles()` INSERTs into `files`/`symbols` with no `project_id`. Even though `/api/index/source` writes the request's files into the request workspace, it then calls `indexer.runFullIndex()` which re-scans SDLC. So the request's `project_id` and workspace never reach the indexer.

### 5.2 Design — `IndexScope` parameter

Introduce an immutable value object and thread it through the indexer (no new singleton, `sharedDb` retained).

```ts
// engine/indexer/index-scope.ts  (model — ≤40 lines)
export interface IndexScope {
  readonly projectId: string;   // fail-closed: never empty
  readonly workspace: string;   // absolute path to scan
}
```

`IndexingEngine.runFullIndex(scope?: IndexScope)`:

- `const projectId = scope?.projectId ?? this.config.projectId;`
- `const workspace = scope?.workspace ?? this.config.workspace;`
- `const files = scanWorkspace({ ...this.config, workspace });` — scans the **request** workspace.
- `indexFiles(files, projectId)` — stamps `project_id` on every insert.
- `updateModules(this.db, projectId)` and `detectAndStorePatterns(..., projectId)` — module rows scoped.
- `graphRepo.resolveTargets(...)` scoped to `projectId` (resolve only within tenant).
- `GraphSyncService.syncProjectSymbols(projectId)` at the end (see §7).

### 5.3 Scoped writes (SQL changes)

```ts
// files insert — add project_id, rely on UNIQUE(project_id, path)
INSERT OR REPLACE INTO files
  (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count, last_indexed)
  VALUES (?,?,?,?,?,?,?,?, datetime('now'))

// symbols insert — add project_id
INSERT INTO symbols
  (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
  VALUES (?,?,?,?,?,?,?,?,?,?)
```

`isFileUnchanged`, `upsertFileInDb`, `removeFile`, and the regex-fallback lookups (`SELECT id FROM files WHERE relative_path = ?`) must all add `AND project_id = ?`, otherwise a same-relative-path file in another tenant would be matched. The tree-sitter indexer path (`TreeSitterIndexer.indexFiles`) must also receive and stamp `project_id` when writing symbols/relationships/body_embeddings.

### 5.4 Concurrency — per-project index guard

Current `this.indexing` boolean blocks *all* indexing while one runs. With multiple tenants this serializes unfairly and could drop a tenant's index request. Replace with a per-project guard:

```ts
private indexing = new Set<string>();       // projectIds currently indexing
// guard:
if (this.indexing.has(projectId)) return;
this.indexing.add(projectId);
try { /* ... */ } finally { this.indexing.delete(projectId); }
```

`isRunning()` becomes `isRunning(projectId?)` → membership check. This keeps tenants independent while avoiding duplicate concurrent full-indexes for the same tenant.

### 5.5 `DatabaseManager` singleton — explicitly retained

Because A1 keeps a single `index.db`, `static sharedDb` stays. The indexer remains a single instance shared across tenants; isolation is enforced by the `project_id` parameter, not by separate connections. **No change** to `sharedDb` other than passing `legacyProjectId` into `runMigrations`. (Had we chosen A2, this singleton would be replaced by a `Map<projectId, DatabaseManager>` pool — documented here as the rejected path.)

### 5.6 File watcher

`FileWatcher` currently watches the boot workspace. Watch-driven `indexSingleFile`/`removeFile` must resolve the owning `project_id` for the changed path. For the boot workspace this is `config.projectId`; for remote-indexed projects, watching is not active (files arrive via `/api/index/source`), so watcher scoping defaults to `config.projectId` and remote projects rely on explicit re-index. This is called out as an open item (§11) if live watching of multiple workspaces is later required.

---

## 6. Design Decision D4 — Query Filtering (fail-closed)

### 6.1 `CodeIntelIsolation` helper (new, mirrors `IsolationLayer`)

Single source of truth for code scope SQL. Fail-closed: no `projectId` ⇒ `1=0`.

```ts
// engine/query/code-intel-isolation.ts  (≤120 lines)
export interface CodeScopeFilter { readonly clause: string; readonly params: readonly unknown[]; }

/** Build a WHERE fragment scoping to one tenant. Fail-closed. */
export function buildCodeScopeFilter(projectId: string | undefined, alias = 's'): CodeScopeFilter {
  if (!projectId) return { clause: '1=0', params: [] };          // secure by default
  return { clause: `${alias}.project_id = ?`, params: [projectId] };
}

/** Guard for writes — throws if no tenant context. */
export function requireProjectId(projectId: string | undefined): string {
  if (!projectId) throw new Error('PROJECT_REQUIRED: code intelligence operation needs project_id');
  return projectId;
}
```

### 6.2 `QueryLayer` — every method takes `projectId`

| Method | Change |
|--------|--------|
| `searchCode(projectId, query, limit)` | `... JOIN symbols s ON symbols_fts.rowid = s.id JOIN files f ON s.file_id=f.id WHERE symbols_fts MATCH ? AND s.project_id = ? ORDER BY rank LIMIT ?` |
| `findSymbols(projectId, name, kind?, limit)` | add `AND s.project_id = ?` |
| `getFileSymbols(projectId, relativePath)` | add `AND f.project_id = ?` (and match file by `relative_path AND project_id`) |
| `listModules(projectId)` / `listModulesWithPatterns(projectId, name)` | add `WHERE project_id = ?` |
| `getIndexStatus(projectId)` | all COUNT/MAX/GROUP BY add `WHERE project_id = ?` |

FTS filtering is done **after** the `symbols_fts MATCH` by joining to `symbols` and constraining `s.project_id`. This is correct and needs no FTS schema change; the `idx_symbols_project`/`idx_symbols_proj_kind` indexes keep it fast.

### 6.3 Threading `projectId` to tool handlers

`dispatchCodeIntelTool(name, args, dbManager, indexer, workspace, projectId)` — add `projectId` (last param). `CodeIntelModule.getToolHandlers()` extracts it from the ADR-001-injected arg:

```ts
const projectId = (args as any).__projectId as string | undefined;
const result = await dispatchCodeIntelTool(def.name, args, this.dbManager, this.indexer, this.workspace, projectId);
```

Each handler passes `projectId` into the corresponding `QueryLayer` call. Handlers that mutate/scan (e.g. `code_index_status` with `reindex:true`) call `runFullIndex({ projectId, workspace })`.

### 6.4 `get_curated_context`

`handleGetCuratedContext` receives `projectId` and passes it into `CuratedContextService.getContext({ ..., projectId })`. Internally:

- Code branch → `queryLayer.searchCode(projectId, ...)`.
- Graph branch → traversal restricted to symbols/relationships `WHERE project_id = ?`.
- Memory branch → already scoped by KB `IsolationLayer` (unchanged).

Fail-closed: missing `projectId` ⇒ the code/graph branches return empty (via `1=0`), matching KB behavior.

### 6.5 `codeCount` in `kb-graph-spatial.ts`

Current query counts *all* symbols:

```ts
"SELECT COUNT(*) as cnt FROM symbols WHERE kind IN ('function','class',...)"
```

Change to scope by the request project (already available via `ctx.getRequestProjectId(c)`):

```ts
const pid = ctx.getRequestProjectId(c);
const row = indexDb.prepare(
  "SELECT COUNT(*) as cnt FROM symbols WHERE project_id = ? AND kind IN ('function','class','interface','method','type','enum','constructor')"
).get(pid) as { cnt: number } | undefined;
```

If `pid` is absent, count returns 0 (fail-closed) — consistent with the KB count path in the same handler.

### 6.6 Error semantics

Per ADR-001 §7.5, cross-project access returns **empty results / 0**, not an error that reveals existence. Only write operations without a tenant throw `PROJECT_REQUIRED` (400 at the API edge). This matches KB's `validateReadAccess` returning `undefined` and `buildReadFilter` returning `1=0`.

---

## 7. Design Decision D5 — Graph Sync (symbols → graph_nodes per project)

### 7.1 Problem

The KB Graph visualization reads `graph_nodes` from **admin.db** (columns include `entry_id, label, type, tier, project_id, x, y, z, level, cluster_id`). Today only KB entries are synced there. Code symbols live in `index.db` and are **not** projected into `graph_nodes`, so `SDLC` shows ~2712 code nodes (legacy/manual) while `hello-agents` shows only 1 CONTEXT node. There is no per-project code node sync.

### 7.2 Design — `GraphSyncService` (new)

A dedicated service (constructor-injected `index.db` read handle + admin.db handle), invoked at the end of `runFullIndex(scope)` for the indexed `projectId`.

```ts
// engine/graph/graph-sync-service.ts  (≤150 lines)
export class GraphSyncService {
  constructor(private indexDb: Database, private adminDb: Database, private log: Logger) {}

  /** Re-project a tenant's code symbols into admin.db graph_nodes. */
  syncProjectSymbols(projectId: string, limit = 2000): void {
    if (!projectId) return;                         // fail-closed
    const symbols = this.readTopSymbols(projectId, limit);
    this.replaceCodeNodes(projectId, symbols);
  }
  // readTopSymbols(), replaceCodeNodes(), toNode() — each ≤20 lines
}
```

### 7.3 Sync algorithm

1. **Fail-closed:** empty `projectId` ⇒ no-op.
2. **Select** the tenant's most relevant symbols from `index.db` (bounded to avoid node explosion — a full 9K would overwhelm the viz):
   ```sql
   SELECT s.id, s.name, s.kind, f.relative_path
   FROM symbols s JOIN files f ON s.file_id = f.id
   WHERE s.project_id = ?
     AND s.kind IN ('class','interface','function','method','enum','type','constructor')
   ORDER BY (s.is_exported = 1) DESC, s.complexity DESC
   LIMIT ?
   ```
3. **Replace** existing code nodes for that tenant only (idempotent, scoped delete — never touches KB nodes or other tenants):
   ```sql
   DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'code:%';
   INSERT OR IGNORE INTO graph_nodes
     (entry_id, label, type, tier, project_id, x, y, z, level, cluster_id)
   VALUES ('code:'||?, ?, 'CODE_ENTITY', 'CODE', ?, ?, ?, ?, 'micro', ?);
   ```
   `entry_id` is namespaced `code:{symbolId}` so it never collides with KB entry ids. `type='CODE_ENTITY'`, `tier='CODE'` — the positions endpoint already treats `tier === 'CODE'` as always-allowed.
4. Positions (`x,y,z`) computed with the same Fibonacci-sphere scheme already used in `kb-graph-spatial.ts` (kept in the service to avoid coupling).

### 7.4 Why sync into `graph_nodes` (vs on-demand read)

Two options were considered:

- **On-demand:** the positions endpoint reads code symbols from `index.db` filtered by `project_id` at request time.
- **Persisted sync (chosen):** project code nodes into `admin.db.graph_nodes` at index time.

Persisted sync is recommended because the graph viz already unifies all node types from `graph_nodes` in a single query and applies tier permissions there; keeping code nodes in the same table means one consistent query path, correct per-project counts, and no cross-DB join at read time. The cost is a bounded write at index time and a scoped delete/insert — both cheap and idempotent. `codeCount` still reads `index.db` directly (authoritative total), while `graph_nodes` holds the bounded visual projection.

---

## 8. Design Decision D6 — API Contract (`/api/index/source`)

### 8.1 Current vs target

`/api/index/source` already reads `X-Project-Id` (`requestProjectId`) and `X-Workspace-Root` (`requestWorkspace`), writes files into the request workspace, registers the project, and creates a KB metadata entry. **The single defect** is:

```ts
indexer.runFullIndex()          // ← scans SDLC, no project_id
```

### 8.2 Change

```ts
indexer.runFullIndex({ projectId: requestProjectId, workspace: requestWorkspace })
  .catch((err) => logger.error({ err }, 'Background full re-index failed'));
```

No new header or body field is needed; the contract is unchanged for clients. The fix is purely wiring the already-parsed `requestProjectId`/`requestWorkspace` into the indexer.

### 8.3 API: `POST /api/index/source` (technical contract)

| Attribute | Value |
|-----------|-------|
| Method | POST |
| Path | /api/index/source |
| Auth | jwtAuth (project context) |
| Headers | `X-Project-Id` (recommended), `X-Workspace-Root` (recommended), `Content-Type: application/json` |

**Request Body:**

```json
{ "files": [ { "path": "src/app.ts", "content": "..." } ] }
```

**Response — 200 OK:**

```json
{ "written": 12, "reindexTriggered": true, "projectId": "abcdef123456" }
```

**Error Responses:**

| Status | Code | When |
|--------|------|------|
| 400 | FILES_REQUIRED | `files` missing / not an array |
| 500 | INTERNAL | disk write or index scheduling failure |

Header-absence policy: if `X-Project-Id` is absent, `requestProjectId` falls back to `config.projectId` (boot workspace). For strict multi-tenant deployments this should be tightened to 400 `PROJECT_REQUIRED` (aligns with ADR-001 guardrail A) — flagged as an open decision in §11.

### 8.4 Sequence

![Index & Query Data Flow](diagrams/data-flow.png)

*[Edit in draw.io](diagrams/data-flow.drawio)*

---

## 9. Class / Module Design

### 9.1 Affected & new files (all ≤200 lines, functions ≤20 lines)

```
backend/src/engine/
├── db/
│   ├── schema.ts              # + project_id in table DDL (new installs)
│   ├── migrations.ts          # + applyMigrationV5(db, legacyProjectId)
│   └── database-manager.ts    # initialize() passes config.projectId → runMigrations
├── indexer/
│   ├── index-scope.ts         # NEW model: IndexScope { projectId, workspace }
│   ├── indexing-engine.ts     # runFullIndex(scope?), per-project guard, scoped inserts
│   └── index-helper.ts        # isFileUnchanged/upsert*/regex — add project_id param
├── query/
│   ├── code-intel-isolation.ts# NEW: buildCodeScopeFilter / requireProjectId (fail-closed)
│   └── query-layer.ts         # all methods take projectId
├── graph/
│   └── graph-sync-service.ts  # NEW: syncProjectSymbols(projectId)
├── database/
│   └── graph-repository.ts    # resolveTargets/insert scoped by project_id
└── tools/
    ├── register-tools.ts      # dispatchCodeIntelTool(..., projectId); handlers pass it
    └── ai-context-tools.ts    # handleGetCuratedContext(..., projectId)
backend/src/modules/code-intel/CodeIntelModule.ts  # extract __projectId, pass to dispatch
backend/src/server/routes/api.ts                   # runFullIndex({projectId, workspace})
backend/src/server/routes/admin/kb-graph-spatial.ts# codeCount filtered by project_id
```

### 9.2 Class Diagram

![Class Diagram](diagrams/class-diagram.png)

*[Edit in draw.io](diagrams/class-diagram.drawio)*

### 9.3 Design Patterns

| Pattern | Where | Rationale |
|---------|-------|-----------|
| Strategy / Policy | `CodeIntelIsolation` | Centralize scope rule; single point to change isolation policy |
| Value Object | `IndexScope` | Immutable `{projectId, workspace}` passed through indexer |
| Repository | `QueryLayer`, `GraphRepository` | Data access with mandatory `projectId` |
| Facade | `GraphSyncService` | Hide cross-DB projection behind one call |
| Parameter Object | `IndexScope` | Avoid long parameter lists (code-standards) |

### 9.4 Error Handling

| Condition | Behavior | Code |
|-----------|----------|------|
| Read without `projectId` | Return empty/0 (fail-closed `1=0`) | — |
| Write/index without `projectId` | Throw, surfaced to caller | PROJECT_REQUIRED |
| Migration V5 failure | Rollback transaction; log; backup remains source of truth | — |
| Graph sync failure | Log + swallow (non-fatal to indexing), user sees stale nodes | — |

Exceptions are logged and surfaced (never silently swallowed) per code-standards; graph sync is the one intentionally non-fatal path (indexing must not fail because visualization projection failed) and it logs at error level.

---

## 10. Security & Deployment

### 10.1 Security Design

| Concern | Design |
|---------|--------|
| Tenant isolation | Every code read scoped via `CodeIntelIsolation` (fail-closed `1=0`); every write stamped with `project_id`. |
| Secure by default | Missing `project_id` yields empty results, never the whole corpus (fixes the ~9K leak). |
| Existence disclosure | Cross-project access returns empty/0, not 403/404 that confirm existence (ADR-001 §7.5). |
| SQL injection | All `project_id` values passed as bound parameters; no string interpolation of identifiers except the fixed alias. |
| Path safety | `/api/index/source` retains `isPathSafe` traversal checks; workspace comes from header but files are still written under the resolved workspace root. |
| Blast radius | Logical isolation — mitigated by single centralized helper + mandatory cross-project tests (see §10.4). |

### 10.2 Alignment with ADR-001 guardrails

- Repository methods take `projectId` as a required parameter (guardrail B).
- Fail-closed default (guardrail: missing header ⇒ no data).
- Cross-project isolation tests mandatory per endpoint/tool (guardrail 7.3).
- Consider a `ProjectId` branded type later (guardrail C) — optional, listed in §11.

### 10.3 Rollback Strategy

1. Before V5, the server copies `index.db`(+`-wal`,`-shm`) to `index.db.pre-v5.bak`.
2. If V5 fails, the transaction rolls back automatically; `schema_version` stays 4.
3. To revert a *successful but unwanted* V5: stop server, restore `index.db.pre-v5.bak`, redeploy previous build. Code that reads `project_id` is backward-tolerant only if the column exists, so app rollback and DB restore go together.
4. `graph_nodes` code rows are namespaced `code:%` and can be purged with a single scoped delete without touching KB nodes.

### 10.4 Testing Strategy

| Level | Test |
|-------|------|
| Migration | V5 on a copy of live `index.db`: assert all rows get SDLC `project_id`, FTS still returns results, counts unchanged. |
| Unit | `buildCodeScopeFilter(undefined)` → `1=0`; with id → `s.project_id = ?`. |
| Isolation (critical) | Index project A + project B with a same-relative-path file; `code_search`/`code_symbols` from B never returns A's symbols; `codeCount(B)` excludes A. |
| Regression | `code_search`/`get_curated_context`/`code_index_status` return correct scoped results for SDLC. |
| Graph | After indexing B, `graph_nodes` has `code:%` rows only for B; SDLC nodes untouched. |

### 10.5 Performance

- Added `idx_symbols_project` / `idx_symbols_proj_kind` keep scoped counts and searches O(log n) within a tenant.
- FTS path unchanged in cost; the extra `AND s.project_id = ?` is applied on the already-joined `symbols` row (indexed).
- Graph sync bounded to `limit` (default 2000) nodes per project to protect the viz and write time.

---

## 11. Appendix

### 11.1 Decision Summary

| ID | Decision | Choice |
|----|----------|--------|
| D1 | Storage strategy | **A1** — single `index.db` + `project_id` |
| D2 | Migration | V5, additive where possible; recreate `files`/`modules` for composite UNIQUE; FTS preserved |
| D3 | Indexer scoping | `IndexScope{projectId,workspace}` param; per-project guard; `sharedDb` retained |
| D4 | Query filtering | `CodeIntelIsolation` fail-closed; `projectId` on all `QueryLayer` methods + `codeCount` |
| D5 | Graph sync | `GraphSyncService` persists bounded `code:%` nodes per `project_id` |
| D6 | API contract | Wire `requestProjectId`/`requestWorkspace` into `runFullIndex` (no client-facing change) |

### 11.2 Implementation Checklist

- [ ] Add `project_id` to `schema.ts` DDL (fresh installs) + composite UNIQUE on `files`/`modules`.
- [ ] Add `applyMigrationV5(db, legacyProjectId)`; bump early-return to `current >= 5`.
- [ ] `DatabaseManager.initialize()` → `runMigrations(db, config.projectId)`.
- [ ] New `index-scope.ts`; `runFullIndex(scope?)`; per-project `Set` guard.
- [ ] Scoped inserts in `indexing-engine.ts` + `index-helper.ts` + tree-sitter path.
- [ ] New `code-intel-isolation.ts` (fail-closed helper).
- [ ] `QueryLayer` methods take `projectId`.
- [ ] `dispatchCodeIntelTool(..., projectId)`; `CodeIntelModule` extracts `__projectId`.
- [ ] `get_curated_context` threads `projectId`.
- [ ] `GraphSyncService` + call from `runFullIndex`.
- [ ] `graph-repository.ts` scoped by `project_id`.
- [ ] `kb-graph-spatial.ts` `codeCount` scoped.
- [ ] `/api/index/source` → `runFullIndex({projectId, workspace})`.
- [ ] Tests: migration, unit, isolation, regression, graph.

### 11.3 Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Enforce 400 `PROJECT_REQUIRED` when `X-Project-Id` missing on `/api/index/source`? | Open — recommend yes for strict deployments |
| 2 | Multi-workspace live file watching (watcher scoping beyond boot workspace)? | Open — out of scope for this fix |
| 3 | Introduce branded `ProjectId` type (compile-time safety, ADR-001 C)? | Open — optional hardening |
| 4 | Graph node limit per project (2000) — tune per viz performance? | Open — default proposed |

### 11.4 Glossary

| Term | Definition |
|------|------------|
| project_id | 12-char tenant identifier derived from git remote / workspace (e.g. SDLC `22b039993db3`). |
| Fail-closed | Absence of scope context yields no data (`1=0`), never all data. |
| External-content FTS | FTS5 table whose content lives in another table (`symbols`), mapped by rowid. |
| IndexScope | Value object `{projectId, workspace}` passed into the indexer. |
| graph_nodes | admin.db table backing the KB/Code graph visualization. |

---

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Index & Query Data Flow | [data-flow.png](diagrams/data-flow.png) | [data-flow.drawio](diagrams/data-flow.drawio) |
| 4 | Class Diagram | [class-diagram.png](diagrams/class-diagram.png) | [class-diagram.drawio](diagrams/class-diagram.drawio) |
| 5 | Multi-Tenant DB Schema | [db-schema.png](diagrams/db-schema.png) | [db-schema.drawio](diagrams/db-schema.drawio) |
