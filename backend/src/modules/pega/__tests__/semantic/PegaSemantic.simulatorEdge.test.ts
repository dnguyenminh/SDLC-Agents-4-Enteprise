import { describe, it, expect } from 'vitest';
import { PegaSemanticAnalyzer } from '../../semantic/PegaSemanticAnalyzer.js';
import { PegaRuleSimulator } from '../../semantic/PegaRuleSimulator.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

describe('PegaRuleSimulator', () => {
  const simulator = new PegaRuleSimulator();

  describe('dispatch simulate', () => {
    it('routes requests by pxObjClass', async () => {
      const activityResult = await simulator.simulate({
        pxObjClass: 'Rule-Obj-Activity',
        json: {
          pyActivityName: 'Test',
          steps: [{ pyStepNum: '1', pyMethod: 'Property-Set', pyMethodParameters: '.x', pyLabel: 'Set X' }],
        },
        inputClipboard: { pyWorkPage: { x: { type: 'Text', value: '' } } },
      });
      expect(activityResult.success).toBe(true);

      const unsupportedResult = await simulator.simulate({
        pxObjClass: 'Rule-Obj-Unknown',
        json: { pyRuleName: 'UnknownRule' },
      });
      expect(unsupportedResult.success).toBe(false);
      expect(unsupportedResult.errors[0]).toContain('Unsupported rule type');
    });
  });

  describe('Integration: Analyzer output used to configure Simulator', () => {
    it('SemanticAnalyzer output can inform simulator configuration', async () => {
      const analyzer = new PegaSemanticAnalyzer();
      const analysis = analyzer.analyze({
        pxObjClass: 'Rule-Obj-Activity',
        pyActivityName: 'CalculateTotal',
        pyClassName: 'Order',
        steps: [
          { pyStepNum: '1', pyMethod: 'Property-Set', pyMethodParameters: '.pyTotal', pyLabel: 'Set Total' },
          { pyStepNum: '2', pyMethod: 'Obj-Save', pyMethodParameters: 'Order', pyLabel: 'Save Order' },
        ],
      });

      expect(analysis.steps).toBe(2);
      expect(analysis.sideEffects.some(s => s.type === 'page_update')).toBe(true);
      expect(analysis.sideEffects.some(s => s.type === 'db_write')).toBe(true);

      const context = new PegaClipboardContext({ pyWorkPage: { Total: { type: 'Number', value: 0 } } }, 'pyWorkPage');
      const result = simulator.simulateActivity(
        {
          pxObjClass: 'Rule-Obj-Activity',
          pyActivityName: 'CalculateTotal',
          steps: [
            { pyStepNum: '1', pyMethod: 'Property-Set', pyMethodParameters: '.pyTotal', pyLabel: 'Set Total' },
            { pyStepNum: '2', pyMethod: 'Obj-Save', pyMethodParameters: 'Order', pyLabel: 'Save Order' },
          ],
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.trace.filter(t => t.action === 'set')).toHaveLength(1);
      expect(result.trace.filter(t => t.action === 'db_write')).toHaveLength(1);
    });
  });

  describe('Error handling: invalid input', () => {
    it('handles empty activity gracefully', () => {
      const context = new PegaClipboardContext({}, 'pyWorkPage');
      const result = simulator.simulateActivity({ pxObjClass: 'Rule-Obj-Activity' }, context);
      expect(result.success).toBe(true);
      expect(result.trace.length).toBeGreaterThanOrEqual(2);
    });

    it('handles invalid JSON with missing steps gracefully', () => {
      const context = new PegaClipboardContext({}, 'pyWorkPage');
      const result = simulator.simulateActivity(
        { pxObjClass: 'Rule-Obj-Activity', pyActivityName: null },
        context,
      );
      expect(result.success).toBe(true);
    });

    it('handles unsupported rule type gracefully', async () => {
      const result = await simulator.simulate({
        pxObjClass: 'Rule-Obj-File',
        json: { pyRuleName: 'MyFile' },
      });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
