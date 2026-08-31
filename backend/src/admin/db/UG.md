# User Guide — Admin Layer DatabaseAdapter Refactoring

## Overview

The admin layer now uses `DatabaseAdapter` instead of hardcoded SQLite for reading KB data. This enables the admin pages (KB Quality, KB Tags, KB Graph, Analytics, KB Entries) to work with PostgreSQL and MySQL in addition to SQLite.

## Quick Start

No configuration changes needed. When `database.json` is set to `sqlite` (default), behavior is identical to before. When switched to `postgresql` or `mysql`, admin pages automatically read from the configured database.

## API Reference

### `getIndexAdapter(): DatabaseAdapter`

Returns a cached `DatabaseAdapter` connected to the index database (knowledge_entries, files, symbols).

```typescript
import { getIndexAdapter } from './admin/db/core.js';

const adapter = getIndexAdapter();
const entries = adapter.all<{ id: string }>('SELECT id FROM knowledge_entries LIMIT 10');
```

### `getAdminAdapter(): DatabaseAdapter`

Returns a cached `DatabaseAdapter` connected to the admin database (users, sessions, graph_nodes).

```typescript
import { getAdminAdapter } from './admin/db/core.js';

const adapter = getAdminAdapter();
const count = adapter.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users');
```

### `resetAdminDb(): void`

Resets all cached DB instances and adapters. Call after database engine switch.

```typescript
import { resetAdminDb } from './admin/db/core.js';

resetAdminDb(); // Closes SQLite handles, disconnects PG/MySQL adapters
```

## Configuration

Database engine is configured in `.code-intel/database.json`:

```json
{
  "activeEngine": "postgresql",
  "engines": {
    "sqlite": { "adminDbPath": "admin.db", "indexDbPath": "index.db" },
    "postgresql": {
      "host": "localhost",
      "port": 5432,
      "username": "sa4e",
      "password": "ENC:...",
      "database": "sa4e_db",
      "ssl": false,
      "pool": { "min": 2, "max": 10 }
    }
  }
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `activeEngine` | `sqlite` \| `postgresql` \| `mysql` | `sqlite` | Active database engine |
| `engines.sqlite.indexDbPath` | string | `index.db` | SQLite index DB filename |
| `engines.postgresql.host` | string | `localhost` | PostgreSQL host |
| `engines.postgresql.port` | number | `5432` | PostgreSQL port |
| `engines.postgresql.database` | string | — | Database name |

## Migration Pattern for Custom Code

If you have custom admin queries using direct SQLite:

**Before:**
```typescript
import Database from 'better-sqlite3';
import { getIndexDbPath } from './core.js';

const db = new Database(getIndexDbPath());
const rows = db.prepare('SELECT * FROM knowledge_entries').all();
db.close();
```

**After:**
```typescript
import { getIndexAdapter } from './core.js';

const adapter = getIndexAdapter();
const rows = adapter.all('SELECT * FROM knowledge_entries');
// No close needed — adapter is cached and managed
```

### Translation Table

| Old (SQLite direct) | New (DatabaseAdapter) |
|---------------------|----------------------|
| `db.prepare(sql).all(...p)` | `adapter.all(sql, [...p])` |
| `db.prepare(sql).get(...p)` | `adapter.get(sql, [...p])` |
| `db.prepare(sql).run(...p)` | `adapter.run(sql, [...p])` |
| `db.exec(sql)` | `adapter.exec(sql)` |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Admin pages show 0 data after DB switch | Stale cached adapter | Call `resetAdminDb()` after engine change |
| "Failed to connect index adapter" in logs | PG/MySQL unreachable | Check `database.json` connection params |
| Tables not found on PG | Migrations not run | Run database migrations before switching engine |

## Error Codes

| Error | Description |
|-------|-------------|
| `[admin] Failed to connect index adapter` | Index adapter connection to PG/MySQL failed; will retry on next request |
| `[admin] Failed to connect admin adapter` | Admin adapter connection failed |

## Backward Compatibility

- `getAdminDb()` still returns the raw `better-sqlite3` Database instance
- `getIndexDbPath()` still returns the SQLite file path
- `getActiveEngine()` / `getActiveDbConfig()` unchanged
- All existing callers of admin-db barrel exports work without modification
