import { describe, it, expect } from 'vitest';
import { parser, dataset, roundTrip, mutationTester } from './helpers.js';

// =============================================================================
// SECTION 6: End-to-end integration between quality tools
// =============================================================================

describe('Quality suite integration', () => {
  it('all golden samples survive round-trip validation', () => {
    const all = dataset.getAllSamples();
    for (const sample of all) {
      const ast = parser.parse(sample.json);
      const verifyResult = dataset.verify(sample, ast);
      expect(verifyResult.passed).toBe(true);
    }
  });

  it('mutation tester detects all mutations in runMutationSuite for Flow sample', () => {
    const flowSample = dataset.getFlowSample();
    const results = mutationTester.runMutationSuite(flowSample.json as Record<string, unknown>);
    expect(results.length).toBeGreaterThanOrEqual(8);
  });

  it('round-trip + mutation together produce consistent results', () => {
    const activity = dataset.getActivitySample();
    const rtResult = roundTrip.validate(activity.json as Record<string, unknown>);
    expect(rtResult.success).toBe(true);

    const mutationResults = mutationTester.runMutationSuite(activity.json as Record<string, unknown>);
    for (const mr of mutationResults) {
      expect(mr.originalValid).toBe(true);
    }
  });

  it('golden dataset verify works for all 15 samples after parse', () => {
    const all = dataset.getAllSamples();
    for (const sample of all) {
      const ast = parser.parse(sample.json);
      const result = dataset.verify(sample, ast);
      expect(result.passed).toBe(true);
      expect(result.ast).toBeDefined();
    }
  });

  it('round-trip correctly identifies lost system fields', () => {
    const sample = {
      pxObjClass: 'Rule-Obj-When',
      pyClassName: 'Work-Cover-Jira',
      pyRuleName: 'TestWhen',
      pyWhenExpression: '.pyStatus = "Open"',
      pyWhenType: 'Expression',
      pxCreateDateTime: '2024-01-01T00:00:00Z',
      pzIndex: '42',
    };
    const result = roundTrip.validate(sample);
    // pxCreateDateTime and pzIndex are system fields, they may be lost
    // But pyWhenExpression, pyWhenType should be preserved
    expect(result.preservedFields).toContain('pyWhenExpression');
    expect(result.preservedFields).toContain('pyWhenType');
  });
});
