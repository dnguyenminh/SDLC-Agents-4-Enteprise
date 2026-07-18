# Technical Design Document (TDD)

## Code Intelligence System — SA4E-45: Refactor engine layer — DatabaseAdapter abstraction cho IndexingEngine, MemoryEngine, GraphSync

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-45 |
| Title | Refactor engine layer — DatabaseAdapter abstraction |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-45.docx |
| Related FSD | FSD-v1-SA4E-45.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-18 | SA Agent | Initial TDD |

---

## 1. Architecture Overview

### 1.1 Design Philosophy

This refactor applies the **Dependency Inversion Principle** (DIP) to the engine layer.
Engine modules currently depend on a concrete implementation (`better-sqlite3 Database`).
After refactor, they depend on the `DatabaseAdapter` abstraction.

### 1.2 Layered Architecture

![Architecture](diagrams/architecture.png)

| Layer | Responsibility | Components |
|-------|---------------|------------|
| **Application** | Business logic | IndexingEngine, MemoryEngine, GraphSyncService, TreeSitterIndexer |
| **Dialect** | SQL translation | DialectHelper |
| **Adapter** | Unified DB interface | DatabaseAdapter, PreparedStatement |
| **Implementation** | Concrete drivers | SqliteDbAdapter, PostgresAdapter, MysqlAdapter |

### 1.3 Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Keep DatabaseAdapter **synchronous** | SQLite is sync; PG adapter wraps async internally. Avoids 200+ async changes. Defer to SA4E-46. |
| 2 | Reuse existing `SqliteDbAdapter` bridge | Already implements full interface (SA4E-44). Zero-overhead stateless wrapper. |
| 3 | New `DialectHelper` module for SQL translation | Isolates dialect concerns. Engine modules stay engine-agnostic. |
| 4 | FTS branching inside MemoryEngine.search() | FTS is fundamentally different per engine. Single branching point acceptable. |
| 5 | Dual-adapter for GraphSyncService | Both adapters same engine preferred; runtime warning if mismatch. |
| 6 | `getDb()` deprecated, not removed | Backward compat for callers not yet refactored. |
| 7 | Single PG schema (merged index+admin) | When PG active, all tables in one schema. SQLite keeps two files. |
| 8 | Migration batch 500 rows | Balance memory vs transaction overhead. Skip FTS virtual tables. |

### 1.4 Component Diagram

![Component](diagrams/component.png)

---

## 2. Class/Module Design

### 2.1 New Module: DialectHelper

**File:** `backend/src/database/dialect/DialectHelper.ts`

```typescript
import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';

export class DialectHelper {
  constructor(private readonly engine: DatabaseEngine) {}

  now(): string {
    return this.engine === 'sqlite' ? "datetime('now')" : 'NOW()';
  }

  upsert(table: string, columns: string[], conflictKey: string, updateColumns: string[]): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    const setClauses = updateColumns.map(c => `${c} = EXCLUDED.${c}`).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO UPDATE SET ${setClauses}`;
  }

  insertIgnore(table: string, columns: string[], conflictKey: string): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO NOTHING`;
  }
}
```

### 2.2 Modified: MemoryEngineCrud

**File:** `backend/src/modules/memory/engine/crud.ts`

```typescript
// AFTER
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';

export class MemoryEngineCrud {
  protected readonly adapter: DatabaseAdapter;
  protected readonly dialect: DialectHelper;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
  }

  /** @deprecated Use adapter directly. Removed in SA4E-47. */
  getDb(): unknown { return (this.adapter as any).db ?? this.adapter; }

  insert(entry: Partial<KnowledgeEntry>): number {
    const result = this.adapter.run(
      `INSERT INTO knowledge_entries
       (content,summary,type,tier,scope,user_id,project_id,source,source_ref,tags,confidence,agent_name,owner)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [entry.content, entry.summary, entry.type, entry.tier ?? 'WORKING',
       entry.scope ?? 'USER', entry.user_id ?? null, entry.project_id ?? null,
       entry.source ?? null, entry.source_ref ?? null, entry.tags ?? '',
       entry.confidence ?? 1.0, entry.agent_name ?? null, entry.owner ?? null]
    );
    return result.lastInsertRowid as number;
  }

  findById(id: number): KnowledgeEntry | undefined {
    return this.adapter.get<KnowledgeEntry>('SELECT * FROM knowledge_entries WHERE id = ?', [id]);
  }

  deleteEntry(id: number): void {
    this.adapter.run('DELETE FROM knowledge_entries WHERE id = ?', [id]);
  }

  updateTags(id: number, tags: string): void {
    this.adapter.run(
      `UPDATE knowledge_entries SET tags = ?, updated_at = ${this.dialect.now()} WHERE id = ?`,
      [tags, id]
    );
  }
}
```

### 2.3 Modified: MemoryEngine (FTS Branching)

**File:** `backend/src/modules/memory/engine/core.ts`

```typescript
search(query: string, limit = 10, tier?: string, type?: string, scopeCtx?: ScopeContext): SearchResult[] {
  const engine = this.adapter.getEngine();

  if (engine === 'sqlite') {
    const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
    const sql = `SELECT ke.*, f.rank FROM
      (SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ?) f
      JOIN knowledge_entries ke ON f.rowid = ke.id
      WHERE ${clauses.join(' AND ')} ORDER BY f.rank LIMIT ?`;
    const rows = this.adapter.all(sql, [ftsQuery, ...params, limit]);
    return this.applyCompositeScoring(rows);
  }

  if (engine === 'postgresql') {
    const sanitized = query.replace(/[^\w\s*":.]/g, ' ').trim();
    if (!sanitized) return this.findFiltered(tier, type, limit, scopeCtx).map(e => ({ entry: e, score: 0, matchType: 'all' }));
    const sql = `SELECT ke.*, ts_rank(ke.tsvector_content, q) as rank
      FROM knowledge_entries ke, plainto_tsquery('english', ?) q
      WHERE ke.tsvector_content @@ q AND ${clauses.join(' AND ')}
      ORDER BY rank DESC LIMIT ?`;
    const rows = this.adapter.all(sql, [sanitized, ...params, limit]);
    return this.applyCompositeScoring(rows);
  }

  // MySQL fallback: MATCH ... AGAINST
  const sql = `SELECT *, MATCH(content, summary) AGAINST(? IN NATURAL LANGUAGE MODE) as rank
    FROM knowledge_entries WHERE MATCH(content, summary) AGAINST(? IN NATURAL LANGUAGE MODE)
    AND ${clauses.join(' AND ')} ORDER BY rank DESC LIMIT ?`;
  const rows = this.adapter.all(sql, [query, query, ...params, limit]);
  return this.applyCompositeScoring(rows);
}
```

### 2.4 Modified: GraphSyncService

**File:** `backend/src/engine/graph/graph-sync-service.ts`

```typescript
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';

export class GraphSyncService {
  private readonly adminDialect: DialectHelper;

  constructor(
    private readonly indexAdapter: DatabaseAdapter,
    private readonly adminAdapter: DatabaseAdapter,
    private readonly log: Logger,
  ) {
    this.adminDialect = new DialectHelper(adminAdapter.getEngine());
    if (indexAdapter.getEngine() !== adminAdapter.getEngine()) {
      this.log.warn('[graph-sync] Index and admin adapters use different engines');
    }
  }

  syncProjectSymbols(projectId: string, limit = 2000): void {
    if (!projectId) return;
    try {
      const symbols = this.indexAdapter.all<CodeSymbolRow>(
        `SELECT s.id, s.name, s.kind, f.relative_path
         FROM symbols s JOIN files f ON s.file_id = f.id
         WHERE s.project_id = ? AND s.kind IN (${CODE_KINDS.map(() => '?').join(',')})
         ORDER BY (s.is_exported = 1) DESC, s.complexity DESC LIMIT ?`,
        [projectId, ...CODE_KINDS, limit]
      );
      this.adminAdapter.transaction(() => {
        this.adminAdapter.run(
          "DELETE FROM graph_nodes WHERE project_id = ? AND entry_id LIKE 'code:%'", [projectId]);
        const sql = this.adminDialect.insertIgnore('graph_nodes',
          ['entry_id','label','type','tier','project_id','x','y','z','level','cluster_id'], 'entry_id');
        const stmt = this.adminAdapter.prepare(sql);
        symbols.forEach((s, i) => {
          const pos = fibonacciSphere(i, Math.max(symbols.length, 1));
          stmt.run(`code:${s.id}`, this.toLabel(s), 'CODE_ENTITY', 'CODE',
                   projectId, pos.x, pos.y, pos.z, 'micro', `code-${projectId}`);
        });
      });
      this.log.info(`[graph-sync] Synced ${symbols.length} code nodes`);
    } catch (err) {
      this.log.error({ err }, `[graph-sync] Failed for ${projectId}`);
    }
  }
}
```

### 2.5 Modified: TreeSitterIndexer

**File:** `backend/src/engine/parsers/tree-sitter-indexer.ts`

```typescript
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

export class TreeSitterIndexer {
  constructor(
    private registry: GrammarRegistry,
    private adapter: DatabaseAdapter,
    private maxFileSize: number = 1_048_576
  ) {}
  // storeResults/storeRegexResults in indexer/storage.ts also accept DatabaseAdapter
}
```

### 2.6 Modified: IndexingEngine

**File:** `backend/src/engine/indexer/indexing-engine.ts`

```typescript
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';
import { SqliteDbAdapter } from '../../modules/memory/task-queue/SqliteDbAdapter.js';

export class IndexingEngine {
  private adapter: DatabaseAdapter;
  private dialect: DialectHelper;

  constructor(adapter: DatabaseAdapter, config: AppConfig) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.config = config;
    this.initTreeSitter();
  }

  private initTreeSitter(): void {
    this.treeSitterIndexer = new TreeSitterIndexer(
      this.grammarRegistry, this.adapter, this.config.maxFileSize);
  }

  private syncGraphNodes(projectId: string): void {
    const adminDb = getAdminDb();
    new GraphSyncService(this.adapter, new SqliteDbAdapter(adminDb), logger)
      .syncProjectSymbols(projectId);
  }
}
```

### 2.7 Caller Injection Points

| Caller Module | Current | After Refactor |
|---------------|---------|----------------|
| CodeIntelModule | `new IndexingEngine(dbManager, config)` | `new IndexingEngine(new SqliteDbAdapter(dbManager.getDb()), config)` |
| MemoryModule | `new MemoryEngine(dbManager.getDb())` | `new MemoryEngine(new SqliteDbAdapter(dbManager.getDb()))` |
| IndexingEngine.syncGraphNodes() | `new GraphSyncService(this.db, adminDb, log)` | `new GraphSyncService(this.adapter, new SqliteDbAdapter(adminDb), log)` |
| IndexingEngine.initTreeSitter() | `new TreeSitterIndexer(reg, this.db, max)` | `new TreeSitterIndexer(reg, this.adapter, max)` |

---

## 3. API Design

### 3.1 DatabaseAdapter Interface (Unchanged from SA4E-44)

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
```

### 3.2 DialectHelper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `now()` | `(): string` | Returns engine-appropriate timestamp expression |
| `upsert()` | `(table, columns, conflictKey, updateColumns): string` | Builds upsert SQL |
| `insertIgnore()` | `(table, columns, conflictKey): string` | Builds insert-ignore SQL |

### 3.3 Method Call Translation Reference

| better-sqlite3 Pattern | DatabaseAdapter Equivalent |
|------------------------|---------------------------|
| `db.prepare(sql).run(...p)` | `adapter.run(sql, p)` or `adapter.prepare(sql).run(...p)` |
| `db.prepare(sql).get(...p)` | `adapter.get<T>(sql, p)` or `adapter.prepare(sql).get<T>(...p)` |
| `db.prepare(sql).all(...p)` | `adapter.all<T>(sql, p)` or `adapter.prepare(sql).all<T>(...p)` |
| `db.exec(sql)` | `adapter.exec(sql)` |
| `db.transaction(fn)()` | `adapter.transaction(fn)` |

**When to use `prepare()` vs direct methods:**
- Use `adapter.prepare(sql)` when the same SQL is executed in a loop (performance: cached statement)
- Use `adapter.run/get/all(sql, params)` for one-shot queries (simpler code)

---

## 4. Error Handling Design

### 4.1 Error Categories

| Category | Source | Handling Strategy |
|----------|--------|-------------------|
| Connection error | `adapter.connect()` fails | Throw `DatabaseNotConnectedError`, caller fails fast |
| SQL syntax error | Dialect mismatch (wrong SQL for engine) | Log full SQL + engine, propagate to caller |
| Constraint violation | UNIQUE/FK conflict | Handled by upsert logic; propagated for unexpected |
| Transaction failure | Deadlock or lock timeout | SQLite: WAL prevents. PG: retry once, then propagate |
| FTS unavailable | PG missing pg_trgm or tsvector setup | Fallback to LIKE search, log warning |
| Migration failure | Any step in batch copy | Atomic rollback: drop target tables, revert config |

### 4.2 Error Propagation Rules

1. **Engine modules NEVER swallow adapter errors** — always log + propagate or handle explicitly
2. **GraphSyncService is non-fatal** — errors caught at top level, indexing continues
3. **Migration is all-or-nothing** — any error triggers full rollback
4. **FTS errors degrade gracefully** — search returns empty array, never crashes

### 4.3 Custom Error Types

```typescript
export class DatabaseNotConnectedError extends Error {
  constructor(engine: DatabaseEngine) {
    super(`Database adapter (${engine}) is not connected`);
  }
}

export class DialectError extends Error {
  constructor(engine: DatabaseEngine, operation: string, sql: string) {
    super(`Dialect error on ${engine}: ${operation}. SQL: ${sql.substring(0, 100)}`);
  }
}

export class MigrationRollbackError extends Error {
  constructor(table: string, reason: string) {
    super(`Migration rollback triggered at table "${table}": ${reason}`);
  }
}
```

---

## 5. Security Design

### 5.1 Credential Management

| Concern | Mitigation |
|---------|-----------|
| PostgreSQL credentials | Stored in environment variables (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). Never hardcoded. |
| Connection string in logs | Adapter MUST NOT log credentials. `getStatus()` returns engine type only, no connection details. |
| `.env` files | Listed in `.gitignore`. Example file `.env.example` has placeholders only. |
| Config persistence | Active DB config stored in admin.db `config` table — password encrypted at rest via `ConfigService`. |

### 5.2 SQL Injection Prevention

| Vector | Prevention |
|--------|-----------|
| User input in queries | ALL queries use parameterized statements (`?` placeholders). No string interpolation. |
| Table/column names in DialectHelper | Only hardcoded string literals passed to `upsert()`/`insertIgnore()`. Never user input. |
| FTS query input | `sanitizeFtsInput()` strips all special characters except alphanumeric, spaces, `*`, `"`. |
| Migration table names | Read from `sqlite_master` (trusted source). Table names quoted with `"`. |

### 5.3 Access Control

| Rule | Implementation |
|------|---------------|
| Engine modules don't manage connections | Connection lifecycle managed by factory/bootstrap code only |
| SqliteDbAdapter: connect/disconnect are no-ops | Prevents accidental connection manipulation |
| Adapter instances are not serializable | No risk of credential leakage via JSON.stringify |
| Database files in `.code-intel/` | Not served by HTTP server; path outside web root |

---

## 6. Migration Service Extension

### 6.1 Engine Table Migration

MigrationService (existing) is extended to handle engine tables:

```typescript
// Phase 1: Discover all migratable tables
const tables = (await source.getTableNames())
  .filter(t => !t.includes('_fts') && !t.startsWith('sqlite_'));

// Phase 2: Translate DDL for target engine
// Phase 3: Batch copy (500 rows per transaction)
// Phase 4: Verify row counts match
```

### 6.2 FTS Handling During Migration

- **Skip** all `*_fts` virtual tables during data copy (they are SQLite-specific)
- **On PostgreSQL target:** Create `tsvector_content` column + GIN index + trigger after data copy
- **On SQLite target:** Recreate FTS5 virtual table + populate from base table

### 6.3 Module Reinitialization After Switch

After successful migration, the system hot-swaps adapters:
1. Stop file watcher + end active sessions
2. Create new adapter via Factory
3. Verify schema exists in target
4. Recreate engine module instances with new adapter
5. Recreate FTS infrastructure (engine-specific)
6. Disconnect old adapter

---

## 7. Testing Strategy

### 7.1 Unit Testing with Mock Adapter

```typescript
// MockDatabaseAdapter for unit tests
class MockAdapter implements DatabaseAdapter {
  private data = new Map<string, any[]>();
  private engine: DatabaseEngine = 'sqlite';

  connect() { return Promise.resolve(); }
  disconnect() { return Promise.resolve(); }
  isConnected() { return true; }
  getStatus() { return { connected: true, engine: this.engine }; }
  getEngine() { return this.engine; }

  run(sql: string, params?: unknown[]): RunResult {
    // Track calls for assertion
    this.calls.push({ method: 'run', sql, params });
    return { changes: 1, lastInsertRowid: this.nextId++ };
  }
  // ... get(), all(), exec(), transaction(), prepare()
}
```

**Usage in tests:**
```typescript
describe('MemoryEngineCrud', () => {
  it('inserts entry via adapter', () => {
    const mock = new MockAdapter();
    const engine = new MemoryEngineCrud(mock);
    engine.insert({ content: 'test', type: 'NOTE', tier: 'WORKING' });
    expect(mock.lastCall('run').sql).toContain('INSERT INTO knowledge_entries');
  });
});
```

### 7.2 Integration Testing

| Test Level | What | How |
|-----------|------|-----|
| Adapter integration | SqliteDbAdapter with real SQLite | In-memory `:memory:` database |
| Engine integration | MemoryEngine full CRUD cycle | SqliteDbAdapter + in-memory DB |
| Migration integration | SQLite → SQLite (path change) | Two temp file DBs |
| FTS integration | Search works on both engines | SQLite (in-memory) + PG (Testcontainers) |
| GraphSync integration | Dual-adapter read/write | Two separate in-memory SQLite DBs |

### 7.3 Existing Test Compatibility

- Existing tests use `Database(':memory:')` — wrap with `new SqliteDbAdapter(db)` at test setup
- Minimal change: replace `new MemoryEngine(db)` with `new MemoryEngine(new SqliteDbAdapter(db))`
- Alternatively: create helper `createTestAdapter()` that returns SqliteDbAdapter with in-memory DB

### 7.4 Regression Test Checklist

- [ ] Full index run produces same file/symbol counts
- [ ] FTS search returns same results for same queries (SQLite mode)
- [ ] GraphSync produces same graph_nodes for same input symbols
- [ ] Memory CRUD: insert/find/update/delete cycle works
- [ ] Session start/end lifecycle unchanged
- [ ] Tool usage increment works
- [ ] Scope promotion/demotion works
- [ ] Composite scoring produces same rankings

---

## 8. Implementation Checklist

### Phase 1: Foundation (No Breaking Changes)

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 1.1 | Create DialectHelper module | `src/database/dialect/DialectHelper.ts` | Unit test: now(), upsert(), insertIgnore() for all 3 engines |
| 1.2 | Export DialectHelper from database barrel | `src/database/index.ts` | Import resolves |

### Phase 2: Leaf Modules (Bottom-Up)

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 2.1 | Refactor TreeSitterIndexer constructor | `src/engine/parsers/tree-sitter-indexer.ts` | Existing indexing tests pass |
| 2.2 | Refactor indexer/storage.ts to accept adapter | `src/engine/parsers/indexer/storage.ts` | storeResults works with adapter |
| 2.3 | Refactor GraphSyncService constructor | `src/engine/graph/graph-sync-service.ts` | Sync produces same graph_nodes |

### Phase 3: Core Engine

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 3.1 | Refactor MemoryEngineCrud (base class) | `src/modules/memory/engine/crud.ts` | CRUD tests pass |
| 3.2 | Refactor MemoryEngine (FTS branching) | `src/modules/memory/engine/core.ts` | Search tests pass |
| 3.3 | Refactor CompositeScorer | `src/modules/memory/evolution/CompositeScorer.ts` | Scoring tests pass |
| 3.4 | Deprecate getDb() with @deprecated JSDoc | `crud.ts` | TypeScript warning in IDE |

### Phase 4: IndexingEngine (Most Complex)

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 4.1 | Refactor IndexingEngine constructor | `src/engine/indexer/indexing-engine.ts` | Full index run succeeds |
| 4.2 | Refactor prepared statements → adapter calls | Same file | Batch insert works |
| 4.3 | Refactor transaction usage | Same file | registerFilesForIndex works |
| 4.4 | Update syncGraphNodes to use adapter | Same file | GraphSync still works |
| 4.5 | Update index-helper.ts utility functions | `src/engine/indexer/index-helper.ts` | Helper functions accept adapter |
| 4.6 | Update module-helper.ts | `src/engine/indexer/module-helper.ts` | Module detection works |

### Phase 5: Caller Modules (Injection Points)

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 5.1 | Update CodeIntelModule | `src/modules/code-intel/CodeIntelModule.ts` | Server starts, index works |
| 5.2 | Update MemoryModule | `src/modules/memory/MemoryModule.ts` | Memory operations work |
| 5.3 | Update any remaining callers | Grep for `Database.Database` usage | Zero matches in engine layer |

### Phase 6: Migration Extension

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 6.1 | Extend MigrationService for engine tables | `src/database/migration/MigrationService.ts` | All tables copied |
| 6.2 | Add FTS recreation logic (PG tsvector) | Same or new file | FTS works after migration |
| 6.3 | Add DDL translation for engine tables | `src/database/migration/ddl-translator.ts` | CREATE TABLE works on PG |
| 6.4 | Add module reinitialization flow | `src/database/migration/reinitialize.ts` | Hot-swap works |

### Phase 7: Cleanup & Verification

| # | Task | File(s) | Verification |
|---|------|---------|-------------|
| 7.1 | Remove all `import Database from 'better-sqlite3'` from engine layer | All engine files | `grep` returns 0 results |
| 7.2 | Remove `import { DatabaseManager }` from IndexingEngine | indexing-engine.ts | Import removed |
| 7.3 | Run full test suite | All test files | All tests pass |
| 7.4 | Benchmark adapter overhead | New benchmark file | < 1ms per query confirmed |

---

## 9. File Structure (New/Modified)

```
backend/src/
├── database/
│   ├── adapters/
│   │   └── DatabaseAdapter.ts          # (unchanged)
│   ├── dialect/
│   │   └── DialectHelper.ts            # NEW: SQL dialect translation
│   ├── factory/
│   │   └── DatabaseAdapterFactory.ts   # (unchanged)
│   └── migration/
│       ├── MigrationService.ts         # MODIFIED: extend for engine tables
│       ├── ddl-translator.ts           # NEW: DDL translation SQLite→PG
│       └── reinitialize.ts             # NEW: hot-swap module reinitialization
├── engine/
│   ├── graph/
│   │   └── graph-sync-service.ts       # MODIFIED: DatabaseAdapter params
│   ├── indexer/
│   │   ├── indexing-engine.ts          # MODIFIED: DatabaseAdapter param
│   │   ├── index-helper.ts            # MODIFIED: accept adapter
│   │   └── module-helper.ts           # MODIFIED: accept adapter
│   └── parsers/
│       ├── tree-sitter-indexer.ts      # MODIFIED: DatabaseAdapter param
│       └── indexer/storage.ts          # MODIFIED: accept adapter
└── modules/
    ├── code-intel/
    │   └── CodeIntelModule.ts          # MODIFIED: create + inject adapter
    └── memory/
        ├── engine/
        │   ├── crud.ts                 # MODIFIED: adapter field
        │   └── core.ts                 # MODIFIED: FTS branching
        ├── evolution/
        │   └── CompositeScorer.ts      # MODIFIED: accept adapter
        ├── task-queue/
        │   └── SqliteDbAdapter.ts      # (unchanged, reused)
        └── MemoryModule.ts             # MODIFIED: create + inject adapter
```

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Prepared statement caching differs between engines | Performance variance | Benchmark both; PG adapter uses connection-level statement cache |
| Transaction nesting accidentally introduced | Runtime crash (SQLite) | Code audit confirms zero nesting; add guard in SqliteDbAdapter |
| `getDb()` callers break silently | Runtime type error | Return `unknown`, TypeScript catches at compile time |
| FTS migration data loss | Search broken after switch | Verify FTS index populated; fallback to LIKE search |
| `INSERT OR REPLACE` semantics differ | Data overwrite vs conflict | DialectHelper generates correct SQL per engine |

---

## 11. Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Layered Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
