import { describe, it, expect } from 'vitest';
import { PegaMetaModelLoader } from '../../metamodel/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(__dirname, '../../schemas');

describe('PegaMetaModelLoader', () => {
  describe('loadSchemaDirectory', () => {
    it('loads schema directory and returns non-empty registry', async () => {
      const loader = new PegaMetaModelLoader();
      const registry = await loader.loadSchemaDirectory(schemasDir);
      expect(registry.size).toBeGreaterThanOrEqual(20);
    });

    it('loads more than 100 classes including base classes', async () => {
      const loader = new PegaMetaModelLoader();
      const registry = await loader.loadSchemaDirectory(schemasDir);
      expect(registry.size).toBeGreaterThan(100);
    });
  });

  describe('Rule-Obj-Activity class definition', () => {
    it('loads with correct pxObjClass', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const def = loader.getClass('Rule-Obj-Activity');
      expect(def).toBeDefined();
      expect(def!.pxObjClass).toBe('Rule-Obj-Activity');
    });

    it('has properties including label and description', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const def = loader.getClass('Rule-Obj-Activity');
      expect(def).toBeDefined();
      const propNames = def!.properties.map(p => p.name);
      expect(propNames).toContain('pyLabel');
      expect(propNames).toContain('pyDescription');
      expect(propNames).toContain('pyClassName');
    });

    it('has correct baseClass', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const def = loader.getClass('Rule-Obj-Activity');
      expect(def).toBeDefined();
      expect(def!.baseClass).toBe('Rule-Obj-');
    });

    it('has children definitions', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const def = loader.getClass('Rule-Obj-Activity');
      expect(def).toBeDefined();
      expect(def!.children.length).toBeGreaterThanOrEqual(1);
      const childNames = def!.children.map(c => c.name);
      expect(childNames).toContain('pyKeyDefList');
    });
  });

  describe('inheritance resolution', () => {
    it('resolves Rule-Obj-Activity inheriting from Rule-Obj-', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const activityDef = loader.getClass('Rule-Obj-Activity');
      const objDef = loader.getClass('Rule-Obj-');
      expect(activityDef).toBeDefined();
      expect(objDef).toBeDefined();
      const activityProps = new Set(activityDef!.properties.map(p => p.name));
      for (const parentProp of objDef!.properties) {
        expect(activityProps.has(parentProp.name)).toBe(true);
      }
    });

    it('resolves Rule-Obj- inheriting from Rule-', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const objDef = loader.getClass('Rule-Obj-');
      const ruleDef = loader.getClass('Rule-');
      expect(objDef).toBeDefined();
      expect(ruleDef).toBeDefined();
      const objProps = new Set(objDef!.properties.map(p => p.name));
      for (const parentProp of ruleDef!.properties) {
        expect(objProps.has(parentProp.name)).toBe(true);
      }
    });

    it('resolves Rule- inheriting from @baseclass', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const ruleDef = loader.getClass('Rule-');
      const baseDef = loader.getClass('@baseclass');
      expect(ruleDef).toBeDefined();
      expect(baseDef).toBeDefined();
      const ruleProps = new Set(ruleDef!.properties.map(p => p.name));
      for (const parentProp of baseDef!.properties) {
        expect(ruleProps.has(parentProp.name)).toBe(true);
      }
    });

    it('Rule-Obj-Activity indirectly inherits properties from @baseclass', async () => {
      const loader = new PegaMetaModelLoader();
      await loader.loadSchemaDirectory(schemasDir);
      const activityDef = loader.getClass('Rule-Obj-Activity');
      const baseDef = loader.getClass('@baseclass');
      expect(activityDef).toBeDefined();
      expect(baseDef).toBeDefined();
      const activityProps = new Set(activityDef!.properties.map(p => p.name));
      for (const parentProp of baseDef!.properties) {
        expect(activityProps.has(parentProp.name)).toBe(true);
      }
    });
  });
});
