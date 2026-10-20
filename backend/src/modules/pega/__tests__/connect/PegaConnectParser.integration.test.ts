import { describe, it, expect } from 'vitest';
import { PegaConnectParser } from '../../connect/PegaConnectParser.js';
import { PegaParserRegistry } from '../../strategies/PegaParserRegistry.js';
import { registerConnectParser } from '../../connect/index.js';

describe('PegaConnectParser', () => {
  const parser = new PegaConnectParser();

  describe('parse (strategy interface)', () => {
    it('returns symbol and dependencies for Rule-Connect-REST', () => {
      const json = {
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'GetJiraIssue',
        pyRuleset: 'JiraIntegration',
        pyRulesetVersion: '01-02-03',
        pyEndpointURL: 'https://jira.example.com/rest/api/2',
        pyAuthProfile: 'JiraOAuth',
        pyRequestDataTransform: 'MapJiraRequest',
        pyResponseDataTransform: 'ParseJiraResponse',
      };

      const result = parser.parse(json);
      expect(result.symbol.fqn).toBe('Rule-Connect-REST:Work-Cover-Jira:GetJiraIssue');
      expect(result.symbol.name).toBe('GetJiraIssue');
      expect(result.symbol.ruleType).toBe('Rule-Connect-REST');
      expect(result.symbol.isRule).toBe(true);
      expect(result.symbol.ruleset).toBe('JiraIntegration');

      expect(result.dependencies).toHaveLength(3);
      expect(result.dependencies).toContainEqual({ ruleType: 'Rule-Connect-AuthProfile', className: '@baseclass', ruleName: 'JiraOAuth' });
      expect(result.dependencies).toContainEqual({ ruleType: 'Rule-Obj-Model', className: 'Work-Cover-Jira', ruleName: 'MapJiraRequest' });
      expect(result.dependencies).toContainEqual({ ruleType: 'Rule-Obj-Model', className: 'Work-Cover-Jira', ruleName: 'ParseJiraResponse' });
    });

    it('extracts reference fields from Rule-Connect-SOAP', () => {
      const json = {
        pxObjClass: 'Rule-Connect-SOAP',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'SoapService',
        pyWSDLURL: 'https://example.com/service?wsdl',
        pyAuthProfile: 'WsSecurity',
      };

      const result = parser.parse(json);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]).toEqual({ ruleType: 'Rule-Connect-AuthProfile', className: '@baseclass', ruleName: 'WsSecurity' });
    });
  });

  describe('serialization round-trip', () => {
    it('supports round-trip: parse -> PegaConnectRule -> same fields', () => {
      const original = {
        pxObjClass: 'Rule-Connect-REST',
        pyRuleName: 'RoundTripTest',
        pyLabel: 'Round Trip Test',
        pyBaseURL: 'https://api.example.com/v1',
        pyHTTPMethod: 'POST',
        pyAuthProfile: 'ApiKeyAuth',
        pyAuthType: 'apiKey',
        pyRequestDataTransform: 'BuildPayload',
        pyHeaders: [
          { pyHeaderName: 'X-API-Key', pyHeaderValue: '${apiKey}' },
        ],
      };

      const rule = parser.parseConnectRest(original);
      expect(rule.pyName).toBe('RoundTripTest');
      expect(rule.connectType).toBe('REST');
      expect(rule.endpoint).toBe('https://api.example.com/v1');
      expect(rule.method).toBe('POST');
      expect(rule.authRef).toBe('ApiKeyAuth');
      expect(rule.authType).toBe('apiKey');
      expect(rule.requestMapping).toBe('BuildPayload');
      expect(rule.headers).toHaveLength(1);
      expect(rule.headers![0].pyName).toBe('X-API-Key');
      expect(rule.headers![0].pyValue).toBe('${apiKey}');
    });
  });

  describe('empty / missing fields', () => {
    it('handles empty headers array', () => {
      const json = {
        pxObjClass: 'Rule-Connect-REST',
        pyRuleName: 'NoHeaders',
        pyHeaders: [],
      };

      const rule = parser.parseConnectRest(json);
      expect(rule.headers).toBeUndefined();
    });

    it('handles null or missing pyHeaders', () => {
      const json = {
        pxObjClass: 'Rule-Connect-REST',
        pyRuleName: 'NoHeadersAtAll',
      };

      const rule = parser.parseConnectRest(json);
      expect(rule.headers).toBeUndefined();
    });
  });

  describe('registry integration', () => {
    it('registers via PegaParserRegistry', () => {
      const registry = new PegaParserRegistry();
      const registered = registerConnectParser(registry);
      expect(registered).toBeInstanceOf(PegaConnectParser);

      const result = registry.parse({
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'Work-Cover',
        pyRuleName: 'RegistryTest',
      });

      expect(result.symbol.ruleType).toBe('Rule-Connect-REST');
      expect(result.symbol.name).toBe('RegistryTest');
    });
  });
});
