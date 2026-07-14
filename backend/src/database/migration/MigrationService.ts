/**
 * Migration Service — orchestrates data transfer between databases.
 * Implements: SA4E-33, UC-4, UC-5, UC-6, BR-3, BR-4, BR-7
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { DatabaseAdapterFactory, type DatabaseConnectionConfig } from '../factory/DatabaseAdapterFactory.js';
import { DatabaseConfigService } from '../config/DatabaseConfigService.js';

export interface MigrationProgress {
  phase: 'schema' | 'data' | 'verify' | 'complete' | 'error' | 'cancelled';
  table?: string;
  rowsCopied?: number;
  totalRows?: number;
  percent?: number;
  message?: string;
  elapsed?: number;
}

export interface MigrationResult {
  success: boolean;
  tablesProcessed: number;
  totalTime: number;
  error?: string;
}

const BATCH_SIZE = 500;

export class MigrationService {
  private cancelled = false;
  private startTime = 0;

  constructor(
    private source: DatabaseAdapter,
    private targetConfig: DatabaseConnectionConfig,
    private configService: DatabaseConfigService,
    private onProgress: (event: MigrationProgress) => void
  ) {}

  async migrate(): Promise<MigrationResult> {
    this.cancelled = false;
    this.startTime = Date.now();
    const target = DatabaseAdapterFactory.create(this.targetConfig);

    try {
      await target.connect();
      const tables = await this.source.getTableNames();
      const migratables = tables.filter(t => !t.includes('_fts') && t !== 'schema_version');

      // Schema phase — create tables in target (no FK constraints, defer them)
      if ('execAsync' in target) {
        await (target as any).execAsync('SET session_replication_role = replica;');
      }
      for (const table of migratables) {
        if (this.cancelled) throw new CancelledError();
        this.onProgress({ phase: 'schema', table, message: `Creating table ${table}` });
        const ddl = this.getCreateTableDDL(table);
        if (ddl) {
          const cleanDDL = this.removeForeignKeys(ddl);
          const translated = this.translateDDL(cleanDDL, this.targetConfig.engine);
          try {
            if ('execAsync' in target) {
              await (target as any).execAsync(translated);
            } else {
              target.exec(translated);
            }
          } catch (ddlErr: any) {
            if (!ddlErr.message?.includes('already exists')) throw ddlErr;
          }
        }
      }

      // Data phase
      let processed = 0;
      for (const table of migratables) {
        if (this.cancelled) throw new CancelledError();
        await this.copyTable(table, target);
        processed++;
      }

      // Verify phase
      for (const table of migratables) {
        const src = await this.source.getRowCount(table);
        const tgt = await target.getRowCount(table);
        this.onProgress({ phase: 'verify', table, rowsCopied: tgt, totalRows: src });
        if (src !== tgt) throw new Error(`Mismatch ${table}: ${src} vs ${tgt}`);
      }

      this.configService.setActiveEngine(this.targetConfig.engine, this.targetConfig as any);
      const totalTime = Date.now() - this.startTime;
      this.onProgress({ phase: 'complete', elapsed: totalTime });
      return { success: true, tablesProcessed: processed, totalTime };
    } catch (err) {
      const msg = (err as Error).message;
      this.onProgress({ phase: err instanceof CancelledError ? 'cancelled' : 'error', message: msg });
      await this.rollback(target);
      return { success: false, tablesProcessed: 0, totalTime: Date.now() - this.startTime, error: msg };
    } finally {
      await target.disconnect();
    }
  }

  cancel(): void { this.cancelled = true; }

  private async copyTable(table: string, target: DatabaseAdapter): Promise<void> {
    const total = await this.source.getRowCount(table);
    if (total === 0) { this.onProgress({ phase: 'data', table, rowsCopied: 0, totalRows: 0, percent: 100 }); return; }
    let copied = 0;
    const isAsync = 'runAsync' in target;
    while (copied < total) {
      if (this.cancelled) throw new CancelledError();
      const rows = this.source.all<Record<string, unknown>>(`SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${copied}`);
      if (rows.length === 0) break;

      if (isAsync) {
        await (target as any).transactionAsync(async () => {
          for (const row of rows) {
            const cols = Object.keys(row);
            const ph = cols.map(() => '?').join(', ');
            await (target as any).runAsync(
              `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${ph})`,
              Object.values(row)
            );
          }
        });
      } else {
        target.transaction(() => {
          for (const row of rows) {
            const cols = Object.keys(row);
            const ph = cols.map(() => '?').join(', ');
            target.run(`INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${ph})`, Object.values(row));
          }
        });
      }

      copied += rows.length;
      this.onProgress({ phase: 'data', table, rowsCopied: copied, totalRows: total, percent: Math.round(copied / total * 100) });
    }
  }

  private async rollback(target: DatabaseAdapter): Promise<void> {
    try {
      const tables = await target.getTableNames();
      for (const t of tables.reverse()) {
        if ('execAsync' in target) {
          await (target as any).execAsync(`DROP TABLE IF EXISTS "${t}" CASCADE`);
        } else {
          target.exec(`DROP TABLE IF EXISTS "${t}" CASCADE`);
        }
      }
    } catch { /* best-effort */ }
    this.configService.setActiveEngine('sqlite');
  }

  /** Get CREATE TABLE DDL from SQLite for a given table */
  private getCreateTableDDL(table: string): string | null {
    const row = this.source.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table]
    );
    return row?.sql || null;
  }

  /** Translate SQLite DDL to target engine dialect */
  private translateDDL(ddl: string, engine: string): string {
    let result = ddl;
    if (engine === 'postgresql') {
      result = result.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
      result = result.replace(/DEFAULT\s*\(datetime\('now'\)\)/gi, "DEFAULT NOW()");
      result = result.replace(/\bBLOB\b/gi, 'BYTEA');
      result = result.replace(/CREATE TABLE IF NOT EXISTS/gi, 'CREATE TABLE IF NOT EXISTS');
    } else if (engine === 'mysql') {
      result = result.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INTEGER PRIMARY KEY AUTO_INCREMENT');
      result = result.replace(/DEFAULT\s*\(datetime\('now'\)\)/gi, "DEFAULT CURRENT_TIMESTAMP");
      result = result.replace(/\bBLOB\b/gi, 'LONGBLOB');
    }
    return result;
  }

  /** Remove FOREIGN KEY clauses from DDL to avoid ordering issues */
  private removeForeignKeys(ddl: string): string {
    const lines = ddl.split('\n');
    const filtered = lines.filter(line => !line.trim().toUpperCase().startsWith('FOREIGN KEY'));
    let result = filtered.join('\n');
    result = result.replace(/,(\s*\))/g, '$1');
    return result;
  }
}

class CancelledError extends Error { constructor() { super('Cancelled'); } }
