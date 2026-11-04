---
name: vitest-testing
description: "Vitest testing patterns for this project. Use when writing unit tests, integration tests, or property-based tests in backend/src/**/__tests__/."
---

# vitest-testing

Testing patterns using Vitest in `backend/src/**/__tests__/`. Covers unit, integration, and property-based testing.

## Basic Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService(mockDeps);
  });

  afterEach(() => {
    // Cleanup resources
  });

  it('should handle valid input', async () => {
    const result = await service.process({ query: 'test' });
    expect(result.status).toBe('ok');
  });
});
```

## In-Memory SQLite Setup (makeTestAdapter)

Standard pattern for DB-backed tests without filesystem access:

```typescript
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { MemoryEngine } from '../engine/core.js';

async function createTestEngine(): Promise<MemoryEngine> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(`
    CREATE TABLE knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      summary TEXT DEFAULT '',
      type TEXT DEFAULT 'CONTEXT',
      tier TEXT DEFAULT 'T1',
      scope TEXT DEFAULT 'USER',
      tags TEXT DEFAULT '',
      confidence REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      archived INTEGER DEFAULT 0
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts
      USING fts5(content, summary, content=knowledge_entries, content_rowid=id);
  `);
  return new MemoryEngine(adapter);
}
```

## Mocking with vi.fn and vi.mock

```typescript
import { vi } from 'vitest';

// Simple function mock
const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });

// Module mock
vi.mock('../services/HttpClient.js', () => ({
  HttpClient: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ id: 1 }),
  })),
}));

// Spy on existing method
const spy = vi.spyOn(service, 'validate');
expect(spy).toHaveBeenCalledWith('input');
```

## Property-Based Testing (fast-check)

```typescript
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Encoder property tests', () => {
  it('roundtrip: encode then decode yields original', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const encoded = encode(input);
        const decoded = decode(encoded);
        expect(decoded).toBe(input);
      }),
    );
  });

  it('search always returns ≤ limit results', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 100 }),
        async (query, limit) => {
          const results = await engine.search(query, limit);
          expect(results.length).toBeLessThanOrEqual(limit);
        },
      ),
    );
  });
});
```

## Test File Organization

```
backend/src/modules/{domain}/__tests__/
├── MyService.test.ts         # Unit tests
├── MyService.property.test.ts # Property-based tests
├── MyHandler.test.ts          # Handler/dispatcher tests
└── e2e/                       # End-to-end integration
    └── MyApi.e2e.test.ts
```

Naming convention: `{Feature}.test.ts` or `{Feature}.property.test.ts`.

## Handler Testing Pattern

Test MCP tool handlers directly without HTTP:

```typescript
describe('handleSearch', () => {
  let engine: MemoryEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
    await engine.insert({ content: 'TypeScript patterns', type: 'CONTEXT' });
  });

  it('returns matching entries', async () => {
    const result = await handleSearch(engine, undefined, { query: 'TypeScript' });
    const parsed = JSON.parse(result);
    expect(parsed.results.length).toBeGreaterThan(0);
  });

  it('returns error for empty query', async () => {
    const result = await handleSearch(engine, undefined, { query: '' });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });
});
```

## Assertions

```typescript
// Equality
expect(value).toBe(exact);
expect(obj).toEqual(deepEqual);

// Truthiness
expect(value).toBeDefined();
expect(value).toBeNull();

// Numbers
expect(count).toBeGreaterThan(0);
expect(score).toBeCloseTo(0.95, 2);

// Strings
expect(msg).toContain('error');
expect(path).toMatch(/\.json$/);

// Arrays
expect(items).toHaveLength(3);
expect(tags).toContain('typescript');

// Async / Errors
await expect(fn()).rejects.toThrow('not found');
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Test implementation details | Test behavior and outputs |
| Share mutable state between tests | Fresh setup in beforeEach |
| Mock everything in integration tests | Use real in-memory DB |
| Skip error path testing | Test both happy and error paths |
| Use `test.skip` for broken tests | Fix or remove them |
| Long test descriptions | Short, specific `it('rejects empty query')` |
