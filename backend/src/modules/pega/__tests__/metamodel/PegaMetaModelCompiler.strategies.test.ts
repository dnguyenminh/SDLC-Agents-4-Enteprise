import { describe, it, expect, beforeAll } from 'vitest';
import { PegaMetaModelLoader, PegaMetaModelCompiler } from '../../metamodel/index.js';
import { setupMetaModel } from './helpers.js';

describe('PegaMetaModelCompiler', () => {
  let loader: PegaMetaModelLoader;
  let compiler: PegaMetaModelCompiler;

  beforeAll(async () => {
    ({ loader, compiler } = await setupMetaModel());
  });

  // ---------------------------------------------------------------------------
  // Test 1: Compiles strategy for Rule-Obj-Activity, parses sample activity JSON
  // ---------------------------------------------------------------------------
  describe('Test 1: Rule-Obj-Activity strategy', () => {
    it('compiles a strategy and parses a sample activity JSON', () => {
      const activityDef = loader.getClass('Rule-Obj-Activity');
      expect(activityDef).toBeDefined();

      const strategy = compiler.compileStrategy(activityDef!);
      expect(strategy.supports('Rule-Obj-Activity')).toBe(true);

      const sampleActivity = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyRuleName: 'ApproveOrder',
        pyLabel: 'Approve Order Activity',
        pyRuleset: 'OrderApp',
        pyRulesetVersion: '01-02-01',
        pyDescription: 'Approves an order after validation',
        pyMethod: 'Call',
        steps: [
          {
            pxObjClass: 'Embed-Step',
            pyStepNumber: '1',
            pyMethod: 'Call',
            pyMethodParameters: 'ValidateOrder',
            pyStepDescription: 'Validate the order',
          },
          {
            pxObjClass: 'Embed-Step',
            pyStepNumber: '2',
            pyMethod: 'Call',
            pyMethodParameters: 'SendApproval',
            pyStepDescription: 'Send for approval',
          },
        ],
        pyLinks: [
          {
            pxObjClass: 'Embed-ClassLinks',
            pyLinkName: 'RelatedFlow',
            pyLinkLinkToClass: 'Work-Order',
            pyLinkLinkToName: 'ApprovalFlow',
          },
        ],
        pyPagesAndClasses: [
          {
            pxObjClass: 'Embed-PagesAndClasses',
            pyPagesAndClassesPage: 'orderPage',
            pyPagesAndClassesClass: 'Work-Order',
          },
        ],
        pyValidRuleSets: [
          {
            pxObjClass: 'Embed-ClassRuleSets',
            pyRuleSetName: 'OrderApp',
          },
        ],
      };

      const result = strategy.parse(sampleActivity);
      expect(result.symbol.ruleType).toBe('Rule-Obj-Activity');
      expect(result.symbol.name).toBe('ApproveOrder');
      expect(result.symbol.className).toBe('Work-Order');
      expect(result.symbol.fqn).toBe('Rule-Obj-Activity:Work-Order:ApproveOrder');
      expect(result.symbol.isRule).toBe(true);
      expect(result.symbol.ruleset).toBe('OrderApp');
      expect(result.symbol.version).toBe('01-02-01');

      // Should detect pyMethodParameters (Call method) and other references as dependencies
      expect(result.dependencies.length).toBeGreaterThanOrEqual(1);
      expect(result.dependencies.some(d => d.ruleName === 'ApproveOrder')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Compiles strategy for Rule-Connect-REST, parses sample connect JSON
  // ---------------------------------------------------------------------------
  describe('Test 2: Rule-Connect-REST strategy', () => {
    it('compiles a strategy and parses a sample connect JSON with endpoint and method', () => {
      const connectDef = loader.getClass('Rule-Connect-REST');
      expect(connectDef).toBeDefined();

      const strategy = compiler.compileStrategy(connectDef!);
      expect(strategy.supports('Rule-Connect-REST')).toBe(true);

      const sampleRest = {
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'GetJiraIssue',
        pyLabel: 'Get Jira Issue',
        pyRuleset: 'JiraIntegration',
        pyRulesetVersion: '01-02-03',
        pyBaseURL: 'https://jira.example.com/rest/api/2',
        pyResourcePath: '/issue/{issueId}',
        pyHTTPMethod: 'GET',
        pyAuthProfile: 'JiraOAuth',
        pyAuthType: 'oauth2',
        pyRequestDataTransform: 'MapJiraRequest',
        pyResponseDataTransform: 'ParseJiraResponse',
        pyHeaders: [
          { pxObjClass: 'Embed-Header', pyHeaderName: 'Authorization', pyHeaderValue: 'Bearer ${token}' },
        ],
      };

      const result = strategy.parse(sampleRest);

      // Symbol assertion
      expect(result.symbol.ruleType).toBe('Rule-Connect-REST');
      expect(result.symbol.name).toBe('GetJiraIssue');
      expect(result.symbol.className).toBe('Work-Cover-Jira');
      expect(result.symbol.fqn).toBe('Rule-Connect-REST:Work-Cover-Jira:GetJiraIssue');
      expect(result.symbol.isRule).toBe(true);

      // Reference dependencies: pyAuthProfile, pyRequestDataTransform, pyResponseDataTransform
      // plus any other fields ending in Name/Class/Profile/Transform
      expect(result.dependencies.length).toBeGreaterThanOrEqual(3);

      expect(result.dependencies).toContainEqual(
        expect.objectContaining({ ruleName: 'JiraOAuth', ruleType: 'Rule-Connect-AuthProfile' }),
      );
      expect(result.dependencies).toContainEqual(
        expect.objectContaining({ ruleName: 'MapJiraRequest', ruleType: 'Rule-Obj-Model' }),
      );
      expect(result.dependencies).toContainEqual(
        expect.objectContaining({ ruleName: 'ParseJiraResponse', ruleType: 'Rule-Obj-Model' }),
      );
    });
  });
});
