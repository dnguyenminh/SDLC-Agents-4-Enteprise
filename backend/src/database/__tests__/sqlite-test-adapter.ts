/**
 * Test-only DatabaseAdapter backed by SqliteAdapter (the production SQLite
 * adapter, no native bindings required). Each test gets a fresh in-memory
 * database. Normalizes Postgres-style $N placeholders to '?' so repositories
 * that use $1..$n parameters can be exercised against the same SQLite code
 * path that runs in production.
 */

import type {
  DatabaseAdapter,
  PreparedStatement,
  RunResult,
} from '../adapters/DatabaseAdapter.js';
import { SqliteAdapter } from '../adapters/SqliteAdapter.js';

export interface SqliteTestDb {
  adapter: SqliteAdapter;
  close(): Promise<void>;
}

export async function makeSqliteTestDb(): Promise<SqliteTestDb> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  return {
    adapter,
    async close() {
      await adapter.disconnect();
    },
  };
}

export function adapterFromSqlite(adapter: SqliteAdapter): DatabaseAdapter {
  const normalize = (sql: string): string => sql.replace(/\$(\d+)/g, '?');
  return {
    connect: () => adapter.connect(),
    disconnect: () => adapter.disconnect(),
    isConnected: () => adapter.isConnected(),
    getEngine: () => adapter.getEngine(),
    getStatus: () => adapter.getStatus(),
    run: (sql, params) => adapter.run(normalize(sql), params),
    get: <T = unknown>(sql: string, params?: unknown[]) =>
      adapter.get<T>(normalize(sql), params),
    all: <T = unknown>(sql: string, params?: unknown[]) =>
      adapter.all<T>(normalize(sql), params),
    exec: (sql) => adapter.exec(sql),
    transaction: <T>(fn: () => T) => adapter.transaction(fn),
    prepare: (sql): PreparedStatement => {
      const prepared = adapter.prepare(normalize(sql));
      return {
        run: (...p: unknown[]): RunResult => prepared.run(...p),
        get: <T = unknown>(...p: unknown[]): T | undefined => prepared.get<T>(...p),
        all: <T = unknown>(...p: unknown[]): T[] => prepared.all<T>(...p),
      };
    },
    runAsync: (sql, params) => adapter.runAsync(normalize(sql), params),
    getAsync: <T = unknown>(sql: string, params?: unknown[]) =>
      adapter.getAsync<T>(normalize(sql), params),
    allAsync: <T = unknown>(sql: string, params?: unknown[]) =>
      adapter.allAsync<T>(normalize(sql), params),
    execAsync: (sql) => adapter.execAsync(sql),
    transactionAsync: <T>(fn: () => Promise<T>) => adapter.transactionAsync(fn),
    getVersion: () => adapter.getVersion(),
    getTableNames: () => adapter.getTableNames(),
    getRowCount: (table: string) => adapter.getRowCount(table),
  };
}
