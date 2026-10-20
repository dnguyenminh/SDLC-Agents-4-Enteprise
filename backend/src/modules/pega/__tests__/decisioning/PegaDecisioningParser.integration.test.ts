import { describe, it, expect } from 'vitest';
import { PegaDecisioningParser } from '../../decisioning/PegaDecisioningParser.js';
import { PegaStrategyComponentResolver } from '../../decision/PegaStrategyComponentResolver.js';

describe('PegaDecisioningParser', () => {
  const parser = new PegaDecisioningParser();

  describe('Strategy -> Component -> Execution integration', () => {
    it('parses a strategy and resolves components via PegaStrategyComponentResolver', () => {
      const json: Record<string, unknown> = {
        pxObjClass: 'Rule-Decision-Strategy',
        pyName: 'IntegrationStrategy',
        pyComponents: [
          { pyName: 'Seg1', pyComponentType: 'Segment', pyExpression: '.Status = "Active"' },
          { pyName: 'Filter1', pyComponentType: 'Filter', pyWhen: 'IsVerified' },
          { pyName: 'Rank1', pyComponentType: 'Rank', pyRankBy: 'Score' },
          { pyName: 'NBA1', pyComponentType: 'NBA', pyIssue: 'Upsell', pyGroup: 'Primary' },
        ],
      };
      const strategy = parser.parseStrategy(json);
      expect(strategy.components.length).toBe(4);

      const resolver = new PegaStrategyComponentResolver();

      for (const comp of strategy.components) {
        const resolved = resolver.resolveComponentType(comp);
        expect(resolved.resolved).toBe(true);
        expect(resolved.componentType).toBe(comp.pyComponentType);
      }
    });
  });
});
