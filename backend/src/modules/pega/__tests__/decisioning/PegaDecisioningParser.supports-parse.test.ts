import { describe, it, expect } from 'vitest';
import { PegaDecisioningParser } from '../../decisioning/PegaDecisioningParser.js';

describe('PegaDecisioningParser', () => {
  const parser = new PegaDecisioningParser();

  describe('supports()', () => {
    it('returns true for Rule-Decision-Strategy', () => {
      expect(parser.supports('Rule-Decision-Strategy')).toBe(true);
    });

    it('returns true for Rule-Decision-Scorecard', () => {
      expect(parser.supports('Rule-Decision-Scorecard')).toBe(true);
    });

    it('returns true for Rule-Decision-PredictiveModel', () => {
      expect(parser.supports('Rule-Decision-PredictiveModel')).toBe(true);
    });

    it('returns true for Rule-Decision-AdaptiveModel', () => {
      expect(parser.supports('Rule-Decision-AdaptiveModel')).toBe(true);
    });

    it('returns true for Rule-Decision-Interaction', () => {
      expect(parser.supports('Rule-Decision-Interaction')).toBe(true);
    });

    it('returns true for Rule-Decision-DecisionData', () => {
      expect(parser.supports('Rule-Decision-DecisionData')).toBe(true);
    });

    it('returns false for abstract Rule-Decision-', () => {
      expect(parser.supports('Rule-Decision-')).toBe(false);
    });

    it('returns false for unrelated classes', () => {
      expect(parser.supports('Rule-Obj-Activity')).toBe(false);
      expect(parser.supports('Rule-Obj-Model')).toBe(false);
      expect(parser.supports('Rule-Obj-Class')).toBe(false);
    });
  });

  describe('parse()', () => {
    it('parses a basic strategy with pyName', () => {
      const json = {
        pxObjClass: 'Rule-Decision-Strategy',
        pyClassName: 'MyCorp.MyClass',
        pyPurpose: 'CustomerStrategy',
        pyDescription: 'Main customer strategy',
        pyLabel: 'Customer Strategy',
      };
      const result = parser.parse(json);
      expect(result.symbol.name).toBe('CustomerStrategy');
      expect(result.symbol.ruleType).toBe('Rule-Decision-Strategy');
      expect(result.symbol.className).toBe('MyCorp.MyClass');
      expect(result.symbol.isRule).toBe(true);
    });

    it('parses pyLabel fallback when pyName and pyPurpose are missing', () => {
      const json = {
        pxObjClass: 'Rule-Decision-Strategy',
        pyClassName: 'MyClass',
        pyLabel: 'FallbackLabel',
      };
      const result = parser.parse(json);
      expect(result.symbol.name).toBe('FallbackLabel');
    });

    it('extracts dependencies from component refs', () => {
      const json: Record<string, unknown> = {
        pxObjClass: 'Rule-Decision-Strategy',
        pyClassName: 'MyClass',
        pyPurpose: 'MyStrategy',
        pyComponents: [
          { pyName: 'Comp1', pyComponentType: 'Segment', pyRef: 'RefRule1' },
          { pyName: 'Comp2', pyComponentType: 'Filter', pyTreatment: 'RefRule2' },
        ],
      };
      const result = parser.parse(json);
      expect(result.dependencies.length).toBeGreaterThanOrEqual(2);
      expect(result.dependencies[0].ruleName).toBe('RefRule1');
      expect(result.dependencies[1].ruleName).toBe('RefRule2');
    });
  });
});
