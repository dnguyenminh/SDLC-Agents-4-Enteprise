import { describe, it, expect } from 'vitest';
import { PegaDecisionTableEvaluator } from '../../decision/PegaDecisionTableEvaluator.js';
import { resolveFieldValue } from '../../decision/fieldResolver.js';
import type { PegaDecisionTableRow } from '../../decision/PegaEvaluationResult.js';
import { context, mockEvaluator } from './helpers.js';

describe('PegaDecisionTableEvaluator', () => {
  const evaluator = new PegaDecisionTableEvaluator();

  it('single matching row returns correct result with tracePath', () => {
    const rows: PegaDecisionTableRow[] = [
      { rowId: 'R1', priority: 1, conditions: [{ field: 'Status', operator: 'EQUALS', value: 'Open' }], result: 'Approved' },
    ];
    const result = evaluator.evaluate(rows, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.matchedRowId).toBe('R1');
    expect(result.outputValue).toBe('Approved');
    expect(result.tracePath).toContain('=> matched row:R1');
  });

  it('multiple rows with higher priority (lower number) wins', () => {
    const rows: PegaDecisionTableRow[] = [
      { rowId: 'R2', priority: 2, conditions: [{ field: 'Status', operator: 'EQUALS', value: 'Open' }], result: 'Fallback' },
      { rowId: 'R1', priority: 1, conditions: [{ field: 'Status', operator: 'EQUALS', value: 'Open' }], result: 'Primary' },
    ];
    const result = evaluator.evaluate(rows, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.matchedRowId).toBe('R1');
    expect(result.outputValue).toBe('Primary');
  });

  it('no matching row returns null result with all rows evaluated in tracePath', () => {
    const rows: PegaDecisionTableRow[] = [
      { rowId: 'R1', priority: 1, conditions: [{ field: 'Status', operator: 'EQUALS', value: 'Closed' }], result: 'X' },
      { rowId: 'R2', priority: 2, conditions: [{ field: 'Amount', operator: 'GREATER', value: 999 }], result: 'Y' },
    ];
    const result = evaluator.evaluate(rows, context, mockEvaluator);
    expect(result.status).toBe('no_match');
    expect(result.matchedRowId).toBe('');
    expect(result.outputValue).toBeNull();
    expect(result.tracePath).toContain('=> no matching row');
    expect(result.tracePath.filter(t => t.startsWith('row:')).length).toBe(2);
  });

  it('all conditions in a row must match (AND logic)', () => {
    const rows: PegaDecisionTableRow[] = [
      {
        rowId: 'R1', priority: 1,
        conditions: [
          { field: 'Status', operator: 'EQUALS', value: 'Open' },
          { field: 'Amount', operator: 'GREATER', value: 500 },
        ],
        result: 'HighAmount',
      },
    ];
    const result = evaluator.evaluate(rows, context, mockEvaluator);
    expect(result.status).toBe('no_match');
  });

  it('row with CUSTOM condition delegates to expression evaluator returning true', () => {
    const rows: PegaDecisionTableRow[] = [
      { rowId: 'R1', priority: 1, conditions: [{ field: '', operator: 'CUSTOM', value: '@MyRule.IsHigh' }], result: 'CustomMatch' },
    ];
    const result = evaluator.evaluate(rows, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.outputValue).toBe('CustomMatch');
  });

  it('row with CUSTOM condition returning false does not match', () => {
    const rows: PegaDecisionTableRow[] = [
      { rowId: 'R1', priority: 1, conditions: [{ field: '', operator: 'CUSTOM', value: '@MyRule.IsLow' }], result: 'NoMatch' },
    ];
    const result = evaluator.evaluate(rows, context, mockEvaluator);
    expect(result.status).toBe('no_match');
  });

  it('empty table returns null result immediately', () => {
    const result = evaluator.evaluate([], context, mockEvaluator);
    expect(result.status).toBe('no_match');
    expect(result.matchedRowId).toBe('');
    expect(result.outputValue).toBeNull();
  });
});

describe('fieldResolver', () => {
  it('resolves .Property path from clipboard', () => {
    const value = resolveFieldValue('.Status', context);
    expect(value).toBe('Open');
  });

  it('resolves .Nested.Property path from clipboard', () => {
    const value = resolveFieldValue('.CustomerType', context);
    expect(value).toBe('Premium');
  });

  it('resolves pyWorkPage.Property path from clipboard', () => {
    const value = resolveFieldValue('pyWorkPage.Name', context);
    expect(value).toBe('John');
  });

  it('resolves pyWorkPage.Nested.Property path from clipboard', () => {
    const value = resolveFieldValue('pyWorkPage.CustomerType', context);
    expect(value).toBe('Premium');
  });

  it('returns null for missing property path', () => {
    const value = resolveFieldValue('.NonExistent', context);
    expect(value).toBeNull();
  });

  it('returns null for missing page path', () => {
    const value = resolveFieldValue('MissingPage.Prop', context);
    expect(value).toBeNull();
  });
});
