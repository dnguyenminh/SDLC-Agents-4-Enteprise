import { describe, it, expect } from 'vitest';
import { PegaRuleSimulator } from '../../semantic/PegaRuleSimulator.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

describe('PegaRuleSimulator', () => {
  const simulator = new PegaRuleSimulator();

  describe('Expression evaluation', () => {
    it('evaluates a simple property expression', () => {
      const context = new PegaClipboardContext({
        pyWorkPage: {
          Status: { type: 'Text', value: 'Open' },
          Amount: { type: 'Number', value: 100 },
        },
      }, 'pyWorkPage');
      const result = simulator.evaluateExpression('.Amount', context);
      expect(result).toBe(100);
    });

    it('evaluates a text property via expression', () => {
      const context = new PegaClipboardContext({
        pyWorkPage: {
          Status: { type: 'Text', value: 'Open' },
        },
      }, 'pyWorkPage');
      const result = simulator.evaluateExpression('.Status', context);
      expect(result).toBe('Open');
    });
  });

  describe('Activity simulation', () => {
    const activityJson = {
      pxObjClass: 'Rule-Obj-Activity',
      pyActivityName: 'ResolveTicket',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Validate Input' },
        { pyStepNum: '2', pyMethod: 'Property-Set', pyMethodParameters: '.pyStatus', pyLabel: 'Set Status' },
        { pyStepNum: '3', pyMethod: 'Obj-Save', pyMethodParameters: 'Work-Cover-Jira', pyLabel: 'Save to DB' },
      ],
    };

    it('simulates an activity with multiple steps', () => {
      const context = new PegaClipboardContext({ pyWorkPage: { Status: { type: 'Text', value: 'New' } } }, 'pyWorkPage');
      const result = simulator.simulateActivity(activityJson, context);
      expect(result.success).toBe(true);
      expect(result.trace.length).toBeGreaterThanOrEqual(5);
      expect(result.errors).toHaveLength(0);
      const actions = result.trace.map(t => t.action);
      expect(actions).toContain('call');
      expect(actions).toContain('set');
      expect(actions).toContain('db_write');
      expect(actions).toContain('complete');
    });

    it('skips steps when when-condition is false', () => {
      const jsonWithCondition = {
        pxObjClass: 'Rule-Obj-Activity',
        pyActivityName: 'ConditionalActivity',
        steps: [
          { pyStepNum: '1', pyMethod: 'Property-Set', pyMethodParameters: '.pyStatus', pyLabel: 'Set', pyWhenCondition: 'false' },
          { pyStepNum: '2', pyMethod: 'Property-Set', pyMethodParameters: '.pyName', pyLabel: 'Set Name' },
        ],
      };
      const context = new PegaClipboardContext({ pyWorkPage: {} }, 'pyWorkPage');
      const result = simulator.simulateActivity(jsonWithCondition, context);
      expect(result.success).toBe(true);
      const actions = result.trace.map(t => t.action);
      expect(actions).toContain('skip');
      expect(actions).toContain('set');
    });
  });

  describe('Data Transform simulation', () => {
    const dtJson = {
      pxObjClass: 'Rule-Obj-Model',
      pyModelName: 'InitializeTicket',
      pyActions: [
        { pyActionType: 'Set', pyTarget: '.pyStatus', pySource: 'New' },
        { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaultStatus' },
        { pyActionType: 'Set', pyTarget: '.pyPriority', pySource: '5', pyWhenCondition: 'false' },
      ],
    };

    it('simulates a data transform with actions', () => {
      const context = new PegaClipboardContext({ pyWorkPage: {} }, 'pyWorkPage');
      const result = simulator.simulateDataTransform(dtJson, context);
      expect(result.success).toBe(true);
      expect(result.trace.length).toBeGreaterThanOrEqual(5);
      const actions = result.trace.map(t => t.action);
      expect(actions).toContain('set');
      expect(actions).toContain('apply_transform');
    });

    it('skips conditional actions when condition is false', () => {
      const context = new PegaClipboardContext({ pyWorkPage: {} }, 'pyWorkPage');
      const result = simulator.simulateDataTransform(dtJson, context);
      const actions = result.trace.map(t => t.action);
      expect(actions).toContain('skip');
    });
  });

  describe('Flow simulation', () => {
    const flowJson = {
      pxObjClass: 'Rule-Obj-Flow',
      pyFlowName: 'MainProcess',
      pyShapes: [
        { pyShapeType: 'Start', pyName: 'Begin' },
        { pyShapeType: 'Assignment', pyName: 'AssignTicket', pyFlowActionName: 'NewAssignment' },
        { pyShapeType: 'End', pyName: 'Done' },
      ],
    };

    it('simulates a flow from start to end', () => {
      const context = new PegaClipboardContext({ pyWorkPage: {} }, 'pyWorkPage');
      const result = simulator.simulateFlow(flowJson, context);
      expect(result.success).toBe(true);
      expect(result.trace.length).toBeGreaterThanOrEqual(4);
      const detail = result.trace.map(t => t.detail).join(' ');
      expect(detail).toContain('END');
    });

    it('reports error for flow with no shapes', () => {
      const context = new PegaClipboardContext({ pyWorkPage: {} }, 'pyWorkPage');
      const result = simulator.simulateFlow({ pxObjClass: 'Rule-Obj-Flow', pyFlowName: 'Empty' }, context);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Flow has no shapes defined');
    });
  });

  describe('Decision Table simulation', () => {
    const decisionJson = {
      pxObjClass: 'Rule-Declare-DecisionTable',
      pyLabel: 'PriorityDecision',
      pyDecisionTableRows: [
        { pyCondition: 'pyUrgency > 80', pyResult: 'Critical' },
        { pyCondition: 'pyUrgency > 50', pyResult: 'High' },
      ],
    };

    it('simulates a decision table and traces evaluation path', () => {
      const context = new PegaClipboardContext({
        pyWorkPage: { pyUrgency: { type: 'Number', value: 90 } },
      }, 'pyWorkPage');
      const result = simulator.simulateDecisionTable(decisionJson, context);
      expect(result.success).toBe(true);
      const detail = result.trace.map(t => t.detail).join(' ');
      expect(detail).toContain('matched');
    });

    it('handles no-match scenario gracefully', () => {
      const context = new PegaClipboardContext({
        pyWorkPage: { Urgency: { type: 'Number', value: 10 } },
      }, 'pyWorkPage');
      const result = simulator.simulateDecisionTable(decisionJson, context);
      expect(result.success).toBe(true);
      const detail = result.trace.map(t => t.detail).join(' ');
      expect(detail).toContain('No matching row');
    });
  });
});
