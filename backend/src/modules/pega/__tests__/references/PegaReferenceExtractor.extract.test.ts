import { describe, it, expect } from 'vitest';
import { PegaReferenceExtractor } from '../../references/PegaReferenceExtractor.js';

describe('PegaReferenceExtractor', () => {
  const extractor = new PegaReferenceExtractor();

  describe('extractFromRule - Activity', () => {
    const activityJson = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'ResolveTicket',
      pyRuleset: 'JiraIntegration',
      pyRulesetVersion: '01-02-03',
      pyLabel: 'Process and Resolve Jira Ticket',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Validate Input' },
        { pyStepNum: '2', pyMethod: 'Call', pyMethodParameters: '@baseclass.SendNotification', pyLabel: 'Send Email' },
        { pyStepNum: '3', pyMethod: 'Branch', pyMethodParameters: 'Work-Cover-Jira.CheckStatus', pyLabel: 'Check Status' },
      ],
    };
    const deps = extractor.extractFromRule(activityJson);

    it('finds called activities from step pyMethodParameters', () => {
      const calls = deps.filter(d => d.relation === 'calls' && d.type === 'Rule-Obj-Activity');
      expect(calls.length).toBeGreaterThanOrEqual(3);
      expect(calls.some(d => d.name === 'ValidateData')).toBe(true);
      expect(calls.some(d => d.name === 'SendNotification')).toBe(true);
      expect(calls.some(d => d.name === 'CheckStatus')).toBe(true);
    });
    it('marks direct calls as non-optional', () => {
      const call = deps.find(d => d.name === 'ValidateData');
      expect(call).toBeDefined();
      expect(call!.optional).toBe(false);
      expect(call!.relation).toBe('calls');
    });
  });

  describe('extractFromRule - DataTransform', () => {
    const dtJson = {
      pxObjClass: 'Rule-Obj-Model',
      pyClassName: 'Work-Cover-Jira',
      pyModelName: 'InitializeTicketData',
      pyActions: [
        { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaultStatus' },
        { pyActionType: 'Apply Data Transform', pyTarget: 'MapFields' },
      ],
    };
    const deps = extractor.extractFromRule(dtJson);
    it('finds transforms from pyActions', () => {
      const transforms = deps.filter(d => d.type === 'Rule-Obj-Model');
      expect(transforms.some(d => d.name === 'SetDefaultStatus')).toBe(true);
    });
    it('finds when conditions from pyActions', () => {
      const dtWithWhen = {
        pxObjClass: 'Rule-Obj-Model',
        pyClassName: 'Work-Cover-Jira',
        pyModelName: 'ConditionalTransform',
        pyActions: [
          { pyActionType: 'Apply Data Transform', pyTarget: 'SetHighPriority', pyWhenCondition: 'IsHighPriority' },
        ],
      };
      const dtDeps = extractor.extractFromRule(dtWithWhen);
      expect(dtDeps.some(d => d.name === 'IsHighPriority' && d.type === 'Rule-Obj-When')).toBe(true);
    });
  });

  describe('extractFromRule - Flow', () => {
    const flowJson = {
      pxObjClass: 'Rule-Obj-Flow',
      pyClassName: 'Work-Cover-Jira',
      pyFlowName: 'MainFlow',
      pyShapes: [
        { pyShapeType: 'Action', pyFlowActionName: 'CreateTicket', pyWhenCondition: 'IsValid' },
        { pyShapeType: 'Decision', pyWhenCondition: 'IsApproved' },
        { pyShapeType: 'Action', pyFlowActionName: 'CloseTicket' },
      ],
    };
    const deps = extractor.extractFromRule(flowJson);
    it('finds flow actions from shapes', () => {
      expect(deps.some(d => d.name === 'CreateTicket' && d.type === 'Rule-Obj-FlowAction')).toBe(true);
      expect(deps.some(d => d.name === 'CloseTicket' && d.type === 'Rule-Obj-FlowAction')).toBe(true);
    });
    it('finds when conditions from shapes', () => {
      expect(deps.some(d => d.name === 'IsValid' && d.type === 'Rule-Obj-When')).toBe(true);
      expect(deps.some(d => d.name === 'IsApproved' && d.type === 'Rule-Obj-When')).toBe(true);
    });
  });

  describe('extractFromRule - Connect', () => {
    const connectJson = {
      pxObjClass: 'Rule-Connect-REST',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'JiraRESTConnector',
      pyAuthProfile: 'JiraOAuthProfile',
      pyRequestDataTransform: 'BuildJiraRequest',
      pyResponseDataTransform: 'ParseJiraResponse',
    };
    const deps = extractor.extractFromRule(connectJson);
    it('finds auth profile', () => {
      expect(deps.some(d => d.name === 'JiraOAuthProfile' && d.type === 'Rule-Connect-AuthProfile' && d.relation === 'configures')).toBe(true);
    });
    it('finds request and response data transforms', () => {
      expect(deps.some(d => d.name === 'BuildJiraRequest' && d.type === 'Rule-Obj-Model')).toBe(true);
      expect(deps.some(d => d.name === 'ParseJiraResponse' && d.type === 'Rule-Obj-Model')).toBe(true);
    });
  });

  describe('extractFromRule - Decision', () => {
    const decisionJson = {
      pxObjClass: 'Rule-Decision-Strategy',
      pyClassName: 'Work-Cover-Jira',
      pyName: 'PriorityStrategy',
      pyComponents: [
        { pyName: 'HighValueSegment', pyComponentType: 'Segment', pyRef: 'HighValueCustomer' },
        { pyName: 'VIPTreatment', pyComponentType: 'Treatment', pyTreatment: 'VIPOffer' },
      ],
    };
    const deps = extractor.extractFromRule(decisionJson);
    it('finds strategy references from components', () => {
      expect(deps.some(d => d.name === 'HighValueCustomer' && d.type === 'Rule-Decision-Strategy')).toBe(true);
      expect(deps.some(d => d.name === 'VIPOffer' && d.type === 'Rule-Decision-Strategy')).toBe(true);
    });
  });

  describe('extractFromRule - Section', () => {
    const sectionJson = {
      pxObjClass: 'Rule-HTML-Section',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TicketDetailsSection',
      pyLayouts: [
        { type: 'dynamic', when: 'IsEditable', children: [{ type: 'field', when: 'ShowDescription' }] },
      ],
    };
    const deps = extractor.extractFromRule(sectionJson);
    it('finds when conditions from layout when clauses', () => {
      expect(deps.some(d => d.name === 'IsEditable' && d.type === 'Rule-Obj-When')).toBe(true);
    });
  });

  describe('extractFromRule - Declare', () => {
    const declareJson = {
      pxObjClass: 'Rule-Declare-Trigger',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'OnTicketSave',
      pyTriggerType: 'after',
      pyOperation: 'save',
      pyActivityName: 'PostSaveProcessing',
      pyWhenCondition: 'IsNotArchived',
    };
    const deps = extractor.extractFromRule(declareJson);
    it('finds activity reference from declare trigger', () => {
      expect(deps.some(d => d.name === 'PostSaveProcessing' && d.type === 'Rule-Obj-Activity' && d.relation === 'calls')).toBe(true);
    });
    it('finds when condition from declare trigger', () => {
      expect(deps.some(d => d.name === 'IsNotArchived' && d.type === 'Rule-Obj-When')).toBe(true);
    });
  });
});
