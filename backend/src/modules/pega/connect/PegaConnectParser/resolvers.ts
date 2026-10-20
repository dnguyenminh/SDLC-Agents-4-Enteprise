/**
 * Field resolution + dependency/logic-summary helpers for PegaConnectParser.
 * Extracted (BR-18) — pure functions; no behavior change.
 */

import type { UnresolvedDependency } from '../../models.js';
import type { PegaConnectHeader, ConnectMethod, AuthType } from '../PegaConnectTypes.js';

export function extractName(_pxObjClass: string, json: Record<string, unknown>): string {
  return (json.pyRuleName as string)
    || (json.pyServiceRuleName as string)
    || (json.pyServiceName as string)
    || (json.pyLabel as string)
    || '';
}

export function resolveEndpoint(json: Record<string, unknown>): string | undefined {
  return (json.pyEndpointURL as string)
    || (json.pyBaseURL as string)
    || (json.pyResourcePath as string)
    || (json.pyUrl as string)
    || undefined;
}

export function resolveMethod(json: Record<string, unknown>): ConnectMethod | undefined {
  const method = (json.pyHttpMethod as string) || (json.pyHTTPMethod as string) || (json.pyMethod as string);
  if (method && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    return method.toUpperCase() as ConnectMethod;
  }
  return undefined;
}

export function resolveAuthType(json: Record<string, unknown>): AuthType | undefined {
  const auth = (json.pyAuthType as string) || '';
  if (!auth) return undefined;
  const lower = auth.toLowerCase();
  if (lower === 'basic') return 'basic';
  if (lower === 'oauth2') return 'oauth2';
  if (lower === 'apikey') return 'apiKey';
  if (lower === 'custom') return 'custom';
  if (lower === 'none') return 'none';
  if (lower.includes('oauth') || lower.includes('oauth2')) return 'oauth2';
  if (lower.includes('basic')) return 'basic';
  if (lower.includes('apikey') || lower.includes('api_key') || lower.includes('api key')) return 'apiKey';
  return 'custom';
}

export function parseHeaders(json: Record<string, unknown>): PegaConnectHeader[] | undefined {
  const rawHeaders = json.pyHeaders as unknown[];
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) return undefined;
  return rawHeaders.map(h => {
    const header = h as Record<string, unknown>;
    return {
      pyName: (header.pyHeaderName as string) || (header.pyName as string) || '',
      pyValue: (header.pyHeaderValue as string) || (header.pyValue as string) || '',
    };
  });
}

export function inferServiceType(json: Record<string, unknown>): string {
  const cls = (json.pxObjClass as string) || '';
  if (cls.startsWith('Rule-Service-REST')) return 'REST';
  if (cls.startsWith('Rule-Service-SOAP')) return 'SOAP';
  if (cls.startsWith('Rule-Service-File')) return 'File';
  if (cls.startsWith('Rule-Service-')) return cls.substring('Rule-Service-'.length);
  return 'REST';
}

export function extractDependencies(json: Record<string, unknown>): UnresolvedDependency[] {
  const deps: UnresolvedDependency[] = [];
  const className = (json.pyClassName as string) || '@baseclass';

  const authRef = (json.pyAuthProfile as string);
  if (authRef) {
    deps.push({ ruleType: 'Rule-Connect-AuthProfile', className: '@baseclass', ruleName: authRef });
  }
  const requestMapping = (json.pyRequestDataTransform as string);
  if (requestMapping) {
    deps.push({ ruleType: 'Rule-Obj-Model', className, ruleName: requestMapping });
  }
  const responseMapping = (json.pyResponseDataTransform as string);
  if (responseMapping) {
    deps.push({ ruleType: 'Rule-Obj-Model', className, ruleName: responseMapping });
  }

  return deps;
}

export function buildLogicSummary(pxObjClass: string, json: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`${pxObjClass}: ${extractName(pxObjClass, json)}`);

  if (pxObjClass.startsWith('Rule-Connect-REST') || pxObjClass.startsWith('Rule-Connect-HTTP')) {
    lines.push(`  Endpoint: ${resolveEndpoint(json) || '(not set)'}`);
    lines.push(`  Method: ${resolveMethod(json) || 'GET'}`);
    const auth = (json.pyAuthProfile as string);
    if (auth) lines.push(`  Auth Profile: ${auth}`);
    const reqMap = (json.pyRequestDataTransform as string);
    if (reqMap) lines.push(`  Request Transform: ${reqMap}`);
    const resMap = (json.pyResponseDataTransform as string);
    if (resMap) lines.push(`  Response Transform: ${resMap}`);
  } else if (pxObjClass === 'Rule-Connect-SOAP') {
    lines.push(`  WSDL: ${(json.pyWSDLURL as string) || '(not set)'}`);
    lines.push(`  SOAP Action: ${(json.pySoapAction as string) || '(not set)'}`);
  } else if (pxObjClass === 'Rule-Connect-SQL') {
    lines.push(`  Data Source: ${(json.pyDataSource as string) || '(not set)'}`);
    const stmt = (json.pySQLStatement as string) || '';
    lines.push(`  Statement: ${stmt.substring(0, 80)}${stmt.length > 80 ? '...' : ''}`);
  } else if (pxObjClass === 'Rule-Connect-File') {
    lines.push(`  File Path: ${(json.pyFilePath as string) || '(not set)'}`);
    lines.push(`  Pattern: ${(json.pyFilePattern as string) || '(none)'}`);
  } else if (pxObjClass.startsWith('Rule-Service-')) {
    lines.push(`  Endpoint: ${resolveEndpoint(json) || '(not set)'}`);
    lines.push(`  Methods: ${(json.pyHttpMethod as string) || (json.pyHTTPMethod as string) || 'GET'}`);
  }

  return lines.join('\n');
}
