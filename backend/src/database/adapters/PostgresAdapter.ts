/**
 * PostgreSQL Adapter — wraps node-postgres (pg) Pool.
 * Uses async methods for all DB operations.
 * Implements: SA4E-33
 */

import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from './DatabaseAdapter.js';

export interface PostgresConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  pool?: { min?: number; max?: number };
}

export class PostgresAdapter implements DatabaseAdapter {
  private pool: any = null;
  private connected = false;
  private serverVersion = '';

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
  run(sql: string, params?: unknown[]): RunResult { throw new Error('Use runAsync'); }
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined { throw new Error('Use getAsync'); }
  all<T = unknown>(sql: string, params?: unknown[]): T[] { throw new Error('Use allAsync'); }
  exec(sql: string): void { throw new Error('Use execAsync'); }
  transaction<T>(fn: () => T): T { throw new Error('Use transactionAsync'); }
  prepare(sql: string): PreparedStatement { throw new Error('Use async methods'); }

  // Async methods
  async runAsync(sql: string, params?: unknown[]): Promise<RunResult> {
    const r = await this.pool.query(this.translateParams(sql), params);
    return { changes: r.rowCount ?? 0, lastInsertRowid: 0 };
  }

  async getAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const r = await this.pool.query(this.translateParams(sql), params);
    return r.rows[0] as T | undefined;
  }

  async allAsync<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const r = await this.pool.query(this.translateParams(sql), params);
    return r.rows as T[];
  }

  async execAsync(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transactionAsync(fn: () => Promise<void>): Promise<void> {
    await this.pool.query('BEGIN');
    try { await fn(); await this.pool.query('COMMIT'); }
    catch (err) { await this.pool.query('ROLLBACK'); throw err; }
  }

  getEngine(): DatabaseEngine { return 'postgresql'; }
  async getVersion(): Promise<string> { return this.serverVersion; }

  async getTableNames(): Promise<string[]> {
    const r = await this.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    return r.rows.map((row: any) => row.tablename);
  }

  async getRowCount(table: string): Promise<number> {
    const r = await this.pool.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return parseInt(r.rows[0]?.cnt || '0', 10);
  }

  private translateParams(sql: string): string {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }
}
