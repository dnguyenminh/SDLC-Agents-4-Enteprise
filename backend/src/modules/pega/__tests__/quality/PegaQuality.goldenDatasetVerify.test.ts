import { describe, it, expect } from 'vitest';
import { parser, dataset } from './helpers.js';

// =============================================================================
// SECTION 2: GoldenDataset.verify checks AST output against expected structure
// =============================================================================

describe('PegaGoldenDataset — verify', () => {
  it('verify passes for valid Activity sample', () => {
    const sample = dataset.getActivitySample();
    const ast = parser.parse(sample.json);
    const result = dataset.verify(sample, ast);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('verify passes for valid Flow sample', () => {
    const sample = dataset.getFlowSample();
    const ast = parser.parse(sample.json);
    const result = dataset.verify(sample, ast);
    expect(result.passed).toBe(true);
  });

  it('verify catches incorrect rule type', () => {
    const sample = dataset.getActivitySample();
    const ast = parser.parse(sample.json);
    const wrongSample = { ...sample, pxObjClass: 'Rule-Obj-Flow' };
    const result = dataset.verify(wrongSample, ast);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes('ruleType'))).toBe(true);
  });

  it('verify catches missing references', () => {
    const sample = dataset.getActivitySample();
    const ast = parser.parse(sample.json);
    const wrongSample = { ...sample, expectedReferences: ['NonExistentRef'] };
    const result = dataset.verify(wrongSample, ast);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes('reference'))).toBe(true);
  });

  it('verify catches wrong child count', () => {
    const sample = dataset.getActivitySample();
    const ast = parser.parse(sample.json);
    const wrongSample = { ...sample, expectedChildren: 99 };
    const result = dataset.verify(wrongSample, ast);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes('children'))).toBe(true);
  });
});

// =============================================================================
// SECTION 3: All 15 golden samples parse without throwing
// =============================================================================

describe('PegaGoldenDataset — all samples parse successfully', () => {
  const all = dataset.getAllSamples();

  for (const sample of all) {
    it(`parses ${sample.pxObjClass} / ${sample.name} without throwing`, () => {
      const ast = parser.parse(sample.json);
      expect(ast).toBeDefined();
      expect(ast.ruleType).toBe(sample.pxObjClass);
      expect(ast.children.length).toBe(sample.expectedChildren);
    });
  }
});
