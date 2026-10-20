/**
 * Heuristic reference extraction — scalar/field passes 1-3 (BR-18).
 * 1. MetaModel class definitions  2. known reference fields  3. suffix conventions.
 */
import type { MetaModelLookup, AddDepFn } from './reference-maps.js';
import { REFERENCE_FIELD_MAP, inferRuleTypeFromField } from './reference-maps.js';

export function extractScalarRefs(
  json: Record<string, unknown>,
  metaModelClasses: MetaModelLookup,
  pxObjClass: string,
  isSelfField: (field: string) => boolean,
  addDep: AddDepFn,
): void {
  // 1. Auto-detect reference fields using MetaModel class definitions
  const classDef = metaModelClasses.get(pxObjClass);
  if (classDef) {
    for (const prop of classDef.properties) {
      if (!prop.isReference) continue;
      if (isSelfField(prop.name)) continue;
      const val = json[prop.name];
      if (typeof val !== 'string' || !val) continue;
      const inferred = REFERENCE_FIELD_MAP[prop.name] ?? inferRuleTypeFromField(prop.name);
      addDep(inferred.ruleType, val, prop.name, inferred.relation, !prop.required);
    }
  }

  // 2. Known reference field patterns (fallback for unknown class definitions)
  for (const [key, mapping] of Object.entries(REFERENCE_FIELD_MAP)) {
    if (isSelfField(key)) continue;
    if (classDef && classDef.properties.some(p => p.name === key && p.isReference)) continue;
    const val = json[key];
    if (typeof val !== 'string' || !val) continue;
    addDep(mapping.ruleType || inferRuleTypeFromField(key).ruleType, val, key, mapping.relation, mapping.optional);
  }

  // 3. Convention-based detection: fields ending in Name/Class/Profile/Transform/Condition
  const referenceSuffixes = ['Name', 'Class', 'Profile', 'Transform', 'Condition', 'From', 'Evaluated', 'Trigger', 'Action', 'Target', 'Source', 'Expression'];
  for (const [key, val] of Object.entries(json)) {
    if (typeof val !== 'string' || !val.trim()) continue;
    if (isSelfField(key)) continue;
    if (key === 'pxObjClass' || key === 'pyRuleset' || key === 'pyRulesetVersion' || key === 'pyRuleSet' || key === 'pyRuleSetVersion') continue;
    if (REFERENCE_FIELD_MAP[key]) continue;
    if (classDef && classDef.properties.some(p => p.name === key && p.isReference)) continue;

    const hasRefSuffix = referenceSuffixes.some(s => key.endsWith(s));
    if (!hasRefSuffix) continue;

    const inferred = inferRuleTypeFromField(key);
    addDep(inferred.ruleType, val, key, inferred.relation, true);
  }
}
