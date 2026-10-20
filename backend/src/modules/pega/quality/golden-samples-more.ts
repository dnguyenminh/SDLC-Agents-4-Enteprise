/** Golden dataset sample builders part 2 — UI/declare/utility rule types (BR-18 extraction from PegaGoldenDataset). */
import type { GoldenTestSample } from './PegaGoldenDataset.js';

export function connectRestSample(): GoldenTestSample {
  return {
    name: 'GetJiraIssue',
    pxObjClass: 'Rule-Connect-REST',
    json: {
      pxObjClass: 'Rule-Connect-REST',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'GetJiraIssue',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Get Jira issue details',
      pyBaseURL: 'https://jira.example.com/rest/api/2',
      pyResourcePath: '/issue/{issueId}',
      pyHTTPMethod: 'GET',
      pyHeaders: [
        { pyHeaderName: 'Authorization', pyHeaderValue: 'Bearer ${token}' },
        { pyHeaderName: 'Content-Type', pyHeaderValue: 'application/json' },
        { pyHeaderName: 'Accept', pyHeaderValue: 'application/json' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 3,
  };
}

export function declareExpressionSample(): GoldenTestSample {
  return {
    name: 'TotalAmount',
    pxObjClass: 'Rule-Declare-Expressions',
    json: {
      pxObjClass: 'Rule-Declare-Expressions',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TotalAmount',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Calculate total amount',
      pyTargetProperty: '.pyTotalAmount',
      pyExpression: '.pyQuantity * .pyUnitPrice',
      pyOnChangeTrigger: 'pyQuantity pyUnitPrice',
    },
    expectedReferences: ['pyQuantity pyUnitPrice'],
    expectedChildren: 0,
  };
}

export function flowActionSample(): GoldenTestSample {
  return {
    name: 'NewAssignment',
    pxObjClass: 'Rule-Obj-FlowAction',
    json: {
      pxObjClass: 'Rule-Obj-FlowAction',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'NewAssignment',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Create new assignment',
      pyDescription: 'Creates a new assignment in the workflow',
      pyPerformer: 'CurrentOperator',
      pyAssignmentType: 'Standard',
    },
    expectedReferences: [],
    expectedChildren: 0,
  };
}

export function classSample(): GoldenTestSample {
  return {
    name: 'Work-Cover-Jira',
    pxObjClass: 'Rule-Obj-Class',
    json: {
      pxObjClass: 'Rule-Obj-Class',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'Work-Cover-Jira',
      pySuperClass: 'Work-',
      pyPatternParent: 'Work-Cover-',
      pyDerivesFrom: 'Work-',
      pyDescription: 'Jira integration work class',
      pxRuleReferences: [
        { pxRuleObjClass: 'Rule-Obj-Property', pyRuleName: 'pyStatus', pxRuleClassName: 'Work-Cover-Jira' },
        { pxRuleObjClass: 'Rule-Obj-Property', pyRuleName: 'pyPriority', pxRuleClassName: 'Work-Cover-Jira' },
        { pxRuleObjClass: 'Rule-Obj-Property', pyRuleName: 'pyDescription', pxRuleClassName: 'Work-Cover-Jira' },
      ],
    },
    expectedReferences: ['Work-', 'Work-Cover-', 'pyStatus', 'pyPriority', 'pyDescription'],
    expectedChildren: 3,
  };
}

export function declarePagesSample(): GoldenTestSample {
  return {
    name: 'TicketPages',
    pxObjClass: 'Rule-Declare-Pages',
    json: {
      pxObjClass: 'Rule-Declare-Pages',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TicketPages',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Declare pages for ticket processing',
      pyPages: [
        { pyPageName: 'pyJiraResponse', pyPageClass: 'Data-Jira-Response' },
        { pyPageName: 'pyJiraConfig', pyPageClass: 'Data-Jira-Config' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 2,
  };
}

export function utilitySample(): GoldenTestSample {
  return {
    name: 'StringUtils',
    pxObjClass: 'Rule-Utility-Function',
    json: {
      pxObjClass: 'Rule-Utility-Function',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'StringUtils',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'String utility functions',
      pyParameters: [
        { pyParamName: 'input', pyParamType: 'Text' },
        { pyParamName: 'delimiter', pyParamType: 'Text' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 2,
  };
}

export function connectSOAPSample(): GoldenTestSample {
  return {
    name: 'GetCustomerData',
    pxObjClass: 'Rule-Connect-SOAP',
    json: {
      pxObjClass: 'Rule-Connect-SOAP',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'GetCustomerData',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Get customer data via SOAP',
      pyBaseURL: 'https://customer.example.com/soap/v1',
      pySOAPAction: 'GetCustomerInfo',
      pyHeaders: [
        { pyHeaderName: 'Authorization', pyHeaderValue: 'Basic ${creds}' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 1,
  };
}

export function accessRoleSample(): GoldenTestSample {
  return {
    name: 'JiraIntegrationRole',
    pxObjClass: 'Rule-Access-Role',
    json: {
      pxObjClass: 'Rule-Access-Role',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'JiraIntegrationRole',
      pyRuleset: 'JiraIntegration',
      pyLabel: 'Jira integration access role',
      pyOperations: [
        { pyOperation: 'Read', pyAccess: 'Allowed' },
        { pyOperation: 'Write', pyAccess: 'Allowed' },
        { pyOperation: 'Delete', pyAccess: 'Denied' },
      ],
    },
    expectedReferences: [],
    expectedChildren: 3,
  };
}
