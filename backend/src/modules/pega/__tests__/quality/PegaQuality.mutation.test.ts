import { describe, it, expect } from 'vitest';
import { mutationTester } from './helpers.js';

// =============================================================================
// SECTION 5: MutationTester
// =============================================================================

describe('PegaMutationTester', () => {
  const sample: Record<string, unknown> = {
    pxObjClass: 'Rule-Obj-Activity',
    pyClassName: 'Work-Cover-Jira',
    pyActivityName: 'TestActivity',
    pyRuleset: 'JiraIntegration',
    pyLabel: 'Test',
    steps: [
      { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'MyClass.MyMethod', pyLabel: 'Step 1' },
    ],
  };

  it('mutateFieldValue produces a different clone', () => {
    const mutated = mutationTester.mutateFieldValue(sample, 'pyLabel', 'MUTATED');
    expect(mutated.pyLabel).toBe('MUTATED');
    expect(sample.pyLabel).toBe('Test');
  });

  it('removeField removes the specified field', () => {
    const mutated = mutationTester.removeField(sample, 'pyClassName');
    expect(mutated.pyClassName).toBeUndefined();
    expect(sample.pyClassName).toBe('Work-Cover-Jira');
  });

  it('changeType changes pxObjClass and returns a different AST fingerprint', () => {
    const mutated = mutationTester.changeType(sample, 'Rule-Obj-Flow');
    expect(mutated.pxObjClass).toBe('Rule-Obj-Flow');
    expect(sample.pxObjClass).toBe('Rule-Obj-Activity');
  });

  it('addRandomField adds an extra field', () => {
    const mutated = mutationTester.addRandomField(sample);
    const extraKeys = Object.keys(mutated).filter(k => k.startsWith('pyExtraField_'));
    expect(extraKeys.length).toBeGreaterThanOrEqual(1);
  });

  it('removeChild removes an item from child array', () => {
    const mutated = mutationTester.removeChild(sample, 'steps', 0);
    const steps = mutated.steps as Array<unknown>;
    expect(steps).toHaveLength(0);
  });

  it('testMutation reports detectedDifference for label change', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'change-label',
      description: 'Change label',
      apply: (orig) => mutationTester.mutateFieldValue(orig, 'pyLabel', 'MUTATED'),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
    expect(result.detectedDifference).toBe(true);
  });

  it('testMutation reports detectedDifference for pxObjClass change', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'change-type',
      description: 'Change type',
      apply: (orig) => mutationTester.changeType(orig, 'Rule-Obj-Flow'),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
    expect(result.detectedDifference).toBe(true);
  });

  it('testMutation reports detectedDifference for child removal', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'remove-first-step',
      description: 'Remove first step',
      apply: (orig) => mutationTester.removeChild(orig, 'steps', 0),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
    expect(result.detectedDifference).toBe(true);
  });

  it('testMutation reports detectedDifference for pyClassName removal', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'remove-classname',
      description: 'Remove className',
      apply: (orig) => mutationTester.removeField(orig, 'pyClassName'),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
    expect(result.detectedDifference).toBe(true);
  });

  it('testMutation reports detectedDifference for extra field', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'add-field',
      description: 'Add random field',
      apply: (orig) => mutationTester.addRandomField(orig),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
    expect(result.detectedDifference).toBe(true);
  });

  it('runMutationSuite returns results for all mutations', () => {
    const results = mutationTester.runMutationSuite(sample);
    expect(results.length).toBeGreaterThanOrEqual(8);
    const names = results.map(r => r.mutationName);
    expect(names).toContain('change-pxObjClass');
    expect(names).toContain('remove-pyClassName');
    expect(names).toContain('change-label');
    expect(names).toContain('add-random-field');
    expect(names).toContain('remove-first-step');
  });

  it('runMutationSuite returns all results with originalValid true', () => {
    const results = mutationTester.runMutationSuite(sample);
    for (const r of results) {
      expect(r.originalValid).toBe(true);
    }
  });

  it('mutation for null pyClassName still parses successfully', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'set-null-classname',
      description: 'Set className to null',
      apply: (orig) => mutationTester.mutateFieldValue(orig, 'pyClassName', null),
    });
    expect(result.originalValid).toBe(true);
    expect(result.mutatedValid).toBe(true);
  });

  it('mutation with empty string label still parses', () => {
    const result = mutationTester.testMutation(sample, {
      name: 'empty-label',
      description: 'Set label to empty',
      apply: (orig) => mutationTester.mutateFieldValue(orig, 'pyLabel', ''),
    });
    expect(result.mutatedValid).toBe(true);
  });

  it('mutated fingerprint differs from original for most mutations', () => {
    const results = mutationTester.runMutationSuite(sample);
    const detected = results.filter(r => r.detectedDifference);
    expect(detected.length).toBeGreaterThanOrEqual(5);
  });
});
