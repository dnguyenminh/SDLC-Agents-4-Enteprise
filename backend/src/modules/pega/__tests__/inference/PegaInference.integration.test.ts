import { describe, it, expect, beforeEach } from 'vitest';
import { PegaSchemaInferrer, PegaFieldDocumentor } from '../../inference/index.js';
import { PegaMetaModelRegistry, PegaMetaModelCompiler } from '../../metamodel/index.js';
import { MOCK_ACTIVITY_JSON, MOCK_DATA_TRANSFORM_JSON, MOCK_DECISION_TABLE_JSON, MOCK_OPERATOR_DATA_JSON } from '../fixtures/pega-samples.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(__dirname, '../../schemas');

describe('Integration: Inference + Metamodel', () => {
  let inferrer: PegaSchemaInferrer;
  let registry: PegaMetaModelRegistry;

  beforeEach(async () => {
    inferrer = new PegaSchemaInferrer();
    registry = PegaMetaModelRegistry.getInstance();
    if (!registry.isKnownClass('@baseclass')) {
      await registry.initialize(schemasDir);
    }
  });

  it('infer → register → compile → parse → same fields', () => {
    const json: Record<string, unknown> = {
      pyLabel: 'Integration Test Rule',
      pyDescription: 'Testing inference',
    };
    const def = inferrer.ensureSchema('Rule-Obj-IntegTest', json, registry);

    const compiler = new PegaMetaModelCompiler(registry);
    const strategy = compiler.compileStrategy(def);

    const parseResult = strategy.parse({ ...json, pxObjClass: 'Rule-Obj-IntegTest', pyClassName: 'Work-Test' });
    expect(parseResult.symbol.ruleType).toBe('Rule-Obj-IntegTest');
    expect(parseResult.dependencies).toEqual([]);
  });

  it('LLM can see field descriptions from documentor', () => {
    const doc = new PegaFieldDocumentor(inferrer);
    const ctx = doc.generatePromptContext('Rule-Obj-Activity', MOCK_ACTIVITY_JSON, registry);
    expect(ctx).toContain('Name of the Activity rule to call');
    expect(ctx).toContain('Display label for the rule');
    expect(ctx).toContain('Ruleset name');
    expect(ctx).toContain('Applies to class name');
  });

  it('ensureSchema + compileStrategy + parse round-trip', () => {
    const json: Record<string, unknown> = {
      pyLabel: 'RoundTrip',
      pyDescription: 'Going full circle',
      steps: [
        { pxObjClass: 'Embedded-Step', pyStepNum: '1', pyMethod: 'Call' },
      ],
    };
    const def = inferrer.ensureSchema('Rule-Obj-RoundTrip', json, registry);

    expect(def.properties.some(p => p.name === 'pyLabel')).toBe(true);
    expect(def.children.some(c => c.name === 'steps')).toBe(true);

    const compiler = new PegaMetaModelCompiler(registry);
    const strategy = compiler.compileStrategy(def);

    const parseJson: Record<string, unknown> = {
      pxObjClass: 'Rule-Obj-RoundTrip',
      pyClassName: 'Work-RoundTrip',
      pyRuleName: 'TestRoundTrip',
      pyLabel: 'RoundTrip',
      steps: [
        { pxObjClass: 'Embedded-Step', pyStepNum: '1', pyMethod: 'Call' },
      ],
    };
    const result = strategy.parse(parseJson);
    expect(result.symbol.name).toBe('TestRoundTrip');
    expect(result.symbol.ruleType).toBe('Rule-Obj-RoundTrip');
  });

  it('inferred schema resolves inheritance properly via registry', () => {
    const json: Record<string, unknown> = { pyLabel: 'Child Rule' };
    const def = inferrer.ensureSchema('Rule-Obj-InheritChild', json, registry);
    expect(def.baseClass).toBe('Rule-Obj-');
    expect(registry.getParser(def.baseClass!)).toBeDefined();
    expect(registry.getParser('@baseclass')).toBeDefined();
  });

  it('inferred schema resolves Data-Custom to Data- when Data- exists', () => {
    const json: Record<string, unknown> = { pyLabel: 'Custom Data' };
    const def = inferrer.ensureSchema('Data-Custom-Product', json, registry);
    expect(def.baseClass).toBe('Data-');
    expect(registry.isKnownClass('Data-')).toBe(true);
  });

  it('inferred schema from operator data uses inferFromRule for correct properties', () => {
    const def = inferrer.inferFromRule('Data-Admin-Operator-ID', MOCK_OPERATOR_DATA_JSON);
    expect(def.properties.some(p => p.name === 'pyUserIdentifier')).toBe(true);
    expect(def.properties.some(p => p.name === 'pyUserName')).toBe(true);
    expect(def.properties.some(p => p.name === 'pyAccessGroup')).toBe(true);
  });

  it('inferred schema from decision table JSON uses inferFromRule for correct properties', () => {
    const def = inferrer.inferFromRule('Rule-Declare-DecisionTable', MOCK_DECISION_TABLE_JSON);
    expect(def.properties.some(p => p.name === 'pyPropertyEvaluated')).toBe(true);
    expect(def.properties.some(p => p.name === 'pyLabel')).toBe(true);
  });

  it('inferred schema from operator data with ensureSchema + unique class', () => {
    const def = inferrer.ensureSchema('Inferred-Data-Admin-Operator-ID', MOCK_OPERATOR_DATA_JSON, registry);
    expect(def.properties.some(p => p.name === 'pyUserIdentifier')).toBe(true);
    expect(def.properties.some(p => p.name === 'pyUserName')).toBe(true);
    expect(def.properties.some(p => p.name === 'pyAccessGroup')).toBe(true);
    expect(def.baseClass).toBe('@baseclass');
  });

  it('multiple inferSchema calls for different types produce different schemas', () => {
    const def1 = inferrer.ensureSchema('Rule-Obj-TypeA', { pyLabel: 'A' }, registry);
    const def2 = inferrer.ensureSchema('Rule-Obj-TypeB', { pyLabel: 'B' }, registry);
    expect(def1).not.toBe(def2);
    expect(def1.pxObjClass).toBe('Rule-Obj-TypeA');
    expect(def2.pxObjClass).toBe('Rule-Obj-TypeB');
  });

  it('compiled strategy from inferred schema matches correct type', () => {
    const json: Record<string, unknown> = { pyLabel: 'Test' };
    const def = inferrer.ensureSchema('Rule-Obj-MyCustom', json, registry);
    const compiler = new PegaMetaModelCompiler(registry);
    const strategy = compiler.compileStrategy(def);
    expect(strategy.supports('Rule-Obj-MyCustom')).toBe(true);
    expect(strategy.supports('Rule-Obj-MyCustomSub')).toBe(false);
  });
});

describe('Integration: Documentor Edge Cases', () => {
  let inferrer: PegaSchemaInferrer;
  let documentor: PegaFieldDocumentor;
  let registry: PegaMetaModelRegistry;

  beforeEach(async () => {
    inferrer = new PegaSchemaInferrer();
    documentor = new PegaFieldDocumentor(inferrer);
    registry = PegaMetaModelRegistry.getInstance();
    if (!registry.isKnownClass('@baseclass')) {
      await registry.initialize(schemasDir);
    }
  });

  it('generates prompt context with null values gracefully', () => {
    const json: Record<string, unknown> = {
      pyLabel: null,
      pyDescription: 'Has null label',
    };
    const ctx = documentor.generatePromptContext('Rule-Obj-NullTest', json, registry);
    expect(ctx).toContain('Rule Type: Rule-Obj-NullTest');
    expect(ctx).toContain('pyDescription');
  });
});
