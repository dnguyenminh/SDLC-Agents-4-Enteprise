/**
 * Semantic analyzer impls — Section + Connector (BR-18 extraction).
 * Standalone functions; PegaSemanticAnalyzer delegates to these.
 */
import type { SemanticAnalysis, SideEffect, SemanticDep, DataFlowEntry } from './types.js';
import { extractName } from './analyzer-utils.js';

export function analyzeSection(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const label = (json.pyLabel as string) || name;
  const fields: string[] = [];
  const layouts: string[] = [];
  const dependencies: SemanticDep[] = [];

  const seenFields = new Set<string>();
  const extractFields = (obj: Record<string, unknown>, prefix: string): void => {
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'pyPropertyName' && typeof val === 'string' && val && !seenFields.has(val)) {
        seenFields.add(val);
        fields.push(val);
      }
      if (key === 'pyLayoutType' && typeof val === 'string' && val) {
        layouts.push(val);
      }
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'object' && item !== null) {
            extractFields(item as Record<string, unknown>, prefix);
          }
        }
      }
    }
  };

  extractFields(json, '');

  const layoutTypes = layouts.length > 0 ? [...new Set(layouts)] : ['dynamic'];
  const summary = fields.length > 0
    ? `This section "${label}" renders ${fields.length} field(s) (${fields.join(', ')}) in ${layoutTypes.join(', ')} layout(s).`
    : `This section "${label}" renders content in ${layoutTypes.join(', ')} layout(s).`;

  return {
    ruleType: 'Rule-Obj-Section',
    name,
    className,
    summary,
    intent: `Render ${fields.length} field(s) in ${layoutTypes.join(', ')} layout(s)`,
    sideEffects: [],
    dependencies,
    conditions: [],
    dataFlow: [],
    renderedFields: fields,
    layoutTypes,
  };
}

export function analyzeConnect(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const pxObjClass = (json.pxObjClass as string) || 'Rule-Connect-REST';
  const label = (json.pyLabel as string) || name;
  const baseUrl = (json.pyBaseURL as string) || '';
  const resourcePath = (json.pyResourcePath as string) || '';
  const httpMethod = (json.pyHTTPMethod as string) || 'GET';
  const reqClass = (json.pyRequestClass as string) || '';
  const respClass = (json.pyResponseClass as string) || '';
  const authType = (json.pyAuthenticationType as string) || '';
  const sideEffects: SideEffect[] = [];
  const dependencies: SemanticDep[] = [];
  const dataFlow: DataFlowEntry[] = [];

  const url = (baseUrl || '') + (resourcePath || '');
  sideEffects.push({
    type: 'api_call',
    target: url || `${pxObjClass}:${name}`,
    detail: `Calls ${httpMethod} ${url || pxObjClass}`,
  });

  if (reqClass) {
    dataFlow.push({ input: reqClass, transform: `Serialized to ${httpMethod} request`, output: url || 'endpoint' });
  }
  if (respClass) {
    dataFlow.push({ input: url || 'endpoint', transform: `Deserialized from ${httpMethod} response`, output: respClass });
  }

  if (authType) {
    dependencies.push({
      type: 'auth',
      target: authType,
      targetClass: className,
      context: `Uses ${authType} authentication`,
    });
  }

  const summary = url
    ? `This ${pxObjClass} "${label}" calls ${httpMethod} ${url} with ${authType || 'no'} authentication.`
    : `This ${pxObjClass} "${label}" defines a connector endpoint.`;

  return {
    ruleType: pxObjClass,
    name,
    className,
    summary,
    intent: `Call ${httpMethod} ${url || 'external endpoint'} via ${pxObjClass}`,
    sideEffects,
    dependencies,
    conditions: [],
    dataFlow,
    endpointUrl: url,
    httpMethod,
    authType,
  };
}
