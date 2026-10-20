import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { PegaSchemaInferrer, PegaSchemaKBService, PegaSchemaAutoLearner } from '../../inference/index.js';
import { PegaMetaModelRegistry, PegaMetaModelCompiler } from '../../metamodel/index.js';
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

  // STC: KB-SVC-06 — loadSchemasFromKB returns 0 when no schemas exist
  it('loadSchemasFromKB returns 0 when no schemas exist', async () => {
    const count = await kbService.loadSchemasFromKB();
    expect(count).toBe(0);
  });

  // STC: KB-SVC-07 — loadSchemasFromKB loads schemas from KB into registry
  it('loadSchemasFromKB loads schemas from KB into registry', async () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-LoadTest',
      baseClass: 'Rule-Obj-',
      properties: [
        { name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false },
      ],
      children: [],
    };

    await kbService.saveSchemaToKB(def);

    const freshRegistry = PegaMetaModelRegistry.getInstance();
    const freshKbService = new PegaSchemaKBService(adapter, freshRegistry, inferrer);

    const count = await freshKbService.loadSchemasFromKB();
    expect(count).toBe(1);
    expect(freshRegistry.isKnownClass('Rule-Obj-LoadTest')).toBe(true);
  });

  // STC: KB-SVC-08 — learnSchema infers + persists + registers
  it('learnSchema infers + persists + registers', async () => {
    const json = { pyLabel: 'Test Rule', pyDescription: 'Inferred schema' };
    const def = await kbService.learnSchema('Rule-Obj-LearnTest', json);

    expect(def.pxObjClass).toBe('Rule-Obj-LearnTest');
    expect(def.properties.some(p => p.name === 'pyLabel')).toBe(true);

    expect(registry.isKnownClass('Rule-Obj-LearnTest')).toBe(true);

    const row = adapter.prepare("SELECT * FROM knowledge_entries WHERE source = 'pega-schema:Rule-Obj-LearnTest'").get() as any;
    expect(row).toBeDefined();
  });

  // STC: KB-SVC-09 — learnSchema returns existing when class already known
  it('learnSchema returns existing when class already known', async () => {
    const json1 = { pyLabel: 'First' };
    const json2 = { pyLabel: 'Second' };

    const def1 = await kbService.learnSchema('Rule-Obj-ExistingTest', json1);
    const def2 = await kbService.learnSchema('Rule-Obj-ExistingTest', json2);

    expect(def2).toBe(def1);
  });

  // STC: KB-SVC-10 — learnSchema does not re-persist for already-known classes
  it('learnSchema does not re-persist for already-known classes', async () => {
    const json = { pyLabel: 'Test' };

    await kbService.learnSchema('Rule-Obj-NoRePersist', json);
    await kbService.learnSchema('Rule-Obj-NoRePersist', json);

    const rows = adapter.prepare("SELECT * FROM knowledge_entries WHERE source = 'pega-schema:Rule-Obj-NoRePersist'").all();
    expect(rows).toHaveLength(1);
  });

  // STC: KB-SVC-11 — AutoLearner.learn returns a compiled strategy
  it('AutoLearner.learn returns a compiled strategy', async () => {
    const compiler = new PegaMetaModelCompiler(registry);
    const learner = new PegaSchemaAutoLearner(kbService, compiler);

    const json = { pyLabel: 'AutoLearner Rule', pyActivityName: 'DoSomething' };
    const strategy = await learner.learn('Rule-Obj-AutoLearner', json);

    expect(strategy.supports('Rule-Obj-AutoLearner')).toBe(true);
    expect(strategy.supports('Rule-Obj-Other')).toBe(false);

    const result = strategy.parse({
      pxObjClass: 'Rule-Obj-AutoLearner',
      pyClassName: 'Work-Test',
      pyRuleName: 'TestAuto',
      pyLabel: 'AutoLearner Rule',
      pyActivityName: 'DoSomething',
    });
    expect(result.symbol.ruleType).toBe('Rule-Obj-AutoLearner');
    expect(result.symbol.name).toBe('TestAuto');
  });

  // STC: KB-SVC-12 — AutoLearner.initialize loads + compiles all
  it('AutoLearner.initialize loads + compiles all', async () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-InitTest',
      properties: [{ name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false }],
      children: [],
    };
    await kbService.saveSchemaToKB(def);

    const freshRegistry = PegaMetaModelRegistry.getInstance();
    const freshKbService = new PegaSchemaKBService(adapter, freshRegistry, inferrer);
    const compiler = new PegaMetaModelCompiler(freshRegistry);
    const learner = new PegaSchemaAutoLearner(freshKbService, compiler);

    await learner.initialize();

    expect(freshRegistry.isKnownClass('Rule-Obj-InitTest')).toBe(true);
    const strategy = compiler.getStrategy('Rule-Obj-InitTest');
    expect(strategy).toBeDefined();
  });
});
