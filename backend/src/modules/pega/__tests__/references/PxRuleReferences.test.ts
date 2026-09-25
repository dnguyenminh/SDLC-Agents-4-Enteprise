/**
 * PxRuleReferences.test.ts — SA4E-235 / GD3.
 * pxRuleReferences is the PRIMARY dependency source; per-type extraction is the FALLBACK.
 */
import { describe, it, expect } from 'vitest';
import { PegaParser } from '../../PegaParser.js';
import {
  extractDependenciesFromReferences,
  hasRuleReferences,
} from '../../references/PxRuleReferences.js';

const parser = new PegaParser();

describe('extractDependenciesFromReferences — engine aggregate', () => {
  it('reads pxRuleReferences, filters noise, drops self, de-dups', () => {
    const json = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Order',
      pyRuleName: 'Process',
      pxRuleReferences: [
        { pxRuleObjClass: 'Rule-Obj-Activity', pxRuleClassName: 'Work-Order', pyRuleName: 'Validate' },
        { pxRuleObjClass: 'Rule-Obj-Activity', pxRuleClassName: 'Work-Order', pyRuleName: 'Validate' }, // dup
        { pxRuleObjClass: 'Rule-Obj-When', pxRuleClassName: 'Work-Order', pyRuleName: 'IsValid' },
        { pxRuleObjClass: 'Rule-Obj-Property', pxRuleClassName: 'Work-Order', pyRuleName: 'pyStatus' }, // noise
        { pxRuleObjClass: 'Rule-Obj-Activity', pxRuleClassName: 'Work-Order', pyRuleName: 'Process' }, // self
      ],
    };
    const deps = extractDependenciesFromReferences(json);
    // Validate (dedup->1) + IsValid; property noise + self dropped.
    expect(deps).toHaveLength(2);
    expect(deps).toContainEqual({ ruleType: 'Rule-Obj-Activity', className: 'Work-Order', ruleName: 'Validate' });
    expect(deps).toContainEqual({ ruleType: 'Rule-Obj-When', className: 'Work-Order', ruleName: 'IsValid' });
  });

  it('skips incomplete entries', () => {
    const json = { pxRuleReferences: [{ pxRuleObjClass: 'Rule-Obj-When' }, { pyRuleName: 'X' }] };
    expect(extractDependenciesFromReferences(json)).toHaveLength(0);
  });
});

describe('PegaParser.extractDependencies — source selection', () => {
  it('uses pxRuleReferences when present (PRIMARY)', () => {
    const json = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Order',
      pyRuleName: 'Process',
      // Activity step that per-type heuristic would pick up:
      steps: [{ pyMethod: 'Call', pyMethodParameters: 'Work-Order.LegacyCalled' }],
      // Engine aggregate says the real dependency is Validate:
      pxRuleReferences: [
        { pxRuleObjClass: 'Rule-Obj-Activity', pxRuleClassName: 'Work-Order', pyRuleName: 'Validate' },
      ],
    };
    const deps = parser.extractDependencies(json);
    expect(hasRuleReferences(json)).toBe(true);
    expect(deps).toContainEqual({ ruleType: 'Rule-Obj-Activity', className: 'Work-Order', ruleName: 'Validate' });
    // Did NOT fall back to per-type step scanning.
    expect(deps.some((d) => d.ruleName === 'LegacyCalled')).toBe(false);
  });

  it('falls back to per-type extraction when aggregate absent', () => {
    const json = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Order',
      pyRuleName: 'Process',
      steps: [{ pyMethod: 'Call', pyMethodParameters: 'Work-Order.Validate' }],
    };
    expect(hasRuleReferences(json)).toBe(false);
    const deps = parser.extractDependencies(json);
    expect(deps).toContainEqual({ ruleType: 'Rule-Obj-Activity', className: 'Work-Order', ruleName: 'Validate' });
  });
});
