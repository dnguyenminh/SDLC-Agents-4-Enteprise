/**
 * Unit tests for DatabaseAdapterFactory — engine dispatch, config validation
 * and constructor defaults (no live connections are opened).
 */

import { describe, it, expect } from 'vitest';
import { DatabaseAdapterFactory } from '../DatabaseAdapterFactory.js';
import { SqliteWasmAdapter } from '../../adapters/wasm/SqliteWasmAdapter.js';
import { PostgresAdapter } from '../../adapters/PostgresAdapter.js';
import { MysqlAdapter } from '../../adapters/MysqlAdapter.js';

describe('DatabaseAdapterFactory', () => {
  it('creates a SqliteAdapter for the sqlite engine', () => {
    const adapter = DatabaseAdapterFactory.create({ engine: 'sqlite', dbPath: ':memory:' });
    expect(adapter).toBeInstanceOf(SqliteWasmAdapter);
  });

  it('throws when sqlite has no dbPath', () => {
    expect(() => DatabaseAdapterFactory.create({ engine: 'sqlite' } as never)).toThrow('SQLite requires dbPath');
  });

  it('creates a PostgresAdapter with defaults for the postgresql engine', () => {
    const adapter = DatabaseAdapterFactory.create({ engine: 'postgresql' } as never);
    expect(adapter).toBeInstanceOf(PostgresAdapter);
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getEngine()).toBe('postgresql');
  });

  it('creates a MysqlAdapter with defaults for the mysql engine', () => {
    const adapter = DatabaseAdapterFactory.create({ engine: 'mysql' } as never);
    expect(adapter).toBeInstanceOf(MysqlAdapter);
    expect(adapter.getEngine()).toBe('mysql');
  });

  it('throws for unsupported engines', () => {
    expect(() => DatabaseAdapterFactory.create({ engine: 'oracle' } as never)).toThrow('Unsupported engine: oracle');
  });
});