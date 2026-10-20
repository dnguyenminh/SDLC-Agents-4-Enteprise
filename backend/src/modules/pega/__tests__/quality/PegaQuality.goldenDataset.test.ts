import { describe, it, expect } from 'vitest';
import { dataset } from './helpers.js';

// =============================================================================
// SECTION 1: GoldenDataset returns valid samples for all major rule types
// =============================================================================

describe('PegaGoldenDataset — sample integrity', () => {
  it('returns valid Activity sample with correct pxObjClass', () => {
    const sample = dataset.getActivitySample();
    expect(sample.pxObjClass).toBe('Rule-Obj-Activity');
    expect(sample.name).toBe('ResolveTicket');
    expect(sample.json.steps).toBeDefined();
    expect(Array.isArray(sample.json.steps)).toBe(true);
  });

  it('returns valid Data Transform sample with correct pxObjClass', () => {
    const sample = dataset.getDataTransformSample();
    expect(sample.pxObjClass).toBe('Rule-Obj-Model');
    expect(sample.name).toBe('InitializeTicket');
    expect(sample.json.pyActions).toBeDefined();
  });

  it('returns valid Flow sample with correct pxObjClass', () => {
    const sample = dataset.getFlowSample();
    expect(sample.pxObjClass).toBe('Rule-Obj-Flow');
    expect(sample.name).toBe('MainProcess');
    expect(sample.json.pyShapes).toBeDefined();
  });

  it('returns valid Decision Table sample with correct pxObjClass', () => {
    const sample = dataset.getDecisionTableSample();
    expect(sample.pxObjClass).toBe('Rule-Declare-DecisionTable');
    expect(sample.name).toBe('PriorityDecision');
    expect(sample.json.pyDecisionTableRows).toBeDefined();
  });

  it('returns valid Decision Tree sample with correct pxObjClass', () => {
    const sample = dataset.getDecisionTreeSample();
    expect(sample.pxObjClass).toBe('Rule-Declare-DecisionTree');
    expect(sample.name).toBe('ApprovalTree');
  });

  it('returns valid When condition sample with correct pxObjClass', () => {
    const sample = dataset.getWhenSample();
    expect(sample.pxObjClass).toBe('Rule-Obj-When');
    expect(sample.name).toBe('IsHighPriority');
  });

  it('returns valid Section sample with correct pxObjClass', () => {
    const sample = dataset.getSectionSample();
    expect(sample.pxObjClass).toBe('Rule-HTML-Section');
    expect(sample.name).toBe('TicketDetails');
  });

  it('returns valid Connect REST sample with correct pxObjClass', () => {
    const sample = dataset.getConnectRestSample();
    expect(sample.pxObjClass).toBe('Rule-Connect-REST');
    expect(sample.name).toBe('GetJiraIssue');
  });

  it('returns valid Declare Expression sample with correct pxObjClass', () => {
    const sample = dataset.getDeclareExpressionSample();
    expect(sample.pxObjClass).toBe('Rule-Declare-Expressions');
    expect(sample.name).toBe('TotalAmount');
  });

  it('returns valid Class sample with correct pxObjClass', () => {
    const sample = dataset.getClassSample();
    expect(sample.pxObjClass).toBe('Rule-Obj-Class');
    expect(sample.name).toBe('Work-Cover-Jira');
  });

  it('returns valid Flow Action sample with correct pxObjClass', () => {
    const sample = dataset.getFlowActionSample();
    expect(sample.pxObjClass).toBe('Rule-Obj-FlowAction');
    expect(sample.name).toBe('NewAssignment');
  });

  it('returns valid Declare Pages sample with correct pxObjClass', () => {
    const sample = dataset.getDeclarePagesSample();
    expect(sample.pxObjClass).toBe('Rule-Declare-Pages');
    expect(sample.name).toBe('TicketPages');
    expect(sample.json.pyPages).toBeDefined();
    expect(Array.isArray(sample.json.pyPages)).toBe(true);
  });

  it('returns valid Utility sample with correct pxObjClass', () => {
    const sample = dataset.getUtilitySample();
    expect(sample.pxObjClass).toBe('Rule-Utility-Function');
    expect(sample.name).toBe('StringUtils');
    expect(sample.json.pyParameters).toBeDefined();
    expect(Array.isArray(sample.json.pyParameters)).toBe(true);
  });

  it('returns valid Connect SOAP sample with correct pxObjClass', () => {
    const sample = dataset.getConnectSOAPSample();
    expect(sample.pxObjClass).toBe('Rule-Connect-SOAP');
    expect(sample.name).toBe('GetCustomerData');
    expect(sample.json.pyBaseURL).toBeDefined();
    expect(sample.json.pySOAPAction).toBeDefined();
  });

  it('returns valid Access Role sample with correct pxObjClass', () => {
    const sample = dataset.getAccessRoleSample();
    expect(sample.pxObjClass).toBe('Rule-Access-Role');
    expect(sample.name).toBe('JiraIntegrationRole');
    expect(sample.json.pyOperations).toBeDefined();
    expect(Array.isArray(sample.json.pyOperations)).toBe(true);
  });

  it('returns all 15 samples via getAllSamples()', () => {
    const all = dataset.getAllSamples();
    expect(all).toHaveLength(15);
    const types = all.map(s => s.pxObjClass);
    expect(types).toContain('Rule-Obj-Activity');
    expect(types).toContain('Rule-Obj-Model');
    expect(types).toContain('Rule-Obj-Flow');
    expect(types).toContain('Rule-Declare-DecisionTable');
    expect(types).toContain('Rule-Obj-When');
    expect(types).toContain('Rule-Connect-REST');
  });
});
