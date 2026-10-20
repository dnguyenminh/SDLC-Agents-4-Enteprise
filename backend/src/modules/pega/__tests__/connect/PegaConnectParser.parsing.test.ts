import { describe, it, expect } from 'vitest';
import { PegaConnectParser } from '../../connect/PegaConnectParser.js';

describe('PegaConnectParser', () => {
  const parser = new PegaConnectParser();

  describe('supports', () => {
    it('supports Rule-Connect-REST', () => {
      expect(parser.supports('Rule-Connect-REST')).toBe(true);
    });
    it('supports Rule-Connect-SOAP', () => {
      expect(parser.supports('Rule-Connect-SOAP')).toBe(true);
    });
    it('supports Rule-Connect-SQL', () => {
      expect(parser.supports('Rule-Connect-SQL')).toBe(true);
    });
    it('supports Rule-Connect-File', () => {
      expect(parser.supports('Rule-Connect-File')).toBe(true);
    });
    it('supports Rule-Service-REST', () => {
      expect(parser.supports('Rule-Service-REST')).toBe(true);
    });
    it('supports generic Rule-Connect- prefix', () => {
      expect(parser.supports('Rule-Connect-MQ')).toBe(true);
    });
    it('does not support unrelated rule types', () => {
      expect(parser.supports('Rule-Obj-Activity')).toBe(false);
      expect(parser.supports('Rule-Obj-Model')).toBe(false);
    });
  });

  describe('parseConnectRest', () => {
    it('parses Rule-Connect-REST with endpoint, method, auth, headers', () => {
      const json = {
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'GetJiraIssue',
        pyLabel: 'Get Jira Issue',
        pyBaseURL: 'https://jira.example.com/rest/api/2',
        pyResourcePath: '/issue/{issueId}',
        pyHTTPMethod: 'GET',
        pyAuthProfile: 'JiraOAuth',
        pyAuthType: 'oauth2',
        pyRequestDataTransform: 'MapJiraRequest',
        pyResponseDataTransform: 'ParseJiraResponse',
        pyHeaders: [
          { pyHeaderName: 'Authorization', pyHeaderValue: 'Bearer ${token}' },
          { pyHeaderName: 'Content-Type', pyHeaderValue: 'application/json' },
        ],
      };

      const rule = parser.parseConnectRest(json);
      expect(rule.connectType).toBe('REST');
      expect(rule.endpoint).toBe('https://jira.example.com/rest/api/2');
      expect(rule.method).toBe('GET');
      expect(rule.authType).toBe('oauth2');
      expect(rule.authRef).toBe('JiraOAuth');
      expect(rule.requestMapping).toBe('MapJiraRequest');
      expect(rule.responseMapping).toBe('ParseJiraResponse');
      expect(rule.headers).toHaveLength(2);
      expect(rule.headers![0].pyName).toBe('Authorization');
      expect(rule.headers![0].pyValue).toBe('Bearer ${token}');
      expect(rule.headers![1].pyName).toBe('Content-Type');
    });

    it('handles optional fields gracefully for REST', () => {
      const json = {
        pxObjClass: 'Rule-Connect-REST',
        pyRuleName: 'MinimalRest',
      };

      const rule = parser.parseConnectRest(json);
      expect(rule.endpoint).toBeUndefined();
      expect(rule.method).toBeUndefined();
      expect(rule.authRef).toBeUndefined();
      expect(rule.headers).toBeUndefined();
    });
  });

  describe('parseConnectSoap', () => {
    it('parses Rule-Connect-SOAP with WSDL URL, SOAP action', () => {
      const json = {
        pxObjClass: 'Rule-Connect-SOAP',
        pyRuleName: 'GetCustomerSoap',
        pyLabel: 'Get Customer via SOAP',
        pyWSDLURL: 'https://example.com/service?wsdl',
        pySoapAction: 'http://example.com/GetCustomer',
        pyEndpointURL: 'https://example.com/service',
        pyAuthProfile: 'BasicAuth',
        pyHeaders: [
          { pyHeaderName: 'SOAPAction', pyHeaderValue: 'http://example.com/GetCustomer' },
        ],
      };

      const rule = parser.parseConnectSoap(json);
      expect(rule.connectType).toBe('SOAP');
      expect(rule.wsdlUrl).toBe('https://example.com/service?wsdl');
      expect(rule.soapAction).toBe('http://example.com/GetCustomer');
      expect(rule.endpoint).toBe('https://example.com/service');
      expect(rule.authRef).toBe('BasicAuth');
      expect(rule.headers).toHaveLength(1);
    });
  });

  describe('parseConnectSql', () => {
    it('parses Rule-Connect-SQL with datasource, statement', () => {
      const json = {
        pxObjClass: 'Rule-Connect-SQL',
        pyRuleName: 'GetOpenTickets',
        pyDataSource: 'JiraDB',
        pySQLStatement: 'SELECT * FROM TICKETS WHERE STATUS = ?',
        pyRWAccess: 'JiraDB',
      };

      const rule = parser.parseConnectSql(json);
      expect(rule.connectType).toBe('SQL');
      expect(rule.dataSource).toBe('JiraDB');
      expect(rule.sqlStatement).toBe('SELECT * FROM TICKETS WHERE STATUS = ?');
    });
  });

  describe('parseConnectFile', () => {
    it('parses Rule-Connect-File with file path, pattern', () => {
      const json = {
        pxObjClass: 'Rule-Connect-File',
        pyRuleName: 'WriteOutputFile',
        pyFilePath: '/data/output/report.csv',
        pyFilePattern: '*.csv',
      };

      const rule = parser.parseConnectFile(json);
      expect(rule.connectType).toBe('File');
      expect(rule.filePath).toBe('/data/output/report.csv');
      expect(rule.filePattern).toBe('*.csv');
    });
  });

  describe('parseServiceRule', () => {
    it('parses Rule-Service-REST with allowed methods', () => {
      const json = {
        pxObjClass: 'Rule-Service-REST',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'JiraWebhookService',
        pyServiceType: 'REST',
        pyEndpointURL: '/api/jira/webhook',
        pyHttpMethod: 'POST',
      };

      const service = parser.parseServiceRule(json);
      expect(service.serviceType).toBe('REST');
      expect(service.endpoint).toBe('/api/jira/webhook');
      expect(service.allowedMethods).toEqual(['POST']);
    });

    it('parses service with multiple allowed methods', () => {
      const json = {
        pxObjClass: 'Rule-Service-REST',
        pyRuleName: 'MultiMethodService',
        pyEndpointURL: '/api/data',
        pyHttpMethod: 'GET,POST,PUT',
      };

      const service = parser.parseServiceRule(json);
      expect(service.allowedMethods).toEqual(['GET', 'POST', 'PUT']);
    });
  });
});
