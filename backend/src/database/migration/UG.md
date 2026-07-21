# TypeMapper — User Guide

## Overview

TypeMapper replaces the regex-based DDL translation in MigrationService with a data-aware type mapping system. It scans actual SQLite column data at runtime to determine the real types stored, then generates correct CREATE TABLE DDL for PostgreSQL or MySQL.

## Problem Solved

SQLite uses dynamic typing — an `INTEGER` column can contain text values. When migrating to PostgreSQL (which enforces types), inserting text into an INTEGER column fails. TypeMapper detects these mixed-type columns and safely maps them to TEXT.

## Architecture

```
MigrationService (orchestrator)
  └── TypeMapper (type resolution + DDL generation)
        ├── scanColumnTypes()   — queries typeof() on actual data
        ├── resolveColumnType() — maps declared+actual types to target
        └── generateCreateTable() — builds DDL from resolved columns
```

## Usage

```typescript
import { TypeMapper } from './database/migration/TypeMapper.js';

// source = connected SQLite DatabaseAdapter
const mapper = new TypeMapper(source);

// Generate DDL for a single table
const ddl = mapper.generateCreateTable('users', 'postgresql');
// → CREATE TABLE IF NOT EXISTS "users" (
//     "id" SERIAL PRIMARY KEY,
//     "name" TEXT NOT NULL,
//     "age" INTEGER,
//     "created_at" TIMESTAMP DEFAULT NOW()
//   )
```

## Type Mapping Reference

| SQLite Declared | Actual Data | PostgreSQL | MySQL |
|----------------|-------------|------------|-------|
| INTEGER (PK AUTOINCREMENT) | integer | SERIAL | INT AUTO_INCREMENT |
| INTEGER | integer only | INTEGER | INT |
| INTEGER | integer + text (mixed) | TEXT | TEXT |
| TEXT | text | TEXT | TEXT |
| TEXT (datetime default) | ISO dates | TIMESTAMP | DATETIME |
| REAL | real only | DOUBLE PRECISION | DOUBLE |
| REAL | real + text (mixed) | TEXT | TEXT |
| BLOB | blob | BYTEA | LONGBLOB |
| NUMERIC | any | NUMERIC | DECIMAL |

## Default Value Translation

| SQLite Default | PostgreSQL | MySQL |
|---------------|------------|-------|
| `datetime('now')` | `NOW()` | `CURRENT_TIMESTAMP` |
| `0` / `1` | `0` / `1` | `0` / `1` |
| `''` | `''` | `''` |
| `'{}'` | `'{}'` | `'{}'` |
| `NULL` | `NULL` | `NULL` |

## Configuration

No configuration needed. TypeMapper is constructed with a source DatabaseAdapter and operates generically on any table.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Column mapped to TEXT unexpectedly | Mixed types detected in data | Clean source data or accept TEXT |
| TIMESTAMP not detected | Values don't match ISO 8601 pattern | Ensure format: `YYYY-MM-DDThh:mm:ss` |
| DDL fails on target | Unsupported default expression | Check DEFAULT value in source schema |

## API Reference

### `TypeMapper`

| Method | Description |
|--------|-------------|
| `constructor(source: DatabaseAdapter)` | Create mapper bound to source DB |
| `resolveColumnType(table, column, declaredType, engine, isPk)` | Resolve single column type |
| `generateCreateTable(table, targetEngine)` | Generate full CREATE TABLE DDL |
