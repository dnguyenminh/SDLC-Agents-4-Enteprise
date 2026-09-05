/**
 * Unit tests for MigrationService — schema creation, data copy, verification,
 * cancellation and rollback using an in-memory source and a faked target.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MigrationService } from '../MigrationService.js';
import type { MigrationProgress } from '../MigrationService.js';
import { SqliteAdapter } from '../../adapters/SqliteAdapter.js';
import { DatabaseConfigService } from '../../config/DatabaseConfigService.js';
import { DatabaseAdapterFactory } from '../../factory/DatabaseAdapterFactory.js';

vi.mock('../../factory/DatabaseAdapterFactory.js', () => ({
  DatabaseAdapterFactory: { create: vi.fn() },
}));

class MemoryTarget {
  adapter = new SqliteAdapter(':memory:');
  ignoreWrites = false;

  async connect(): Promise<void> {
    await this.adapter.connect();
  }
  async disconnect(): Promise<void> {
    if (this.adapter.isConnected()) await this.adapter.disconnect();
  }

  async getTableNames(): Promise<string[]> {
    const rows = this.adapter.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    return rows.map((r) => r.name);
  }

  async getRowCount(table: string): Promise<number> {
    const row = this.adapter.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${table}"`);
    return row?.cnt ?? 0;
  }

  async execAsync(sql: string): Promise<void> {
    if (/^\s*SET /i.test(sql)) return;
    const cleaned = sql.replace(/\s+CASCADE\s*$/i, '').replace(/CASCADE/g, '');
    this.adapter.exec(cleaned);
  }

  async runAsync(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    if (this.ignoreWrites) return { changes: 0, lastInsertRowid: 0 };
    const r = this.adapter.run(sql, params);
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }

  async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

let dataDir: string;
let source: SqliteAdapter;
let configService: DatabaseConfigService;
let events: MigrationProgress[];
let target: MemoryTarget;

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-'));
  configService = new DatabaseConfigService(dataDir);
  events = [];
  target = new MemoryTarget();
  await target.connect();
  vi.mocked(DatabaseAdapterFactory.create).mockReturnValue(target as never);

  source = new SqliteAdapter(':memory:');
  await source.connect();
  source.exec(`CREATE TABLE app_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  source.run('INSERT INTO app_data (name) VALUES (?)', ['alpha']);
  source.run('INSERT INTO app_data (name) VALUES (?)', ['beta']);
});

afterEach(async () => {
  if (source.isConnected()) await source.disconnect();
  if (target.adapter.isConnected()) await target.disconnect();
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

let svc: MigrationService | null = null;

function makeService(cancelAtSchema = false): MigrationService {
  svc = new MigrationService(
    source,
    { engine: 'sqlite', dbPath: ':memory:' },
    configService,
    (event) => {
      events.push(event);
      if (cancelAtSchema && event.phase === 'schema') svc?.cancel();
    },
  );
  return svc;
}

describe('MigrationService', () => {
  it('migrates schema and data with matching row counts', async () => {
    svc = makeService();
    const result = await svc!.migrate();
    expect(result.success).toBe(true);
    expect(result.tablesProcessed).toBe(1);
    expect(events[events.length - 1].phase).toBe('complete');
    expect(configService.load().activeEngine).toBe('sqlite');
  });

  it('reports an error and rolls back when verification mismatches', async () => {
    target.ignoreWrites = true;
    svc = makeService();
    const result = await svc!.migrate();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Mismatch app_data');
    expect(events.some((e) => e.phase === 'error')).toBe(true);
    expect(configService.load().activeEngine).toBe('sqlite');
  });

  it('cancels the migration mid-flight', async () => {
    svc = makeService(true);
    const result = await svc!.migrate();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cancelled');
    expect(events.some((e) => e.phase === 'cancelled')).toBe(true);
  });

  it('copies an empty table without error', async () => {
    source.exec('CREATE TABLE empty_log (id INTEGER PRIMARY KEY, msg TEXT)');
    svc = makeService();
    const result = await svc!.migrate();
    expect(result.success).toBe(true);
    expect(result.tablesProcessed).toBe(2);
  });
});
