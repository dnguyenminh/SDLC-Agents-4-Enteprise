import { describe, it, expect } from 'vitest';
import { PegaSemanticAnalyzer } from '../../semantic/PegaSemanticAnalyzer.js';

describe('PegaSemanticAnalyzer', () => {
  const analyzer = new PegaSemanticAnalyzer();

  describe('Activity analysis', () => {
    const activityJson = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'ResolveTicket',
      pyLabel: 'Process and Resolve Jira Ticket',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Validate Input' },
        { pyStepNum: '2', pyMethod: 'Call', pyMethodParameters: '@baseclass.SendNotification', pyLabel: 'Send Email' },
        { pyStepNum: '3', pyMethod: 'Property-Set', pyMethodParameters: '.pyStatus', pyLabel: 'Set Status' },
        { pyStepNum: '4', pyMethod: 'Obj-Save', pyMethodParameters: 'Work-Cover-Jira', pyLabel: 'Save to DB' },
        { pyStepNum: '5', pyMethod: 'Property-Set', pyMethodParameters: '.pyPriority', pyLabel: 'Set Priority', pyWhenCondition: '.IsHighPriority' },
      ],
    };

    const analysis = analyzer.analyzeActivity(activityJson);

    it('produces summary with step count', () => {
      expect(analysis.ruleType).toBe('Rule-Obj-Activity');
      expect(analysis.name).toBe('ResolveTicket');
      expect(analysis.summary).toContain('5 step(s)');
      expect(analysis.steps).toBe(5);
    });

    it('detects called activities from Call steps', () => {
      expect(analysis.calledActivities).toContain('ValidateData');
      expect(analysis.calledActivities).toContain('SendNotification');
      expect(analysis.calledActivities).toHaveLength(2);
    });

    it('detects properties set from Property-Set steps', () => {
      expect(analysis.setProperties).toContain('pyStatus');
      expect(analysis.setProperties).toContain('pyPriority');
    });

    it('predicts side effects: api_call and db_write', () => {
      const apiCalls = analysis.sideEffects.filter(s => s.type === 'api_call');
      const dbWrites = analysis.sideEffects.filter(s => s.type === 'db_write');
      const pageUpdates = analysis.sideEffects.filter(s => s.type === 'page_update');
      expect(apiCalls.length).toBeGreaterThanOrEqual(2);
      expect(dbWrites.length).toBe(1);
      expect(pageUpdates.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts conditions from when conditions on steps', () => {
      expect(analysis.conditions.length).toBeGreaterThanOrEqual(1);
      expect(analysis.conditions[0].field).toBe('.IsHighPriority');
    });

    it('extracts dependencies for called activities', () => {
      const activityDeps = analysis.dependencies.filter(d => d.type === 'activity');
      expect(activityDeps.length).toBe(2);
      expect(activityDeps[0].target).toBe('ValidateData');
    });

    it('detects data flow entries for property sets', () => {
      expect(analysis.dataFlow.length).toBeGreaterThanOrEqual(2);
    });

    it('generates intent describing what the activity does', () => {
      expect(analysis.intent).toContain('calls 2');
      expect(analysis.intent).toContain('sets 2');
    });
  });

  describe('Data Transform analysis', () => {
    const dtJson = {
      pxObjClass: 'Rule-Obj-Model',
      pyClassName: 'Work-Cover-Jira',
      pyModelName: 'InitializeTicket',
      pyLabel: 'Initialize ticket data',
      pyActions: [
        { pyActionType: 'Set', pyTarget: '.pyStatus', pySource: 'New' },
        { pyActionType: 'Set', pyTarget: '.pyPriority', pySource: '5' },
        { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaultStatus' },
        { pyActionType: 'Set', pyTarget: '.pyOwner', pySource: '.pyRequestor', pyWhenCondition: '.HasRequestor' },
      ],
    };

    const analysis = analyzer.analyzeDataTransform(dtJson);

    it('extracts property mappings', () => {
      expect(analysis.propertyMappings).toBeDefined();
      expect(analysis.propertyMappings!.length).toBe(3);
      expect(analysis.propertyMappings![0].from).toBe('New');
      expect(analysis.propertyMappings![0].to).toBe('pyStatus');
    });

    it('detects sub-transform references', () => {
      const transformDeps = analysis.dependencies.filter(d => d.type === 'data_transform');
      expect(transformDeps.length).toBe(1);
      expect(transformDeps[0].target).toBe('SetDefaultStatus');
    });

    it('detects conditions on conditional actions', () => {
      expect(analysis.conditions.length).toBe(1);
      expect(analysis.conditions[0].field).toBe('.HasRequestor');
    });

    it('generates summary with action count', () => {
      expect(analysis.summary).toContain('4 action(s)');
    });
  });

  describe('Decision analysis', () => {
    const decisionJson = {
      pxObjClass: 'Rule-Declare-DecisionTable',
      pyClassName: 'Work-Cover-Jira',
      pyLabel: 'PriorityDecision',
      pyPropertyEvaluated: 'pyUrgency',
      pyDecisionTableRows: [
        { pyCondition: 'pyUrgency > 80', pyResult: 'Critical' },
        { pyCondition: 'pyUrgency > 50', pyResult: 'High' },
        { pyCondition: 'pyUrgency > 20', pyResult: 'Medium' },
      ],
      pyReturnActions: [{ pyTransformName: 'SetHighPriorityData' }],
    };

    const analysis = analyzer.analyzeDecision(decisionJson);

    it('extracts conditions and results', () => {
      expect(analysis.conditions.length).toBe(3);
      expect(analysis.conditions[0].field).toBe('pyUrgency');
      expect(analysis.conditions[0].operator).toBe('>');
      expect(analysis.conditions[0].value).toBe('80');
    });

    it('tracks row count and property evaluated', () => {
      expect(analysis.decisionRows).toBe(3);
      expect(analysis.propertyEvaluated).toBe('pyUrgency');
    });

    it('detects data flow from input to output', () => {
      expect(analysis.dataFlow.length).toBe(3);
      expect(analysis.dataFlow[0].input).toBe('pyUrgency');
      expect(analysis.dataFlow[0].output).toBe('Critical');
    });

    it('extracts return action transform dependencies', () => {
      const transformDeps = analysis.dependencies.filter(d => d.type === 'data_transform');
      expect(transformDeps.length).toBe(1);
      expect(transformDeps[0].target).toBe('SetHighPriorityData');
    });

    it('generates summary referencing rows', () => {
      expect(analysis.summary).toContain('3 row(s)');
    });
  });
});
