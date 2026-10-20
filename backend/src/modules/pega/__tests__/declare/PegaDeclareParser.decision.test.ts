import { describe, it, expect } from 'vitest';
import { PegaDeclareParser } from '../../declare/PegaDeclareParser.js';

describe('PegaDeclareParser', () => {
  const parser = new PegaDeclareParser();

  // ─── Declare DecisionTable / DecisionTree ─────────────────────────────

  describe('Declare DecisionTable / DecisionTree', () => {
    it('parses DecisionTable with rows', () => {
      const json = {
        pxObjClass: 'Rule-Declare-DecisionTable',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'PriorityDecision',
        pyPropertyEvaluated: 'pyPriority',
        pyDecisionTableRows: [
          { pyCondition: 'pyUrgency > 80', pyResult: 'Critical' },
          { pyCondition: 'pyUrgency > 50', pyResult: 'High' },
          { pyCondition: 'pyUrgency > 20', pyResult: 'Medium' },
        ],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('PriorityDecision');
      expect(result.symbol.logicSummary).toContain('3 row(s)');

      const typed = parser.parseDeclareDecisionTable(json);
      expect(typed.propertyEvaluated).toBe('pyPriority');
      expect(typed.rows).toHaveLength(3);
      expect(typed.rows[0].condition).toBe('pyUrgency > 80');
      expect(typed.rows[0].result).toBe('Critical');
      expect(typed.rows[2].result).toBe('Medium');
    });

    it('parses DecisionTree with rows', () => {
      const json = {
        pxObjClass: 'Rule-Declare-DecisionTree',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'RiskTree',
        pyDecisionTableRows: [
          { pyCondition: 'pyScore > 90', pyResult: 'HighRisk' },
          { pyCondition: 'pyScore > 50', pyResult: 'MediumRisk' },
        ],
      };

      expect(parser.supports('Rule-Declare-DecisionTree')).toBe(true);
      const typed = parser.parseDeclareDecisionTree(json);
      expect(typed.declareType).toBe('Declare-DecisionTree');
      expect(typed.rows).toHaveLength(2);
    });
  });

  // ─── supports() method ──────────────────────────────────────────────

  describe('supports() method', () => {
    it('returns true for all Rule-Declare-* types', () => {
      expect(parser.supports('Rule-Declare-Expressions')).toBe(true);
      expect(parser.supports('Rule-Declare-OnChange')).toBe(true);
      expect(parser.supports('Rule-Declare-Trigger')).toBe(true);
      expect(parser.supports('Rule-Declare-Pages')).toBe(true);
      expect(parser.supports('Rule-Declare-Constraints')).toBe(true);
      expect(parser.supports('Rule-Declare-Index')).toBe(true);
      expect(parser.supports('Rule-Declare-DecisionTable')).toBe(true);
      expect(parser.supports('Rule-Declare-DecisionTree')).toBe(true);
    });

    it('returns false for non-Declare types', () => {
      expect(parser.supports('Rule-Obj-Activity')).toBe(false);
      expect(parser.supports('Rule-Obj-Model')).toBe(false);
      expect(parser.supports('Rule-Obj-Flow')).toBe(false);
      expect(parser.supports('')).toBe(false);
    });
  });

  // ─── Missing / optional fields ──────────────────────────────────────

  describe('Handles missing optional fields gracefully', () => {
    it('returns defaults when all fields are empty', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Expressions',
        pyClassName: 'Work-Cover-Jira',
      };

      const typed = parser.parseDeclareExpression(json);
      expect(typed.targetProperty).toBe('');
      expect(typed.expression).toBe('');

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('UnnamedDeclare');
      expect(result.dependencies).toHaveLength(0);
    });

    it('handles empty pages array', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Pages',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'EmptyPages',
      };

      const typed = parser.parseDeclarePages(json);
      expect(typed.pages).toHaveLength(0);
    });

    it('handles empty actions array', () => {
      const json = {
        pxObjClass: 'Rule-Declare-OnChange',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'NoActions',
        pyProperty: 'pyStatus',
      };

      const typed = parser.parseDeclareOnChange(json);
      expect(typed.actions).toHaveLength(0);
      expect(typed.whenCondition).toBeUndefined();
    });
  });
});
