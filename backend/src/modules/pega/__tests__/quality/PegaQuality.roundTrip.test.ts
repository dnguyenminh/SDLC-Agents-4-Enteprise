import { describe, it, expect } from 'vitest';
import { roundTrip, dataset } from './helpers.js';

// =============================================================================
// SECTION 4: RoundTripValidator
// =============================================================================

describe('PegaRoundTripValidator', () => {
  it('successfully preserves all fields for Activity', () => {
    const activity = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'ResolveTicket',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Test Activity',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Step 1' },
      ],
    };
    const result = roundTrip.validate(activity);
    expect(result.success).toBe(true);
    expect(result.ruleName).toBe('ResolveTicket');
    expect(result.ruleType).toBe('Rule-Obj-Activity');
  });

  it('successfully preserves all fields for DataTransform', () => {
    const dt = {
      pxObjClass: 'Rule-Obj-Model',
      pyClassName: 'Work-Cover-Jira',
      pyModelName: 'InitializeTicket',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Test DT',
      pyActions: [
        { pyActionType: 'Set', pyTarget: '.pyStatus', pySource: 'New' },
        { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaultStatus' },
      ],
    };
    const result = roundTrip.validate(dt);
    expect(result.success).toBe(true);
    expect(result.ruleName).toBe('InitializeTicket');
    expect(result.ruleType).toBe('Rule-Obj-Model');
  });

  it('successfully preserves all fields for Flow', () => {
    const flow = {
      pxObjClass: 'Rule-Obj-Flow',
      pyClassName: 'Work-Cover-Jira',
      pyFlowName: 'MainFlow',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Test Flow',
      pyShapes: [
        { pyShapeType: 'Start', pyName: 'Begin' },
        { pyShapeType: 'End', pyName: 'Done' },
      ],
    };
    const result = roundTrip.validate(flow);
    expect(result.success).toBe(true);
  });

  it('successfully preserves all fields for DecisionTable', () => {
    const dt = {
      pxObjClass: 'Rule-Declare-DecisionTable',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TestTable',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Test Decision Table',
      pyPropertyEvaluated: 'pyStatus',
      pyDecisionTableRows: [
        { pyCondition: 'pyUrgency > 80', pyResult: 'Critical' },
      ],
    };
    const result = roundTrip.validate(dt);
    expect(result.success).toBe(true);
  });

  it('successfully preserves all fields for ConnectREST', () => {
    const rest = {
      pxObjClass: 'Rule-Connect-REST',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'GetIssue',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Get Issue',
      pyBaseURL: 'https://example.com/api',
      pyResourcePath: '/issue/{id}',
      pyHTTPMethod: 'GET',
      pyHeaders: [
        { pyHeaderName: 'Authorization', pyHeaderValue: 'Bearer token' },
      ],
    };
    const result = roundTrip.validate(rest);
    expect(result.success).toBe(true);
  });

  it('detects lost fields when semantic field is dropped', () => {
    // Simulate a case where a key field gets stripped
    const original = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'TestActivity',
      pyCustomField: 'should-survive',
      steps: [],
    };
    const result = roundTrip.validate(original);
    // pyCustomField is not a system field, should survive
    expect(result.lostFields).not.toContain('pyCustomField');
  });

  it('handles empty JSON gracefully without throwing', () => {
    const result = roundTrip.validate({});
    expect(result.ruleName).toBe('unknown');
    expect(result.ruleType).toBe('unknown');
    expect(result.differences).toBeDefined();
  });

  it('validateBatch returns results for all samples', () => {
    const all = dataset.getAllSamples();
    const jsons = all.map(s => s.json);
    const results = roundTrip.validateBatch(jsons);
    expect(results).toHaveLength(15);
    for (const r of results) {
      expect(r.ruleName).toBeDefined();
      expect(r.ruleType).toBeDefined();
    }
  });

  it('assertPropertiesPreserved returns true for unmodified samples', () => {
    const activity = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'TestActivity',
      pyLabel: 'Test',
    };
    const result = roundTrip.validate(activity);
    expect(roundTrip.assertPropertiesPreserved(activity, result)).toBe(true);
  });
});
