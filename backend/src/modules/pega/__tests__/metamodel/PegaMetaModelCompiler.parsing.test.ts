import { describe, it, expect, beforeAll } from 'vitest';
import { PegaMetaModelLoader, PegaMetaModelCompiler } from '../../metamodel/index.js';
import { setupMetaModel } from './helpers.js';

describe('PegaMetaModelCompiler', () => {
  let loader: PegaMetaModelLoader;
  let compiler: PegaMetaModelCompiler;

  beforeAll(async () => {
    ({ loader, compiler } = await setupMetaModel());
  });

  // ---------------------------------------------------------------------------
  // Test 9: Handles malformed JSON gracefully
  // ---------------------------------------------------------------------------
  describe('Test 9: Malformed JSON handling', () => {
    it('returns a result without throwing on empty object', () => {
      const activityDef = loader.getClass('Rule-Obj-Activity');
      expect(activityDef).toBeDefined();
      const strategy = compiler.compileStrategy(activityDef!);

      expect(() => strategy.parse({})).not.toThrow();
      const result = strategy.parse({});
      expect(result.symbol).toBeDefined();
      expect(result.symbol.ruleType).toBe('Rule-Obj-Activity');
      expect(result.symbol.name).toBe('Unnamed');
      expect(result.dependencies).toBeDefined();
    });

    it('returns a result without throwing on null-like values', () => {
      const activityDef = loader.getClass('Rule-Obj-Activity');
      expect(activityDef).toBeDefined();
      const strategy = compiler.compileStrategy(activityDef!);

      const weirdJson = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: null,
        pyRuleName: undefined,
        pyLabel: 42,
        steps: 'not-an-array',
        pyDescription: { nested: 'object' },
      };

      expect(() => strategy.parse(weirdJson as any)).not.toThrow();
      const result = strategy.parse(weirdJson as any);
      expect(result.symbol).toBeDefined();
      // pyLabel is 42 (not a string), so the extractName skips it and returns 'Unnamed'
      expect(result.symbol.className).toBe('@baseclass');
    });

    it('returns a result for partially missing required fields', () => {
      const connectDef = loader.getClass('Rule-Connect-REST');
      expect(connectDef).toBeDefined();
      const strategy = compiler.compileStrategy(connectDef!);

      const minimal = {
        pxObjClass: 'Rule-Connect-REST',
        pyRuleName: 'MinimalConnect',
      };

      const result = strategy.parse(minimal);
      expect(result.symbol.name).toBe('MinimalConnect');
      expect(result.symbol.ruleType).toBe('Rule-Connect-REST');
      expect(result.dependencies).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Test 10: Reference detection on naming convention fields
  // ---------------------------------------------------------------------------
  describe('Test 10: Reference detection', () => {
    it('detects fields ending in Name, Class, Profile, Transform as dependencies', () => {
      const activityDef = loader.getClass('Rule-Obj-Activity');
      expect(activityDef).toBeDefined();
      const strategy = compiler.compileStrategy(activityDef!);

      const json = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyRuleName: 'ReferenceTest',
        pyLabel: 'Reference Test',
        pyWhenCondition: 'CheckStatus',
        pyFlowActionName: 'NotifyManager',
        pyFlowName: 'ApprovalFlow',
        pyPropertyName: 'OrderAmount',
        pyTransformName: 'MapOrderData',
        // Extra reference-like fields
        pyAuthProfile: 'BasicAuthProfile',
        pyRequestDataTransform: 'MapRequest',
        pyResponseDataTransform: 'MapResponse',
        pyDerivesFrom: 'Rule-Obj-',
        pySuperClass: 'Rule-Obj-',
      };

      const result = strategy.parse(json);

      // Should catch all reference fields
      const depNames = result.dependencies.map(d => d.ruleName);
      expect(depNames).toContain('CheckStatus');
      expect(depNames).toContain('NotifyManager');
      expect(depNames).toContain('ApprovalFlow');
      expect(depNames).toContain('OrderAmount');
      expect(depNames).toContain('MapOrderData');

      // Check ruleType inference
      const flowDep = result.dependencies.find(d => d.ruleName === 'ApprovalFlow');
      expect(flowDep!.ruleType).toBe('Rule-Obj-Flow');

      const whenDep = result.dependencies.find(d => d.ruleName === 'CheckStatus');
      expect(whenDep!.ruleType).toBe('Rule-Obj-When');

      const propertyDep = result.dependencies.find(d => d.ruleName === 'OrderAmount');
      expect(propertyDep!.ruleType).toBe('Rule-Obj-Property');
    });

    it('deduplicates dependencies', () => {
      const activityDef = loader.getClass('Rule-Obj-Activity');
      expect(activityDef).toBeDefined();
      const strategy = compiler.compileStrategy(activityDef!);

      const json = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyRuleName: 'DedupTest',
        pyLabel: 'Dedup Test',
        pyWhenCondition: 'CheckStatus',
        pyMethodParameters: 'CheckStatus', // same value as pyWhenCondition - should deduplicate
      };

      const result = strategy.parse(json);
      // Count duplicates by ruleName
      const ruleNameCounts = new Map<string, number>();
      for (const dep of result.dependencies) {
        ruleNameCounts.set(dep.ruleName, (ruleNameCounts.get(dep.ruleName) || 0) + 1);
      }

      // Each ruleName should appear at most once
      for (const [, count] of ruleNameCounts) {
        expect(count).toBe(1);
      }
    });
  });
});
