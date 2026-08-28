/**
 * Database Configuration Service — manages database.json.
 * Implements: SA4E-33, BR-5, BR-9
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';
import type { DatabaseConnectionConfig } from '../factory/DatabaseAdapterFactory.js';

export interface ActiveEngineFlag {
  /** Whether this engine is the currently active one. Exactly ONE engine must be true at a time. */
  active: boolean;
}

export interface SqliteEngineConfig extends ActiveEngineFlag {
  dbPath: string;
}
export interface PostgresEngineConfig extends ConnectionParams, ActiveEngineFlag {}
export interface MysqlEngineConfig extends ConnectionParams, ActiveEngineFlag {}

export interface DatabaseJsonConfig {
  // Kept in sync with the per-engine `active` flag (source of truth).
  activeEngine: DatabaseEngine;
  engines: {
    // SA4E-49: Unified single DB file
    sqlite: SqliteEngineConfig;
    postgresql?: PostgresEngineConfig;
    mysql?: MysqlEngineConfig;
  };
  migration: { lastMigration: string | null; backupSqlitePaths: string[] };
}

export interface ConnectionParams {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  pool: { min: number; max: number };
}

export class DatabaseConfigService {
  private configPath: string;
  private keyPath: string;

  constructor(private readonly dataDir: string) {
    this.configPath = path.join(dataDir, 'database.json');
    this.keyPath = path.join(dataDir, '.dbkey');
  }

  load(): DatabaseJsonConfig {
    if (!fs.existsSync(this.configPath)) return this.defaultConfig();
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    const config = JSON.parse(raw) as DatabaseJsonConfig;
    if (config.engines.postgresql?.password) {
      config.engines.postgresql.password = this.decrypt(config.engines.postgresql.password);
    }
    if (config.engines.mysql?.password) {
      config.engines.mysql.password = this.decrypt(config.engines.mysql.password);
    }
    return config;
  }

  save(config: DatabaseJsonConfig): void {
    const toWrite = JSON.parse(JSON.stringify(config)) as DatabaseJsonConfig;
    if (toWrite.engines.postgresql?.password) {
      toWrite.engines.postgresql.password = this.encrypt(toWrite.engines.postgresql.password);
    }
    if (toWrite.engines.mysql?.password) {
      toWrite.engines.mysql.password = this.encrypt(toWrite.engines.mysql.password);
    }
    fs.writeFileSync(this.configPath, JSON.stringify(toWrite, null, 2), 'utf-8');
  }

  getActiveConfig(): DatabaseConnectionConfig {
    const config = this.load();
    const engine = this.resolveActiveEngine(config);
    switch (engine) {
      case 'sqlite':
        return { engine: 'sqlite', dbPath: path.join(this.dataDir, config.engines.sqlite.dbPath) };
      case 'postgresql': {
        const pg = config.engines.postgresql!;
        return { engine: 'postgresql', ...pg };
      }
      case 'mysql': {
        const my = config.engines.mysql!;
        return { engine: 'mysql', ...my };
      }
    }
  }

  /**
   * Determine the active engine from the per-engine `active` flag (source of truth).
   * Falls back to the legacy `activeEngine` string for backward compatibility.
   */
  private resolveActiveEngine(config: DatabaseJsonConfig): DatabaseEngine {
    const candidates: DatabaseEngine[] = ['postgresql', 'mysql', 'sqlite'];
    for (const e of candidates) {
      const eng = (config.engines as Record<string, ActiveEngineFlag | undefined>)[e];
      if (eng && eng.active === true) return e;
    }
    return config.activeEngine || 'sqlite';
  }

  setActiveEngine(engine: DatabaseEngine, params?: ConnectionParams): void {
    const config = this.load();
    config.activeEngine = engine;
    // Ensure exactly one engine has the active flag set.
    for (const e of ['sqlite', 'postgresql', 'mysql'] as DatabaseEngine[]) {
      const eng = (config.engines as Record<string, ActiveEngineFlag | undefined>)[e];
      if (eng) eng.active = e === engine;
    }
    if (params && engine !== 'sqlite') {
      (config.engines as any)[engine] = { ...params, active: true };
    } else if (engine === 'sqlite') {
      config.engines.sqlite.active = true;
    }
    this.save(config);
  }

  private defaultConfig(): DatabaseJsonConfig {
    return {
      activeEngine: 'sqlite',
      // SA4E-49: Single unified DB file
      engines: { sqlite: { dbPath: 'index.db', active: true } },
      migration: { lastMigration: null, backupSqlitePaths: [] },
    };
  }

  private getKey(): Buffer {
    if (!fs.existsSync(this.keyPath)) {
      const key = crypto.randomBytes(32);
      fs.writeFileSync(this.keyPath, key);
      return key;
    }
    return fs.readFileSync(this.keyPath);
  }

  private encrypt(plaintext: string): string {
    if (plaintext.startsWith('ENC:')) return plaintext;
    const key = this.getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'ENC:' + Buffer.concat([iv, enc, tag]).toString('base64');
  }

  private decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith('ENC:')) return ciphertext;
    const key = this.getKey();
    const data = Buffer.from(ciphertext.slice(4), 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(data.length - 16);
    const enc = data.subarray(12, data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  }
}
