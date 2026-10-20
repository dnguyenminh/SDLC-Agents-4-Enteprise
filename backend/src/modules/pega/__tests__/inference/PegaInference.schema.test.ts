import { describe, it, expect, beforeEach } from 'vitest';
import { PegaSchemaInferrer } from '../../inference/index.js';
import { PegaMetaModelRegistry } from '../../metamodel/index.js';
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

  describe('ensureSchema', () => {
    it('creates and registers when class unknown', () => {
      const freshRegistry = PegaMetaModelRegistry.getInstance();
      const json: Record<string, unknown> = {
        pyLabel: 'Test Rule',
        pyDescription: 'A test rule',
      };
      const def = inferrer.ensureSchema('Rule-Obj-TestUnknown', json, freshRegistry);
      expect(def.pxObjClass).toBe('Rule-Obj-TestUnknown');
      expect(freshRegistry.isKnownClass('Rule-Obj-TestUnknown')).toBe(true);
      const fetched = freshRegistry.getParser('Rule-Obj-TestUnknown');
      expect(fetched).toBeDefined();
      expect(fetched!.pxObjClass).toBe('Rule-Obj-TestUnknown');
    });

    it('returns existing when class known', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'Activity',
      };
      const first = inferrer.ensureSchema('Rule-Obj-TestKnown', json, registry);
      const second = inferrer.ensureSchema('Rule-Obj-TestKnown', json, registry);
      expect(second).toBe(first);
    });

    it('sets baseClass for newly inferred schemas', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'New Rule',
      };
      const def = inferrer.ensureSchema('Rule-Obj-NewThing', json, registry);
      expect(def.baseClass).toBeDefined();
      expect(def.baseClass!.startsWith('Rule-')).toBe(true);
    });

    it('returns pre-loaded schema for known class in registry', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'Extra Field Not In Schema',
      };
      const def = inferrer.ensureSchema('Rule-Obj-Activity', json, registry);
      expect(def.pxObjClass).toBe('Rule-Obj-Activity');
      expect(def.label).toBeDefined();
    });
  });

  describe('hasKnownSchema', () => {
    it('returns false for unknown type', () => {
      expect(inferrer.hasKnownSchema('Totally-Unregistered-Type', registry)).toBe(false);
    });

    it('returns true for known type after ensureSchema', () => {
      const json: Record<string, unknown> = { pyLabel: 'test' };
      inferrer.ensureSchema('Rule-Obj-CheckKnown', json, registry);
      expect(inferrer.hasKnownSchema('Rule-Obj-CheckKnown', registry)).toBe(true);
    });
  });

  describe('isReferenceField', () => {
    it('detects Name-suffix fields as reference', () => {
      expect(inferrer.isReferenceField('pyActivityName')).toBe(true);
      expect(inferrer.isReferenceField('pyModelName')).toBe(true);
      expect(inferrer.isReferenceField('pyRuleName')).toBe(true);
      expect(inferrer.isReferenceField('pyTransformName')).toBe(true);
    });

    it('detects Class-suffix fields as reference', () => {
      expect(inferrer.isReferenceField('pyClassName')).toBe(true);
      expect(inferrer.isReferenceField('pySuperClass')).toBe(true);
      expect(inferrer.isReferenceField('pyTargetClass')).toBe(true);
    });

    it('detects Profile-suffix fields as reference', () => {
      expect(inferrer.isReferenceField('pyAuthProfile')).toBe(true);
    });

    it('does not mark plain fields as reference', () => {
      expect(inferrer.isReferenceField('pyLabel')).toBe(false);
      expect(inferrer.isReferenceField('pyDescription')).toBe(false);
      expect(inferrer.isReferenceField('pyCount')).toBe(false);
    });
  });
});
