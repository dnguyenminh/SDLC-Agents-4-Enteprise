import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { PegaSchemaInferrer, PegaSchemaKBService } from '../../inference/index.js';
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
});
