import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseManager } from '../../../engine/db/database-manager.js';
import { MemoryEngine } from '../engine/index.js';
import { MemoryToolDispatcher } from '../dispatchers/index.js';
import { QueryLayer } from '../../../engine/query/query-layer.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';

describe('MemoryToolDispatcher sync_code & live status', () => {
  let tmpDir: string;
  let dbPath: string;
  let dbManager: DatabaseManager;
  let engine: MemoryEngine;
  let queryLayer: QueryLayer;
  let dispatcher: MemoryToolDispatcher;

  beforeEach(() => {
    (DatabaseManager as any).sharedDb = null;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksa-mem-test-'));
    dbPath = path.join(tmpDir, 'index.db');
    dbManager = new DatabaseManager(dbPath);
    dbManager.initialize();

    engine = new MemoryEngine(new SqliteDbAdapter(dbManager.getDb()));
    queryLayer = new QueryLayer(new SqliteDbAdapter(dbManager.getDb()));
    dispatcher = new MemoryToolDispatcher(engine, tmpDir, queryLayer);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports correct live counts in status action', async () => {
    const statusBefore = await dispatcher.dispatch('mem_status', {});
    expect(statusBefore).toBe('Entries: 0 | Edges: 0');

    // Insert an entry manually
    engine.insert({
      content: 'test content',
      summary: 'test summary',
      type: 'CONTEXT',
      tier: 'WORKING',
    });

    const statusAfter = await dispatcher.dispatch('mem_status', {});
    expect(statusAfter).toBe('Entries: 1 | Edges: 0');
  });

  it('performs sync_code and creates cross-references', async () => {
    const db = dbManager.getDb();
    
    // 1. Seed files and symbols in database (SA4E-41: stamped with a tenant)
    const PID = 'test-proj-01';
    db.prepare("INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes) VALUES (?, 'C:/projects/kiro/src/index.ts', 'src/index.ts', 'typescript', 'hash123', 100)").run(PID);
    const fileId = (db.prepare("SELECT id FROM files WHERE relative_path = 'src/index.ts'").get() as any).id;
    
    db.prepare(`
      INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, visibility) 
      VALUES (?, ?, 'MyClass', 'class', 'class MyClass {}', 10, 20, 'public')
    `).run(PID, fileId);

    // 2. Seed a document in knowledge entries referencing the class name
    engine.insert({
      content: 'Documentation for MyClass, which implements some feature.',
      summary: 'MyClass Doc',
      type: 'REQUIREMENT',
      tier: 'SEMANTIC',
    });

    // 3. Dispatch sync_code (SA4E-41: tenant scope via injected __projectId)
    const syncRes = await dispatcher.dispatch('mem_sync_code', { __projectId: PID });
    expect(syncRes).toContain('Synced: 1 code symbols, 1 cross-reference edges');

    // 4. Verify counts
    const statusRes = await dispatcher.dispatch('mem_status', {});
    expect(statusRes).toBe('Entries: 2 | Edges: 1');

    // 5. Verify the code entity was inserted with type CODE_ENTITY
    const entries = await engine.findFiltered(undefined, 'CODE_ENTITY');
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe('class: MyClass (src/index.ts)');
    expect(entries[0].content).toContain('class MyClass');
  });
});
