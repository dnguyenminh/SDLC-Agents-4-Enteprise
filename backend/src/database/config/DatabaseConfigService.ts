/**
 * Database Configuration Service — manages database.json.
 * Implements: SA4E-33, BR-5, BR-9
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { DatabaseEngine } from '../adapters/DatabaseAdapter.js';
import type { DatabaseConnectionConfig } from '../factory/DatabaseAdapterFactory.js';

export interface DatabaseJsonConfig {
  activeEngine: DatabaseEngine;
  engines: {
    sqlite: { adminDbPath: string; indexDbPath: string };
    postgresql?: ConnectionParams;
    mysql?: ConnectionParams;
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
    switch (config.activeEngine) {
      case 'sqlite':
        return { engine: 'sqlite', dbPath: path.join(this.dataDir, config.engines.sqlite.adminDbPath) };
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

  setActiveEngine(engine: DatabaseEngine, params?: ConnectionParams): void {
    const config = this.load();
    config.activeEngine = engine;
    if (params && engine !== 'sqlite') {
      (config.engines as any)[engine] = params;
    }
    this.save(config);
  }

  private defaultConfig(): DatabaseJsonConfig {
    return {
      activeEngine: 'sqlite',
      engines: { sqlite: { adminDbPath: 'admin.db', indexDbPath: 'index.db' } },
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
