import type { Database } from './wasmTypes.js';
import type { RunResult, PreparedStatement } from '../DatabaseAdapter.js';

export class WasmDbSyncAdapter {
  constructor(private readonly db: Database) {}

  private getLastInsertRowid(): number {
    const rows = this.db.exec({ sql: 'SELECT last_insert_rowid() as id', rowMode: 'object', returnValue: 'resultRows' }) as any[];
    return Number(rows?.[0]?.id ?? 0);
  }

  prepare(sql: string): PreparedStatement {
    return {
      run: (...params: unknown[]): RunResult => {
        this.db.exec({ sql, bind: params as any[] });
        const lastInsertRowid = this.getLastInsertRowid();
        return { changes: (this.db as any).changes(), lastInsertRowid };
      },
      get: <T = unknown>(...params: unknown[]): T | undefined => {
        const rows = this.db.exec({ sql, bind: params as any[], rowMode: 'object', returnValue: 'resultRows' }) as T[];
        return rows[0];
      },
      all: <T = unknown>(...params: unknown[]): T[] => {
        return this.db.exec({ sql, bind: params as any[], rowMode: 'object', returnValue: 'resultRows' }) as T[];
      },
    };
  }

  run(sql: string, params?: unknown[]): RunResult {
    this.db.exec({ sql, bind: params as any[] });
    const lastInsertRowid = this.getLastInsertRowid();
    return { changes: this.db.changes(), lastInsertRowid };
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const rows = this.db.exec({ sql, bind: params as any[], rowMode: 'object', returnValue: 'resultRows' }) as T[];
    return rows[0];
  }

  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    return this.db.exec({ sql, bind: params as any[], rowMode: 'object', returnValue: 'resultRows' }) as T[];
  }

  exec(sql: string): void {
    this.db.exec({ sql });
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }
}
