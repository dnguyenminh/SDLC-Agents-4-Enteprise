# TDD — MemoryModule PostgreSQL Refactor

## SA4E-44 Addendum: Migrate MemoryModule from hardcoded SQLite to DatabaseAdapter

---

## 1. Problem Statement

`MemoryModule` directly uses `better-sqlite3` (`Database.Database`) throughout:
- `MemoryEngine(db: Database.Database)` — constructor takes raw sqlite3
- `MemoryEngineCrud` uses `this.db.prepare(sql).run/get/all()` 
- `CompositeScorer`, `QueryLayer`, evolution services — all raw sqlite3
- Migrations typed as `(db: Database.Database) => void`
- `database.json` config `activeEngine: "postgresql"` is IGNORED

## 2. Root Cause

`MemoryModule.initialize()` line 66:
```typescript
const config = loadConfig();  // reads engine/config.ts, NOT database.json
this.dbManager = new DatabaseManager(config.dbPath);  // hardcoded SQLite
```

`loadConfig()` returns `{ dbPath: '.code-intel/index.db', workspace: '...' }` — no database engine selection.

## 3. Scope of Change

| Component | Current | Target |
|-----------|---------|--------|
| MemoryEngine | `Database.Database` (sqlite3) | `DatabaseAdapter` interface |
| MemoryEngineCrud | `.prepare(sql).run/get/all()` | `.run(sql, params)` / `.get()` / `.all()` |
| CompositeScorer | `Database.Database` | `DatabaseAdapter` |
| QueryLayer | `DatabaseManager` (sqlite) | `DatabaseAdapter` |
| Evolution services | `Database.Database` | `DatabaseAdapter` |
| Migrations 001-008 | `Database.Database` | `DatabaseAdapter.exec()` |
| FTS5 search | SQLite FTS5 syntax | PG: `tsvector` + `to_tsquery` |
| Vector search | `sqlite-vec` extension | PG: `pgvector` |

## 4. Key Technical Challenges

### 4.1 Sync vs Async

| | SQLite (better-sqlite3) | PostgreSQL (pg) |
|---|---|---|
| API | **Synchronous** | **Asynchronous** (Promise) |
| `db.prepare(sql).run()` | Returns immediately | N/A |
| `pool.query(sql)` | N/A | Returns Promise |

`DatabaseAdapter` interface defines SYNC methods. `PostgresAdapter` throws on sync calls.

### 4.2 FTS (Full-Text Search)

| | SQLite | PostgreSQL |
|---|---|---|
| Index | FTS5 virtual table | GIN index on tsvector column |
| Query | `MATCH ?` | `@@ to_tsquery(?)` |
| Ranking | `rank` from FTS5 | `ts_rank()` function |
| SQL | `SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH ?` | `SELECT * FROM knowledge_entries WHERE tsv @@ to_tsquery(?)` |

### 4.3 Vector Search

| | SQLite | PostgreSQL |
|---|---|---|
| Extension | `sqlite-vec` (BLOB) | `pgvector` |
| Column | `BLOB` (Float32Array buffer) | `vector(384)` |
| Query | Custom distance function | `<=>` operator (cosine) |

## 5. Decision: Approach

### Chosen: Refactor MemoryEngine to use DatabaseAdapter + PG-specific query adapters

**Architecture:**

```
MemoryModule.initialize()
  → DatabaseConfigService.getActiveConfig()
  → if sqlite: SqliteDbAdapter (existing, fast, sync)
  → if postgresql: PostgresDbAdapter (NEW — sync wrapper using pg-native)
  → MemoryEngine(adapter: DatabaseAdapter)
    → QueryStrategy: SqliteFtsStrategy | PostgresFtsStrategy
    → VectorStrategy: SqliteVecStrategy | PgVectorStrategy
```

**Key decision:** Use **Strategy pattern** for DB-specific queries (FTS, vector) while keeping `DatabaseAdapter` for standard CRUD.

## 6. Implementation Tasks

### Phase A: Core adapter refactor (Day 1)

| # | Task | Files |
|---|------|-------|
| A1 | Create `PostgresSyncAdapter` using `pg-native` (sync libpq) | `database/adapters/PostgresSyncAdapter.ts` |
| A2 | Refactor `MemoryEngineCrud`: `Database.Database` → `DatabaseAdapter` | `modules/memory/engine/crud.ts` |
| A3 | Refactor `MemoryEngine`: constructor takes `DatabaseAdapter` | `modules/memory/engine/core.ts` |
| A4 | Refactor `CompositeScorer`: raw DB → `DatabaseAdapter` | `modules/memory/evolution/CompositeScorer.ts` |
| A5 | Refactor `QueryLayer`: `DatabaseManager` → `DatabaseAdapter` | `engine/query/query-layer.ts` |
| A6 | Refactor migrations 001-008: `Database.Database` → `DatabaseAdapter` | `modules/memory/migrations/*.ts` |
| A7 | Update `MemoryModule.initialize()`: read `database.json`, create correct adapter | `modules/memory/MemoryModule.ts` |

### Phase B: Query strategies (Day 2)

| # | Task | Files |
|---|------|-------|
| B1 | Create `ISearchStrategy` interface | `modules/memory/engine/strategies/ISearchStrategy.ts` |
| B2 | Create `SqliteFtsStrategy` (existing FTS5 logic) | `modules/memory/engine/strategies/SqliteFtsStrategy.ts` |
| B3 | Create `PostgresFtsStrategy` (tsvector + GIN) | `modules/memory/engine/strategies/PostgresFtsStrategy.ts` |
| B4 | Create `IVectorStrategy` interface | `modules/memory/engine/strategies/IVectorStrategy.ts` |
| B5 | Create `SqliteVecStrategy` (sqlite-vec) | `modules/memory/engine/strategies/SqliteVecStrategy.ts` |
| B6 | Create `PgVectorStrategy` (pgvector cosine) | `modules/memory/engine/strategies/PgVectorStrategy.ts` |
| B7 | Wire strategies into MemoryEngine based on engine type | `modules/memory/engine/core.ts` |

### Phase C: PG schema + migration (Day 2-3)

| # | Task | Files |
|---|------|-------|
| C1 | PG schema: `knowledge_entries` with tsvector column + GIN index | `database/migrations/pg/` |
| C2 | PG schema: `knowledge_fts` trigger (auto-update tsvector on INSERT/UPDATE) | `database/migrations/pg/` |
| C3 | PG schema: pgvector extension + vector(384) column | `database/migrations/pg/` |
| C4 | PG schema: all memory tables (sessions, audit, decay, consolidation) | `database/migrations/pg/` |
| C5 | Auto-migration on startup: if PG empty + SQLite has data → migrate | `modules/memory/MemoryModule.ts` |

### Phase D: Testing + verification (Day 3)

| # | Task |
|---|------|
| D1 | Unit tests: PostgresSyncAdapter CRUD |
| D2 | Integration tests: MemoryEngine with Testcontainers PG |
| D3 | FTS search tests: same results SQLite vs PG |
| D4 | Vector search tests: cosine similarity accuracy |
| D5 | Performance benchmark: SQLite vs PG for 20k entries |
| D6 | E2E: mem_ingest → TAG_ENRICHMENT task → tags applied (full cycle) |

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| `pg-native` native addon build issues (Windows) | Fallback: use async PG with deasync wrapper |
| FTS results differ between SQLite/PG | Normalize ranking algorithm; accept minor differences |
| Performance regression (PG slower for single-user) | Keep SQLite as option; let user choose in config |
| Data loss during migration | SQLite files preserved as backup (existing behavior) |
| Breaking existing tests (476 unit tests) | Run full suite after each phase; fix as go |

## 8. Success Criteria

- [ ] `database.json` `activeEngine: postgresql` → MemoryModule uses PostgreSQL
- [ ] `mem_ingest` creates entry in PG + TAG_ENRICHMENT task in PG
- [ ] `mem_search` returns results from PG (FTS + vector)
- [ ] TaskWorker processes tasks from PG `pending_tasks` table
- [ ] All 476 existing unit tests pass
- [ ] No SQLite file created when PG configured
- [ ] Admin UI "Current Engine: postgresql" = truth (not just config)

## 9. Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| A: Core adapter | 4-6h | Medium (many files) |
| B: Query strategies | 3-4h | High (FTS/vector translation) |
| C: PG schema | 2-3h | Low (SQL scripting) |
| D: Testing | 3-4h | Medium (compatibility) |
| **Total** | **12-17h** | **Medium-High** |

## 10. Alternative: Accept Dual-DB (ADR)

If refactor too risky, document as Architecture Decision Record:
- SQLite = KB runtime engine (FTS5, sqlite-vec, sync, fast)
- PostgreSQL = code intelligence + admin (async, scalable)
- "Start Migration" copies data periodically
- Not a bug — intentional performance optimization

**User must explicitly confirm which path to take.**
