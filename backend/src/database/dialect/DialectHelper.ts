import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';

export class DialectHelper {
  constructor(private readonly engine: DatabaseEngine) {}

  now(): string {
    return this.engine === 'sqlite' ? "datetime('now')" : 'NOW()';
  }

  upsert(table: string, columns: string[], conflictKey: string, updateColumns: string[]): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    const setClauses = updateColumns.map(c => `${c} = EXCLUDED.${c}`).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO UPDATE SET ${setClauses}`;
  }

  insertIgnore(table: string, columns: string[], conflictKey: string): string {
    if (this.engine === 'sqlite') {
      return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    }
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${conflictKey}) DO NOTHING`;
  }
}
