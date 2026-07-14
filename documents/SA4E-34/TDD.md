# Technical Design Document (TDD)

## SA4E-33: Multi-database Support with Admin Configuration & Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-33 |
| Version | 1.0 |
| Date | 2026-07-14 |
| Author | SA Agent |
| Status | Draft |

---

## 1. Architecture Overview

The multi-database feature introduces a Database Abstraction Layer (Strategy pattern) between the application modules and the underlying database engines. A DatabaseAdapterFactory creates the correct adapter based on configuration, and all existing code migrates from direct better-sqlite3 calls to the adapter interface.

### Key Components:
- `DatabaseAdapter` interface — unified API for all engines
- `SqliteAdapter` — wraps better-sqlite3 (existing, default)
- `PostgresAdapter` — wraps pg (node-postgres)
- `MysqlAdapter` — wraps mysql2
- `DatabaseAdapterFactory` — creates adapter from config
- `DatabaseConfigService` — manages database.json
- `MigrationService` — orchestrates data transfer
- `DatabaseConfigRouter` — Hono routes for admin API

---

## 2. Component Design

### 2.1 Directory Structure

```
backend/src/database/
├── adapters/
│   ├── DatabaseAdapter.ts        # Interface
│   ├── SqliteAdapter.ts          # better-sqlite3 wrapper
│   ├── PostgresAdapter.ts        # pg wrapper
│   └── MysqlAdapter.ts           # mysql2 wrapper
├── factory/
│   └── DatabaseAdapterFactory.ts # Factory + config
├── config/
│   ├── DatabaseConfig.ts         # Types
│   ├── DatabaseConfigService.ts  # Read/write config
│   └── CryptoService.ts          # AES-256-GCM
├── migration/
│   ├── MigrationService.ts       # Orchestrator
│   ├── SchemaGenerator.ts        # DDL per engine
│   └── DataCopier.ts             # Batch copy
└── index.ts                      # Barrel
```

### 2.2 DatabaseAdapter Interface

```typescript
export type DatabaseEngine = 'sqlite' | 'postgresql' | 'mysql';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface ConnectionStatus {
  connected: boolean;
  engine: DatabaseEngine;
  version?: string;
  error?: string;
}

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

export interface PreparedStatement {
  run(...params: unknown[]): RunResult;
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}
```

### 2.3 SqliteAdapter

Wraps better-sqlite3. Synchronous API exposed through the async interface (resolves immediately). This is the zero-change path for existing code.

### 2.4 PostgresAdapter

Uses `pg` Pool. Translates `?` params to `$1, $2, ...`. Wraps async pool queries into sync-compatible interface using connection reservation.

### 2.5 MysqlAdapter

Uses `mysql2` pool. Keeps `?` params (MySQL native). Similar pattern to PostgresAdapter.

---

## 3. API Design

### Route: /api/admin/database/*

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/admin/database/status | JWT + CONFIG_EDIT | Current DB status |
| POST | /api/admin/database/test-connection | JWT + CONFIG_EDIT | Test target connection |
| POST | /api/admin/database/migrate | JWT + CONFIG_EDIT | Start migration (SSE) |
| POST | /api/admin/database/migrate/cancel | JWT + CONFIG_EDIT | Cancel migration |
| POST | /api/admin/database/switch-to-sqlite | JWT + CONFIG_EDIT | Revert to SQLite |

Registered in HttpServer.ts alongside existing admin routes.

---

## 4. SQL Dialect Translation

| Feature | SQLite | PostgreSQL | MySQL |
|---------|--------|------------|-------|
| Auto-increment | AUTOINCREMENT | GENERATED ALWAYS AS IDENTITY | AUTO_INCREMENT |
| Boolean | INTEGER | BOOLEAN | TINYINT(1) |
| BLOB | BLOB | BYTEA | LONGBLOB |
| DateTime | TEXT | TIMESTAMP | DATETIME |
| Params | ? | $1, $2 | ? |
| FTS | FTS5 | tsvector + GIN | FULLTEXT |
| Upsert | INSERT OR REPLACE | ON CONFLICT DO UPDATE | ON DUPLICATE KEY |

SchemaGenerator handles DDL translation from SQLite CREATE TABLE to target dialect.

---

## 5. Security Design

### 5.1 Credential Encryption
- AES-256-GCM via CryptoService
- Key from machine-specific derivation (.code-intel/.dbkey)
- Passwords prefixed ENC: in database.json

### 5.2 API Security
- JWT + CONFIG_EDIT permission required
- Zod validation on all inputs
- Passwords never returned in GET responses
- Full audit trail

---

## 6. Migration Design

### Process:
1. Connect to target
2. Generate DDL for all tables (SchemaGenerator)
3. Execute DDL in target
4. Copy data table-by-table (DataCopier, batch 500)
5. Rebuild FTS indexes in target
6. Verify row counts
7. Update database.json
8. Restart modules

### Rollback:
- Drop all created tables in target
- Revert database.json
- Re-init SQLite adapters

### Progress Reporting:
- SSE stream with MigrationProgress events
- Cancellable via shared flag

---

## 7. Implementation Checklist

| # | Task | File(s) | Size |
|---|------|---------|------|
| 1 | DatabaseAdapter interface | database/adapters/DatabaseAdapter.ts | S |
| 2 | SqliteAdapter | database/adapters/SqliteAdapter.ts | M |
| 3 | PostgresAdapter | database/adapters/PostgresAdapter.ts | M |
| 4 | MysqlAdapter | database/adapters/MysqlAdapter.ts | M |
| 5 | DatabaseAdapterFactory | database/factory/DatabaseAdapterFactory.ts | S |
| 6 | CryptoService | database/config/CryptoService.ts | S |
| 7 | DatabaseConfigService | database/config/DatabaseConfigService.ts | M |
| 8 | SchemaGenerator | database/migration/SchemaGenerator.ts | L |
| 9 | DataCopier | database/migration/DataCopier.ts | L |
| 10 | MigrationService | database/migration/MigrationService.ts | L |
| 11 | Database routes | server/routes/database.ts | M |
| 12 | Register in HttpServer | server/HttpServer.ts | S |
| 13 | Refactor admin DB access | admin/db/core.ts | M |
| 14 | Refactor memory module | modules/memory/ | M |
| 15 | Admin UI tab | extension/webview-assets/ | L |
| 16 | Add dependencies | package.json | S |

---

## 8. Error Handling

All adapter methods wrap errors into DatabaseError(code, message, engine, original). Migration errors trigger automatic rollback. Module restart failures fallback to SQLite.

---

## 9. Performance

- SQLite adapter: zero overhead (sync, direct)
- PG/MySQL: connection pool (2-10 connections)
- Migration: 500 rows/batch, progress every batch
- Target: >= 1000 rows/sec throughput

---

## 10. Backward Compatibility

- No breaking changes
- Missing database.json → default SQLite
- Existing callers unchanged (same interface)
- Migration is optional

---

## 11. New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| pg | ^8.12.0 | PostgreSQL client |
| mysql2 | ^3.11.0 | MySQL client |
