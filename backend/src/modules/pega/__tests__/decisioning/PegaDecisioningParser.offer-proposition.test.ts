import { describe, it, expect } from 'vitest';
import { PegaDecisioningParser } from '../../decisioning/PegaDecisioningParser.js';

describe('PegaDecisioningParser', () => {
  const parser = new PegaDecisioningParser();

  describe('parseOffer()', () => {
    it('parses offer with treatment refs', () => {
      const raw: Record<string, unknown> = {
        pyName: 'PremiumLoanOffer',
        pyLabel: 'Premium Personal Loan',
        pyIcon: 'loan-icon.png',
        pyDescription: 'Special loan for premium customers',
        pyTreatment: 'EmailTreatment_01',
        pyDisplayOrder: 2,
        treatment: {
          pyName: 'EmailTreatment_01',
          pyContent: 'Dear {{.CustomerName}}, get our premium loan...',
          pyChannel: 'Email',
          pyDisplayFormat: 'HTML',
        },
      };
      const offer = parser.parseOffer(raw);
      expect(offer.pyName).toBe('PremiumLoanOffer');
      expect(offer.pyLabel).toBe('Premium Personal Loan');
      expect(offer.pyIcon).toBe('loan-icon.png');
      expect(offer.pyDescription).toBe('Special loan for premium customers');
      expect(offer.pyTreatment).toBe('EmailTreatment_01');
      expect(offer.pyDisplayOrder).toBe(2);
      expect(offer.treatment).toBeDefined();
      expect(offer.treatment!.pyName).toBe('EmailTreatment_01');
      expect(offer.treatment!.pyChannel).toBe('Email');
    });

    it('handles minimal offer', () => {
      const offer = parser.parseOffer({ pyName: 'MinimalOffer' });
      expect(offer.pyName).toBe('MinimalOffer');
      expect(offer.pyLabel).toBeUndefined();
      expect(offer.pyDisplayOrder).toBeUndefined();
    });
  });

  describe('parseProposition()', () => {
    it('parses proposition with weight', () => {
      const raw: Record<string, unknown> = {
        pyName: 'TopProposition',
        pyGroup: 'A1',
        pyTreatment: 'Trt_001',
        pyWeight: 95,
        pyStartDate: '20260701T000000.000 GMT',
      };
      const prop = parser.parseProposition(raw);
      expect(prop.pyName).toBe('TopProposition');
      expect(prop.pyGroup).toBe('A1');
      expect(prop.pyTreatment).toBe('Trt_001');
      expect(prop.pyWeight).toBe(95);
      expect(prop.pyStartDate).toBe('20260701T000000.000 GMT');
    });

    it('parses proposition with embedded offer', () => {
      const raw: Record<string, unknown> = {
        pyName: 'BundleProp',
        pyWeight: 50,
        offer: {
          pyName: 'BundleOffer',
          pyLabel: 'Bundle Deal',
        },
      };
      const prop = parser.parseProposition(raw);
      expect(prop.offer).toBeDefined();
      expect(prop.offer!.pyName).toBe('BundleOffer');
      expect(prop.offer!.pyLabel).toBe('Bundle Deal');
    });
  });

  describe('parseTreatment()', () => {
    it('parses treatment with content and channel', () => {
      const raw: Record<string, unknown> = {
        pyName: 'SMSAlert',
        pyContent: 'Your account balance is low',
        pyChannel: 'SMS',
        pyDisplayFormat: 'PlainText',
      };
      const treatment = parser.parseTreatment(raw);
      expect(treatment.pyName).toBe('SMSAlert');
      expect(treatment.pyContent).toBe('Your account balance is low');
      expect(treatment.pyChannel).toBe('SMS');
      expect(treatment.pyDisplayFormat).toBe('PlainText');
    });
  });
});
