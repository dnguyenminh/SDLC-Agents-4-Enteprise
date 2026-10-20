import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { PegaSchemaInferrer, PegaSchemaKBService } from '../../inference/index.js';
import { PegaMetaModelRegistry } from '../../metamodel/index.js';
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
});
