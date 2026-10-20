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
});
