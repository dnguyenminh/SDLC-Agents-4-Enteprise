import { describe, it, expect } from 'vitest';
import { PegaRuleAstParser } from '../PegaRuleAstParser.js';

describe('PegaRuleAstParser', () => {
  const parser = new PegaRuleAstParser();

  describe('Decision Table AST', () => {
    const dt = {
      pxObjClass: 'Rule-Declare-DecisionTable',
      pyClassName: 'Work-Cover-Jira',
      pyLabel: 'PriorityDecision',
      pyPropertyEvaluated: 'pyPriority',
      pyDecisionTableRows: [
        { pyCondition: 'pyUrgency > 80', pyResult: 'Critical' },
        { pyCondition: 'pyUrgency > 50', pyResult: 'High' },
      ],
    };

    const ast = parser.parse(dt);

    it('extracts decision type', () => {
      expect(ast.ruleType).toBe('Rule-Declare-DecisionTable');
      expect(ast.name).toBe('PriorityDecision');
    });

    it('creates decision row nodes', () => {
      expect(ast.children).toHaveLength(2);
      expect(ast.children[0].type).toBe('DecisionRow');
      expect(ast.children[0].properties.pyCondition).toBe('pyUrgency > 80');
    });
  });

  describe('When Condition AST', () => {
    const when = {
      pxObjClass: 'Rule-Obj-When',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'IsHighPriority',
      pyWhenExpression: '.pyPriority = "Critical"',
      pyWhenType: 'Expression',
    };

    const ast = parser.parse(when);

    it('extracts when condition', () => {
      expect(ast.ruleType).toBe('Rule-Obj-When');
      expect(ast.name).toBe('IsHighPriority');
      expect(ast.properties.pyWhenExpression).toBe('.pyPriority = "Critical"');
    });
  });

  describe('Connect REST AST', () => {
    const rest = {
      pxObjClass: 'Rule-Connect-REST',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'GetJiraIssue',
      pyBaseURL: 'https://jira.example.com/rest/api/2',
      pyResourcePath: '/issue/{issueId}',
      pyHTTPMethod: 'GET',
      pyHeaders: [
        { pyHeaderName: 'Authorization', pyHeaderValue: 'Bearer ${token}' },
        { pyHeaderName: 'Content-Type', pyHeaderValue: 'application/json' },
      ],
    };

    const ast = parser.parse(rest);

    it('extracts connector config', () => {
      expect(ast.ruleType).toBe('Rule-Connect-REST');
      expect(ast.properties.pyBaseURL).toBe('https://jira.example.com/rest/api/2');
      expect(ast.properties.pyHTTPMethod).toBe('GET');
    });

    it('creates header nodes', () => {
      expect(ast.children.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Declare Expression AST', () => {
    const expr = {
      pxObjClass: 'Rule-Declare-Expressions',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TotalAmount',
      pyTargetProperty: '.pyTotalAmount',
      pyExpression: '.pyQuantity * .pyUnitPrice',
    };

    const ast = parser.parse(expr);

    it('extracts declare expression', () => {
      expect(ast.ruleType).toBe('Rule-Declare-Expressions');
      expect(ast.name).toBe('TotalAmount');
      expect(ast.properties.pyExpression).toBe('.pyQuantity * .pyUnitPrice');
    });
  });

  describe('toPromptContext output', () => {
    const activity = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'ResolveTicket',
      pyLabel: 'Process and Resolve Jira Ticket',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Validate Input' },
      ],
    };

    it('generates human-readable prompt context', () => {
      const ast = parser.parse(activity);
      const ctx = parser.toPromptContext(ast);
      expect(ctx).toContain('Rule-Obj-Activity');
      expect(ctx).toContain('ResolveTicket');
      expect(ctx).toContain('Work-Cover-Jira');
      expect(ctx).toContain('ValidateData');
      expect(ctx).toContain('[Step]');
    });
  });

  describe('Generic fallback', () => {
    const generic = {
      pxObjClass: 'Rule-Admin-Product',
      pyClassName: 'MyApp',
      pyRuleName: 'MyAppProduct',
      pyProductName: 'My Application',
      pyProductVersion: '01-01-01',
    };

    it('parses unknown rule types', () => {
      const ast = parser.parse(generic);
      expect(ast.ruleType).toBe('Rule-Admin-Product');
      expect(ast.name).toBe('MyAppProduct');
      expect(ast.properties.pyProductName).toBe('My Application');
    });
  });
});
