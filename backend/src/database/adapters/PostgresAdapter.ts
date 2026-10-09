/**
 * PostgreSQL Adapter — wraps node-postgres (pg) Pool.
 * Uses async methods for all DB operations.
 * SA4E-104: AsyncLocalStorage for concurrent-safe transactions.
 * Implements: SA4E-33
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from './DatabaseAdapter.js';
import { parseInsertTarget, quoteIdentifier, translatePlaceholders } from './pg-sql-utils.js';

export interface PostgresConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  pool?: { min?: number; max?: number };
}

/** AsyncLocalStorage to scope queries to a dedicated client during transactions. */
const txClientStorage = new AsyncLocalStorage<{ query: (sql: string, params?: unknown[]) => Promise<any> }>();

export class PostgresAdapter implements DatabaseAdapter {
  private pool: any = null;
  private connected = false;
  private serverVersion = '';
  /** Memoized per-table result of the information_schema `id` column check. */
  private idColumnCache = new Map<string, boolean>();

  constructor(private readonly config: PostgresConfig) {}

  async connect(): Promise<void> {
    const { Pool } = await import('pg');
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      min: this.config.pool?.min ?? 2,
      max: this.config.pool?.max ?? 10,
    });
    // Evict idle clients that encounter errors — prevents poisoned connections in pool
    if (this.pool.on) {
      this.pool.on('error', (err: Error) => {
        console.error('[PostgresAdapter] Pool idle client error (evicted):', err.message);
      });
    }
    const res = await this.pool.query('SELECT version()');
    this.serverVersion = res.rows[0]?.version || 'PostgreSQL';
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) { await this.pool.end(); this.pool = null; this.connected = false; }
  }

  isConnected(): boolean { return this.connected; }

  getStatus(): ConnectionStatus {
    return { connected: this.connected, engine: 'postgresql', version: this.serverVersion,
      details: { host: this.config.host, port: this.config.port, database: this.config.database } };
  }

  // Sync stubs — not usable for PG, use async variants
  run(_sql: string, _params?: unknown[]): RunResult { throw new Error('Use runAsync'); }
  get<T = unknown>(_sql: string, _params?: unknown[]): T | undefined { throw new Error('Use getAsync'); }
  all<T = unknown>(_sql: string, _params?: unknown[]): T[] { throw new Error('Use allAsync'); }
  exec(_sql: string): void { throw new Error('Use execAsync'); }
  transaction<T>(_fn: () => T): T { throw new Error('Use transactionAsync'); }
  prepare(_sql: string): PreparedStatement { throw new Error('Use async methods'); }

  /**
   * Get the active query function — either the transaction client (from AsyncLocalStorage)
   * or the pool itself. This ensures queries inside transactionAsync() go through
   * the dedicated client without monkey-patching pool.query.
   */
  private getQueryFn(): (sql: string, params?: unknown[]) => Promise<any> {
    const txClient = txClientStorage.getStore();
    return txClient ? txClient.query : this.pool.query.bind(this.pool);
  }

  // Async methods
  async runAsync(sql: string, params?: unknown[]): Promise<RunResult> {
    const translated = translatePlaceholders(sql);
    const queryFn = this.getQueryFn();
    const isInsert = /^\s*INSERT/i.test(sql);
    const hasReturning = /RETURNING/i.test(sql);
    // SA4E-104: append RETURNING id to get lastInsertRowid — but ONLY when the
    // table actually has an `id` column. A failed RETURNING inside a transaction
    // aborts it (25P02), so we never gamble: the memoized check decides upfront.
    if (isInsert && !hasReturning && (await this.tableHasIdColumn(sql, queryFn))) {
      const r = await queryFn(`${translated} RETURNING id`, params);
      return { changes: r.rowCount ?? 0, lastInsertRowid: r.rows?.[0]?.id ?? 0 };
    }
    // Id-less table / unparsable target / check failed → plain INSERT, which can
    // never poison a transaction or a pooled connection.
    const r = await queryFn(translated, params);
    return { changes: r.rowCount ?? 0, lastInsertRowid: 0 };
  }

  /**
   * Memoized per-table check: does the target of this INSERT have an `id` column?
   * Runs on the active query fn (tx client inside transactions) so tables created
   * in the same transaction are visible. Check failure → false (plain INSERT is
   * always safe); the cache costs one metadata query per table per lifetime.
   */
  private async tableHasIdColumn(
    sql: string,
    queryFn: (sql: string, params?: unknown[]) => Promise<any>,
  ): Promise<boolean> {
    const target = parseInsertTarget(sql);
    if (!target) return false;
    const cached = this.idColumnCache.get(target.key);
    if (cached !== undefined) return cached;
    try {
      const r = await queryFn(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'id' LIMIT 1`,
        [target.schema, target.table],
      );
      const exists = (r.rows?.length ?? 0) > 0;
      this.idColumnCache.set(target.key, exists);
      return exists;
    } catch (err) {
      console.warn('[PostgresAdapter] id-column lookup failed — defaulting to plain INSERT:', (err as Error).message);
      this.idColumnCache.set(target.key, false);
      return false;
    }
  }

  async getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const r = await this.getQueryFn()(translatePlaceholders(sql), params);
    return r.rows[0] as T | undefined;
  }

  async allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const r = await this.getQueryFn()(translatePlaceholders(sql), params);
    return r.rows as T[];
  }

  async execAsync(sql: string): Promise<void> {
    await this.getQueryFn()(sql);
  }

  /**
   * Execute fn() within a PostgreSQL transaction using a dedicated client.
   * Uses AsyncLocalStorage to scope all queries within fn() to the same client —
   * no monkey-patching, fully concurrent-safe.
   */
  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await txClientStorage.run(
        { query: client.query.bind(client) },
        fn,
      );
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (err) { console.debug('[PostgresAdapter] ignore rollback error :', (err as Error).message); }
      throw err;
    } finally {
      client.release();
    }
  }

  getEngine(): DatabaseEngine { return 'postgresql'; }
  async getVersion(): Promise<string> { return this.serverVersion; }

  async getTableNames(): Promise<string[]> {
    const r = await this.getQueryFn()("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    return r.rows.map((row: any) => row.tablename);
  }

  async getRowCount(table: string): Promise<number> {
    const r = await this.getQueryFn()(`SELECT COUNT(*) as cnt FROM ${quoteIdentifier(table)}`);
    return parseInt(r.rows[0]?.cnt || '0', 10);
  }
}

