import { describe, it, expect } from 'vitest';
import { PegaMiscParser } from '../../misc/PegaMiscParser.js';

describe('PegaMiscParser', () => {
  const parser = new PegaMiscParser();

  // ─── Group 1: MapValue — source/target/map ruleset ─────────────────────

  describe('MapValue parsing', () => {
    it('parses MapValue with source/target property and map ruleset', () => {
      const json = {
        pxObjClass: 'Rule-Obj-MapValue',
        pyRuleName: 'MapCustomerName',
        pySourceProperty: '.Customer.FullName',
        pyTargetProperty: '.Order.CustomerName',
        pyMapRuleSet: 'CustomerMappingRules',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('MapCustomerName');
      expect(result.symbol.ruleType).toBe('Rule-Obj-MapValue');

      const typed = parser.parseMapValue(json);
      expect(typed.pyName).toBe('MapCustomerName');
      expect(typed.pySourceProperty).toBe('.Customer.FullName');
      expect(typed.pyTargetProperty).toBe('.Order.CustomerName');
      expect(typed.pyMapRuleSet).toBe('CustomerMappingRules');
    });

    it('handles MapValue with missing optional fields', () => {
      const json = {
        pxObjClass: 'Rule-Obj-MapValue',
        pyRuleName: 'MinimalMap',
      };

      const typed = parser.parseMapValue(json);
      expect(typed.pyName).toBe('MinimalMap');
      expect(typed.pySourceProperty).toBeUndefined();
      expect(typed.pyTargetProperty).toBeUndefined();
      expect(typed.pyMapRuleSet).toBeUndefined();
    });
  });

  // ─── Group 2: FieldValue — field value + class ref ──────────────────────

  describe('FieldValue parsing', () => {
    it('parses FieldValue with field value and class reference', () => {
      const json = {
        pxObjClass: 'Rule-Obj-FieldValue',
        pyRuleName: 'StatusActive',
        pyFieldValue: 'Active',
        pyClass: 'Work-Order',
        pyValue: 'Active',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('StatusActive');

      const typed = parser.parseFieldValue(json);
      expect(typed.pyName).toBe('StatusActive');
      expect(typed.pyFieldValue).toBe('Active');
      expect(typed.pyClass).toBe('Work-Order');
      expect(typed.pyValue).toBe('Active');
    });

    it('handles FieldValue with missing optional fields', () => {
      const json = {
        pxObjClass: 'Rule-Obj-FieldValue',
        pyRuleName: 'MinimalField',
      };

      const typed = parser.parseFieldValue(json);
      expect(typed.pyName).toBe('MinimalField');
      expect(typed.pyFieldValue).toBeUndefined();
      expect(typed.pyClass).toBeUndefined();
      expect(typed.pyValue).toBeUndefined();
    });
  });

  // ─── Group 3: CaseType — stages + start process ────────────────────────

  describe('CaseType parsing', () => {
    it('parses CaseType with stages and start process', () => {
      const json = {
        pxObjClass: 'Rule-Obj-CaseType',
        pyRuleName: 'OrderProcessing',
        pyLabel: 'Order Processing Case',
        pyStages: [
          { pyName: 'Stage1', pyLabel: 'Initial Review' },
          { pyName: 'Stage2', pyLabel: 'Fulfillment' },
        ],
        pyDefaultStage: 'Stage1',
        pyStartProcess: 'StartOrderProcess',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('OrderProcessing');

      const typed = parser.parseCaseType(json);
      expect(typed.pyName).toBe('OrderProcessing');
      expect(typed.pyLabel).toBe('Order Processing Case');
      expect(typed.stages).toHaveLength(2);
      expect(typed.stages![0].pyName).toBe('Stage1');
      expect(typed.stages![0].pyLabel).toBe('Initial Review');
      expect(typed.stages![1].pyName).toBe('Stage2');
      expect(typed.pyDefaultStage).toBe('Stage1');
      expect(typed.pyStartProcess).toBe('StartOrderProcess');
    });

    it('extracts start process dependency from CaseType', () => {
      const json = {
        pxObjClass: 'Rule-Obj-CaseType',
        pyClassName: 'Work-Order',
        pyRuleName: 'SimpleCase',
        pyStartProcess: 'InitProcess',
      };

      const result = parser.parse(json);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]).toEqual({
        ruleType: 'Rule-Obj-Activity',
        className: 'Work-Order',
        ruleName: 'InitProcess',
      });
    });
  });

  // ─── Group 4: Stage — type + processes ─────────────────────────────────

  describe('Stage parsing', () => {
    it('parses Stage with type and processes', () => {
      const json = {
        pxObjClass: 'Rule-Obj-Stage',
        pyRuleName: 'ReviewStage',
        pyLabel: 'Review Stage',
        pyStageType: 'Approval',
        pyProcesses: ['ReviewProcess', 'EscalateProcess'],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('ReviewStage');

      const typed = parser.parseStage(json);
      expect(typed.pyName).toBe('ReviewStage');
      expect(typed.pyLabel).toBe('Review Stage');
      expect(typed.pyStageType).toBe('Approval');
      expect(typed.pyProcesses).toEqual(['ReviewProcess', 'EscalateProcess']);
    });

    it('extracts process dependencies from Stage', () => {
      const json = {
        pxObjClass: 'Rule-Obj-Stage',
        pyClassName: 'Work-Order',
        pyRuleName: 'StageWithProcesses',
        pyStageType: 'Subprocess',
        pyProcesses: ['ProcessA', 'ProcessB'],
      };

      const result = parser.parse(json);
      const processDeps = result.dependencies.filter(d => d.ruleType === 'Rule-Obj-Activity');
      expect(processDeps).toHaveLength(2);
      expect(processDeps[0]).toEqual({ ruleType: 'Rule-Obj-Activity', className: 'Work-Order', ruleName: 'ProcessA' });
      expect(processDeps[1]).toEqual({ ruleType: 'Rule-Obj-Activity', className: 'Work-Order', ruleName: 'ProcessB' });
    });
  });
});
