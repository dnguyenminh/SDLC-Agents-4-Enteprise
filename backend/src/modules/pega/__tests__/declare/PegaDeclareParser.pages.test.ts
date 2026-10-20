import { describe, it, expect } from 'vitest';
import { PegaDeclareParser } from '../../declare/PegaDeclareParser.js';

describe('PegaDeclareParser', () => {
  const parser = new PegaDeclareParser();

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
});
