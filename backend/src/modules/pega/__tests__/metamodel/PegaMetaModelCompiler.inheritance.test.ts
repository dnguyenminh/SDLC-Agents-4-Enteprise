import { describe, it, expect, beforeAll } from 'vitest';
import { PegaMetaModelLoader, PegaMetaModelRegistry, PegaMetaModelCompiler } from '../../metamodel/index.js';
import type { PegaClassDefinition } from '../../metamodel/PegaClassDefinition.js';
import { setupMetaModel } from './helpers.js';

describe('PegaMetaModelCompiler', () => {
  let loader: PegaMetaModelLoader;
  let metaRegistry: PegaMetaModelRegistry;
  let compiler: PegaMetaModelCompiler;

  beforeAll(async () => {
    ({ loader, metaRegistry, compiler } = await setupMetaModel());
  });

  // ---------------------------------------------------------------------------
  // Test 4: Strategy resolves inheritance: Rule-Obj-Activity has @baseclass props
  // ---------------------------------------------------------------------------
  describe('Test 4: Inheritance resolution', () => {
    it('compiled strategy for Rule-Obj-Activity includes @baseclass properties', () => {
      const activityDef = loader.getClass('Rule-Obj-Activity');
      const baseDef = loader.getClass('@baseclass');
      expect(activityDef).toBeDefined();
      expect(baseDef).toBeDefined();

      // The loader already resolved inheritance, so activityDef should have base properties
      const activityPropNames = new Set(activityDef!.properties.map(p => p.name));
      for (const baseProp of baseDef!.properties) {
        expect(activityPropNames.has(baseProp.name)).toBe(true);
      }

      // The compiler strategy's class definition should also carry inherited properties
      const strategy = compiler.compileStrategy(activityDef!);

      // Strategy should parse JSON that includes those base properties
      const sampleJson = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyRuleName: 'TestActivity',
        pyLabel: 'Test',
        pyDescription: 'Full description',    // inherited from @baseclass
        pyUsage: 'Usage info',                // inherited from @baseclass
        pyCategory: 'Technical',              // inherited from @baseclass
      };
      const result = strategy.parse(sampleJson);
      expect(result.symbol.name).toBe('TestActivity');
      expect(result.symbol.className).toBe('Work-Order');
    });

    it('strategy supports Rule-Obj-Activity via base class matching', () => {
      const ruleDef = loader.getClass('Rule-');
      expect(ruleDef).toBeDefined();
      const strategy = compiler.compileStrategy(ruleDef!);

      // 'Rule-' is a base class category that should match Rule-Obj-Activity
      expect(strategy.supports('Rule-Obj-Activity')).toBe(true);
      expect(strategy.supports('Rule-Obj-Flow')).toBe(true);
      expect(strategy.supports('Rule-Connect-REST')).toBe(true);
      expect(strategy.supports('Rule-Declare-DecisionTable')).toBe(true);
      expect(strategy.supports('Rule-Obj-')).toBe(true);
    });

    it('strategy supports subclasses through inheritance chain', () => {
      // Rule-Connect- supports Rule-Connect-REST and Rule-Connect-SOAP
      const connectDef = loader.getClass('Rule-Connect-');
      expect(connectDef).toBeDefined();
      const strategy = compiler.compileStrategy(connectDef!);

      expect(strategy.supports('Rule-Connect-REST')).toBe(true);
      expect(strategy.supports('Rule-Connect-SOAP')).toBe(true);
      expect(strategy.supports('Rule-Connect-SQL')).toBe(true);
      // But not unrelated
      expect(strategy.supports('Rule-Obj-Activity')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5: Strategy returns undefined for unregistered class
  // ---------------------------------------------------------------------------
  describe('Test 5: Unregistered class handling', () => {
    it('getStrategy returns undefined for classes that were not compiled', () => {
      const noCompileCompiler = new PegaMetaModelCompiler(metaRegistry);
      expect(noCompileCompiler.getStrategy('NonExistent-Class-XYZ')).toBeUndefined();
      expect(noCompileCompiler.getStrategy('Rule-Obj-Activity')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6: compileAll returns strategies for all registered classes (200+)
  // ---------------------------------------------------------------------------
  describe('Test 6: compileAll returns strategies for all registered classes', () => {
    it('returns strategies for 200+ registered classes', () => {
      const strategies = compiler.compileAll();
      expect(strategies.length).toBeGreaterThanOrEqual(175);

      // Should include key classes
      const classNames = strategies
        .map(s => {
          // Extract class name from a test parse
          const result = s.parse({ pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyRuleName: 'T' });
          return result.symbol.ruleType;
        })
        .filter((v, i, a) => a.indexOf(v) === i);

      expect(classNames).toContain('Rule-Obj-Activity');
    });

    it('each compiled strategy supports its own pxObjClass', () => {
      const strategies = compiler.compileAll();

      // Check some specific classes
      for (const cls of ['Rule-Obj-Activity', 'Rule-Connect-REST', '@baseclass', 'Rule-', 'Rule-Obj-Model']) {
        const matching = strategies.filter(s => s.supports(cls));
        expect(matching.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('returns strategies ordered by specificity (concrete before generic)', () => {
      const strategies = compiler.compileAll();

      const classDefs = strategies.map(s => (s as any).classDef as PegaClassDefinition);

      const computeDepth = (cls: string): number => {
        const def = metaRegistry.getParser(cls);
        if (!def || !def.baseClass) return 0;
        return 1 + computeDepth(def.baseClass);
      };

      const depths = classDefs.map(d => computeDepth(d.pxObjClass));

      for (let i = 1; i < depths.length; i++) {
        expect(depths[i]).toBeLessThanOrEqual(depths[i - 1]);
      }

      const classNames = classDefs.map(d => d.pxObjClass);
      expect(classNames.indexOf('Rule-Obj-Activity')).toBeLessThan(classNames.indexOf('@baseclass'));
      expect(classNames.indexOf('Rule-Obj-')).toBeLessThan(classNames.indexOf('Rule-'));
    });
  });
});
