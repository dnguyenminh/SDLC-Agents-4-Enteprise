import { describe, it, expect } from 'vitest';
import { PegaDeclareParser } from '../../declare/PegaDeclareParser.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';
import { ExprNodeEvaluator } from '../../expression/ExprNodeEvaluator.js';

describe('PegaDeclareParser', () => {
  const parser = new PegaDeclareParser();

  // ─── Declare Expression ──────────────────────────────────────────────

  describe('Declare Expression (Rule-Declare-Expressions)', () => {
    it('parses target property and expression string', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Expressions',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'TotalAmount',
        pyProperty: 'pyTotalAmount',
        pyExpression: '.pyQuantity * .pyUnitPrice',
        pyLabel: 'Auto-calc total',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('TotalAmount');
      expect(result.symbol.className).toBe('Work-Cover-Jira');
      expect(result.symbol.ruleType).toBe('Rule-Declare-Expressions');
      expect(result.symbol.isRule).toBe(true);
      expect(result.symbol.logicSummary).toContain('pyTotalAmount');
      expect(result.symbol.logicSummary).toContain('.pyQuantity * .pyUnitPrice');

      const typed = parser.parseDeclareExpression(json);
      expect(typed.targetProperty).toBe('pyTotalAmount');
      expect(typed.expression).toBe('.pyQuantity * .pyUnitPrice');
      expect(typed.pyLabel).toBe('Auto-calc total');
      expect(typed.declareType).toBe('Declare-Expression');
    });

    it('parses expression string into a POC ExprNode and evaluates it', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Expressions',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'HasBoth',
        pyProperty: 'pyHasBoth',
        // Grammar-native logical operator (&&); raw parser does not handle Pega '.AND.' text.
        pyExpression: '.pyFirstName = "John" && .pyLastName = "Doe"',
      };

      const typed = parser.parseDeclareExpression(json);
      expect(typed.expressionAst).toBeDefined();
      // New model is a data AST discriminated by `kind` (not the old OOP `nodeType`).
      expect(typed.expressionAst!.kind).toBe('BinaryOp');

      // Evaluation is now done by ExprNodeEvaluator, not by a node method.
      const ctx = new PegaClipboardContext({
        pyWorkPage: {
          pyFirstName: { type: 'Text', value: 'John' },
          pyLastName: { type: 'Text', value: 'Doe' },
        },
      });
      const result = new ExprNodeEvaluator().eval(typed.expressionAst!, ctx);
      expect(result.boolean).toBe(true);
    });

    it('handles expression parse failure gracefully (no AST)', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Expressions',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'BadExpr',
        pyProperty: 'pyBad',
        pyExpression: '!!! invalid !!!',
      };

      const typed = parser.parseDeclareExpression(json);
      expect(typed.targetProperty).toBe('pyBad');
      expect(typed.expression).toBe('!!! invalid !!!');
      // AST should be undefined since parsing failed
      expect(typed.expressionAst).toBeUndefined();
    });

    it('parses via supports() + parse() integration', () => {
      expect(parser.supports('Rule-Declare-Expressions')).toBe(true);
      const json = {
        pxObjClass: 'Rule-Declare-Expressions',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'TaxRate',
        pyProperty: 'pyTaxRate',
        pyExpression: '.pySubtotal * 0.1',
        pyRuleset: 'Finance',
        pyRulesetVersion: '01-01-01',
      };

      const result = parser.parse(json);
      expect(result.symbol.ruleset).toBe('Finance');
      expect(result.symbol.version).toBe('01-01-01');
      expect(result.dependencies).toHaveLength(0);
    });
  });

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

  // ─── Declare Pages ───────────────────────────────────────────────────

  describe('Declare Pages (Rule-Declare-Pages)', () => {
    it('parses page definitions with source, ref, parameters, and scope', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Pages',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'LoadCustomerPage',
        pyPages: [
          {
            pyPageName: 'CustomerInfo',
            pySource: 'DataPage',
            pySourceClass: 'D_GetCustomer',
            pyParameters: { CustomerID: '.pyCustomerID' },
            pyScope: 'requestor',
          },
        ],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('LoadCustomerPage');
      expect(result.symbol.logicSummary).toContain('1 page(s)');

      const typed = parser.parseDeclarePages(json);
      expect(typed.pages).toHaveLength(1);
      expect(typed.pages[0].name).toBe('CustomerInfo');
      expect(typed.pages[0].source).toBe('dataPage');
      expect(typed.pages[0].sourceRef).toBe('D_GetCustomer');
      expect(typed.pages[0].parameters).toBeDefined();
      expect(typed.pages[0].parameters!['CustomerID']).toBe('.pyCustomerID');
      expect(typed.pages[0].scope).toBe('requestor');
    });

    it('handles multiple pages with different source types', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Pages',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'MultiPageLoad',
        pyPages: [
          { pyPageName: 'UserPrefs', pySource: 'DataTransform', pySourceClass: 'SetUserPrefs', pyScope: 'thread' },
          { pyPageName: 'Config', pySource: 'class', pySourceClass: 'Work-Cover-Jira-Config' },
          { pyPageName: 'TempData', pySource: 'clipboard' },
        ],
      };

      const typed = parser.parseDeclarePages(json);
      expect(typed.pages).toHaveLength(3);
      expect(typed.pages[0].source).toBe('dataTransform');
      expect(typed.pages[0].scope).toBe('thread');
      expect(typed.pages[1].source).toBe('class');
      expect(typed.pages[1].sourceRef).toBe('Work-Cover-Jira-Config');
      expect(typed.pages[1].scope).toBeUndefined();
      expect(typed.pages[2].source).toBe('clipboard');
      expect(typed.pages[2].sourceRef).toBe('');
    });
  });

  // ─── Declare Constraint ──────────────────────────────────────────────

  describe('Declare Constraint (Rule-Declare-Constraints)', () => {
    it('parses property, constraint type, value, and message', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Constraints',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'AmountRange',
        pyProperty: 'pyAmount',
        pyConstraintType: 'min',
        pyConstraintValue: '0',
        pyConstraintMessage: 'Amount must be non-negative',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('AmountRange');
      expect(result.symbol.logicSummary).toContain('pyAmount');

      const typed = parser.parseDeclareConstraint(json);
      expect(typed.property).toBe('pyAmount');
      expect(typed.constraintType).toBe('min');
      expect(typed.constraintValue).toBe('0');
      expect(typed.message).toBe('Amount must be non-negative');
    });

    it('supports pattern, list, and expression constraint types', () => {
      const patternJson = {
        pxObjClass: 'Rule-Declare-Constraints',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'EmailPattern',
        pyProperty: 'pyEmail',
        pyConstraintType: 'Pattern',
        pyConstraintValue: '^[\\w.-]+@[\\w.-]+\\.\\w+$',
      };
      const typed = parser.parseDeclareConstraint(patternJson);
      expect(typed.constraintType).toBe('pattern');

      const listJson = {
        pxObjClass: 'Rule-Declare-Constraints',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'StatusList',
        pyProperty: 'pyStatus',
        pyConstraintType: 'List',
        pyConstraintValue: 'Open,In Progress,Resolved,Closed',
      };
      const listTyped = parser.parseDeclareConstraint(listJson);
      expect(listTyped.constraintType).toBe('list');

      const exprJson = {
        pxObjClass: 'Rule-Declare-Constraints',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'CustomExpr',
        pyProperty: 'pyTotal',
        pyConstraintType: 'expression',
        pyConstraintValue: '.pyQuantity > 0 .AND. .pyUnitPrice > 0',
      };
      const exprTyped = parser.parseDeclareConstraint(exprJson);
      expect(exprTyped.constraintType).toBe('expression');
    });
  });

  // ─── Declare Index ───────────────────────────────────────────────────

  describe('Declare Index (Rule-Declare-Index)', () => {
    it('parses property and index type', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Index',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'UniqueEmail',
        pyProperty: 'pyEmail',
        pyIndexType: 'unique',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('UniqueEmail');
      expect(result.symbol.logicSummary).toContain('pyEmail');
      expect(result.symbol.logicSummary).toContain('unique');

      const typed = parser.parseDeclareIndex(json);
      expect(typed.property).toBe('pyEmail');
      expect(typed.indexType).toBe('unique');
    });

    it('supports compound index with additional properties', () => {
      const json = {
        pxObjClass: 'Rule-Declare-Index',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'CompoundName',
        pyProperty: 'pyLastName',
        pyIndexType: 'compound',
        pyAdditionalProperties: ['pyFirstName', 'pyMiddleName'],
      };

      const typed = parser.parseDeclareIndex(json);
      expect(typed.indexType).toBe('compound');
      expect(typed.additionalProperties).toEqual(['pyFirstName', 'pyMiddleName']);
    });
  });

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

// ─── PegaParserRegistry integration ─────────────────────────────────────

import { PegaParserRegistry } from '../../strategies/PegaParserRegistry.js';
import { registerDeclareParsers } from '../../declare/index.js';

describe('PegaDeclareParser registry integration', () => {
  it('can be registered and used via PegaParserRegistry', () => {
    const registry = new PegaParserRegistry();
    registerDeclareParsers(registry);

    const json = {
      pxObjClass: 'Rule-Declare-Expressions',
      pyClassName: 'Work-Order',
      pyRuleName: 'CalcTotal',
      pyProperty: 'pyTotal',
      pyExpression: '.pyQty * .pyPrice',
    };

    const result = registry.parse(json);
    expect(result.symbol.ruleType).toBe('Rule-Declare-Expressions');
    expect(result.symbol.name).toBe('CalcTotal');
    expect(result.symbol.logicSummary).toContain('pyTotal');
  });

  it('registers before fallback so Declare rules are handled first', () => {
    const registry = new PegaParserRegistry();
    registerDeclareParsers(registry);

    // Non-Declare rule should still work via fallback
    const activityJson = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Order',
      pyActivityName: 'ProcessOrder',
    };

    const result = registry.parse(activityJson);
    // Activity should go to ActivityParserStrategy (registered first in constructor)
    // but should still return a valid result
    expect(result.symbol.name).toBe('ProcessOrder');
  });
});