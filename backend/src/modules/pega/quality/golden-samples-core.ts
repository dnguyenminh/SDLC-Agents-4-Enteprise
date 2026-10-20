/** Golden dataset sample builders part 1 — core rule types (BR-18 extraction from PegaGoldenDataset). */
import type { GoldenTestSample } from './PegaGoldenDataset.js';

export function activitySample(): GoldenTestSample {
  return {
    name: 'ResolveTicket',
    pxObjClass: 'Rule-Obj-Activity',
    json: {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'ResolveTicket',
      pyRuleset: 'JiraIntegration',
      pyRuleSetVersion: '01-02-03',
      pyLabel: 'Process and Resolve Jira Ticket',
      pyDescription: 'Main resolution flow for Jira integration',
      pxCreateDateTime: '2024-01-01T00:00:00Z',
      pxCreateOperator: 'admin',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.ValidateData', pyLabel: 'Validate Input' },
        { pyStepNum: '2', pyMethod: 'Call', pyMethodParameters: '@baseclass.SendNotification', pyLabel: 'Send Email' },
        { pyStepNum: '3', pyMethod: 'Property-Set', pyMethodParameters: '.pyStatus', pyLabel: 'Set Status', pyStepContext: 'Primary' },
        { pyStepNum: '4', pyMethod: 'Branch', pyMethodParameters: 'Work-Cover-Jira.EscalateIfNeeded', pyLabel: 'Escalate', pyWhenCondition: 'NeedsEscalation' },
      ],
    },
    expectedReferences: ['ValidateData', 'SendNotification', 'EscalateIfNeeded', 'NeedsEscalation'],
    expectedChildren: 4,
  };
}

export function dataTransformSample(): GoldenTestSample {
  return {
    name: 'InitializeTicket',
    pxObjClass: 'Rule-Obj-Model',
    json: {
      pxObjClass: 'Rule-Obj-Model',
      pyClassName: 'Work-Cover-Jira',
      pyModelName: 'InitializeTicket',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Initialize ticket data',
      pyActions: [
        { pyActionType: 'Set', pyTarget: '.pyStatus', pySource: 'New' },
        { pyActionType: 'Apply Data Transform', pyTarget: 'SetDefaultStatus' },
        { pyActionType: 'Set', pyTarget: '.pyPriority', pySource: '5', pyWhenCondition: 'IsHighPriority' },
        { pyActionType: 'Set', pyTarget: '.pyDescription', pySource: 'Default description' },
      ],
    },
    expectedReferences: ['SetDefaultStatus', 'IsHighPriority'],
    expectedChildren: 4,
  };
}

export function flowSample(): GoldenTestSample {
  return {
    name: 'MainProcess',
    pxObjClass: 'Rule-Obj-Flow',
    json: {
      pxObjClass: 'Rule-Obj-Flow',
      pyClassName: 'Work-Cover-Jira',
      pyFlowName: 'MainProcess',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Main Jira Process Flow',
      pyDescription: 'End-to-end Jira ticket processing flow',
      pyShapes: [
        { pyShapeType: 'Start', pyName: 'Begin' },
        { pyShapeType: 'Assignment', pyName: 'AssignTicket', pyFlowActionName: 'NewAssignment' },
        { pyShapeType: 'Action', pyName: 'Validate', pyFlowActionName: 'ValidateAction', pyWhenCondition: 'NeedsValidation' },
        { pyShapeType: 'Action', pyName: 'ProcessPayment', pyFlowActionName: 'PaymentAction', pyClassName: 'Work-Cover-Payment' },
        { pyShapeType: 'End', pyName: 'Done' },
      ],
    },
    expectedReferences: ['NewAssignment', 'ValidateAction', 'NeedsValidation', 'PaymentAction', 'Work-Cover-Payment'],
    expectedChildren: 5,
  };
}

export function decisionTableSample(): GoldenTestSample {
  return {
    name: 'PriorityDecision',
    pxObjClass: 'Rule-Declare-DecisionTable',
    json: {
      pxObjClass: 'Rule-Declare-DecisionTable',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'PriorityDecision',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Priority decision table',
      pyPropertyEvaluated: 'pyPriority',
      pyDecisionTableRows: [
        { pyCondition: 'pyUrgency > 80', pyResult: 'Critical' },
        { pyCondition: 'pyUrgency > 50', pyResult: 'High' },
        { pyCondition: 'pyUrgency > 20', pyResult: 'Medium' },
        { pyCondition: 'pyUrgency >= 0', pyResult: 'Low' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 4,
  };
}

export function decisionTreeSample(): GoldenTestSample {
  return {
    name: 'ApprovalTree',
    pxObjClass: 'Rule-Declare-DecisionTree',
    json: {
      pxObjClass: 'Rule-Declare-DecisionTree',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'ApprovalTree',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Approval decision tree',
      pyPropertyEvaluated: 'pyApprovalStatus',
      pyRows: [
        { pyCondition: 'pyAmount > 10000', pyResult: 'SeniorManager' },
        { pyCondition: 'pyAmount > 5000', pyResult: 'Manager' },
        { pyCondition: 'pyAmount > 0', pyResult: 'TeamLead' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 3,
  };
}

export function whenSample(): GoldenTestSample {
  return {
    name: 'IsHighPriority',
    pxObjClass: 'Rule-Obj-When',
    json: {
      pxObjClass: 'Rule-Obj-When',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'IsHighPriority',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Check if priority is high',
      pyWhenExpression: '.pyPriority = "Critical" .OR. .pyUrgency > 75',
      pyWhenType: 'Expression',
    },
    expectedReferences: [],
    expectedChildren: 0,
  };
}

export function sectionSample(): GoldenTestSample {
  return {
    name: 'TicketDetails',
    pxObjClass: 'Rule-HTML-Section',
    json: {
      pxObjClass: 'Rule-HTML-Section',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TicketDetails',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Jira ticket details section',
      pyDescription: 'Displays ticket details in a form layout',
      pzIndex: '0',
      pyLayouts: [
        { pyLayoutType: 'Dynamic', pyName: 'HeaderLayout' },
        { pyLayoutType: 'Grid', pyName: 'FieldsGrid' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 2,
  };
}
