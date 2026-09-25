import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { PegaSchemaInferrer, PegaSchemaKBService, PegaSchemaAutoLearner } from '../../inference/index.js';
import { PegaMetaModelRegistry, PegaMetaModelCompiler } from '../../metamodel/index.js';
import type { PegaClassDefinition } from '../../metamodel/PegaClassDefinition.js';
import type { PegaRuleKbSchema } from '../../strategies/KbDrivenPegaParserStrategy.js';
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

  // STC: KB-SVC-01 — toKbSchema converts PegaClassDefinition correctly
  it('toKbSchema converts PegaClassDefinition correctly', () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-Test',
      properties: [
        { name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false },
        { name: 'pyActivityName', type: 'ref', required: false, isSystem: false, isReference: true },
      ],
      children: [
        { name: 'steps', childType: 'Embedded-Step', arrayType: 'array' },
      ],
      description: 'A test rule type',
      label: 'Test Rule',
    };

    const kb = kbService.toKbSchema(def);
    expect(kb.targetClass).toBe('Rule-Obj-Test');
    expect(kb.displayName).toBe('Test Rule');
    expect(kb.description).toBe('A test rule type');
    expect(kb.nameProperty).toBe('pyLabel');
    expect(kb.keyFields).toContain('pyLabel');
    expect(kb.keyFields).toContain('pyActivityName');
    expect(kb.contextFields).toContain('steps');
    expect(kb.dependencyPaths).toContain('pyActivityName');
    expect(kb.dependencyPaths).not.toContain('pyLabel');
    expect(kb.semantics?.baseClass).toBeUndefined();
  });

  // STC: KB-SVC-02 — fromKbSchema converts PegaRuleKbSchema correctly
  it('fromKbSchema converts PegaRuleKbSchema correctly', () => {
    const kb: PegaRuleKbSchema = {
      targetClass: 'Rule-Obj-Test',
      displayName: 'Test Rule',
      description: 'A test rule type',
      nameProperty: 'pyLabel',
      keyFields: ['pyLabel', 'pyActivityName'],
      contextFields: ['steps'],
      dependencyPaths: ['pyActivityName'],
      semantics: {
        baseClass: 'Rule-Obj-',
        properties: [
          { name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false },
          { name: 'pyActivityName', type: 'ref', required: false, isSystem: false, isReference: true },
        ],
        children: [
          { name: 'steps', childType: 'Embedded-Step', arrayType: 'array' },
        ],
      },
    };

    const def = kbService.fromKbSchema(kb);
    expect(def.pxObjClass).toBe('Rule-Obj-Test');
    expect(def.label).toBe('Test Rule');
    expect(def.description).toBe('A test rule type');
    expect(def.baseClass).toBe('Rule-Obj-');
    expect(def.properties).toHaveLength(2);
    expect(def.children).toHaveLength(1);
  });

  // STC: KB-SVC-03 — Round-trip: PegaClassDef -> toKbSchema -> fromKbSchema -> same fields
  it('round-trip PegaClassDef -> toKbSchema -> fromKbSchema preserves fields', () => {
    const original: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-RoundTrip',
      baseClass: 'Rule-Obj-',
      properties: [
        { name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false },
        { name: 'pyActivityName', type: 'ref', required: false, isSystem: false, isReference: true },
        { name: 'pxCreateDateTime', type: 'string', required: false, isSystem: true, isReference: false },
      ],
      children: [
        { name: 'steps', childType: 'Embedded-Step', arrayType: 'array', description: 'Activity steps' },
      ],
      description: 'Round trip test',
      label: 'Round Trip',
    };

    const kb = kbService.toKbSchema(original);
    const restored = kbService.fromKbSchema(kb);

    expect(restored.pxObjClass).toBe(original.pxObjClass);
    expect(restored.baseClass).toBe(original.baseClass);
    expect(restored.description).toBe(original.description);
    expect(restored.label).toBe(original.label);
    expect(restored.properties).toHaveLength(original.properties.length);
    expect(restored.children).toHaveLength(original.children.length);
    expect(restored.properties[0].name).toBe(original.properties[0].name);
    expect(restored.properties[1].isReference).toBe(true);
  });

  // STC: KB-SVC-04 — saveSchemaToKB inserts into knowledge_entries
  it('saveSchemaToKB inserts into knowledge_entries', async () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-SaveTest',
      properties: [{ name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false }],
      children: [],
    };

    await kbService.saveSchemaToKB(def);

    const row = adapter.prepare("SELECT * FROM knowledge_entries WHERE type = 'PEGA_SCHEMA'").get() as any;
    expect(row).toBeDefined();
    expect(row.source).toBe('pega-schema:Rule-Obj-SaveTest');
    expect(row.tier).toBe('SEMANTIC');
    expect(row.scope).toBe('SHARED');
    expect(row.tags).toBe('pega,schema');

    const content = JSON.parse(row.content) as PegaRuleKbSchema;
    expect(content.targetClass).toBe('Rule-Obj-SaveTest');
  });

  // STC: KB-SVC-05 — saveSchemaToKB is idempotent (second call does not duplicate)
  it('saveSchemaToKB is idempotent', async () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-Idempotent',
      properties: [{ name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false }],
      children: [],
    };

    await kbService.saveSchemaToKB(def);
    await kbService.saveSchemaToKB(def);

    const rows = adapter.prepare("SELECT * FROM knowledge_entries WHERE type = 'PEGA_SCHEMA' AND source = 'pega-schema:Rule-Obj-Idempotent'").all();
    expect(rows).toHaveLength(1);
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

  // STC: KB-SVC-13 — Integration: save -> restart (new registry) -> load -> compile -> parse
  it('save -> new registry -> load -> compile -> parse round-trip', async () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-IntegCycle',
      baseClass: 'Rule-Obj-',
      properties: [
        { name: 'pyLabel', type: 'string', required: false, isSystem: false, isReference: false },
        { name: 'pyActivityName', type: 'ref', required: false, isSystem: false, isReference: true },
      ],
      children: [],
      description: 'Integration cycle test',
    };
    await kbService.saveSchemaToKB(def);

    const freshRegistry = PegaMetaModelRegistry.getInstance();
    const freshKbService = new PegaSchemaKBService(adapter, freshRegistry, inferrer);
    await freshKbService.loadSchemasFromKB();

    const compiler = new PegaMetaModelCompiler(freshRegistry);
    const strategy = compiler.compileStrategy(
      freshRegistry.getParser('Rule-Obj-IntegCycle')!,
    );

    const result = strategy.parse({
      pxObjClass: 'Rule-Obj-IntegCycle',
      pyClassName: 'Work-Test',
      pyRuleName: 'CycleTest',
      pyLabel: 'Cycle',
      pyActivityName: 'DoSomething',
    });

    expect(result.symbol.ruleType).toBe('Rule-Obj-IntegCycle');
    expect(result.symbol.name).toBe('CycleTest');
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].ruleName).toBe('DoSomething');
  });

  // STC: KB-SVC-14 — Unknown pxObjClass with no JSON fields handled gracefully
  it('handles unknown pxObjClass with no JSON fields gracefully', () => {
    const def = inferrer.inferFromRule('Something-Unique-Unknown', {});
    expect(def.pxObjClass).toBe('Something-Unique-Unknown');
    expect(def.properties).toEqual([]);
    expect(def.children).toEqual([]);
  });

  // STC: KB-SVC-15 — toKbSchema with empty properties
  it('toKbSchema with empty properties', () => {
    const def: PegaClassDefinition = {
      pxObjClass: 'Rule-Obj-EmptyProps',
      properties: [],
      children: [],
    };

    const kb = kbService.toKbSchema(def);
    expect(kb.targetClass).toBe('Rule-Obj-EmptyProps');
    expect(kb.nameProperty).toBeUndefined();
    expect(kb.keyFields).toEqual([]);
    expect(kb.dependencyPaths).toEqual([]);
  });

  // STC: KB-SVC-16 — fromKbSchema with minimal fields
  it('fromKbSchema with minimal fields', () => {
    const kb: PegaRuleKbSchema = {
      targetClass: 'Rule-Obj-Minimal',
      dependencyPaths: [],
    };

    const def = kbService.fromKbSchema(kb);
    expect(def.pxObjClass).toBe('Rule-Obj-Minimal');
    expect(def.properties).toEqual([]);
    expect(def.children).toEqual([]);
  });

  // STC: KB-SVC-17 — Integration: learnSchema for Rule-Obj-NewType persists -> loadSchemasFromKB finds it
  it('learnSchema for new type persists and is found by loadSchemasFromKB', async () => {
    const json = { pyLabel: 'Brand New Type', pyDescription: 'Just created' };

    await kbService.learnSchema('Rule-Obj-NewType', json);

    const freshRegistry = PegaMetaModelRegistry.getInstance();
    const freshKbService = new PegaSchemaKBService(adapter, freshRegistry, inferrer);
    const count = await freshKbService.loadSchemasFromKB();

    expect(count).toBeGreaterThanOrEqual(1);
    expect(freshRegistry.isKnownClass('Rule-Obj-NewType')).toBe(true);

    const loadedDef = freshRegistry.getParser('Rule-Obj-NewType')!;
    expect(loadedDef.pxObjClass).toBe('Rule-Obj-NewType');
    expect(loadedDef.properties.some(p => p.name === 'pyLabel')).toBe(true);
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
