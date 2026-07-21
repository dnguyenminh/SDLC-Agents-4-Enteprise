/**
 * Migration Service — orchestrates data transfer between databases.
 * Uses TypeMapper for type-safe DDL generation (replaces old regex approach).
 * Implements: SA4E-33, UC-4, UC-5, UC-6, BR-3, BR-4, BR-7
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { DatabaseAdapterFactory, type DatabaseConnectionConfig } from '../factory/DatabaseAdapterFactory.js';
import { DatabaseConfigService } from '../config/DatabaseConfigService.js';
import { TypeMapper } from './TypeMapper.js';
import pino from 'pino';

const logger = pino({ name: 'migration-service' });

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
    const tablesCreatedInSession: string[] = [];
    // TypeMapper scans actual data to build correct DDL
    const typeMapper = new TypeMapper(this.source);

    try {
      await target.connect();
      const preExistingTables = await target.getTableNames();
      const tables = await this.source.getTableNames();
      const migratables = tables.filter(
        t => !t.includes('_fts') && t !== 'schema_version'
      );

      // Schema phase — generate DDL from scanned column types
      if ('execAsync' in target) {
        await (target as any).execAsync(
          'SET session_replication_role = replica;'
        );
      }
      for (const table of migratables) {
        if (this.cancelled) throw new CancelledError();
        this.onProgress({
          phase: 'schema', table, message: `Creating table ${table}`,
        });
        // SA4E-45: DROP existing table to ensure correct schema (data will be re-copied)
        try {
          if ('execAsync' in target) {
            await (target as any).execAsync(`DROP TABLE IF EXISTS "${table}" CASCADE`);
          } else {
            target.exec(`DROP TABLE IF EXISTS "${table}" CASCADE`);
          }
        } catch { /* ignore if table doesn't exist */ }
        const ddl = typeMapper.generateCreateTable(
          table, this.targetConfig.engine
        );
        if ('execAsync' in target) {
          await (target as any).execAsync(ddl);
        } else {
          target.exec(ddl);
        }
        tablesCreatedInSession.push(table);
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
        this.onProgress({
          phase: 'verify', table, rowsCopied: tgt, totalRows: src,
        });
        if (src !== tgt) {
          throw new Error(`Mismatch ${table}: ${src} vs ${tgt}`);
        }
      }

      this.configService.setActiveEngine(
        this.targetConfig.engine, this.targetConfig as any
      );
      const totalTime = Date.now() - this.startTime;
      this.onProgress({ phase: 'complete', elapsed: totalTime });
      return { success: true, tablesProcessed: processed, totalTime };
    } catch (err) {
      const error = err as Error;
      const msg = error.message;
      const stack = error.stack || '';
      const phase = err instanceof CancelledError ? 'cancelled' : 'error';
      // Log full stack to server console for debugging
      logger.error({ err: error, stack }, `[migration] Failed: ${msg}`);
      // Send error + stack to frontend via SSE
      this.onProgress({ phase, message: `${msg}\n${stack}` });
      await this.rollback(target, tablesCreatedInSession);
      return {
        success: false, tablesProcessed: 0,
        totalTime: Date.now() - this.startTime, error: `${msg}\n${stack}`,
      };
    } finally {
      await target.disconnect();
    }
  }

  cancel(): void { this.cancelled = true; }

  private async copyTable(
    table: string, target: DatabaseAdapter
  ): Promise<void> {
    const total = await this.source.getRowCount(table);
    if (total === 0) {
      this.onProgress({
        phase: 'data', table, rowsCopied: 0, totalRows: 0, percent: 100,
      });
      return;
    }
    // SA4E-45: Clear existing data in target table before copy (handles re-migration)
    const isAsync = 'runAsync' in target;
    try {
      if (isAsync) {
        await (target as any).runAsync(`DELETE FROM "${table}"`);
      } else {
        target.run(`DELETE FROM "${table}"`, []);
      }
    } catch { /* table may be empty or not exist yet */ }

    let copied = 0;
    while (copied < total) {
      if (this.cancelled) throw new CancelledError();
      const rows = this.source.all<Record<string, unknown>>(
        `SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${copied}`
      );
      if (rows.length === 0) break;

      if (isAsync) {
        await (target as any).transactionAsync(async () => {
          for (const row of rows) {
            const cols = Object.keys(row);
            const ph = cols.map(() => '?').join(', ');
            // SA4E-45: Sanitize values — PG rejects null bytes (0x00) in TEXT columns
            const values = Object.values(row).map(v =>
              typeof v === 'string' ? v.replace(/\x00/g, '') : v
            );
            await (target as any).runAsync(
              `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${ph})`,
              values
            );
          }
        });
      } else {
        target.transaction(() => {
          for (const row of rows) {
            const cols = Object.keys(row);
            const ph = cols.map(() => '?').join(', ');
            const values = Object.values(row).map(v =>
              typeof v === 'string' ? v.replace(/\x00/g, '') : v
            );
            target.run(
              `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${ph})`,
              values
            );
          }
        });
      }

      copied += rows.length;
      this.onProgress({
        phase: 'data', table, rowsCopied: copied,
        totalRows: total, percent: Math.round(copied / total * 100),
      });
    }
  }

  /**
   * SA4E-45: Safe rollback — revert config to sqlite only.
   * NEVER drops tables — user data preservation is priority.
   */
  private async rollback(
    _target: DatabaseAdapter, _tablesCreatedInSession: string[]
  ): Promise<void> {
    this.configService.setActiveEngine('sqlite');
  }
}

class CancelledError extends Error { constructor() { super('Cancelled'); } }
