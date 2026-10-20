/** Reference extraction shared types, maps and inference helpers (BR-18). */
import type { PegaClassDefinition } from '../metamodel/PegaClassDefinition.js';

export interface ResolvedDependency {
  type: string;
  name: string;
  relation: 'calls' | 'extends' | 'implements' | 'configures' | 'references';
  fieldName: string;
  optional: boolean;
}

export interface DependencyNode {
  fqn: string;
  name: string;
  type: string;
  className: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  relation: ResolvedDependency['relation'];
  fieldName: string;
  optional: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

/**
 * Fields used as the rule's own identifier within specific rule types.
 * key: field name, value: the rule type where this field identifies the rule itself.
 * If a rule's pxObjClass matches, the field is treated as self-identifier, not a dependency.
 */
export const SELF_NAME_TYPE_MAP: Record<string, string> = {
  'pyActivityName': 'Rule-Obj-Activity',
  'pyModelName': 'Rule-Obj-Model',
  'pyTransformName': 'Rule-Obj-Model',
  'pyFlowName': 'Rule-Obj-Flow',
};

/**
 * Fields that always identify the rule itself, regardless of rule type.
 */
export const ALWAYS_SELF_FIELDS = new Set([
  'pyRuleName', 'pyClassName', 'pyLabel', 'pyName',
]);

export const REFERENCE_FIELD_MAP: Record<string, { ruleType: string; relation: ResolvedDependency['relation']; optional: boolean }> = {
  pySuperClass: { ruleType: 'Rule-Obj-Class', relation: 'extends', optional: true },
  pyPatternParent: { ruleType: 'Rule-Obj-Class', relation: 'extends', optional: true },
  pyDerivesFrom: { ruleType: 'Rule-Obj-Class', relation: 'extends', optional: true },
  pyWhenCondition: { ruleType: 'Rule-Obj-When', relation: 'references', optional: true },
  pyOnChangeTrigger: { ruleType: 'Rule-Obj-When', relation: 'configures', optional: true },
  pyFlowActionName: { ruleType: 'Rule-Obj-FlowAction', relation: 'references', optional: true },
  pyPropertyName: { ruleType: 'Rule-Obj-Property', relation: 'references', optional: true },
  pyPropertyEvaluated: { ruleType: 'Rule-Obj-Property', relation: 'references', optional: true },
  pyAuthProfile: { ruleType: 'Rule-Connect-AuthProfile', relation: 'configures', optional: true },
  pyRequestDataTransform: { ruleType: 'Rule-Obj-Model', relation: 'configures', optional: true },
  pyResponseDataTransform: { ruleType: 'Rule-Obj-Model', relation: 'configures', optional: true },
  pyAccessGroup: { ruleType: 'Data-Admin-AccessGroup', relation: 'references', optional: true },
  pyAccessRole: { ruleType: 'Rule-Access-Role-Name', relation: 'references', optional: true },
  pyPrivilegeName: { ruleType: 'Rule-Access-Privilege', relation: 'references', optional: true },
  pyBlockName: { ruleType: 'Rule-Obj-When', relation: 'references', optional: true },
  pyStartProcess: { ruleType: 'Rule-Obj-Activity', relation: 'calls', optional: true },
  pyMapRuleSet: { ruleType: 'Rule-Obj-MapValue', relation: 'references', optional: true },
  pyTargetProperty: { ruleType: 'Rule-Obj-FieldValue', relation: 'references', optional: true },
  pyDatasource: { ruleType: 'Rule-Obj-Report-', relation: 'references', optional: true },
  pyPortal: { ruleType: 'Rule-Portal', relation: 'references', optional: true },
  pySkin: { ruleType: 'Rule-Portal-Skin', relation: 'references', optional: true },
};

export const NAME_CANDIDATE_FIELDS = [
  'pyRuleName', 'pyActivityName', 'pyModelName', 'pyTransformName',
  'pyFlowName', 'pyServiceRuleName', 'pyServiceName', 'pyLabel',
  'pyName', 'pyUserIdentifier', 'pyPrivilegeName', 'pyAccessRole',
  'pyAccessGroup',
];

export function inferRuleTypeFromField(fieldName: string): { ruleType: string; relation: ResolvedDependency['relation'] } {
  if (REFERENCE_FIELD_MAP[fieldName]) {
    return { ruleType: REFERENCE_FIELD_MAP[fieldName].ruleType, relation: REFERENCE_FIELD_MAP[fieldName].relation };
  }
  if (fieldName.endsWith('Transform')) return { ruleType: 'Rule-Obj-Model', relation: 'references' };
  if (fieldName.endsWith('Class')) return { ruleType: 'Rule-Obj-Class', relation: 'extends' };
  if (fieldName.endsWith('Profile')) return { ruleType: 'Rule-Connect-AuthProfile', relation: 'configures' };
  if (fieldName.endsWith('Condition')) return { ruleType: 'Rule-Obj-When', relation: 'references' };
  if (fieldName.endsWith('Trigger')) return { ruleType: 'Rule-Obj-When', relation: 'configures' };
  if (fieldName.endsWith('ActivityName')) return { ruleType: 'Rule-Obj-Activity', relation: 'calls' };
  if (fieldName.endsWith('From')) return { ruleType: 'Rule-Obj-Class', relation: 'extends' };
  if (fieldName.endsWith('Evaluated')) return { ruleType: 'Rule-Obj-Property', relation: 'references' };
  if (fieldName.endsWith('Action')) return { ruleType: 'Rule-Obj-FlowAction', relation: 'references' };
  if (fieldName.endsWith('Target')) return { ruleType: 'Rule-Obj-Model', relation: 'references' };
  if (fieldName.endsWith('Source')) return { ruleType: 'Rule-Obj-Class', relation: 'extends' };
  if (fieldName.endsWith('Name')) return { ruleType: 'Rule-Obj-Activity', relation: 'calls' };
  return { ruleType: 'Rule-Obj-Activity', relation: 'references' };
}

export function extractName(json: Record<string, unknown>): string {
  for (const key of NAME_CANDIDATE_FIELDS) {
    const val = json[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return 'Unnamed';
}

/** Public name extraction alias (kept on the original module path). */
export function extractPegaName(json: Record<string, unknown>): string {
  return extractName(json);
}

/** Class-def lookup type (keeps graph/heuristic modules free of metamodel imports). */
export type MetaModelLookup = Map<string, PegaClassDefinition>;

/** Deduplicating dependency sink shared by the heuristic extraction passes. */
export type AddDepFn = (
  ruleType: string, name: string, fieldName: string,
  relation: ResolvedDependency['relation'], optional: boolean,
) => void;
