/** SQLite statement execution helpers (BR-18 extraction from SqliteAdapter). */
import type { RunResult, PreparedStatement } from './DatabaseAdapter.js';
import { normalizeSqlitePlaceholders } from './sqlite-placeholders.js';

/** Fetch last_insert_rowid as a number via an object-mode exec. */
function lastInsertRowid(db: any): number {
  const rows = db.exec('SELECT last_insert_rowid() as id', { rowMode: 'object', returnValue: 'resultRows' }) as any;
  return Number(rows[0]?.id ?? 0);
}

export function sqliteRun(db: any, sql: string, params?: unknown[], markDirty?: () => void): RunResult {
  const normalized = normalizeSqlitePlaceholders(sql);
  markDirty?.();
  if (params && params.length) {
    const stmt = db.prepare(normalized);
    stmt.bind(params);
    while (stmt.step()) { /* step to exhaust */ }
    const changes = db.changes();
    const lastId = lastInsertRowid(db);
    stmt.finalize?.();
    return { changes, lastInsertRowid: lastId };
  }
  db.exec(normalized);
  return { changes: db.changes(), lastInsertRowid: lastInsertRowid(db) };
}

export function sqliteGet<T = unknown>(db: any, sql: string, params?: unknown[]): T | undefined {
  const normalized = normalizeSqlitePlaceholders(sql);
  const opts = params && params.length ? { bind: params, rowMode: 'object', returnValue: 'resultRows' } : { rowMode: 'object', returnValue: 'resultRows' };
  const rows = db.exec(normalized, opts) as any[];
  return rows?.[0] as T | undefined;
}

export function sqliteAll<T = unknown>(db: any, sql: string, params?: unknown[]): T[] {
  const normalized = normalizeSqlitePlaceholders(sql);
  const opts = params && params.length ? { bind: params, rowMode: 'object', returnValue: 'resultRows' } : { rowMode: 'object', returnValue: 'resultRows' };
  const rows = db.exec(normalized, opts) as any[];
  return rows as T[];
}

/** Tolerant exec: swallow duplicate column/index/table errors (idempotent DDL). */
export function sqliteExec(db: any, sql: string): void {
  try {
    db.exec(normalizeSqlitePlaceholders(sql));
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('duplicate column') || msg.includes('duplicate index') || msg.includes('table') && msg.includes('already exists')) {
      return;
    }
    throw e;
  }
}

export function sqliteTransaction<T>(db: any, fn: () => T, markDirty?: () => void): T {
  markDirty?.();
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
}

export function sqlitePrepare(db: any, sql: string, markDirty?: () => void): PreparedStatement {
  const normalized = normalizeSqlitePlaceholders(sql);
  return {
    run: (...params: unknown[]) => {
      markDirty?.();
      const stmt = db.prepare(normalized);
      if (params.length > 0) stmt.bind(params);
      while (stmt.step()) { /* step to exhaust */ }
      const changes = db.changes();
      const lastId = lastInsertRowid(db);
      stmt.finalize?.();
      return { changes, lastInsertRowid: lastId };
    },
    get: <T>(...params: unknown[]) => {
      const opts = params.length > 0 ? { bind: params, rowMode: 'object' as const } : { rowMode: 'object' as const };
      const rows = db.exec(normalized, opts) as any[];
      return rows?.[0] as T | undefined;
    },
    all: <T>(...params: unknown[]) => {
      const opts = params.length > 0 ? { bind: params, rowMode: 'object' as const } : { rowMode: 'object' as const };
      const rows = db.exec(normalized, opts) as any[];
      return rows as T[];
    },
  };
}
