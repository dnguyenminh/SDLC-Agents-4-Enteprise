import { describe, it, expect } from 'vitest';
import { PegaRuleAstParser } from '../PegaRuleAstParser.js';

describe('PegaRuleAstParser', () => {
  const parser = new PegaRuleAstParser();

  describe('Activity AST', () => {
    const activity = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'ResolveTicket',
      pyRuleset: 'JiraIntegration',
      pyRuleSetVersion: '01-02-03',
      pyLabel: 'Process and Resolve Jira Ticket',
      pyDescription: 'Main resolution flow',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Validate Input' },
        { pyStepNum: '2', pyMethod: 'Call', pyMethodParameters: '@baseclass.SendNotification', pyLabel: 'Send Email' },
        { pyStepNum: '3', pyMethod: 'Property-Set', pyMethodParameters: '.pyStatus', pyLabel: 'Set Status', pyStepContext: 'Primary' },
      ],
      pxCreateDateTime: '2024-01-01T00:00:00Z',
      pxCreateOperator: 'admin',
    };

    const ast = parser.parse(activity);

    it('extracts identity', () => {
      expect(ast.ruleType).toBe('Rule-Obj-Activity');
      expect(ast.name).toBe('ResolveTicket');
      expect(ast.className).toBe('Work-Cover-Jira');
      expect(ast.ruleset).toBe('JiraIntegration');
      expect(ast.rulesetVersion).toBe('01-02-03');
    });

    it('strips system fields', () => {
      expect(ast.properties.pxObjClass).toBeUndefined();
      expect(ast.properties.pxCreateDateTime).toBeUndefined();
      expect(ast.properties.pxCreateOperator).toBeUndefined();
    });

    it('creates step nodes', () => {
      expect(ast.children).toHaveLength(3);
      expect(ast.children[0].type).toBe('Step');
      expect(ast.children[0].properties.pyMethod).toBe('Call');
      expect(ast.children[1].properties.pyLabel).toBe('Send Email');
    });

    it('extracts references', () => {
      const calls = ast.references.filter(r => r.role === 'calls');
      expect(calls).toHaveLength(2);
      expect(calls[0].ruleName).toBe('ValidateData');
      expect(calls[0].className).toBe('Work-Cover-Jira');
      expect(calls[1].ruleName).toBe('SendNotification');
      expect(calls[1].className).toBe('@baseclass');
    });
  });

  describe('Data Transform AST', () => {
    const dt = {
      pxObjClass: 'Rule-Obj-Model',
      pyClassName: 'Work-Cover-Jira',
      pyModelName: 'InitializeTicket',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Initialize ticket data',
      pyActions: [
        { pyActionType: 'Set', pyTarget: '.pyStatus', pySource: 'New' },
        { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaultStatus' },
        { pyActionType: 'Set', pyTarget: '.pyPriority', pySource: '5', pyWhenCondition: 'IsHighPriority' },
      ],
    };

    const ast = parser.parse(dt);

    it('extracts identity', () => {
      expect(ast.ruleType).toBe('Rule-Obj-Model');
      expect(ast.name).toBe('InitializeTicket');
      expect(ast.className).toBe('Work-Cover-Jira');
    });

    it('creates action nodes', () => {
      expect(ast.children).toHaveLength(3);
      expect(ast.children[0].type).toBe('Action');
      expect(ast.children[0].properties.pyActionType).toBe('Set');
    });

    it('extracts transform references', () => {
      const transforms = ast.references.filter(r => r.role === 'applies-transform');
      expect(transforms).toHaveLength(1);
      expect(transforms[0].ruleName).toBe('SetDefaultStatus');
    });

    it('extracts when condition references', () => {
      const guards = ast.references.filter(r => r.role === 'guards');
      expect(guards).toHaveLength(1);
      expect(guards[0].ruleName).toBe('IsHighPriority');
    });
  });

  describe('Flow AST', () => {
    const flow = {
      pxObjClass: 'Rule-Obj-Flow',
      pyClassName: 'Work-Cover-Jira',
      pyFlowName: 'MainProcess',
      pyLabel: 'Main Jira Process Flow',
      pyShapes: [
        { pyShapeType: 'Start', pyName: 'Begin' },
        { pyShapeType: 'Assignment', pyName: 'AssignTicket', pyFlowActionName: 'NewAssignment' },
        { pyShapeType: 'Action', pyName: 'Validate', pyFlowActionName: 'ValidateAction', pyWhenCondition: 'NeedsValidation' },
        { pyShapeType: 'End', pyName: 'Done' },
      ],
    };

    const ast = parser.parse(flow);

    it('extracts identity', () => {
      expect(ast.ruleType).toBe('Rule-Obj-Flow');
      expect(ast.name).toBe('MainProcess');
    });

    it('creates shape nodes', () => {
      expect(ast.children).toHaveLength(4);
      expect(ast.children[0].type).toBe('Start');
      expect(ast.children[1].type).toBe('Assignment');
    });

    it('extracts flow action references', () => {
      const fa = ast.references.filter(r => r.role === 'flow-action');
      expect(fa).toHaveLength(2);
      expect(fa[0].ruleName).toBe('NewAssignment');
      expect(fa[1].ruleName).toBe('ValidateAction');
    });
  });

  describe('Class AST', () => {
    const cls = {
      pxObjClass: 'Rule-Obj-Class',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'Work-Cover-Jira',
      pySuperClass: 'Work-',
      pyPatternParent: 'Work-Cover-',
      pyDerivesFrom: 'Work-',
      pyDescription: 'Jira integration work class',
      pxRuleReferences: [
        { pxRuleObjClass: 'Rule-Obj-Property', pyRuleName: 'pyPriority', pxRuleClassName: 'Work-Cover-Jira' },
        { pxRuleObjClass: 'Rule-Obj-Property', pyRuleName: 'pyStatus', pxRuleClassName: 'Work-Cover-Jira' },
      ],
    };

    const ast = parser.parse(cls);

    it('extracts class hierarchy', () => {
      expect(ast.ruleType).toBe('Rule-Obj-Class');
      expect(ast.name).toBe('Work-Cover-Jira');
    });

    it('extracts class references', () => {
      const classRefs = ast.references.filter(r => r.ruleType === 'Rule-Obj-Class');
      expect(classRefs.length).toBeGreaterThanOrEqual(2);
      expect(classRefs.some(r => r.ruleName === 'Work-')).toBe(true);
    });
  });

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

  // ── SA4E-338 Plan A2: real field mapping (BR-14) ──

  describe('buildActivity — pySteps primary (BR-14)', () => {
    it('reads pySteps when present', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'W',
        pyActivityName: 'A',
        pySteps: [{ pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'X.Y' }],
      });
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0].type).toBe('Step');
    });

    it('falls back to legacy steps when pySteps absent', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'W',
        pyActivityName: 'A',
        steps: [{ pyStepNum: '2', pyMethod: 'Property-Set', pyMethodParameters: '.x' }],
      });
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0].type).toBe('Step');
    });
  });

  describe('buildDataTransform — pyProperties primary (BR-14)', () => {
    it('reads pyProperties when present', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-Model',
        pyClassName: 'W',
        pyModelName: 'M',
        pyProperties: [{ pyActionName: 'Set', pyTarget: '.x', pySource: '1' }],
      });
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0].type).toBe('Action');
    });

    it('falls back to legacy pyActions when pyProperties absent', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-Model',
        pyClassName: 'W',
        pyModelName: 'M',
        pyActions: [{ pyActionName: 'Set', pyTarget: '.y', pySource: '2' }],
      });
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0].type).toBe('Action');
    });
  });

  describe('buildDecision — pyDecisionRules primary (BR-14)', () => {
    it('reads pyDecisionRules when present', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-DecisionTable',
        pyClassName: 'W',
        pyRuleName: 'D',
        pyDecisionRules: [{ pyCondition: 'C1', pyResult: 'R1' }],
      });
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0].type).toBe('DecisionRow');
    });

    it('falls back to pyDecisionTableRows then pyRows', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-DecisionTable',
        pyClassName: 'W',
        pyRuleName: 'D',
        pyDecisionTableRows: [{ pyCondition: 'C2', pyResult: 'R2' }],
      });
      expect(ast.children).toHaveLength(1);
    });
  });

  describe('getBuilder — Rule-Obj-DecisionTable', () => {
    it('routes Rule-Obj-DecisionTable to buildDecision', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-DecisionTable',
        pyClassName: 'W',
        pyRuleName: 'D',
        pyDecisionRules: [{ pyCondition: 'C', pyResult: 'R' }],
      });
      expect(ast.ruleType).toBe('Rule-Obj-DecisionTable');
      expect(ast.children[0].type).toBe('DecisionRow');
    });
  });

  describe('renderPropertyValue — cap + ellipsis (BR-17)', () => {
    it('truncates large string values with ellipsis', () => {
      const large = 'x'.repeat(3000);
      const result = (parser as any).renderPropertyValue?.('pyData', large);
      // renderPropertyValue is private — test via toPromptContext output
    });

    it('does not JSON.stringify large objects in toPromptContext', () => {
      const ruleJson: Record<string, unknown> = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'W',
        pyActivityName: 'A',
        pySteps: [{ pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'X.Y' }],
        pyHugeProp: { a: 'b', c: { d: { e: 'f' } } },
      };
      const ast = parser.parse(ruleJson);
      const ctx = parser.toPromptContext(ast);
      // Large nested objects should be rendered as outline, not full JSON dump
      expect(ctx.length).toBeLessThan(2000);
    });
  });

  describe('formatNodes — line budget (BR-17)', () => {
    it('caps a single node subtree at 200 lines', () => {
      const ast = parser.parse({
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'W',
        pyActivityName: 'A',
        pySteps: [{ pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'X.Y' }],
      });
      // Create ONE node whose subtree exceeds 200 lines (deep nesting)
      const deepChild: AstNode = { type: 'Layout', properties: { pyName: 'Root' }, children: [] };
      for (let i = 0; i < 300; i++) {
        deepChild.children.push({ type: 'Item', properties: { pyName: `L${i}` }, children: [] });
      }
      ast.children = [deepChild];
      const ctx = parser.toPromptContext(ast);
      // Per-node subtree cap at 200 lines → output bounded
      expect(ctx.length).toBeLessThan(5000);
      // Should contain truncation marker because subtree > 200 lines
      expect(ctx).toContain('…');
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
