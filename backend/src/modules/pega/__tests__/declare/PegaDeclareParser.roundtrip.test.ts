import { describe, it, expect } from 'vitest';
import { PegaDeclareParser } from '../../declare/PegaDeclareParser.js';

describe('PegaDeclareParser', () => {
  const parser = new PegaDeclareParser();

  // ─── Round-trip ───────────────────────────────────────────────────────

  describe('Round-trip: parse → serialize → same field values', () => {
    it('preserves field values for Declare Expression', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Expressions',
        pyClassName: 'Work-Cover-Complaint',
        pyRuleName: 'DueDateCalc',
        pyLabel: 'Auto-calculate due date',
        pyProperty: 'pyDueDate',
        pyExpression: '@AddDays(.pyCreateDate, .pySLADays)',
      };

      const typed = parser.parseDeclareExpression(json);
      expect(typed.pxObjClass).toBe('Rule-Declare-Expressions');
      expect(typed.pyName).toBe('DueDateCalc');
      expect(typed.pyLabel).toBe('Auto-calculate due date');
      expect(typed.declareType).toBe('Declare-Expression');
      expect(typed.targetProperty).toBe('pyDueDate');
      expect(typed.expression).toBe('@AddDays(.pyCreateDate, .pySLADays)');
    });

    it('preserves field values for Declare OnChange', () => {
      const json = {
        pxObjClass: 'Rule-Declare-OnChange',
        pyClassName: 'Work-Cover-Complaint',
        pyRuleName: 'OnStatusChange',
        pyProperty: 'pyStatus',
        pyWhenCondition: 'IsActive',
        pyActions: [
          { pyActionType: 'Run Activity', pyTarget: 'NotifyManager', pyActivityName: 'NotifyManager' },
        ],
      };

      const typed = parser.parseDeclareOnChange(json);
      expect(typed.pxObjClass).toBe('Rule-Declare-OnChange');
      expect(typed.pyName).toBe('OnStatusChange');
      expect(typed.targetProperty).toBe('pyStatus');
      expect(typed.whenCondition).toBe('IsActive');
      expect(typed.actions).toHaveLength(1);
      expect(typed.actions[0].type).toBe('runActivity');
      expect(typed.actions[0].target).toBe('NotifyManager');
    });

    it('preserves field values for Declare Trigger', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Trigger',
        pyClassName: 'Work-Cover-Complaint',
        pyRuleName: 'AfterOpenHook',
        pyTriggerType: 'after',
        pyOperation: 'open',
        pyWhenCondition: 'IsComplaint',
        pyActivityName: 'LogOpen',
        pyActionType: 'Activity',
      };

      const typed = parser.parseDeclareTrigger(json);
      expect(typed.pxObjClass).toBe('Rule-Declare-Trigger');
      expect(typed.pyName).toBe('AfterOpenHook');
      expect(typed.triggerType).toBe('after');
      expect(typed.operation).toBe('open');
      expect(typed.targetClass).toBe('Work-Cover-Complaint');
      expect(typed.whenCondition).toBe('IsComplaint');
      expect(typed.action).toBe('LogOpen');
      expect(typed.actionType).toBe('Activity');
    });

    it('preserves field values for Declare Pages', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Pages',
        pyClassName: 'Work-Cover-Complaint',
        pyRuleName: 'LoadRefData',
        pyPages: [
          { pyPageName: 'Products', pySource: 'DataPage', pySourceClass: 'D_ProductList', pyScope: 'node' },
        ],
      };

      const typed = parser.parseDeclarePages(json);
      expect(typed.pxObjClass).toBe('Rule-Declare-Pages');
      expect(typed.pyName).toBe('LoadRefData');
      expect(typed.pages).toHaveLength(1);
      expect(typed.pages[0].name).toBe('Products');
      expect(typed.pages[0].source).toBe('dataPage');
      expect(typed.pages[0].sourceRef).toBe('D_ProductList');
      expect(typed.pages[0].scope).toBe('node');
    });

    it('preserves field values for Declare Constraint', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Constraints',
        pyClassName: 'Work-Cover-Complaint',
        pyRuleName: 'MaxAmount',
        pyProperty: 'pyAmount',
        pyConstraintType: 'max',
        pyConstraintValue: '100000',
        pyConstraintMessage: 'Amount cannot exceed 100,000',
      };

      const typed = parser.parseDeclareConstraint(json);
      expect(typed.pxObjClass).toBe('Rule-Declare-Constraints');
      expect(typed.pyName).toBe('MaxAmount');
      expect(typed.property).toBe('pyAmount');
      expect(typed.constraintType).toBe('max');
      expect(typed.constraintValue).toBe('100000');
      expect(typed.message).toBe('Amount cannot exceed 100,000');
    });

    it('preserves DecisionTable row order and values', () => {
      const json = {
        pxObjClass: 'Rule-Declare-DecisionTable',
        pyClassName: 'Work-Cover-Complaint',
        pyRuleName: 'SeverityMatrix',
        pyPropertyEvaluated: 'pySeverity',
        pyDecisionTableRows: [
          { pyCondition: 'pyImpact = "High" .AND. pyLikelihood = "High"', pyResult: 'Critical' },
          { pyCondition: 'pyImpact = "High" .AND. pyLikelihood = "Medium"', pyResult: 'Major' },
        ],
      };

      const typed = parser.parseDeclareDecisionTable(json);
      expect(typed.propertyEvaluated).toBe('pySeverity');
      expect(typed.rows).toHaveLength(2);
      expect(typed.rows[0].condition).toBe('pyImpact = "High" .AND. pyLikelihood = "High"');
      expect(typed.rows[0].result).toBe('Critical');
      expect(typed.rows[1].result).toBe('Major');
    });
  });
});
