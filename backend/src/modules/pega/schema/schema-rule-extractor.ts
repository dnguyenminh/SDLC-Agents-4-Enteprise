/**
 * SA4E-214 — Rule-based field extraction for SchemaAnalyzeService.
 * Extracted from SchemaAnalyzeService.ts: deterministic strategies over
 * pxRuleReferences, pyRows/pyCells bindings and top-level data keys.
 */

import type { FieldDescriptor } from '../../../models/pega-schema.models.js';

/** Run all rule-based extraction strategies in order (deduped by path). */
export function extractFieldsRuleBased(
  json: Record<string, unknown>, ruleType: string,
): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const seen = new Set<string>();

  // Strategy 1: Look for pxRuleReferences with field bindings
  extractFromRuleReferences(json, fields, seen);

  // Strategy 2: Look for pyRows/pyCells with pyValue bindings
  extractFromCellBindings(json, fields, seen);

  // Strategy 3: Look for top-level properties that look like data fields
  extractTopLevelDataFields(json, fields, seen, ruleType);

  return fields;
}

/** Extract from pxRuleReferences array. */
function extractFromRuleReferences(
  json: Record<string, unknown>, fields: FieldDescriptor[], seen: Set<string>,
): void {
  const refs = json['pxRuleReferences'];
  if (!Array.isArray(refs)) return;

  for (const ref of refs) {
    if (!ref || typeof ref !== 'object') continue;
    const r = ref as Record<string, unknown>;
    const propName = String(r['pyPropertyName'] || r['pyValue'] || '');
    if (!propName || propName.startsWith('px') || propName.startsWith('pz')) continue;
    if (seen.has(propName)) continue;
    seen.add(propName);

    fields.push({
      path: propName.replace(/^\./, ''),
      category: inferCategory(propName),
      type: inferFieldType(r),
      description: String(r['pyLabel'] || r['pyCaption'] || ''),
      frequency: 'common',
    });
  }
}

/** Extract from pyRows → pyCells hierarchy. */
function extractFromCellBindings(
  json: Record<string, unknown>, fields: FieldDescriptor[], seen: Set<string>,
): void {
  const traverse = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(traverse); return; }

    const record = obj as Record<string, unknown>;
    const value = record['pyValue'];
    if (typeof value === 'string' && value.startsWith('.') && value.length > 1) {
      const propName = value.substring(1);
      if (!propName.startsWith('px') && !propName.startsWith('pz') && !seen.has(propName)) {
        seen.add(propName);
        fields.push({
          path: propName,
          category: inferCategory(propName),
          type: record['pyType'] === 'CHECKBOX' ? 'boolean' : 'string',
          description: String(record['pyLabel'] || record['pyCaption'] || ''),
          frequency: 'common',
        });
      }
    }
    // Recurse into children
    for (const val of Object.values(record)) {
      if (typeof val === 'object' && val !== null) traverse(val);
    }
  };
  traverse(json['pyRows'] || json['pySections']);
}

/** Extract top-level data fields (non-internal, non-rendering). */
function extractTopLevelDataFields(
  json: Record<string, unknown>, fields: FieldDescriptor[], seen: Set<string>, _ruleType: string,
): void {
  const SKIP_PREFIXES = ['px', 'pz', 'pyJava', 'pyVisio', 'pyFooter', 'pyHeader'];
  for (const [key, val] of Object.entries(json)) {
    if (seen.has(key)) continue;
    if (SKIP_PREFIXES.some(p => key.startsWith(p))) continue;
    if (key === 'pxObjClass' || key === 'pxCreateDateTime') continue;

    // Only include fields with actual data content
    if (val === null || val === '' || val === undefined) continue;
    seen.add(key);

    fields.push({
      path: key,
      category: inferCategory(key),
      type: inferTypeFromValue(val),
      description: '',
      frequency: 'common',
    });
  }
}

/** Detect sub-sections that need recursive analysis. */
export function detectSubSections(json: Record<string, unknown>): string[] {
  const sections: string[] = [];
  const refs = json['pxRuleReferences'];
  if (!Array.isArray(refs)) return sections;

  for (const ref of refs) {
    if (!ref || typeof ref !== 'object') continue;
    const r = ref as Record<string, unknown>;
    if (r['pxRuleObjClass'] === 'Rule-HTML-Section') {
      const name = String(r['pyRuleName'] || '');
      if (name) sections.push(name);
    }
  }
  return sections;
}

/** Infer category from property name patterns. */
export function inferCategory(name: string): FieldDescriptor['category'] {
  if (/^py(ClassName|RuleName|RuleSet|Label|Purpose)/.test(name)) return 'identity';
  if (/^py(Steps|Connector|Decision|Flow|Action|When)/.test(name)) return 'logic';
  if (/^py(DataPage|Service|Connect|Queue|External)/.test(name)) return 'connectivity';
  return 'metadata';
}

/** Infer type from pxRuleReference metadata. */
function inferFieldType(ref: Record<string, unknown>): string {
  const objClass = String(ref['pxRuleObjClass'] || '');
  if (objClass.includes('List') || objClass.includes('Page')) return 'array';
  if (objClass.includes('Boolean')) return 'boolean';
  return 'string';
}

/** Infer type from value. */
function inferTypeFromValue(val: unknown): string {
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return 'number';
  if (typeof val === 'object') return 'object';
  return 'string';
}
