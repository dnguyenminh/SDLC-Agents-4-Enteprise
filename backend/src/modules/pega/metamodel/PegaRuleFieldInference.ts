/**
 * PegaMetaModelCompiler — field-to-rule-type inference helpers.
 * Extracted from CompiledPegaRuleParserStrategy: pure mapping functions
 * used during dependency extraction and symbol naming.
 */

/** Candidate JSON keys that carry the rule's display name, in priority order. */
const NAME_CANDIDATE_KEYS = ['pyRuleName', 'pyActivityName', 'pyModelName', 'pyTransformName',
  'pyFlowName', 'pyServiceRuleName', 'pyServiceName', 'pyLabel', 'pyName'];

/** Extract the rule name from well-known name fields (fallback "Unnamed"). */
export function extractRuleName(json: Record<string, unknown>): string {
  for (const key of NAME_CANDIDATE_KEYS) {
    const val = json[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return 'Unnamed';
}

/** Map a reference field name/value to the most likely rule type. */
export function inferRuleTypeFromField(fieldName: string, fieldValue: string, _json?: Record<string, unknown>): string {
  // Map known reference fields to rule types
  if (fieldName === 'pyAuthProfile') return 'Rule-Connect-AuthProfile';
  if (fieldName === 'pyRequestDataTransform' || fieldName === 'pyResponseDataTransform') return 'Rule-Obj-Model';
  if (fieldName === 'pyWhenCondition') return 'Rule-Obj-When';
  if (fieldName === 'pyOnChangeTrigger') return 'Rule-Obj-When';
  if (fieldName === 'pyFlowActionName') return 'Rule-Obj-FlowAction';
  if (fieldName === 'pySuperClass' || fieldName === 'pyDerivesFrom' || fieldName === 'pyPatternParent') return 'Rule-Obj-Class';
  if (fieldName === 'pyTransformName') return 'Rule-Obj-Model';
  if (fieldName === 'pyActivityName') return 'Rule-Obj-Activity';
  if (fieldName === 'pyFlowName') return 'Rule-Obj-Flow';
  if (fieldName === 'pyPropertyName') return 'Rule-Obj-Property';
  if (fieldName === 'pyPropertyEvaluated') return 'Rule-Obj-Property';
  if (fieldName === 'pyMethodParameters') return 'Rule-Obj-Activity';

  // Generic detection from value pattern
  if (fieldValue.includes('.') && fieldName.includes('Method')) return 'Rule-Obj-Activity';
  if (fieldName.endsWith('Transform')) return 'Rule-Obj-Model';
  if (fieldName.endsWith('Class')) return 'Rule-Obj-Class';
  if (fieldName.endsWith('Profile')) return 'Rule-Connect-AuthProfile';
  if (fieldName.endsWith('Condition')) return 'Rule-Obj-When';
  if (fieldName.endsWith('From')) return 'Rule-Obj-Class';
  if (fieldName.endsWith('Evaluated')) return 'Rule-Obj-Property';
  if (fieldName.endsWith('Trigger')) return 'Rule-Obj-When';
  if (fieldName.endsWith('Action')) return 'Rule-Obj-FlowAction';
  if (fieldName.endsWith('Target')) return 'Rule-Obj-Model';
  if (fieldName.endsWith('Source')) return 'Rule-Obj-Class';
  if (fieldName.endsWith('Expression')) return 'Rule-Obj-Model';
  if (fieldName.endsWith('Name')) return 'Rule-Obj-Activity';

  return 'Rule-Obj-Activity';
}
