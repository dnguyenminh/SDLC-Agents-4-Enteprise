---
name: sqlite-patterns
description: "SQLite/better-sqlite3 patterns for this project. Use when writing database queries, repositories, or migrations."
---

# sqlite-patterns

Database patterns for SQLite (better-sqlite3) and the cross-engine DatabaseAdapter abstraction.

## DatabaseAdapter Interface

All DB operations go through `DatabaseAdapter` — supports SQLite, PostgreSQL, MySQL:

```typescript
import type { DatabaseAdapter } from '../database/adapters/DatabaseAdapter.js';

class MyRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async findById(id: string): Promise<Item | null> {
    return this.adapter.getAsync<Item>('SELECT * FROM items WHERE id = ?', [id]);
  }
}
```

## Repository Pattern

Every table gets a dedicated repository in `backend/src/database/repositories/`:

```typescript
export class ItemRepository implements IItemRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async create(params: CreateItemParams): Promise<Item> {
    await this.adapter.runAsync(
      'INSERT INTO items (id, name, created_at) VALUES (?, ?, ?)',
      [params.id, params.name, new Date().toISOString()]
    );
    return { id: params.id, name: params.name };
  }

  async findAll(projectId: string, limit: number): Promise<Item[]> {
    return this.adapter.allAsync<Item>(
      'SELECT * FROM items WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
      [projectId, limit]
    );
  }
}
```

## Transaction Pattern

```typescript
await adapter.transactionAsync(async () => {
  await adapter.runAsync('INSERT INTO items ...', [params]);
  await adapter.runAsync('INSERT INTO audit_log ...', [auditParams]);
});
```

**⛔ CRITICAL**: Never catch errors inside `transactionAsync()` — transaction aborts on first error.

## DDL Outside Transactions

```typescript
await adapter.execAsync('CREATE TABLE IF NOT EXISTS items (...)');
await adapter.transactionAsync(async () => {
  await adapter.runAsync('INSERT INTO items ...', params);
});
```

## Testing with In-Memory SQLite

```typescript
import Database from 'better-sqlite3';
import { makeTestAdapter } from '../../database/__tests__/test-adapter.js';

describe('MyRepository', () => {
  let db: Database.Database;
  let repo: MyRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)');
    repo = new MyRepository(makeTestAdapter(db));
  });

  afterEach(() => db.close());
});
```

## Batch Operations

```typescript
const BATCH_SIZE = 200; // Optimal for SQLite WAL
await adapter.transactionAsync(async () => {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    for (const item of items.slice(i, i + BATCH_SIZE)) {
      await adapter.runAsync('INSERT INTO items VALUES (?, ?)', [item.id, item.name]);
    }
  }
});
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Try/catch inside transactions | Let errors propagate |
| DDL inside transactions | DDL autocommit, DML in tx |
| String interpolation in SQL | Parameterized queries |
| Import better-sqlite3 directly | Use DatabaseAdapter |
| Test with production DB | Use makeTestAdapter(:memory:) |
