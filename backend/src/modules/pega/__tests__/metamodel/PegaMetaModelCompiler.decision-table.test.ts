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
  // Test 3: Compiles strategy for Rule-Decision-Table, parses sample with rows
  // ---------------------------------------------------------------------------
  describe('Test 3: Rule-Declare-DecisionTable strategy', () => {
    it('compiles a strategy and parses a sample decision table with rows', () => {
      // The class name in schemas is Rule-Declare-DecisionTable
      const dtDef = loader.getClass('Rule-Declare-DecisionTable');
      expect(dtDef).toBeDefined();

      const strategy = compiler.compileStrategy(dtDef!);
      expect(strategy.supports('Rule-Declare-DecisionTable')).toBe(true);

      const sampleDT = {
        pxObjClass: 'Rule-Declare-DecisionTable',
        pyClassName: 'Work-Order',
        pyRuleName: 'PriorityDecision',
        pyLabel: 'Priority Decision',
        pyRuleset: 'OrderApp',
        pyRulesetVersion: '01-02-01',
        pyPurpose: 'Determine order priority based on amount',
        pyPropertyEvaluated: 'pyPriority',
        pyDecisionTableRows: [
          {
            pxObjClass: 'Embed-DecisionRow',
            pyCondition: '.pyAmount > 10000',
            pyResult: '"High"',
          },
          {
            pxObjClass: 'Embed-DecisionRow',
            pyCondition: '.pyAmount > 5000',
            pyResult: '"Medium"',
          },
          {
            pxObjClass: 'Embed-DecisionRow',
            pyCondition: 'otherwise',
            pyResult: '"Low"',
          },
        ],
      };

      const result = strategy.parse(sampleDT);
      expect(result.symbol.ruleType).toBe('Rule-Declare-DecisionTable');
      expect(result.symbol.name).toBe('PriorityDecision');
      expect(result.symbol.className).toBe('Work-Order');

      // Should detect pyPropertyEvaluated as reference dependency (ends in 'Evaluated')
      expect(result.dependencies.length).toBeGreaterThanOrEqual(1);
      const propRef = result.dependencies.find(d => d.ruleName === 'pyPriority');
      expect(propRef).toBeDefined();
      expect(propRef!.ruleType).toBe('Rule-Obj-Property');
    });
  });
});
