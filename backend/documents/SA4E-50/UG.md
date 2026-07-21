# User Guide — SA4E-50: Full Async Refactor of Admin/DB Layer

## Overview

SA4E-50 refactors the entire `admin/db` layer and its callers to use async/await throughout. This eliminates the PostgreSQL crash ("Use getAsync") and ensures all KB data is visible regardless of the database engine configured.

---

## What Changed

### Architecture

| Layer | Before | After |
|-------|--------|-------|
| `DatabaseAdapter` interface | Sync methods only | + async variants (`runAsync`, `getAsync`, `allAsync`, `execAsync`, `transactionAsync`) |
| `SqliteDbAdapter` | Sync only | + async variants (delegate to sync — zero overhead) |
| `PostgresAdapter` | Async only (threw on sync) | + generic `transactionAsync<T>` matching interface |
| `SqliteAdapter` / `MysqlAdapter` | Missing async | + async variants |
| `admin/db/*.ts` | `getAdminDb()` raw better-sqlite3 | `getAdminAdapter()` / `getIndexAdapter()` async calls |
| Route handlers | Mix of sync/async | Fully async; all DB calls awaited |
| `jwt-auth.ts` middleware | Sync `safeValidateSession` | Async — awaits `validateSession` |

### Files Modified

**Interface & Adapters:**
- `database/adapters/DatabaseAdapter.ts` — added 5 async method signatures
- `modules/memory/task-queue/SqliteDbAdapter.ts` — added 5 async methods (delegates to sync)
- `database/adapters/SqliteAdapter.ts` — added 5 async methods
- `database/adapters/MysqlAdapter.ts` — added 5 async methods
- `database/adapters/PostgresAdapter.ts` — made `transactionAsync` generic `<T>`

**Admin DB Layer (all now async):**
- `admin/db/users.ts` — 9 functions → async
- `admin/db/sessions.ts` — 6 functions → async
- `admin/db/groups.ts` — 6 functions → async
- `admin/db/audit.ts` — 3 functions → async
- `admin/db/config.ts` — 2 functions → async
- `admin/db/kb-entries.ts` — 3 functions → async, uses `getIndexAdapter()`
- `admin/db/kb-search.ts` — 1 function → async, uses `getIndexAdapter()`
- `admin/db/kb-tags.ts` — 6 functions → async, uses `getIndexAdapter()`
- `admin/db/kb-embeddings.ts` — 1 function → async, uses `getIndexAdapter()`
- `admin/db/promotion.ts` — 2 functions → async
- `admin/db/query-logs.ts` — 3 functions → async
- `admin/admin-db.ts` — barrel updated with new exports

**Route Layer (all handlers async + awaited):**
- `server/routes/admin/auth.ts`
- `server/routes/admin/users.ts`
- `server/routes/admin/rbac.ts`
- `server/routes/admin/analytics.ts`
- `server/routes/admin/kb-entries.ts`
- `server/routes/admin/kb-graph.ts`
- `server/routes/admin/kb-graph-spatial.ts`
- `server/routes/admin/kb-quality.ts`
- `server/routes/admin/kb-tags.ts`
- `server/routes/admin/kb-operations.ts`
- `server/routes/admin/config.ts`
- `server/routes/admin/mcp.ts`
- `server/routes/admin/mcp-crud.ts`
- `server/routes/admin/sse.ts`
- `server/routes/admin/context.ts` — `authenticate`, `requireAuth`, `checkPermission`, `requirePermission` all async

**Other:**
- `server/middleware/jwt-auth.ts` — `safeValidateSession` is now async
- `admin/services/dashboard.service.ts` — `getHealth()` is now async
- `modules/kb-graph/service/sync.ts` — `fullSync()` is async; `processKbEntries` awaits `getKbEntries`
- `modules/kb-graph/service/index.ts` — `fullSync()` returns `Promise`
- `database/migration/MigrationService.ts` — type cast fixes for `target` narrowing
- `admin/__tests__/admin-db.test.ts` — all test cases updated to `await` async functions
- `admin/db/__tests__/kb-entry-count.test.ts` — updated to `await`

---

## Migration Guide (for downstream code)

If you call admin-db functions directly, you must now `await` them:

```typescript
// Before (will now return Promise, not value)
const user = getUserById(userId);
const count = getKbEntryCount();

// After (correct)
const user = await getUserById(userId);
const count = await getKbEntryCount();
```

Route handlers must be `async`:

```typescript
// Before
app.get('/path', (c) => {
  const user = ctx.requireAuth(c);
  ...
});

// After
app.get('/path', async (c) => {
  const user = await ctx.requireAuth(c);
  ...
});
```

---

## PostgreSQL Mode

With the async refactor complete, running the server with PostgreSQL is fully supported:

1. Set `database.json` in your data directory with `activeEngine: "postgresql"`:

```json
{
  "activeEngine": "postgresql",
  "engines": {
    "postgresql": {
      "host": "localhost",
      "port": 5432,
      "username": "kiro",
      "password": "...",
      "database": "kiro_db",
      "ssl": false
    }
  }
}
```

2. The admin dashboard, KB entries, tags, search, and graph will all use PostgreSQL.
3. Schema initialization still uses the local SQLite DB via `getAdminDb()` (this is by design — schema is bootstrapped locally).

---

## Schema Init (SQLite-only)

`initSchema` and `seedDefaults` in `schema.ts` still use raw better-sqlite3 via `getAdminDb()`. This is intentional — they run once at startup against the local SQLite DB for default data seeding. They are not called against PostgreSQL.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Promise { <pending> }` in route response | Forgot `await` on DB call | Add `await` |
| `Use runAsync` error | Using sync method on PG adapter | Use `runAsync`/`getAsync`/`allAsync` |
| KB count shows 0 in PostgreSQL mode | Old sync path returning 0 | Fixed in SA4E-50 — uses async adapter |
| TypeScript error: Property does not exist on type 'never' | TypeScript narrowed type to `never` after `'x' in obj` check | Cast with `(obj as DatabaseAdapter).method()` |

---

## Testing

Run the test suite after upgrading:

```bash
cd backend
npx vitest run
```

Expected: **571 tests pass**, 4 skipped (native addon tests). Zero failures.

TypeScript check:

```bash
npx tsc --noEmit
```

Expected: **zero errors**.
