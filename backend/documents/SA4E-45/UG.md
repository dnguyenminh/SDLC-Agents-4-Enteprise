# User Guide — SA4E-45: DatabaseAdapter Abstraction for Engine Layer

## Overview

SA4E-45 refactors the engine layer to depend on the `DatabaseAdapter` interface instead of concrete `better-sqlite3` types. This enables the system to run on SQLite, PostgreSQL, or MySQL without engine-level code changes.

## What Changed

All engine modules (IndexingEngine, MemoryEngine, GraphSyncService, TreeSitterIndexer, and 25+ graph/analyzer/tool files) now accept `DatabaseAdapter` instead of `Database.Database`.

## For Module Developers

### Creating a new engine service

```typescript
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../database/dialect/DialectHelper.js';

export class MyService {
  private readonly dialect: DialectHelper;

  constructor(private readonly adapter: DatabaseAdapter) {
    this.dialect = new DialectHelper(adapter.getEngine());
  }

  findItem(id: number): Item | undefined {
    return this.adapter.get<Item>('SELECT * FROM items WHERE id = ?', [id]);
  }
}
```

### Translation Reference

| Old Pattern (better-sqlite3) | New Pattern (DatabaseAdapter) |
|------------------------------|-------------------------------|
| `db.prepare(sql).run(...p)` | `adapter.run(sql, [...p])` |
| `db.prepare(sql).get(...p)` | `adapter.get<T>(sql, [...p])` |
| `db.prepare(sql).all(...p)` | `adapter.all<T>(sql, [...p])` |
| `db.exec(sql)` | `adapter.exec(sql)` |
| `db.transaction(fn)()` | `adapter.transaction(fn)` |
| `db.pragma('...')` | `adapter.all('PRAGMA ...')` |

### When to use `prepare()` vs direct methods

- Use `adapter.prepare(sql)` in tight loops (cached statement handle)
- Use `adapter.run/get/all(sql, params)` for one-shot queries

### Using DialectHelper for cross-engine SQL

```typescript
const dialect = new DialectHelper(adapter.getEngine());

// Timestamp: sqlite → datetime('now'), pg/mysql → NOW()
const sql = `UPDATE items SET updated_at = ${dialect.now()} WHERE id = ?`;

// Upsert
const upsertSql = dialect.upsert('items', ['id', 'name', 'value'], 'id', ['name', 'value']);

// Insert-ignore
const ignoreSql = dialect.insertIgnore('items', ['id', 'name'], 'id');
```

## For Test Writers

### Wrapping raw SQLite in tests

```typescript
import Database from 'better-sqlite3';
import { SqliteDbAdapter } from '../modules/memory/task-queue/SqliteDbAdapter.js';

const db = new Database(':memory:');
db.exec(SCHEMA);
const adapter = new SqliteDbAdapter(db);

// Pass adapter to services
const resolver = new SymbolResolver(adapter, projectId);
const engine = new MemoryEngine(adapter);
```

## Configuration

No configuration changes needed. The system auto-detects the active database engine from the `DatabaseAdapter.getEngine()` return value and branches accordingly (FTS5 for SQLite, tsvector for PostgreSQL, FULLTEXT for MySQL).

## FTS Search Behavior by Engine

| Engine | FTS Method | Query Syntax |
|--------|-----------|--------------|
| SQLite | FTS5 MATCH | `word1 word2*` |
| PostgreSQL | `tsvector @@ plainto_tsquery` | Natural language |
| MySQL | `MATCH ... AGAINST` | Natural language mode |

## Deprecated API

`getDb()` on `MemoryEngineCrud` is deprecated. It returns the underlying database handle for backward compatibility but will be removed in SA4E-47. Use `adapter` methods directly.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `TypeError: adapter.run is not a function` | Passing raw `Database` instead of adapter | Wrap with `new SqliteDbAdapter(db)` |
| `SQL syntax error` on PostgreSQL | Using SQLite-specific syntax | Use `DialectHelper` for dialect-specific SQL |
| Empty search results after DB switch | FTS infrastructure not created | Run migration service to rebuild FTS |

## Files Modified

- `backend/src/engine/graph/` — All graph services use DatabaseAdapter
- `backend/src/engine/tools/` — All tool handlers accept DatabaseAdapter  
- `backend/src/engine/analyzers/` — All analyzers accept DatabaseAdapter
- `backend/src/engine/context/` — All context services accept DatabaseAdapter
- `backend/src/engine/indexer/` — IndexingEngine uses DatabaseAdapter
- `backend/src/modules/memory/engine/` — MemoryEngine uses DatabaseAdapter
- `backend/src/database/dialect/DialectHelper.ts` — SQL dialect translation
