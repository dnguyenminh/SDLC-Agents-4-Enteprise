/**
 * EnrichedSchema aggregation + progressive enrichment helpers (SA4E-214).
 * Pure functions — no I/O.
 */

import type { EnrichedSchema, FieldDescriptor, SchemaAnalyzeResponse } from '../../models/EnrichedSchema';

/** Build final EnrichedSchema from accumulated fields. */
export function buildSchema(
  ruleType: string,
  allFields: FieldDescriptor[],
  rootAnalysis: SchemaAnalyzeResponse,
  discoveredSections: Set<string>,
): EnrichedSchema {
  const now = new Date().toISOString();
  const identity: Record<string, FieldDescriptor> = {};
  const logic: Record<string, FieldDescriptor> = {};
  const connectivity: Record<string, FieldDescriptor> = {};

  // Categorize fields — deduplicate by path
  const seen = new Set<string>();
  for (const field of allFields) {
    if (seen.has(field.path)) continue;
    seen.add(field.path);
    switch (field.category) {
      case 'identity': identity[field.path] = field; break;
      case 'logic': logic[field.path] = field; break;
      case 'connectivity': connectivity[field.path] = field; break;
      default: logic[field.path] = field; break; // metadata/config → logic bucket
    }
  }

  return {
    rule_type: ruleType,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    identity_fields: identity,
    logic_fields: logic,
    connectivity_fields: connectivity,
    extraction_hints: {
      primary_logic_field: rootAnalysis.hints.primary_logic_field || null,
      logic_structure: rootAnalysis.hints.logic_structure || null,
      summary_focus: rootAnalysis.hints.summary_focus || null,
    },
    known_fields: [...seen],
    coverage: rootAnalysis.rule_based_coverage,
    discovered_sections: [...discoveredSections],
  };
}

/** Compare rule JSON keys against schema known_fields to find new fields. */
export function findNewFields(schema: EnrichedSchema, ruleJson: Record<string, unknown>): FieldDescriptor[] {
  const knownSet = new Set(schema.known_fields);
  const newFields: FieldDescriptor[] = [];

  for (const key of Object.keys(ruleJson)) {
    // Skip internal Pega fields (px*/pz* prefix)
    if (key.startsWith('px') || key.startsWith('pz')) continue;
    if (knownSet.has(key)) continue;

    newFields.push({
      path: key,
      category: 'metadata',
      type: inferType(ruleJson[key]),
      description: `Discovered from instance (${typeof ruleJson[key]})`,
      frequency: 'rare',
    });
  }
  return newFields;
}

/** Infer JSON type string from a value. */
function inferType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
