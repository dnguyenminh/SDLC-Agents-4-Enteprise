/**
 * SA4E-418 — ranking math tests: weight formula, multipliers, PageRank,
 * personalization, binary-search packing (16K Doc §6).
 */

import { describe, it, expect } from 'vitest';
import {
  buildFileGraph,
  estimateTokens,
  multiplierFor,
  packWithinBudget,
  personalizedPageRank,
  termWeight,
  tokenizeIdentifier,
} from '../repo-map-rank.js';

describe('SA4E-418 weight formula', () => {
  it('tokenizes CamelCase / snake_case into lowercase terms', () => {
    expect(tokenizeIdentifier('SecurityConfig')).toEqual(['security', 'config']);
    expect(tokenizeIdentifier('user_login_handler')).toEqual(['user', 'login', 'handler']);
    expect(tokenizeIdentifier('parse-HTTPResponse')).toEqual(['parse', 'http', 'response']);
  });

  it('multipliers: query ×10, test ×0.2, long identifier ×2', () => {
    const q = new Set(['payment']);
    expect(multiplierFor('payment', q, 'src/x.ts')).toBe(10);
    expect(multiplierFor('unrelated', q, 'tests/x.spec.ts')).toBe(0.2);
    expect(multiplierFor('authservice', new Set(), 'src/x.ts')).toBe(2);
    expect(multiplierFor('auth', new Set(), 'src/x.ts')).toBe(1);
  });

  it('W = m × √freq × ln(N/(df+1))', () => {
    // N=100, df=9 → ln(100/10) = ln(10); m=1, freq=4 → 2 × ln(10)
    expect(termWeight(4, 9, 100, 1)).toBeCloseTo(2 * Math.log(10), 6);
    expect(termWeight(0, 9, 100, 1)).toBe(0);
    expect(termWeight(4, 100, 100, 1)).toBe(0);
  });
});

describe('SA4E-418 personalized PageRank', () => {
  function hubGraph() {
    // +2 unrelated files so common terms keep positive IDF (N=6 > df+1)
    return buildFileGraph({
      symbolNamesByFile: new Map([
        ['src/controller/payment.ts', ['PaymentController']],
        ['src/service/payment.ts', ['PaymentService']],
        ['src/repository/payment.ts', ['PaymentRepository']],
        ['src/util/money.ts', ['MoneyUtil']],
        ['src/other/alpha.ts', ['AlphaModule']],
        ['src/other/beta.ts', ['BetaModule']],
      ]),
      edges: [
        { fromFile: 'src/controller/payment.ts', toFile: 'src/service/payment.ts', symbolName: 'PaymentService' },
        { fromFile: 'src/service/payment.ts', toFile: 'src/repository/payment.ts', symbolName: 'PaymentRepository' },
        { fromFile: 'src/controller/payment.ts', toFile: 'src/util/money.ts', symbolName: 'MoneyUtil' },
      ],
    });
  }

  it('ranks the central node highest; scores sum ≈ 1 (stochastic)', () => {
    const graph = hubGraph();
    const uniform = new Map(graph.nodes.map((n) => [n, 1]));
    const rank = personalizedPageRank(graph, uniform);
    const service = rank.get('src/service/payment.ts') ?? 0;
    const controller = rank.get('src/controller/payment.ts') ?? 0;
    expect(service).toBeGreaterThan(controller); // service: in from controller, feeds repository
    expect(rank.get('src/repository/payment.ts') ?? 0).toBeGreaterThan(0);
    const sum = [...rank.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('personalization vector boosts the favored file', () => {
    const graph = hubGraph();
    const neutral = new Map(graph.nodes.map((n) => [n, 1]));
    const base = personalizedPageRank(graph, neutral);
    const personal = new Map<string, number>([
      ['src/util/money.ts', 100],
      ['src/controller/payment.ts', 1],
      ['src/service/payment.ts', 1],
      ['src/repository/payment.ts', 1],
    ]);
    const ranked = personalizedPageRank(graph, personal);
    expect(ranked.get('src/util/money.ts') ?? 0).toBeGreaterThan(base.get('src/util/money.ts') ?? 0);
  });

  it('query-matched terms weight edges ×10 inside buildFileGraph', () => {
    const input = {
      symbolNamesByFile: new Map([
        ['src/a.ts', ['PaymentController']],
        ['src/b.ts', ['PaymentRepository']],
        ['src/other/alpha.ts', ['AlphaModule']],
        ['src/other/beta.ts', ['BetaModule']],
      ]),
      edges: [{ fromFile: 'src/a.ts', toFile: 'src/b.ts', symbolName: 'PaymentRepository' }],
      query: 'payment',
    };
    const withQuery = buildFileGraph(input);
    const withoutQuery = buildFileGraph({ ...input, query: undefined });
    const wq = withQuery.edges.get('src/a.ts')?.[0].weight ?? 0;
    const wo = withoutQuery.edges.get('src/a.ts')?.[0].weight ?? 0;
    expect(wq).toBeGreaterThan(wo);
  });
});

describe('SA4E-418 token packing (binary search)', () => {
  it('packs the largest prefix within the budget', () => {
    const lines = ['x'.repeat(40), 'y'.repeat(40), 'z'.repeat(40)];
    const packed = packWithinBudget(lines, 25);
    expect(packed).toHaveLength(2);
    expect(estimateTokens(packed.join('\n'))).toBeLessThanOrEqual(25);
  });

  it('budget too small → empty; large budget → all; empty input → empty', () => {
    const lines = ['x'.repeat(400)];
    expect(packWithinBudget(lines, 10)).toHaveLength(0);
    expect(packWithinBudget(lines, 1000)).toHaveLength(1);
    expect(packWithinBudget([], 100)).toHaveLength(0);
  });

  it('binary search does not overshoot (maximal prefix fits)', () => {
    const lines = Array.from({ length: 100 }, (_, i) => 'a'.repeat(8 + (i % 7)));
    for (const budget of [10, 50, 100, 250, 400]) {
      const packed = packWithinBudget(lines, budget);
      expect(estimateTokens(packed.join('\n'))).toBeLessThanOrEqual(budget);
      if (packed.length < lines.length) {
        expect(estimateTokens(lines.slice(0, packed.length + 1).join('\n'))).toBeGreaterThan(budget);
      }
    }
  });
});
