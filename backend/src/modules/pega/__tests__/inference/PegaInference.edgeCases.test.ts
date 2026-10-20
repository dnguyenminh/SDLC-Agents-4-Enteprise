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

  describe('handle edge cases', () => {
    it('handles empty JSON gracefully', () => {
      const def = inferrer.inferFromRule('Rule-Obj-Empty', {});
      expect(def.pxObjClass).toBe('Rule-Obj-Empty');
      expect(def.properties).toEqual([]);
      expect(def.children).toEqual([]);
    });

    it('handles malformed JSON (null values)', () => {
      const json: Record<string, unknown> = {
        pyLabel: null,
        pyCount: null,
        pyActive: null,
      };
      const props = inferrer.inferProperties(json);
      expect(props.length).toBeGreaterThanOrEqual(0);
    });

    it('handles deeply nested JSON (objects as values → skip)', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'test',
        nestedObject: { innerKey: 'value', deeper: { a: 1 } },
        anotherProp: 'keep me',
      };
      const props = inferrer.inferProperties(json);
      const nested = props.find(p => p.name === 'nestedObject');
      expect(nested).toBeUndefined();
      expect(props.find(p => p.name === 'anotherProp')).toBeDefined();
    });

    it('marks system fields with pxCreate* and pxUpdate* prefixes as isSystem', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'test',
        pxCreateDateTime: '2026-07-27T10:00:00Z',
        pxUpdateOperator: 'user@test.com',
      };
      const props = inferrer.inferProperties(json);
      const createTime = props.find(p => p.name === 'pxCreateDateTime');
      const updateOp = props.find(p => p.name === 'pxUpdateOperator');
      expect(createTime).toBeDefined();
      expect(createTime!.isSystem).toBe(true);
      expect(updateOp).toBeDefined();
      expect(updateOp!.isSystem).toBe(true);
      expect(props.find(p => p.name === 'pyLabel')).toBeDefined();
    });

    it('marks system fields with pz* prefix as isSystem', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'test',
        pzChecksum: 'abc123',
        pzIndex: '0',
      };
      const props = inferrer.inferProperties(json);
      const checksum = props.find(p => p.name === 'pzChecksum');
      const index = props.find(p => p.name === 'pzIndex');
      expect(checksum).toBeDefined();
      expect(checksum!.isSystem).toBe(true);
      expect(index).toBeDefined();
      expect(index!.isSystem).toBe(true);
    });

    it('skips pxObjClass, pyClassName, pyRuleName in properties', () => {
      const json: Record<string, unknown> = {
        pxObjClass: 'Rule-Obj-Test',
        pyClassName: 'Work-Test',
        pyRuleName: 'MyRule',
        pyLabel: 'visible',
      };
      const props = inferrer.inferProperties(json);
      expect(props.find(p => p.name === 'pxObjClass')).toBeUndefined();
      expect(props.find(p => p.name === 'pyClassName')).toBeUndefined();
      expect(props.find(p => p.name === 'pyRuleName')).toBeUndefined();
      expect(props.find(p => p.name === 'pyLabel')).toBeDefined();
    });

    it('skips skipped arrays pxAllChangeList, pxWarnings', () => {
      const json: Record<string, unknown> = {
        pyLabel: 'test',
        pxAllChangeList: [],
        pxWarnings: [],
      };
      const children = inferrer.inferChildren(json);
      expect(children.find(c => c.name === 'pxAllChangeList')).toBeUndefined();
      expect(children.find(c => c.name === 'pxWarnings')).toBeUndefined();
    });
  });
});
