import { describe, it, expect } from 'vitest';
import { PegaSemanticAnalyzer } from '../../semantic/PegaSemanticAnalyzer.js';
import type { PegaClassDefinition } from '../../metamodel/PegaClassDefinition.js';

describe('PegaSemanticAnalyzer', () => {
  const analyzer = new PegaSemanticAnalyzer();

  describe('Connect analysis', () => {
    const connectJson = {
      pxObjClass: 'Rule-Connect-REST',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'GetJiraIssue',
      pyBaseURL: 'https://jira.example.com/rest/api/2',
      pyResourcePath: '/issue/{issueId}',
      pyHTTPMethod: 'GET',
      pyAuthenticationType: 'Basic',
    };

    const analysis = analyzer.analyzeConnect(connectJson);

    it('extracts endpoint URL and HTTP method', () => {
      expect(analysis.endpointUrl).toBe('https://jira.example.com/rest/api/2/issue/{issueId}');
      expect(analysis.httpMethod).toBe('GET');
      expect(analysis.authType).toBe('Basic');
    });

    it('predicts side effect: api_call', () => {
      const apiCalls = analysis.sideEffects.filter(s => s.type === 'api_call');
      expect(apiCalls.length).toBe(1);
      expect(apiCalls[0].target).toContain('jira.example.com');
    });

    it('generates endpoint-focused summary', () => {
      expect(analysis.summary).toContain('GET');
      expect(analysis.summary).toContain('Basic');
    });
  });

  describe('Flow analysis', () => {
    const flowJson = {
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

    const analysis = analyzer.analyzeFlow(flowJson);

    it('extracts route description', () => {
      expect(analysis.summary).toContain('starts at');
      expect(analysis.summary).toContain('ends at');
    });

    it('extracts shape types', () => {
      expect(analysis.shapeTypes).toContain('Start');
      expect(analysis.shapeTypes).toContain('Assignment');
      expect(analysis.shapeTypes).toContain('End');
    });

    it('detects flow action dependencies', () => {
      const faDeps = analysis.dependencies.filter(d => d.type === 'flow_action');
      expect(faDeps.length).toBe(2);
      expect(faDeps[0].target).toBe('NewAssignment');
    });

    it('extracts conditions from branching shapes', () => {
      expect(analysis.conditions.length).toBe(1);
      expect(analysis.conditions[0].field).toBe('NeedsValidation');
    });
  });

  describe('Section analysis', () => {
    const sectionJson = {
      pxObjClass: 'Rule-Obj-Section',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TicketDetails',
      pyLabel: 'Ticket Details Section',
      pyLayouts: [
        { pyLayoutType: 'dynamic', pyPropertyName: 'pyStatus' },
        { pyLayoutType: 'dynamic', pyPropertyName: 'pyPriority' },
        { pyLayoutType: 'dynamic', pyPropertyName: 'pyOwner' },
      ],
    };

    const analysis = analyzer.analyzeSection(sectionJson);

    it('extracts rendered fields', () => {
      expect(analysis.renderedFields).toContain('pyStatus');
      expect(analysis.renderedFields).toContain('pyPriority');
      expect(analysis.renderedFields).toContain('pyOwner');
      expect(analysis.renderedFields!.length).toBe(3);
    });

    it('detects layout types', () => {
      expect(analysis.layoutTypes).toContain('dynamic');
    });

    it('generates field-focused summary', () => {
      expect(analysis.summary).toContain('3 field(s)');
    });
  });

  describe('Declare analysis', () => {
    const declareJson = {
      pxObjClass: 'Rule-Declare-Expressions',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TotalAmount',
      pyTargetProperty: '.pyTotalAmount',
      pyExpression: '.pyQuantity * .pyUnitPrice',
    };

    const analysis = analyzer.analyzeDeclare(declareJson);

    it('extracts target property and expression', () => {
      expect(analysis.targetProperty).toBe('.pyTotalAmount');
      expect(analysis.expression).toBe('.pyQuantity * .pyUnitPrice');
    });

    it('generates recalculation summary', () => {
      expect(analysis.summary).toContain('pyTotalAmount');
      expect(analysis.summary).toContain('pyQuantity * .pyUnitPrice');
    });

    it('tracks data flow from inputs to target', () => {
      expect(analysis.dataFlow.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Generic analysis fallback', () => {
    it('produces analysis for unknown types', () => {
      const genericJson = {
        pxObjClass: 'Rule-Admin-Product',
        pyClassName: 'MyApp',
        pyRuleName: 'MyAppProduct',
      };
      const analysis = analyzer.analyze(genericJson);
      expect(analysis.ruleType).toBe('Rule-Admin-Product');
      expect(analysis.name).toBe('MyAppProduct');
      expect(analysis.summary).toContain('Rule-Admin-Product');
    });
  });

  describe('Generic analysis with class def', () => {
    it('analyzes with class definition metadata', () => {
      const json = {
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'MyApp',
        pyRuleName: 'MyConnector',
        pyBaseURL: 'https://api.example.com',
      };
      const classDef: PegaClassDefinition = {
        pxObjClass: 'Rule-Connect-REST',
        description: 'REST connector configuration',
        properties: [
          { name: 'pyBaseURL', type: 'string', required: true, isSystem: false, isReference: false, description: 'Base URL' },
        ],
        children: [],
      };
      const analysis = analyzer.analyzeGeneric(json, classDef);
      expect(analysis.ruleType).toBe('Rule-Connect-REST');
      expect(analysis.name).toBe('MyConnector');
      expect(analysis.summary).toContain('REST connector');
    });
  });

  it('dispatches analysis by type correctly', () => {
    expect(analyzer.analyze({ pxObjClass: 'Rule-Obj-Activity', pyActivityName: 'A' }).summary).toContain('0 step(s)');
    expect(analyzer.analyze({ pxObjClass: 'Rule-Obj-Model', pyModelName: 'B' }).summary).toContain('0 action(s)');
    expect(analyzer.analyze({ pxObjClass: 'Rule-Obj-Flow', pyFlowName: 'C' }).summary).toContain('0 shape(s)');
    expect(analyzer.analyze({ pxObjClass: 'Rule-Declare-DecisionTable', pyLabel: 'D' }).summary).toContain('0 row(s)');
    expect(analyzer.analyze({ pxObjClass: 'Rule-Connect-REST', pyRuleName: 'E' }).summary).toContain('Rule-Connect-REST');
    expect(analyzer.analyze({ pxObjClass: 'Rule-Declare-Expressions', pyRuleName: 'F' }).summary).toContain('Rule-Declare-Expressions');
  });
});
