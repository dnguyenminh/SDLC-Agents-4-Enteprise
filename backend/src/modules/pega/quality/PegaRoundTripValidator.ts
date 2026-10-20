/**
 * Round-trip validator: Pega rule JSON → AST → JSON, verifying no field loss.
 * BR-18 facade — serialization lives in ./PegaRoundTripValidator/serialize.ts,
 * comparison utils in ./PegaRoundTripValidator/compare.ts.
 */

import { PegaRuleAstParser } from '../PegaRuleAstParser.js';
import { serializeAst } from './PegaRoundTripValidator/serialize.js';
import { deepEqual, getFieldPaths, getValueAtPath } from './PegaRoundTripValidator/compare.js';

export interface RoundTripResult {
  ruleName: string;
  ruleType: string;
  success: boolean;
  originalFields: string[];
  preservedFields: string[];
  lostFields: string[];
  addedFields: string[];
  differences: string[];
}

export class PegaRoundTripValidator {
  constructor(private parser: PegaRuleAstParser) {}

  validate(json: Record<string, unknown>): RoundTripResult {
    const ruleName = (json.pyRuleName as string) || (json.pyActivityName as string) || (json.pyModelName as string) || 'unknown';
    const ruleType = (json.pxObjClass as string) || 'unknown';

    // Step 1: Parse
    const ast = this.parser.parse(json);

    // Step 2: Serialize back
    const serialized = serializeAst(ast);

    // Step 3: Compare field by field
    const originalFields = getFieldPaths(json);
    const serializedFields = getFieldPaths(serialized);

    const originalSet = new Set(originalFields);
    const serializedSet = new Set(serializedFields);

    // Fields in original that don't exist in serialized (lost)
    const lostFields = originalFields.filter(f => !serializedSet.has(f));

    // Fields in serialized that don't exist in original (added)
    const addedFields = serializedFields.filter(f => !originalSet.has(f));

    // Common fields that have same value (or equivalent)
    const preservedFields = originalFields.filter(f => {
      if (!serializedSet.has(f)) return false;
      const originalVal = getValueAtPath(json, f);
      const serializedVal = getValueAtPath(serialized, f);
      return originalVal !== undefined && serializedVal !== undefined && deepEqual(originalVal, serializedVal);
    });

    const differences = collectDifferences(json, serialized, {
      originalFields, lostFields, addedFields, preservedFields,
    });

    return {
      ruleName,
      ruleType,
      success: differences.length === 0,
      originalFields,
      preservedFields,
      lostFields,
      addedFields,
      differences,
    };
  }

  validateBatch(samples: Record<string, unknown>[]): RoundTripResult[] {
    return samples.map(s => this.validate(s));
  }

  assertPropertiesPreserved(original: Record<string, unknown>, result: RoundTripResult): boolean {
    // Check that all semantic (non-system) fields from the original survived
    const semanticFields = Object.keys(original).filter(k => !k.startsWith('px') && !k.startsWith('pz'));
    for (const field of semanticFields) {
      if (result.lostFields.includes(field)) {
        return false;
      }
    }
    return true;
  }
}

/** Build the human-readable difference list from the field comparison. */
function collectDifferences(
  json: Record<string, unknown>,
  serialized: Record<string, unknown>,
  sets: {
    originalFields: string[]; lostFields: string[];
    addedFields: string[]; preservedFields: string[];
  },
): string[] {
  const differences: string[] = [];
  const { originalFields, lostFields, addedFields, preservedFields } = sets;

  // Check lost fields — only flag semantic (non-system) fields as differences
  for (const field of lostFields) {
    const isSystemField = field.startsWith('px') || field.startsWith('pz');
    if (isSystemField) continue; // system fields are expected to be stripped
    differences.push(`Field "${field}" was lost during round-trip`);
  }

  // Check added fields — only flag non-system fields
  for (const field of addedFields) {
    if (field.startsWith('px') || field.startsWith('pz')) continue;
    // Rule name normalization: ignore when a type-specific name field
    // (eg pyActivityName) exists alongside pyRuleName
    if (field === 'pyRuleName' && originalFields.some(f => f.startsWith('py') && f.endsWith('Name') && f !== 'pyRuleName')) continue;
    if (!originalFields.includes(field)) {
      differences.push(`Field "${field}" was added during round-trip`);
    }
  }

  // Check value changes in common fields
  for (const field of preservedFields) {
    const originalVal = getValueAtPath(json, field);
    const serializedVal = getValueAtPath(serialized, field);
    if (!deepEqual(originalVal, serializedVal)) {
      differences.push(`Field "${field}" value changed: ${JSON.stringify(originalVal)} -> ${JSON.stringify(serializedVal)}`);
    }
  }

  return differences;
}
