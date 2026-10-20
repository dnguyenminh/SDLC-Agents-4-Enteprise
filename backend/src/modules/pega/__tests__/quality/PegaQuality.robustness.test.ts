import { describe, it, expect } from 'vitest';
import { parser, dataset, roundTrip, mutationTester } from './helpers.js';

// =============================================================================
// SECTION 7: Additional edge cases and robustness
// =============================================================================

describe('Additional robustness tests', () => {
  it('round-trip handles null values in original json without throwing', () => {
    const json: Record<string, unknown> = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: null,
      pyActivityName: 'NullTest',
      steps: null,
    };
    expect(() => roundTrip.validate(json)).not.toThrow();
    const result = roundTrip.validate(json);
    expect(result.ruleName).toBe('NullTest');
    expect(result.ruleType).toBe('Rule-Obj-Activity');
  });

  it('round-trip handles undefined values in original json without throwing', () => {
    const json: Record<string, unknown> = {
      pxObjClass: 'Rule-Obj-Activity',
      pyActivityName: 'UndefTest',
    };
    expect(() => roundTrip.validate(json)).not.toThrow();
    const result = roundTrip.validate(json);
    expect(result.ruleName).toBe('UndefTest');
  });

  it('mutation tester handles empty steps array gracefully', () => {
    const emptySteps: Record<string, unknown> = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'EmptySteps',
      steps: [],
    };
    const result = mutationTester.testMutation(emptySteps, {
      name: 'remove-first-from-empty',
      description: 'Remove from empty array',
      apply: (orig) => mutationTester.removeChild(orig, 'steps', 0),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
  });

  it('mutation tester handles missing array field gracefully', () => {
    const noSteps: Record<string, unknown> = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'NoSteps',
    };
    const result = mutationTester.testMutation(noSteps, {
      name: 'remove-from-missing',
      description: 'Remove from missing array',
      apply: (orig) => mutationTester.removeChild(orig, 'steps', 0),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
  });

  it('round-trip validator batch handles mixed content', () => {
    const samples = [
      {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Class1',
        pyActivityName: 'Act1',
        steps: [],
      },
      {
        pxObjClass: 'Rule-Obj-When',
        pyClassName: 'Class2',
        pyRuleName: 'When1',
        pyWhenExpression: 'true',
      },
      {},
    ];
    const results = roundTrip.validateBatch(samples);
    expect(results).toHaveLength(3);
    expect(results[0].ruleName).toBe('Act1');
    expect(results[1].ruleName).toBe('When1');
    expect(results[2].ruleName).toBe('unknown');
  });

  it('mutation tester preserves original object immutably', () => {
    const orig: Record<string, unknown> = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'TestActivity',
      pyLabel: 'Test',
      steps: [],
    };
    const originalJson = JSON.stringify(orig);
    mutationTester.mutateFieldValue(orig, 'pyLabel', 'changed');
    mutationTester.removeField(orig, 'pyClassName');
    expect(JSON.stringify(orig)).toBe(originalJson);
  });

  it('golden dataset verify returns ast in result', () => {
    const sample = dataset.getActivitySample();
    const ast = parser.parse(sample.json);
    const result = dataset.verify(sample, ast);
    expect(result.ast).toBe(ast);
    expect(result.sampleName).toBe('ResolveTicket');
  });

  it('round-trip validator produces consistent diff output', () => {
    const activity = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work-Cover-Jira',
      pyActivityName: 'DiffTest',
      steps: [
        { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Class.Method', pyLabel: 'Diff' },
      ],
    };
    const result = roundTrip.validate(activity);
    expect(result.differences).toHaveLength(0);
    expect(result.lostFields).toHaveLength(0);
    expect(result.addedFields).toHaveLength(0);
  });
});
