import { describe, it, expect } from 'vitest';
import { PegaDecisioningParser } from '../../decisioning/PegaDecisioningParser.js';
import type { Strategy } from '../../decisioning/PegaDecisioningTypes.js';

describe('PegaDecisioningParser', () => {
  const parser = new PegaDecisioningParser();

  describe('parseStrategy()', () => {
    it('parses a strategy with multiple components', () => {
      const json: Record<string, unknown> = {
        pxObjClass: 'Rule-Decision-Strategy',
        pyName: 'PremiumOfferStrategy',
        pyDescription: 'Strategy for premium customer offers',
        pyComponents: [
          { pyName: 'HighValueSegment', pyComponentType: 'Segment', pyExpression: '.CustomerType = "Premium"' },
          { pyName: 'EligibilityFilter', pyComponentType: 'Filter', pyWhen: 'IsEligible' },
          { pyName: 'ProfitRank', pyComponentType: 'Rank', pyRankBy: 'ProfitScore' },
          { pyName: 'TopPriority', pyComponentType: 'SetPriority', pyPriority: '10' },
          { pyName: 'NBAStep', pyComponentType: 'NBA', pyIssue: 'CrossSell', pyGroup: 'Main' },
          { pyName: 'FinalOffer', pyComponentType: 'Offer', pyLabel: 'Premium Loan', pyDisplayOrder: 1 },
        ],
      };
      const strategy = parser.parseStrategy(json);
      expect(strategy.pyName).toBe('PremiumOfferStrategy');
      expect(strategy.pyDescription).toBe('Strategy for premium customer offers');
      expect(strategy.pyType).toBe('Rule-Decision-Strategy');
      expect(strategy.components.length).toBe(6);
      expect(strategy.components[0].pyName).toBe('HighValueSegment');
      expect(strategy.components[0].pyComponentType).toBe('Segment');
      expect(strategy.components[1].pyComponentType).toBe('Filter');
      expect(strategy.components[2].pyComponentType).toBe('Rank');
      expect(strategy.components[3].pyComponentType).toBe('SetPriority');
      expect(strategy.components[4].pyComponentType).toBe('NBA');
      expect(strategy.components[5].pyComponentType).toBe('Offer');
    });

    it('parses strategy with pySegments as components', () => {
      const json: Record<string, unknown> = {
        pyName: 'SegmentedStrategy',
        pySegments: [
          { pyName: 'SegA', pyExpression: '.Region = "US"' },
          { pyName: 'SegB', pyExpression: '.Region = "EU"' },
        ],
      };
      const strategy = parser.parseStrategy(json);
      expect(strategy.components.length).toBe(2);
      expect(strategy.components[0].pyComponentType).toBe('Segment');
      expect(strategy.components[0].config.pyExpression).toBe('.Region = "US"');
    });

    it('handles missing pyName with UnnamedStrategy', () => {
      const strategy = parser.parseStrategy({});
      expect(strategy.pyName).toBe('UnnamedStrategy');
    });

    it('returns empty components when no component data exists', () => {
      const strategy = parser.parseStrategy({ pyName: 'EmptyStrategy' });
      expect(strategy.components).toEqual([]);
    });
  });

  describe('Round-trip', () => {
    it('parses a complex strategy and re-serializes correctly via JSON round-trip', () => {
      const json: Record<string, unknown> = {
        pxObjClass: 'Rule-Decision-Strategy',
        pyName: 'RoundTripStrategy',
        pyDescription: 'Testing round-trip fidelity',
        pyComponents: [
          { pyName: 'Segment1', pyComponentType: 'Segment', pyExpression: '.Region = "US"' },
          { pyName: 'Offer1', pyComponentType: 'Offer', pyLabel: 'Test Offer', pyDisplayOrder: 1 },
        ],
      };
      const strategy = parser.parseStrategy(json);
      const roundTripped = JSON.parse(JSON.stringify(strategy)) as Strategy;
      expect(roundTripped.pyName).toBe('RoundTripStrategy');
      expect(roundTripped.pyDescription).toBe('Testing round-trip fidelity');
      expect(roundTripped.components.length).toBe(2);
      expect(roundTripped.components[0].pyName).toBe('Segment1');
      expect(roundTripped.components[1].pyComponentType).toBe('Offer');
    });
  });

  describe('Missing fields', () => {
    it('handles empty JSON gracefully', () => {
      const strategy = parser.parseStrategy({});
      expect(strategy.pyName).toBe('UnnamedStrategy');
      expect(strategy.components).toEqual([]);
      expect(strategy.pyDescription).toBeUndefined();
    });

    it('handles null pyComponents', () => {
      const strategy = parser.parseStrategy({ pyName: 'NullComp', pyComponents: null });
      expect(strategy.components).toEqual([]);
    });

    it('handles non-array pyComponents', () => {
      const strategy = parser.parseStrategy({ pyName: 'BadComp', pyComponents: 'notanarray' });
      expect(strategy.components).toEqual([]);
    });

    it('handles null pySegments', () => {
      const strategy = parser.parseStrategy({ pyName: 'NullSeg', pySegments: null });
      expect(strategy.components).toEqual([]);
    });

    it('handles partially undefined NBA fields', () => {
      const nba = parser.parseNBA({ pyName: 'PartialNBA', pyIssue: undefined });
      expect(nba.pyName).toBe('PartialNBA');
      expect(nba.pyIssue).toBeUndefined();
    });
  });
});
