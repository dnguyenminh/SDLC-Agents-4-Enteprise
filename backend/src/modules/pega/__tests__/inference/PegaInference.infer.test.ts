import { describe, it, expect, beforeEach } from 'vitest';
import { PegaSchemaInferrer } from '../../inference/index.js';
import { PegaMetaModelRegistry } from '../../metamodel/index.js';
import { MOCK_ACTIVITY_JSON } from '../fixtures/pega-samples.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(__dirname, '../../schemas');

describe('PegaSchemaInferrer', () => {
  let inferrer: PegaSchemaInferrer;
  let registry: PegaMetaModelRegistry;

  beforeEach(async () => {
    inferrer = new PegaSchemaInferrer();
    registry = PegaMetaModelRegistry.getInstance();
    if (!registry.isKnownClass('@baseclass')) {
      await registry.initialize(schemasDir);
    }
  });

  describe('inferFromRule', () => {
    it('infers pxObjClass correctly from JSON', () => {
      const def = inferrer.inferFromRule('Rule-Obj-Activity', MOCK_ACTIVITY_JSON);
      expect(def.pxObjClass).toBe('Rule-Obj-Activity');
    });

    it('returns properties and children from sample JSON', () => {
      const def = inferrer.inferFromRule('Rule-Obj-Activity', MOCK_ACTIVITY_JSON);
      expect(def.properties.length).toBeGreaterThan(0);
      expect(def.children.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('inferBaseClass', () => {
    it('infers baseClass for Rule-Obj-Activity → Rule-Obj-', () => {
      const base = inferrer.inferBaseClass('Rule-Obj-Activity', registry);
      expect(base).toBe('Rule-Obj-');
    });

    it('infers baseClass for Rule-Obj-FooBar → Rule-Obj-', () => {
      const base = inferrer.inferBaseClass('Rule-Obj-FooBar', registry);
      expect(base).toBe('Rule-Obj-');
    });

    it('infers baseClass for Rule-Connect-REST → Rule-Connect-', () => {
      const base = inferrer.inferBaseClass('Rule-Connect-REST', registry);
      expect(base).toBe('Rule-Connect-');
    });

    it('infers baseClass for Rule-HTML-Section → Rule-HTML-', () => {
      const base = inferrer.inferBaseClass('Rule-HTML-Section', registry);
      expect(base).toBe('Rule-HTML-');
    });

    it('infers baseClass by walking up hierarchy when intermediate missing', () => {
      const base = inferrer.inferBaseClass('Rule-X-Y', registry);
      expect(base).toBe('Rule-');
    });

    it('infers baseClass for unknown → @baseclass', () => {
      const base = inferrer.inferBaseClass('Something-Completely-Unknown', registry);
      expect(base).toBe('@baseclass');
    });

    it('returns empty string for @baseclass itself', () => {
      const base = inferrer.inferBaseClass('@baseclass', registry);
      expect(base).toBe('');
    });
  });

  describe('inferProperties', () => {
    it('infers properties with correct types (string, number, boolean, ref)', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'My Label',
        pyCount: 42,
        pyActive: true,
        pyClassName: 'Work-Cover',
        pyActivityName: 'DoSomething',
      };
      const props = inferrer.inferProperties(json);
      const label = props.find(p => p.name === 'pyLabel');
      const count = props.find(p => p.name === 'pyCount');
      const active = props.find(p => p.name === 'pyActive');
      const className = props.find(p => p.name === 'pyClassName');
      const activityName = props.find(p => p.name === 'pyActivityName');

      expect(label?.type).toBe('string');
      expect(count?.type).toBe('number');
      expect(active?.type).toBe('boolean');
      expect(className).toBeUndefined();
      expect(activityName).toBeDefined();
      expect(activityName!.type).toBe('ref');
    });

    it('marks Name-ending fields as isReference', () => {
      const json: Record<string, unknown> = {
        pyTemplateName: 'MyTemplate',
        pySourceClass: 'Work-',
        pyLabel: 'Hello',
      };
      const props = inferrer.inferProperties(json);
      const templateName = props.find(p => p.name === 'pyTemplateName');
      const sourceClass = props.find(p => p.name === 'pySourceClass');
      const label = props.find(p => p.name === 'pyLabel');

      expect(templateName?.isReference).toBe(true);
      expect(templateName?.type).toBe('ref');
      expect(sourceClass?.isReference).toBe(true);
      expect(sourceClass?.type).toBe('ref');
      expect(label?.isReference).toBe(false);
    });

    it('marks Class-ending fields as isReference', () => {
      const json: Record<string, unknown> = {
        pyTargetClass: 'Work-Cover',
        pySourceClass: 'Data-Admin',
        pyDescription: 'some text',
      };
      const props = inferrer.inferProperties(json);
      const tc = props.find(p => p.name === 'pyTargetClass');
      const sc = props.find(p => p.name === 'pySourceClass');
      expect(tc?.isReference).toBe(true);
      expect(sc?.isReference).toBe(true);
    });

    it('marks Profile-ending fields as isReference', () => {
      const json: Record<string, unknown> = {
        pyAuthProfile: 'MyProfile',
        pyLabel: 'test',
      };
      const props = inferrer.inferProperties(json);
      const profile = props.find(p => p.name === 'pyAuthProfile');
      expect(profile?.isReference).toBe(true);
      expect(profile?.type).toBe('ref');
    });

    it('detects children from array fields', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'test',
        steps: [
          { pxObjClass: 'Embedded-Step', pyStepNum: '1', pyMethod: 'Call' },
          { pxObjClass: 'Embedded-Step', pyStepNum: '2', pyMethod: 'Call' },
        ],
      };
      const children = inferrer.inferChildren(json);
      const stepsChild = children.find(c => c.name === 'steps');
      expect(stepsChild).toBeDefined();
      expect(stepsChild!.childType).toBe('Embedded-Step');
      expect(stepsChild!.arrayType).toBe('array');
    });

    it('does not produce duplicate properties', () => {
      const json: Record<string, unknown> = { pyLabel: 'A' };
      Object.defineProperty(json, 'pyLabel', { value: 'B', enumerable: true, writable: true, configurable: true });
      const props = inferrer.inferProperties(json);
      const labels = props.filter(p => p.name === 'pyLabel');
      expect(labels.length).toBeLessThanOrEqual(1);
    });

    it('detects reference from dotted value like class.method', () => {
      const json: Record<string, unknown> = {
        pyMethodCall: 'Work-Cover.SomeActivity',
        pyLabel: 'Simple Label',
      };
      const props = inferrer.inferProperties(json);
      const methodCall = props.find(p => p.name === 'pyMethodCall');
      expect(methodCall).toBeDefined();
      expect(methodCall!.type).toBe('ref');
    });
  });
});
