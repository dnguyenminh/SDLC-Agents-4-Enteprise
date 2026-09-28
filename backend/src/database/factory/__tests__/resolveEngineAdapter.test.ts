/**
 * Unit tests for resolveEngineAdapter — sqlite path, non-sqlite factory path,
 * config-corruption fallback and failed-connect fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveEngineAdapter } from '../resolveEngineAdapter.js';
import { SqliteWasmAdapter } from '../../adapters/wasm/SqliteWasmAdapter.js';
import { DatabaseAdapterFactory } from '../DatabaseAdapterFactory.js';

vi.mock('../DatabaseAdapterFactory.js', () => ({
  DatabaseAdapterFactory: { create: vi.fn() },
}));

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-adapter-'));
  vi.clearAllMocks();
});

afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function writeConfig(cfg: unknown): void {
  fs.writeFileSync(path.join(dataDir, 'database.json'), JSON.stringify(cfg), 'utf-8');
}

function sqliteConfig(): Record<string, unknown> {
  return {
    activeEngine: 'sqlite',
    engines: { sqlite: { dbPath: 'index.db' } },
    migration: { lastMigration: null, backupSqlitePaths: [] },
  };
}

function postgresConfig(): Record<string, unknown> {
  return {
    activeEngine: 'postgresql',
    engines: {
      sqlite: { dbPath: 'index.db' },
      postgresql: { host: 'h', port: 5432, username: 'u', password: '', database: 'd', ssl: false, pool: { min: 1, max: 2 } },
    },
    migration: { lastMigration: null, backupSqlitePaths: [] },
  };
}

describe('resolveEngineAdapter', () => {
  it('returns a connected SqliteAdapter for the sqlite engine', async () => {
    writeConfig(sqliteConfig());
    const adapter = await resolveEngineAdapter(dataDir, ':memory:');
    expect(adapter).toBeInstanceOf(SqliteWasmAdapter);
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getEngine()).toBe('sqlite');
    await adapter.disconnect();
  });

  it('falls back to SqliteAdapter when the config file is corrupt', async () => {
    fs.writeFileSync(path.join(dataDir, 'database.json'), '{invalid json', 'utf-8');
    const adapter = await resolveEngineAdapter(dataDir, ':memory:');
    expect(adapter).toBeInstanceOf(SqliteWasmAdapter);
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
  });

  it('uses the factory adapter for non-sqlite engines', async () => {
    writeConfig(postgresConfig());
    const fake = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getEngine: () => 'postgresql',
    };
    vi.mocked(DatabaseAdapterFactory.create).mockReturnValue(fake as never);
    const adapter = await resolveEngineAdapter(dataDir, ':memory:');
    expect(DatabaseAdapterFactory.create).toHaveBeenCalled();
    expect(adapter).toBe(fake);
  });

  it('falls back to SqliteAdapter when the target connect fails', async () => {
    writeConfig(postgresConfig());
    vi.mocked(DatabaseAdapterFactory.create).mockReturnValue({
      connect: vi.fn().mockRejectedValue(new Error('connection refused')),
      getEngine: () => 'postgresql',
    } as never);
    const adapter = await resolveEngineAdapter(dataDir, ':memory:');
    expect(adapter).toBeInstanceOf(SqliteWasmAdapter);
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
  });
});