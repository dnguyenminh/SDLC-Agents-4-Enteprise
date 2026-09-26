import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';

/**
 * DialectHelper — cross-engine SQL generation (Strategy pattern).
 * Produces engine-specific SQL fragments for SQLite and PostgreSQL.
 */
export class DialectHelper {
  readonly engine: DatabaseEngine;
  constructor(engine: DatabaseEngine) { this.engine = engine; }

  /** Current timestamp expression for DML queries. */
  now(): string {
    return this.engine === 'sqlite' ? "datetime('now')" : 'NOW()';
  }

  /** INSERT OR REPLACE / ON CONFLICT DO UPDATE — cross-engine upsert. */
  upsert(table: string, columns: string[], conflictKey: string, updateColumns: string[]): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    const setClauses = updateColumns.map(c => `${c} = EXCLUDED.${c}`).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO UPDATE SET ${setClauses}`;
  }

  /** INSERT OR IGNORE / ON CONFLICT DO NOTHING — cross-engine insert-ignore. */
  insertIgnore(table: string, columns: string[], conflictKey: string): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO NOTHING`;
  }

  /** Check if a table exists — cross-engine SQL. */
  tableExistsQuery(table: string): string {
    if (this.engine === 'sqlite') {
      return `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
    }
    return `SELECT table_name FROM information_schema.tables WHERE table_name = '${table}'`;
  }

  /** Check column existence — cross-engine SQL. */
  columnExistsQuery(table: string): string {
    if (this.engine === 'sqlite') {
      return `PRAGMA table_info('${table}')`;
    }
    return `SELECT column_name as name FROM information_schema.columns WHERE table_name = '${table}'`;
  }

  /** CREATE TABLE with auto-increment primary key. */
  serialPk(): string {
    return this.engine === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY';
  }

  /** Default timestamp expression for DDL (column defaults). */
  defaultTimestamp(): string {
    return this.engine === 'sqlite' ? "(datetime('now'))" : 'current_timestamp';
  }

  /** Date arithmetic: subtract seconds from now. */
  dateSubtract(seconds: string): string {
    if (this.engine === 'sqlite') {
      return `datetime('now', '-' || ${seconds} || ' seconds')`;
    }
    return `NOW() - INTERVAL '1 second' * ${seconds}`;
  }

  /**
   * Column-to-date comparison expression.
   *
   * Supports two operators:
   *  - `'<= now -'`: column compared against now minus an interval (SQLite sign convention)
   *  - `'<= now'`: column compared against now (no interval)
   *
   * @example
   *   dialect.dateColumnCompare('created_at', '<= now -', '-24 hours')
   *   // SQLite:  datetime(created_at) <= datetime('now', '-24 hours')
   *   // PG:      created_at::timestamp <= NOW() - INTERVAL '24 hours'
   */
  dateColumnCompare(column: string, operator: '<= now -' | '<= now', interval?: string): string {
    if (this.engine === 'postgresql' || this.engine === 'mysql') {
      const tsCol = `${column}::timestamp`;
      if (operator === '<= now -' && interval != null) {
        const pgInterval = interval.startsWith('-') ? interval.slice(1) : interval;
        return `${tsCol} <= NOW() - INTERVAL '${pgInterval}'`;
      }
      return `${tsCol} <= NOW()`;
    }
    if (operator === '<= now -' && interval != null) {
      return `datetime(${column}) <= datetime('now', '${interval}')`;
    }
    return `datetime(${column}) <= datetime('now')`;
  }

  /** Cross-engine LEAST/MIN — returns smallest of two numeric expressions. */
  least(a: string, b: string): string {
    if (this.engine === 'postgresql') return `LEAST(${a}, ${b}::double precision)`;
    return `MIN(${a}, ${b})`;
  }

  /** Cross-engine expiry check — compares TEXT date column against now. */
  expiryCheck(column: string): string {
    if (this.engine === 'postgresql') return `(${column} IS NULL OR ${column}::timestamp >= NOW())`;
    return `(${column} IS NULL OR ${column} >= datetime('now'))`;
  }
}
