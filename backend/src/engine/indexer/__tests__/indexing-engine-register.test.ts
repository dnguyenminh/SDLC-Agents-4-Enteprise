/**
 * Regression tests for the EMPTY project_registry root cause.
 *
 * Bug: registration ran ONLY at the very end of runFullIndex(), so any run
 * killed mid-flight (tsx watch restart on source change, crash, abort
 * early-return) never wrote the row — while files/symbols had already been
 * persisted. Fix: register BEFORE scanning + await the (previously
 * fire-and-forget) registration, keeping it non-fatal.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  adapterFromSqlite,
  makeSqliteTestDb,
  type SqliteTestDb,
} from '../../../database/__tests__/sqlite-test-adapter.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { IndexingEngine } from '../indexing-engine.js';
import type { AppConfig } from '../../config.js';

const REGISTRY_SCHEMA = `
CREATE TABLE project_registry (
  project_id     TEXT PRIMARY KEY,
  display_name   TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  last_seen      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     TEXT NOT NULL DEFAULT ''
);
`;

let db: SqliteTestDb;
let adapter: DatabaseAdapter;
let tmpDir: string;
let config: AppConfig;

beforeEach(async () => {
  db = await makeSqliteTestDb();
  adapter = adapterFromSqlite(db.adapter);
  adapter.exec(REGISTRY_SCHEMA);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexer-register-'));
  config = {
    port: 0,
    host: '127.0.0.1',
    onnxModelPath: '',
    logLevel: 'info' as const,
    projectId: 'reg-test',
    dataDir: tmpDir,
    sqliteDbPath: path.join(tmpDir, 'index.db'),
    orchestrationConfigPath: path.join(tmpDir, 'orchestration.json'),
    workspace: tmpDir,
    indexTempDir: path.join(tmpDir, 'CodeIntel'),
    viewerPort: 0,
    dbPath: path.join(tmpDir, 'index.db'),
    configPath: path.join(tmpDir, 'config.json'),
    watchEnabled: false,
    watchDebounceMs: 500,
    ollamaUrl: null,
    ollamaModel: 'nomic-embed-text',
    excludePatterns: ['node_modules', '.git', '.code-intel'],
    includeExtensions: ['.ts', '.tsx', '.js', '.py'],
    maxFileSize: 512_000,
    sandbox: {} as AppConfig['sandbox'],
    entra: { ssoEnabled: false, config: null },
  };
});

afterEach(async () => {
  await db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('IndexingEngine — project_registry registration (root-cause regression)', () => {
  it('registers the project even when the run is aborted before indexing', async () => {
    const engine = new IndexingEngine(adapter, config);
    const ac = new AbortController();
    ac.abort(); // simulates a mid-run kill/cancel right after start
    await engine.runFullIndex(undefined, ac.signal);

    const row = adapter.get<{ project_id: string; workspace_path: string; display_name: string }>(
      'SELECT project_id, workspace_path, display_name FROM project_registry WHERE project_id = ?',
      ['reg-test'],
    );
    expect(row, 'project_registry row must exist even for an aborted run').toBeTruthy();
    expect(row!.workspace_path).toBe(tmpDir);
    expect(row!.display_name).toBe(path.basename(tmpDir));
    engine.stop();
  });

  it('honors an explicit displayName (X-Workspace-Root) for display_name', async () => {
    const engine = new IndexingEngine(adapter, config);
    const ac = new AbortController();
    ac.abort();
    await engine.runFullIndex(
      { projectId: 'reg-test', workspace: path.join(tmpDir, 'scan'), displayName: 'MyRealWorkspace' },
      ac.signal,
    );

    const row = adapter.get<{ display_name: string; workspace_path: string }>(
      'SELECT display_name, workspace_path FROM project_registry WHERE project_id = ?',
      ['reg-test'],
    );
    expect(row?.display_name).toBe('MyRealWorkspace');
    expect(row?.workspace_path).toBe(path.join(tmpDir, 'scan'));
    engine.stop();
  });

  it('stays non-fatal when project_registry is missing (awaited catch, no throw)', async () => {
    adapter.exec('DROP TABLE project_registry');
    const engine = new IndexingEngine(adapter, config);
    const ac = new AbortController();
    ac.abort();
    // Old fire-and-forget code could not surface DB errors at all; the awaited
    // version must swallow them inside registerWorkspace instead of rejecting.
    await expect(engine.runFullIndex(undefined, ac.signal)).resolves.toBeUndefined();
    engine.stop();
  });
});
