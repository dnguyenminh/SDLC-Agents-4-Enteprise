/**
 * SA4E-??? — PegaServiceMethodLinker
 * Extracts ALL linked rules (activities, data transforms, when rules) from a
 * service METHOD rule JSON, keyed by its ServiceType (REST/SOAP/FILE/JMS/...).
 * The mapping is declarative + has a generic fallback so new service types
 * classify automatically without code changes.
 */

export type PegaServiceType =
  | 'Rule-Service-REST'
  | 'Rule-Service-SOAP'
  | 'Rule-Service-FILE'
  | 'Rule-Service-JMS'
  | 'Rule-Service-MQ'
  | 'Rule-Service-EJB'
  | 'Rule-Service-JAVA'
  | 'Rule-Service-HTTP'
  | 'Rule-Service-SQL'
  | 'Rule-Service-EMAIL'
  | 'Rule-Service-PORTLET'
  | string;

/** A rule referenced by a service method. */
export interface LinkedRule {
  ruleName: string;
  ruleType: string;
  role: string;
  appliesTo?: string;
}

interface FieldMap {
  field: string;
  ruleType: string;
  role: string;
}

/**
 * Declarative per-service-type field map. Each entry says:
 * "read field X, treat its value as a rule of type Y, in role Z".
 * The generic fallback below covers anything not listed here.
 */
const SERVICE_FIELD_MAP: Record<string, FieldMap[]> = {
  'Rule-Service-REST': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
    { field: 'pyRequestDataTransform', ruleType: 'Rule-Obj-Model', role: 'request-transform' },
    { field: 'pyResponseDataTransform', ruleType: 'Rule-Obj-Model', role: 'response-transform' },
    { field: 'pyWhenName', ruleType: 'Rule-Obj-When', role: 'when-condition' },
  ],
  'Rule-Service-SOAP': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
    { field: 'pyRequestDataTransform', ruleType: 'Rule-Obj-Model', role: 'request-transform' },
    { field: 'pyResponseDataTransform', ruleType: 'Rule-Obj-Model', role: 'response-transform' },
    { field: 'pyWhenName', ruleType: 'Rule-Obj-When', role: 'when-condition' },
  ],
  'Rule-Service-FILE': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
    { field: 'pyRequestDataTransform', ruleType: 'Rule-Obj-Model', role: 'request-transform' },
  ],
  'Rule-Service-JMS': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
    { field: 'pyRequestDataTransform', ruleType: 'Rule-Obj-Model', role: 'request-transform' },
    { field: 'pyResponseDataTransform', ruleType: 'Rule-Obj-Model', role: 'response-transform' },
  ],
  'Rule-Service-HTTP': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
    { field: 'pyRequestDataTransform', ruleType: 'Rule-Obj-Model', role: 'request-transform' },
  ],
  'Rule-Service-MQ': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  ],
  'Rule-Service-EJB': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  ],
  'Rule-Service-JAVA': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  ],
  'Rule-Service-SQL': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  ],
  'Rule-Service-EMAIL': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  ],
  'Rule-Service-PORTLET': [
    { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  ],
};

const GENERIC_FIELDS: FieldMap[] = [
  { field: 'pyActivityName', ruleType: 'Rule-Obj-Activity', role: 'processing-activity' },
  { field: 'pyRequestDataTransform', ruleType: 'Rule-Obj-Model', role: 'request-transform' },
  { field: 'pyResponseDataTransform', ruleType: 'Rule-Obj-Model', role: 'response-transform' },
  { field: 'pyParseDataTransform', ruleType: 'Rule-Obj-Model', role: 'parse-transform' },
  { field: 'pyMapDataTransform', ruleType: 'Rule-Obj-Model', role: 'map-transform' },
  { field: 'pyWhenName', ruleType: 'Rule-Obj-When', role: 'when-condition' },
];

/**
 * Rule-Service-REST stores the linked activity PER HTTP verb, not in a single
 * pyActivityName. The applies-to class is pyPrimaryPageClass.
 */
const REST_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Read a possibly-nested field (dot path) from a JSON object. */
function readField(json: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, json);
}

function pushLink(
  out: LinkedRule[], seen: Set<string>,
  ruleName: unknown, ruleType: string, role: string, appliesTo?: string,
): void {
  if (typeof ruleName !== 'string' || !ruleName.trim()) return;
  const key = `${ruleType}:${role}:${ruleName}:${appliesTo ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ ruleName: ruleName.trim(), ruleType, role, appliesTo });
}

/** Extract links declared at top level or inside pyMethods[]. */
function extractFromFields(
  json: Record<string, unknown>, fields: FieldMap[],
  appliesTo: string | undefined, out: LinkedRule[], seen: Set<string>,
): void {
  for (const map of fields) {
    const value = readField(json, map.field);
    if (typeof value === 'string' && value.trim()) {
      pushLink(out, seen, value, map.ruleType, map.role, appliesTo);
    }
  }
}

/**
 * Main entry: extract every linked rule from a service method JSON.
 * @param methodJson - the downloaded service method/rule JSON
 * @param serviceType - the ServiceType (e.g. Rule-Service-REST)
 * @param defaultClass - applies-to class to associate with linked rules
 */
export function extractServiceLinks(
  methodJson: Record<string, unknown>,
  serviceType: string,
  defaultClass?: string,
): LinkedRule[] {
  const out: LinkedRule[] = [];
  const seen = new Set<string>();
  const appliesTo = (defaultClass ?? (methodJson.pyClassName as string) ?? undefined) || undefined;
  const fields = SERVICE_FIELD_MAP[serviceType] ?? GENERIC_FIELDS;

  if (serviceType === 'Rule-Service-REST') {
    extractRestVerbLinks(methodJson, out, seen);
  } else {
    extractFromFields(methodJson, fields, appliesTo, out, seen);
  }

  const methods = methodJson.pyMethods;
  if (Array.isArray(methods)) {
    for (const m of methods) {
      if (m && typeof m === 'object') {
        extractFromFields(m as Record<string, unknown>, fields, appliesTo, out, seen);
      }
    }
  }
  return out;
}

/** REST: read py{VERB}ServiceActivity + py{VERB}FallbackActivity for each HTTP verb. */
function extractRestVerbLinks(
  json: Record<string, unknown>, out: LinkedRule[], seen: Set<string>,
): void {
  const appliesTo = (json.pyPrimaryPageClass as string) || undefined;
  for (const verb of REST_VERBS) {
    pushLink(out, seen, json[`py${verb}ServiceActivity`], 'Rule-Obj-Activity', `${verb}-processing-activity`, appliesTo);
    pushLink(out, seen, json[`py${verb}FallbackActivity`], 'Rule-Obj-Activity', `${verb}-fallback-activity`, appliesTo);
  }
}
