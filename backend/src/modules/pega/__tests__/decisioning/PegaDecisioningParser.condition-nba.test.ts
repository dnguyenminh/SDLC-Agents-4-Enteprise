import { describe, it, expect } from 'vitest';
import { PegaDecisioningParser } from '../../decisioning/PegaDecisioningParser.js';

describe('PegaDecisioningParser', () => {
  const parser = new PegaDecisioningParser();

  describe('parseCondition()', () => {
    it('parses condition with expression string', () => {
      const raw = {
        pyName: 'HighValueCond',
        pyType: 'Filter',
        pyExpression: '.CustomerType = "Premium"',
        operator: 'equals',
        field: 'CustomerType',
        value: 'Premium',
      };
      const cond = parser.parseCondition(raw);
      expect(cond.pyName).toBe('HighValueCond');
      expect(cond.pyType).toBe('Filter');
      expect(cond.pyExpression).toBe('.CustomerType = "Premium"');
      expect(cond.operator).toBe('EQUALS');
      expect(cond.field).toBe('CustomerType');
      expect(cond.value).toBe('Premium');
    });

    it('parses condition with pyWhen reference', () => {
      const raw = {
        pyName: 'EligibilityCond',
        pyWhen: 'IsEligible',
      };
      const cond = parser.parseCondition(raw);
      expect(cond.pyWhen).toBe('IsEligible');
      expect(cond.pyExpression).toBe('IsEligible');
    });

    it('parses condition with pyField mapping', () => {
      const cond = parser.parseCondition({ pyName: 'FCond', pyField: 'Status' });
      expect(cond.field).toBe('Status');
    });

    it('handles condition with custom operator', () => {
      const cond = parser.parseCondition({ pyName: 'CustomCond', operator: 'custom', pyExpression: '@MyRule.Check' });
      expect(cond.operator).toBe('CUSTOM');
    });

    it('returns undefined operator for unknown operator string', () => {
      const cond = parser.parseCondition({ pyName: 'UnknownOp', operator: 'bogus_op_xyz' });
      expect(cond.operator).toBeUndefined();
    });
  });

  describe('parseNBA()', () => {
    it('parses NBA with date ranges', () => {
      const raw: Record<string, unknown> = {
        pyName: 'CrossSellNBA',
        pyIssue: 'CrossSell',
        pyGroup: 'MainGroup',
        pyActive: true,
        pyStartDate: '20260701T000000.000 GMT',
        pyEndDate: '20261231T235959.000 GMT',
      };
      const nba = parser.parseNBA(raw);
      expect(nba.pyName).toBe('CrossSellNBA');
      expect(nba.pyIssue).toBe('CrossSell');
      expect(nba.pyGroup).toBe('MainGroup');
      expect(nba.pyActive).toBe(true);
      expect(nba.pyStartDate).toBe('20260701T000000.000 GMT');
      expect(nba.pyEndDate).toBe('20261231T235959.000 GMT');
    });

    it('parses NBA with embedded proposition', () => {
      const raw: Record<string, unknown> = {
        pyName: 'WeightedNBA',
        proposition: {
          pyName: 'HighProp',
          pyGroup: 'Tier1',
          pyWeight: 100,
        },
      };
      const nba = parser.parseNBA(raw);
      expect(nba.proposition).toBeDefined();
      expect(nba.proposition!.pyName).toBe('HighProp');
      expect(nba.proposition!.pyWeight).toBe(100);
    });

    it('parses NBA with embedded offer via pyOffer', () => {
      const raw: Record<string, unknown> = {
        pyName: 'OfferNBA',
        pyOffer: {
          pyName: 'GoldOffer',
          pyLabel: 'Gold Card',
        },
      };
      const nba = parser.parseNBA(raw);
      expect(nba.offer).toBeDefined();
      expect(nba.offer!.pyName).toBe('GoldOffer');
      expect(nba.offer!.pyLabel).toBe('Gold Card');
    });

    it('handles inactive NBA', () => {
      const nba = parser.parseNBA({ pyName: 'InactiveNBA', pyActive: false });
      expect(nba.pyActive).toBe(false);
    });

    it('handles NBA with no optional fields', () => {
      const nba = parser.parseNBA({ pyName: 'MinimalNBA' });
      expect(nba.pyName).toBe('MinimalNBA');
      expect(nba.pyIssue).toBeUndefined();
      expect(nba.pyActive).toBeUndefined();
    });
  });
});
