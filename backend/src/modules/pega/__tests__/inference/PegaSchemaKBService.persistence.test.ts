import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { PegaSchemaInferrer, PegaSchemaKBService } from '../../inference/index.js';
import { PegaMetaModelRegistry } from '../../metamodel/index.js';
import type { PegaClassDefinition } from '../../metamodel/PegaClassDefinition.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(__dirname, '../../schemas');

describe('PegaSchemaKBService', () => {
  let adapter: SqliteAdapter;
  let inferrer: PegaSchemaInferrer;
  let registry: PegaMetaModelRegistry;
  let kbService: PegaSchemaKBService;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        summary TEXT NOT NULL,
        type TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'WORKING',
        scope TEXT NOT NULL DEFAULT 'USER',
        project_id TEXT DEFAULT NULL,
        source TEXT,
        tags TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    inferrer = new PegaSchemaInferrer();
    registry = PegaMetaModelRegistry.getInstance();
    if (!registry.isKnownClass('@baseclass')) {
      await registry.initialize(schemasDir);
    }
    kbService = new PegaSchemaKBService(adapter, registry, inferrer);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  // STC: KB-SVC-18 — Proper source key format: pega-schema:{pxObjClass}
  it('source key format is pega-schema:{pxObjClass}', async () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-SourceKeyTest',
      properties: [{ name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false }],
      children: [],
    };

    await kbService.saveSchemaToKB(def);

    const row = adapter.prepare("SELECT source FROM knowledge_entries WHERE type = 'PEGA_SCHEMA'").get() as any;
    expect(row.source).toBe('pega-schema:Rule-Obj-SourceKeyTest');
  });

  // STC: KB-SVC-19 — Multiple learnSchema calls for different types all persist
  it('multiple learnSchema calls for different types all persist', async () => {
    await kbService.learnSchema('Rule-Obj-TypeAlpha', { pyLabel: 'Alpha' });
    await kbService.learnSchema('Rule-Obj-TypeBeta', { pyLabel: 'Beta' });
    await kbService.learnSchema('Rule-Obj-TypeGamma', { pyLabel: 'Gamma' });

    const rows = adapter.prepare("SELECT source FROM knowledge_entries WHERE type = 'PEGA_SCHEMA'").all() as any[];
    const sources = rows.map(r => r.source).sort();
    expect(sources).toEqual([
      'pega-schema:Rule-Obj-TypeAlpha',
      'pega-schema:Rule-Obj-TypeBeta',
      'pega-schema:Rule-Obj-TypeGamma',
    ]);
  });

  // STC: KB-SVC-20 — Error handling: corrupted KB entry skipped gracefully
  it('corrupted KB entry skipped gracefully during load', async () => {
    adapter.prepare(`
      INSERT INTO knowledge_entries (content, summary, type, tier, scope, source, tags)
      VALUES ('{invalid json}', 'bad entry', 'PEGA_SCHEMA', 'SEMANTIC', 'SHARED', 'pega-schema:BadEntry', 'pega,schema')
    `).run();

    adapter.prepare(`
      INSERT INTO knowledge_entries (content, summary, type, tier, scope, source, tags)
      VALUES ('{"targetClass":"Rule-Obj-Good","dependencyPaths":[]}', 'good entry', 'PEGA_SCHEMA', 'SEMANTIC', 'SHARED', 'pega-schema:GoodEntry', 'pega,schema')
    `).run();

    const freshRegistry = PegaMetaModelRegistry.getInstance();
    const freshKbService = new PegaSchemaKBService(adapter, freshRegistry, inferrer);

    const count = await freshKbService.loadSchemasFromKB();
    expect(count).toBe(1);
    expect(freshRegistry.isKnownClass('Rule-Obj-Good')).toBe(true);
    expect(freshRegistry.isKnownClass('BadEntry')).toBe(false);
  });

  describe('ensureSchemaAsync callback', () => {
    it('onSchemaInferred callback fires after ensureSchemaAsync', async () => {
      let called = false;
      let capturedDef: PegaClassDefinition | null = null;
      let capturedJson: Record<string, unknown> | null = null;

      const cbInferrer = new PegaSchemaInferrer();
      cbInferrer.onSchemaInferred = (def, json) => {
        called = true;
        capturedDef = def;
        capturedJson = json;
      };

      const json = { pyLabel: 'Callback Test' };
      const def = await cbInferrer.ensureSchemaAsync('Rule-Obj-CallbackTest', json, registry);

      expect(called).toBe(true);
      expect(capturedDef).toBe(def);
      expect(capturedJson).toBe(json);
    });

    it('async onSchemaInferred callback is awaited', async () => {
      const order: string[] = [];

      const cbInferrer = new PegaSchemaInferrer();
      cbInferrer.onSchemaInferred = async (_def, _json) => {
        await new Promise(r => setTimeout(r, 10));
        order.push('callback');
      };

      const json = { pyLabel: 'Async Test' };
      await cbInferrer.ensureSchemaAsync('Rule-Obj-AsyncCallback', json, registry);
      order.push('after');

      expect(order).toEqual(['callback', 'after']);
    });

    it('sync ensureSchema still works for backward compat', () => {
      const json = { pyLabel: 'Sync Compat' };
      const def = inferrer.ensureSchema('Rule-Obj-SyncCompat', json, registry);
      expect(def.pxObjClass).toBe('Rule-Obj-SyncCompat');
      expect(registry.isKnownClass('Rule-Obj-SyncCompat')).toBe(true);
    });

    it('learnSchema works with async inferrer callback via service', async () => {
      const cbInferrer = new PegaSchemaInferrer();
      cbInferrer.onSchemaInferred = () => {};

      const freshRegistry = PegaMetaModelRegistry.getInstance();
      const freshKbService = new PegaSchemaKBService(adapter, freshRegistry, cbInferrer);

      const json = { pyLabel: 'Service Callback' };
      const def = await freshKbService.learnSchema('Rule-Obj-ServiceCallback', json);

      expect(def.pxObjClass).toBe('Rule-Obj-ServiceCallback');
    });
  });
});
