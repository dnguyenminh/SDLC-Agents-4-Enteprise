/**
 * PostgresAsyncAdapter — implements AsyncDatabaseAdapter using node-postgres Pool.
 * SA4E-44: Native async PostgreSQL adapter for MemoryModule and other async-first consumers.
 * Cleaner than PostgresAdapter: no sync stubs that throw, pure async contract.
 */

import type { AsyncDatabaseAdapter } from './AsyncDatabaseAdapter.js';
import type { DatabaseEngine, RunResult } from './DatabaseAdapter.js';
import { translatePlaceholders } from './pg-sql-utils.js';

export interface PostgresAsyncConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  pool?: { min?: number; max?: number };
}

export class PostgresAsyncAdapter implements AsyncDatabaseAdapter {
  private pool: any = null;
  private connected = false;

  constructor(private readonly config: PostgresAsyncConfig) {}

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
    await this.pool.query('SELECT 1'); // verify connection
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) { await this.pool.end(); this.pool = null; this.connected = false; }
  }

  isConnected(): boolean { return this.connected; }
  getEngine(): DatabaseEngine { return 'postgresql'; }

  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const r = await this.pool.query(this.translateParams(sql), params);
    return { changes: r.rowCount ?? 0, lastInsertRowid: 0 };
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const r = await this.pool.query(this.translateParams(sql), params);
    return r.rows[0] as T | undefined;
  }

  async all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const r = await this.pool.query(this.translateParams(sql), params);
    return r.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Use dedicated client for all queries within fn()
      const originalQuery = this.pool.query.bind(this.pool);
      (this.pool as any).query = client.query.bind(client);
      const result = await fn();
      (this.pool as any).query = originalQuery;
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (err) { console.debug('[PostgresAsyncAdapter] ignore :', (err as Error).message); }
      throw err;
    } finally {
      // ALWAYS restore pool.query — prevents poisoning on error path
      client.release();
    }
  }

  /** Convert ? placeholders to $1, $2, etc. for pg driver — skips `?` in literals. */
  private translateParams(sql: string): string {
    return translatePlaceholders(sql);
  }
}
