import { describe, it, expect } from 'vitest';
import { PegaDecisionTreeEvaluator } from '../../decision/PegaDecisionTreeEvaluator.js';
import type { DecisionTreeNode } from '../../decision/PegaEvaluationResult.js';
import { context, mockEvaluator } from './helpers.js';

describe('PegaDecisionTreeEvaluator', () => {
  it('simple condition tree resolves to leaf result', () => {
    const tree: DecisionTreeNode = {
      nodeId: 'N1',
      condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
      branches: [
        {
          key: 'open',
          conditionResult: true,
          childNode: {
            nodeId: 'N2',
            condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
            branches: [],
            defaultResult: 'Approved',
          },
        },
      ],
    };
    const evaluator = new PegaDecisionTreeEvaluator(5);
    const result = evaluator.evaluate(tree, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.outputValue).toBe('Approved');
    expect(result.matchedRowId).toBe('N2');
  });

  it('nested tree with multiple branches navigates correct path', () => {
    const tree: DecisionTreeNode = {
      nodeId: 'Root',
      condition: { field: 'Amount', operator: 'GREATER', value: 50 },
      branches: [
        {
          key: 'highAmount',
          conditionResult: true,
          childNode: {
            nodeId: 'HighBranch',
            condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
            branches: [
              {
                key: 'open', conditionResult: true,
                childNode: { nodeId: 'LeafHO', condition: { field: 'Status', operator: 'EQUALS', value: 'Open' }, branches: [], defaultResult: 'HighOpen' },
              },
              {
                key: 'closed', conditionResult: false,
                childNode: { nodeId: 'LeafHC', condition: { field: 'Status', operator: 'EQUALS', value: 'Open' }, branches: [], defaultResult: 'HighClosed' },
              },
            ],
          },
        },
        {
          key: 'lowAmount',
          conditionResult: false,
          childNode: {
            nodeId: 'LowBranch',
            condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
            branches: [
              {
                key: 'open', conditionResult: true,
                childNode: { nodeId: 'LeafLO', condition: { field: 'Status', operator: 'EQUALS', value: 'Open' }, branches: [], defaultResult: 'LowOpen' },
              },
            ],
          },
        },
      ],
    };
    const evaluator = new PegaDecisionTreeEvaluator(5);
    const result = evaluator.evaluate(tree, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.outputValue).toBe('HighOpen');
  });

  it('no matching branch returns defaultResult from node', () => {
    const tree: DecisionTreeNode = {
      nodeId: 'N1',
      condition: { field: 'Status', operator: 'EQUALS', value: 'Closed' },
      branches: [
        {
          key: 'noMatch',
          conditionResult: 'something_else',
          childNode: null,
        },
      ],
      defaultResult: 'DefaultFallback',
    };
    const evaluator = new PegaDecisionTreeEvaluator(5);
    const result = evaluator.evaluate(tree, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.outputValue).toBe('DefaultFallback');
  });

  it('tree with no defaultResult and no match returns null', () => {
    const tree: DecisionTreeNode = {
      nodeId: 'N1',
      condition: { field: 'Status', operator: 'EQUALS', value: 'Closed' },
      branches: [
        {
          key: 'noMatch',
          conditionResult: 'something_else',
          childNode: null,
        },
      ],
    };
    const evaluator = new PegaDecisionTreeEvaluator(5);
    const result = evaluator.evaluate(tree, context, mockEvaluator);
    expect(result.status).toBe('no_match');
    expect(result.outputValue).toBeNull();
  });

  it('max depth exceeded returns error with outputValue null', () => {
    const deepTree: DecisionTreeNode = {
      nodeId: 'Root',
      condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
      branches: [
        {
          key: 'child',
          conditionResult: true,
          childNode: {
            nodeId: 'Child',
            condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
            branches: [],
            defaultResult: 'Result',
          },
        },
      ],
    };
    const evaluator = new PegaDecisionTreeEvaluator(0);
    const result = evaluator.evaluate(deepTree, context, mockEvaluator);
    expect(result.status).toBe('error');
    expect(result.outputValue).toBeNull();
    expect(result.error).toContain('max depth');
    expect(result.tracePath).toContain('ERROR: max depth exceeded');
  });

  it('leaf node with no branches returns defaultResult directly', () => {
    const leaf: DecisionTreeNode = {
      nodeId: 'Leaf',
      condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
      branches: [],
      defaultResult: 'LeafResult',
    };
    const evaluator = new PegaDecisionTreeEvaluator(5);
    const result = evaluator.evaluate(leaf, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.outputValue).toBe('LeafResult');
  });

  it('branch matching with null conditionResult', () => {
    const tree: DecisionTreeNode = {
      nodeId: 'N1',
      condition: { field: 'Status', operator: 'CUSTOM', value: '@MyRule.Null' },
      branches: [
        {
          key: 'nullBranch',
          conditionResult: null,
          childNode: {
            nodeId: 'N2',
            condition: { field: 'Status', operator: 'EQUALS', value: 'Open' },
            branches: [],
            defaultResult: 'NullMatched',
          },
        },
      ],
    };
    const evaluator = new PegaDecisionTreeEvaluator(5);
    const result = evaluator.evaluate(tree, context, mockEvaluator);
    expect(result.status).toBe('matched');
    expect(result.outputValue).toBe('NullMatched');
  });
});
