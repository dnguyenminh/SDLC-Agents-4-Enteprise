import { describe, it, expect } from 'vitest';
import { PegaConditionOperatorRegistry } from '../../decision/PegaConditionOperatorRegistry.js';
import { parseDecisionCondition } from '../../decision/PegaDecisionConditionParser.js';
import { PegaStrategyComponentResolver } from '../../decision/PegaStrategyComponentResolver.js';

describe('PegaConditionOperatorRegistry', () => {
  it('EQUALS returns true for equal values and false for different values', () => {
    expect(PegaConditionOperatorRegistry.evaluate('EQUALS', 'Open', 'Open')).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('EQUALS', 'Open', 'Closed')).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('EQUALS', 100, 100)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('EQUALS', 100, 99)).toBe(false);
  });

  it('NOT_EQUALS returns true for different values', () => {
    expect(PegaConditionOperatorRegistry.evaluate('NOT_EQUALS', 'Open', 'Closed')).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('NOT_EQUALS', 'Open', 'Open')).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('NOT_EQUALS', 100, 99)).toBe(true);
  });

  it('GREATER, LESS, GREATER_EQUALS, LESS_EQUALS perform numeric comparisons', () => {
    expect(PegaConditionOperatorRegistry.evaluate('GREATER', 10, 5)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('GREATER', 5, 10)).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('GREATER', 5, 5)).toBe(false);

    expect(PegaConditionOperatorRegistry.evaluate('LESS', 5, 10)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('LESS', 10, 5)).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('LESS', 5, 5)).toBe(false);

    expect(PegaConditionOperatorRegistry.evaluate('GREATER_EQUALS', 10, 10)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('GREATER_EQUALS', 10, 5)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('GREATER_EQUALS', 5, 10)).toBe(false);

    expect(PegaConditionOperatorRegistry.evaluate('LESS_EQUALS', 5, 10)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('LESS_EQUALS', 10, 10)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('LESS_EQUALS', 10, 5)).toBe(false);
  });

  it('IN operator checks array membership', () => {
    expect(PegaConditionOperatorRegistry.evaluate('IN', 'Open', ['Open', 'Closed'])).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IN', 'Pending', ['Open', 'Closed'])).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('IN', 1, [1, 2, 3])).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IN', 4, [1, 2, 3])).toBe(false);
  });

  it('NOT_IN returns true when value is not in array', () => {
    expect(PegaConditionOperatorRegistry.evaluate('NOT_IN', 'Pending', ['Open', 'Closed'])).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('NOT_IN', 'Open', ['Open', 'Closed'])).toBe(false);
  });

  it('IS_NULL returns true for null and undefined, false for non-null', () => {
    expect(PegaConditionOperatorRegistry.evaluate('IS_NULL', null, null)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IS_NULL', undefined, null)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IS_NULL', '', null)).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('IS_NULL', 0, null)).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('IS_NULL', false, null)).toBe(false);
  });

  it('IS_BLANK returns true for empty string, null, undefined; false for non-empty', () => {
    expect(PegaConditionOperatorRegistry.evaluate('IS_BLANK', null, null)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IS_BLANK', undefined, null)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IS_BLANK', '', null)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('IS_BLANK', 'text', null)).toBe(false);
    expect(PegaConditionOperatorRegistry.evaluate('IS_BLANK', 0, null)).toBe(false);
  });

  it('CUSTOM operator always returns true via registry (delegated at evaluator level)', () => {
    expect(PegaConditionOperatorRegistry.evaluate('CUSTOM', null, null)).toBe(true);
    expect(PegaConditionOperatorRegistry.evaluate('CUSTOM', 'anything', 'anything')).toBe(true);
  });

  it('hasOperator returns correct boolean', () => {
    expect(PegaConditionOperatorRegistry.hasOperator('EQUALS')).toBe(true);
    expect(PegaConditionOperatorRegistry.hasOperator('CUSTOM')).toBe(true);
    expect(PegaConditionOperatorRegistry.hasOperator('IN')).toBe(true);
  });

  it('evaluate throws for unknown operator key', () => {
    expect(() => PegaConditionOperatorRegistry.evaluate('UNKNOWN' as any, null, null)).toThrow('Unknown decision operator');
  });
});

describe('PegaDecisionConditionParser', () => {
  it('parses simple condition JSON with field, operator, value', () => {
    const cond = parseDecisionCondition({ field: 'Status', operator: 'equals', value: 'Open' });
    expect(cond.field).toBe('Status');
    expect(cond.operator).toBe('EQUALS');
    expect(cond.value).toBe('Open');
  });

  it('parses conditions with all operator types', () => {
    expect(parseDecisionCondition({ field: 'a', operator: '>', value: 5 }).operator).toBe('GREATER');
    expect(parseDecisionCondition({ field: 'a', operator: '<', value: 10 }).operator).toBe('LESS');
    expect(parseDecisionCondition({ field: 'a', operator: '>=', value: 5 }).operator).toBe('GREATER_EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: '<=', value: 5 }).operator).toBe('LESS_EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: 'in', value: [1, 2] }).operator).toBe('IN');
    expect(parseDecisionCondition({ field: 'a', operator: 'not_in', value: [1, 2] }).operator).toBe('NOT_IN');
    expect(parseDecisionCondition({ field: 'a', operator: 'is_null', value: null }).operator).toBe('IS_NULL');
    expect(parseDecisionCondition({ field: 'a', operator: 'is_blank', value: null }).operator).toBe('IS_BLANK');
    expect(parseDecisionCondition({ field: 'a', operator: 'custom', value: '@MyRule.X' }).operator).toBe('CUSTOM');
  });

  it('normalizes operator name aliases', () => {
    expect(parseDecisionCondition({ field: 'a', operator: 'equals' }).operator).toBe('EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: 'equal' }).operator).toBe('EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: '=' }).operator).toBe('EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: '<>' }).operator).toBe('NOT_EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: '!=' }).operator).toBe('NOT_EQUALS');
    expect(parseDecisionCondition({ field: 'a', operator: '>' }).operator).toBe('GREATER');
    expect(parseDecisionCondition({ field: 'a', operator: '<' }).operator).toBe('LESS');
    expect(parseDecisionCondition({ field: 'a', operator: 'is_null' }).operator).toBe('IS_NULL');
    expect(parseDecisionCondition({ field: 'a', operator: 'is_blank' }).operator).toBe('IS_BLANK');
  });

  it('handles CUSTOM prefix and @ prefix', () => {
    expect(parseDecisionCondition({ field: 'a', operator: 'CustomRule', value: '@expr' }).operator).toBe('CUSTOM');
    expect(parseDecisionCondition({ field: 'a', operator: '@MyRule', value: '@expr' }).operator).toBe('CUSTOM');
  });

  it('handles edge case with missing optional fields', () => {
    const cond = parseDecisionCondition({});
    expect(cond.field).toBe('');
    expect(cond.operator).toBe('EQUALS');
    expect(cond.value).toBeUndefined();
  });

  it('defaults unknown operator to EQUALS', () => {
    const cond = parseDecisionCondition({ field: 'Status', operator: 'unknown_op', value: 'X' });
    expect(cond.operator).toBe('EQUALS');
  });
});

describe('PegaStrategyComponentResolver', () => {
  const resolver = new PegaStrategyComponentResolver();

  it('resolves DecisionTree:treeName to decision_rule type', () => {
    const result = resolver.resolve('DecisionTree:MyTree');
    expect(result.type).toBe('decision_rule');
    expect(result.ref).toBe('DecisionTree:MyTree');
    expect(result.resolved).toBe(false);
  });

  it('resolves DecisionTable:tableName to decision_rule type', () => {
    const result = resolver.resolve('DecisionTable:MyTable');
    expect(result.type).toBe('decision_rule');
    expect(result.ref).toBe('DecisionTable:MyTable');
    expect(result.resolved).toBe(false);
  });

  it('resolves AdaptiveModel:name to adaptive_model type', () => {
    const result = resolver.resolve('AdaptiveModel:MyModel');
    expect(result.type).toBe('adaptive_model');
    expect(result.ref).toBe('AdaptiveModel:MyModel');
    expect(result.resolved).toBe(false);
  });

  it('resolves adaptive: prefix to adaptive_model type', () => {
    const result = resolver.resolve('adaptive:MyModel');
    expect(result.type).toBe('adaptive_model');
  });

  it('returns decision_rule type for unknown reference format', () => {
    const result = resolver.resolve('UnknownType:Something');
    expect(result.type).toBe('decision_rule');
    expect(result.ref).toBe('UnknownType:Something');
  });

  it('resolveWithContext throws for adaptive model', () => {
    expect(() => resolver.resolveWithContext('AdaptiveModel:Test', {})).toThrow('not implemented');
  });
});
