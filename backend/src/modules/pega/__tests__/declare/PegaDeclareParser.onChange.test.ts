import { describe, it, expect } from 'vitest';
import { PegaDeclareParser } from '../../declare/PegaDeclareParser.js';

describe('PegaDeclareParser', () => {
  const parser = new PegaDeclareParser();

  // ─── Declare OnChange ────────────────────────────────────────────────

  describe('Declare OnChange (Rule-Declare-OnChange)', () => {
    it('parses property, when condition, and actions (runActivity, setValue)', () => {
      const json = {
        pxObjClass: 'Rule-Declare-OnChange',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'OnStatusChange',
        pyProperty: 'pyStatus',
        pyWhenCondition: 'IsActive',
        pyActions: [
          { pyActionType: 'Run Activity', pyTarget: 'NotifyAssignee', pyActivityName: 'NotifyAssignee' },
          { pyActionType: 'Set', pyTarget: '.pyTimestamp', pyParameters: { value: '@CurrentDate()' } },
        ],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('OnStatusChange');
      expect(result.symbol.logicSummary).toContain('pyStatus');
      expect(result.symbol.logicSummary).toContain('2 action(s)');

      // Should have dependency on the When condition
      const whenDeps = result.dependencies.filter(d => d.ruleType === 'Rule-Obj-When');
      expect(whenDeps).toHaveLength(1);
      expect(whenDeps[0].ruleName).toBe('IsActive');

      // Should have activity dependency
      const actDeps = result.dependencies.filter(d => d.ruleType === 'Rule-Obj-Activity');
      expect(actDeps).toHaveLength(1);
      expect(actDeps[0].ruleName).toBe('NotifyAssignee');

      const typed = parser.parseDeclareOnChange(json);
      expect(typed.targetProperty).toBe('pyStatus');
      expect(typed.whenCondition).toBe('IsActive');
      expect(typed.actions).toHaveLength(2);
      expect(typed.actions[0].type).toBe('runActivity');
      expect(typed.actions[0].target).toBe('NotifyAssignee');
      expect(typed.actions[1].type).toBe('setValue');
      expect(typed.actions[1].params).toBeDefined();
      expect(typed.actions[1].params!['value']).toBe('@CurrentDate()');
    });

    it('handles multiple actions of mixed types', () => {
      const json = {
        pxObjClass: 'Rule-Declare-OnChange',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'MultiAction',
        pyProperty: 'pyPriority',
        pyActions: [
          { pyActionType: 'Run Activity', pyTarget: 'LogChange', pyActivityName: 'LogChange' },
          { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaults', pyTransformName: 'SetDefaults' },
          { pyActionType: 'Run Report', pyTarget: 'ImpactReport' },
        ],
      };

      const typed = parser.parseDeclareOnChange(json);
      expect(typed.actions).toHaveLength(3);
      expect(typed.actions[0].type).toBe('runActivity');
      expect(typed.actions[0].target).toBe('LogChange');
      expect(typed.actions[1].type).toBe('runDataTransform');
      expect(typed.actions[1].target).toBe('SetDefaults');
      expect(typed.actions[2].type).toBe('runReport');
      expect(typed.actions[2].target).toBe('ImpactReport');
    });

    it('handles missing optional fields', () => {
      const json = {
        pxObjClass: 'Rule-Declare-OnChange',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'MinimalOC',
        pyProperty: 'pyStatus',
      };

      const typed = parser.parseDeclareOnChange(json);
      expect(typed.targetProperty).toBe('pyStatus');
      expect(typed.whenCondition).toBeUndefined();
      expect(typed.actions).toHaveLength(0);

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('MinimalOC');
    });
  });

  // ─── Declare Trigger ─────────────────────────────────────────────────

  describe('Declare Trigger (Rule-Declare-Trigger)', () => {
    it('parses trigger type, operation, target class, when condition, and action', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Trigger',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'BeforeSaveValidation',
        pyTriggerType: 'before',
        pyOperation: 'save',
        pyWhenCondition: 'NeedsValidation',
        pyActivityName: 'ValidateTicket',
        pyActionType: 'Activity',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('BeforeSaveValidation');
      expect(result.symbol.logicSummary).toContain('before-save');

      const actDeps = result.dependencies.filter(d => d.ruleType === 'Rule-Obj-Activity');
      expect(actDeps).toHaveLength(1);
      expect(actDeps[0].ruleName).toBe('ValidateTicket');

      const whenDeps = result.dependencies.filter(d => d.ruleType === 'Rule-Obj-When');
      expect(whenDeps).toHaveLength(1);
      expect(whenDeps[0].ruleName).toBe('NeedsValidation');

      const typed = parser.parseDeclareTrigger(json);
      expect(typed.triggerType).toBe('before');
      expect(typed.operation).toBe('save');
      expect(typed.targetClass).toBe('Work-Cover-Jira');
      expect(typed.whenCondition).toBe('NeedsValidation');
      expect(typed.action).toBe('ValidateTicket');
      expect(typed.actionType).toBe('Activity');
    });

    it('supports after-delete and DataTransform action type', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Trigger',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'AfterDeleteCleanup',
        pyTriggerType: 'after',
        pyOperation: 'delete',
        pyTransformName: 'CleanupHistory',
        pyActionType: 'DataTransform',
      };

      const typed = parser.parseDeclareTrigger(json);
      expect(typed.triggerType).toBe('after');
      expect(typed.operation).toBe('delete');
      expect(typed.action).toBe('CleanupHistory');
      expect(typed.actionType).toBe('DataTransform');

      const result = parser.parse(json);
      const dtDeps = result.dependencies.filter(d => d.ruleType === 'Rule-Obj-Model');
      expect(dtDeps).toHaveLength(1);
      expect(dtDeps[0].ruleName).toBe('CleanupHistory');
    });
  });
});
