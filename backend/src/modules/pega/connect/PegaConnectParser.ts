import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { PegaConnectRule, PegaServiceRule, ConnectMethod } from './PegaConnectTypes.js';
import {
  buildLogicSummary,
  extractDependencies,
  extractName,
  inferServiceType,
  parseHeaders,
  resolveAuthType,
  resolveEndpoint,
  resolveMethod,
} from './PegaConnectParser/resolvers.js';

const CONNECT_CLASSES = new Set([
  'Rule-Connect-REST',
  'Rule-Connect-SOAP',
  'Rule-Connect-SQL',
  'Rule-Connect-File',
  'Rule-Connect-HTTP',
  'Rule-Connect-MQ',
  'Rule-Connect-JMS',
  'Rule-Connect-JCA',
  'Rule-Connect-Java',
  'Rule-Connect-EJB',
  'Rule-Connect-dotNet',
  'Rule-Connect-CMIS',
]);

export class PegaConnectParser implements IPegaRuleParserStrategy {
  public supports(pxObjClass: string): boolean {
    if (pxObjClass.startsWith('Rule-Service-')) return true;
    if (CONNECT_CLASSES.has(pxObjClass)) return true;
    if (pxObjClass.startsWith('Rule-Connect-')) return true;
    return false;
  }

  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || '';
    const className = (json.pyClassName as string) || '@baseclass';
    const name = extractName(pxObjClass, json);
    const fqn = `${pxObjClass}:${className}:${name}`;

    const dependencies = extractDependencies(json);

    const logicSummary = buildLogicSummary(pxObjClass, json);

    const symbol = {
      fqn,
      name,
      className,
      ruleType: pxObjClass,
      isRule: true,
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
      logicSummary,
    };

    return { symbol, dependencies };
  }

  public parseConnectRest(json: Record<string, unknown>): PegaConnectRule {
    const headers = parseHeaders(json);
    return {
      pxObjClass: (json.pxObjClass as string) || 'Rule-Connect-REST',
      pyName: extractName('Rule-Connect-REST', json),
      pyLabel: (json.pyLabel as string) || undefined,
      connectType: 'REST',
      endpoint: resolveEndpoint(json),
      method: resolveMethod(json),
      authType: resolveAuthType(json),
      authRef: (json.pyAuthProfile as string) || undefined,
      headers,
      requestMapping: (json.pyRequestDataTransform as string) || undefined,
      responseMapping: (json.pyResponseDataTransform as string) || undefined,
    };
  }

  public parseConnectSoap(json: Record<string, unknown>): PegaConnectRule {
    const headers = parseHeaders(json);
    return {
      pxObjClass: (json.pxObjClass as string) || 'Rule-Connect-SOAP',
      pyName: extractName('Rule-Connect-SOAP', json),
      pyLabel: (json.pyLabel as string) || undefined,
      connectType: 'SOAP',
      endpoint: resolveEndpoint(json),
      method: resolveMethod(json),
      authType: resolveAuthType(json),
      authRef: (json.pyAuthProfile as string) || undefined,
      headers,
      wsdlUrl: (json.pyWSDLURL as string) || (json.pyWsdlUrl as string) || undefined,
      soapAction: (json.pySoapAction as string) || (json.pySOAPAction as string) || undefined,
      requestMapping: (json.pyRequestDataTransform as string) || undefined,
      responseMapping: (json.pyResponseDataTransform as string) || undefined,
    };
  }

  public parseConnectSql(json: Record<string, unknown>): PegaConnectRule {
    return {
      pxObjClass: (json.pxObjClass as string) || 'Rule-Connect-SQL',
      pyName: extractName('Rule-Connect-SQL', json),
      pyLabel: (json.pyLabel as string) || undefined,
      connectType: 'SQL',
      endpoint: (json.pyDataSource as string) || undefined,
      method: undefined,
      dataSource: (json.pyDataSource as string) || (json.pyRWAccess as string) || undefined,
      sqlStatement: (json.pySQLStatement as string) || (json.pyStatement as string) || undefined,
    };
  }

  public parseConnectFile(json: Record<string, unknown>): PegaConnectRule {
    return {
      pxObjClass: (json.pxObjClass as string) || 'Rule-Connect-File',
      pyName: extractName('Rule-Connect-File', json),
      pyLabel: (json.pyLabel as string) || undefined,
      connectType: 'File',
      filePath: (json.pyFilePath as string) || (json.pyFileName as string) || undefined,
      filePattern: (json.pyFilePattern as string) || undefined,
    };
  }

  public parseServiceRule(json: Record<string, unknown>): PegaServiceRule {
    const methodStr = (json.pyHttpMethod as string) || (json.pyHTTPMethod as string) || 'GET';
    return {
      pxObjClass: (json.pxObjClass as string) || 'Rule-Service-REST',
      pyName: extractName('Rule-Service-REST', json),
      serviceType: (json.pyServiceType as string) || inferServiceType(json),
      endpoint: resolveEndpoint(json) || '',
      allowedMethods: methodStr.split(',').map(m => m.trim() as ConnectMethod).filter(m => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)),
    };
  }
}
