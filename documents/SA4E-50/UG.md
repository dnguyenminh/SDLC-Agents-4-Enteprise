# SA4E-50 User Guide — Migrate Remaining DB Calls to Local SQLite

## Overview

SA4E-50 eliminates the "Use getAsync" crash that occurs when `activeEngine: "postgresql"` is set in `database.json`. The root cause: `admin/db/kb-*.ts` files called sync methods (`.get()`, `.all()`) on `getIndexAdapter()`, which returns a `PostgresAdapter` that only supports async operations.

## What Changed

| File | Before | After |
|------|--------|-------|
| `admin/db/kb-entries.ts` | `getIndexAdapter().get(...)` | `getAdminDb().prepare(...).get(...)` |
| `admin/db/kb-search.ts` | `getIndexAdapter().all(...)` | `getAdminDb().prepare(...).all(...)` |
| `admin/db/kb-embeddings.ts` | `getIndexAdapter().get(...)` | `getAdminDb().prepare(...).get(...)` |
| `admin/db/kb-tags.ts` | `getIndexAdapter().all(...)` | `getAdminDb().prepare(...).all(...)` |

## Architecture Rationale

These KB query functions are **SQLite-specific by design** — they use `sqlite_master` table checks, `LIKE` queries optimized for SQLite, and synchronous call patterns. They operate on the **local unified DB** (`index.db`) which is always SQLite regardless of `activeEngine`.

The `getAdminDb()` function always returns the local `better-sqlite3` handle. It is the correct access point for:
- KB entries (knowledge_entries table)
- Sessions, audit, config changes
- Graph nodes/edges
- Query logs, promotion cooldowns

The `getIndexAdapter()` / `getAdminAdapter()` abstractions should only be used by code that explicitly needs PostgreSQL/MySQL support (route-level repositories via `DatabaseManager`).

## Configuration

No configuration changes needed. The fix is transparent:

- `activeEngine: "sqlite"` — Works as before (no change in behavior)
- `activeEngine: "postgresql"` — No longer crashes with "Use getAsync" errors

## Verification

After deploying, verify with:

```bash
# Set database.json to postgresql mode
# Start the server — should not crash
# Access KB search, entries, embeddings, tags endpoints
# All should return data from the local SQLite DB
```

## Files Not Changed (Already Correct)

| File | Uses | Status |
|------|------|--------|
| `admin/db/sessions.ts` | `getAdminDb()` | Already correct |
| `admin/db/audit.ts` | `getAdminDb()` | Already correct |
| `admin/db/promotion.ts` | `getAdminDb()` | Already correct |
| `admin/db/query-logs.ts` | `getAdminDb()` | Already correct |
| `admin/db/config.ts` | `getAdminDb()` | Already correct |
| `modules/kb-graph/service/index.ts` | `getAdminDb()` | Already correct |
| `modules/kb-graph/service/sync.ts` | `getAdminDb()` + `getKbEntries()` | Fixed transitively |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Use getAsync" error | Code calling sync on PostgresAdapter | Ensure file uses `getAdminDb()` not `getIndexAdapter()` |
| Empty KB results | `knowledge_entries` table missing | Run server once with SQLite to auto-create schema |
| Build error "cannot find getIndexAdapter" | Import not updated | Use `import { getAdminDb, logger } from './core.js'` |
