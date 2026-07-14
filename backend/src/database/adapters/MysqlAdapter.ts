/**
 * MySQL Adapter — wraps mysql2 pool.
 * Implements: SA4E-33
 */

import type {
  DatabaseAdapter,
  DatabaseEngine,
  RunResult,
  ConnectionStatus,
  PreparedStatement,
} from './DatabaseAdapter.js';

export interface MysqlConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  pool?: { min?: number; max?: number };
}

export class MysqlAdapter implements DatabaseAdapter {
  private pool: any = null;
  private connected = false;
  private serverVersion = '';

  constructor(private readonly config: MysqlConfig) {}

  async connect(): Promise<void> {
    // @ts-ignore - mysql2 is optional dependency
    const mysql = await import('mysql2');
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? {} : undefined,
      connectionLimit: this.config.pool?.max ?? 10,
    });
    const [rows] = await this.pool.promise().query('SELECT VERSION() as ver');
    this.serverVersion = `MySQL ${(rows as any)[0]?.ver || 'unknown'}`;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.promise().end();
      this.pool = null;
      this.connected = false;
    }
  }

  isConnected(): boolean { return this.connected; }

  getStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      engine: 'mysql',
      version: this.serverVersion,
      details: { host: this.config.host, port: this.config.port, database: this.config.database },
    };
  }

  run(sql: string, params?: unknown[]): RunResult {
    const [result] = this.syncQuery(sql, params);
    return { changes: (result as any).affectedRows ?? 0, lastInsertRowid: (result as any).insertId ?? 0 };
  }

  get<T = unknown>(sql: string, params?: unknown[]): T | undefined {
    const [rows] = this.syncQuery(sql, params);
    return (rows as any[])[0] as T | undefined;
  }

  all<T = unknown>(sql: string, params?: unknown[]): T[] {
    const [rows] = this.syncQuery(sql, params);
    return rows as T[];
  }

  exec(sql: string): void { this.syncQuery(sql); }

  transaction<T>(fn: () => T): T {
    this.exec('START TRANSACTION');
    try {
      const result = fn();
      this.exec('COMMIT');
      return result;
    } catch (err) {
      this.exec('ROLLBACK');
      throw err;
    }
  }

  prepare(sql: string): PreparedStatement {
    return {
      run: (...params: unknown[]) => this.run(sql, params),
      get: <T>(...params: unknown[]) => this.get<T>(sql, params),
      all: <T>(...params: unknown[]) => this.all<T>(sql, params),
    };
  }

  getEngine(): DatabaseEngine { return 'mysql'; }
  async getVersion(): Promise<string> { return this.serverVersion; }

  async getTableNames(): Promise<string[]> {
    const [rows] = await this.pool.promise().query('SHOW TABLES');
    return (rows as any[]).map((r: any) => Object.values(r)[0] as string);
  }

  async getRowCount(table: string): Promise<number> {
    const [rows] = await this.pool.promise().query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
    return parseInt((rows as any)[0]?.cnt || '0', 10);
  }

  private syncQuery(sql: string, params?: unknown[]): any {
    if (!this.pool) throw new Error('MySQL not connected');
    return this.pool.promise().query(sql, params);
  }
}
