import { describe, it, expect } from 'vitest';
import { PegaAccessParser } from '../../access/PegaAccessParser.js';

describe('PegaAccessParser', () => {
  const parser = new PegaAccessParser();

  // ─── OperatorID with org references ──────────────────────────────────

  describe('OperatorID with org references', () => {
    it('parses OperatorID with org division and org unit', () => {
      const json = {
        pxObjClass: 'Data-Admin-Operator-ID',
        pyUserIdentifier: 'john.doe',
        pyUserName: 'John Doe',
        pyAccessGroup: 'JiraDevelopers',
        pyOrganization: 'PegaSystems',
        pyDivision: 'Engineering',
        pyUnit: 'PlatformTeam',
        pyLanguage: 'en_US',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('john.doe');

      const typed = parser.parseOperatorID(json);
      expect(typed.pyName).toBe('john.doe');
      expect(typed.pyLabel).toBe('John Doe');
      expect(typed.pyAccessGroupName).toBe('JiraDevelopers');
      expect(typed.pyOrgDivision).toBe('Engineering');
      expect(typed.pyOrgUnit).toBe('PlatformTeam');
      expect(typed.pyLanguage).toBe('en_US');
      expect(typed.pyOrganization).toBe('PegaSystems');
    });

    it('extracts AccessGroup dependency from OperatorID', () => {
      const json = {
        pxObjClass: 'Data-Admin-Operator-ID',
        pyUserIdentifier: 'jane.doe',
        pyUserName: 'Jane Doe',
        pyAccessGroup: 'Managers',
        pyOrganization: 'PegaSystems',
      };

      const result = parser.parse(json);
      const agDeps = result.dependencies.filter(d => d.ruleType === 'Data-Admin-AccessGroup');
      expect(agDeps).toHaveLength(1);
      expect(agDeps[0].ruleName).toBe('Managers');
    });

    it('handles minimal OperatorID', () => {
      const json = {
        pxObjClass: 'Data-Admin-Operator-ID',
        pyUserIdentifier: 'minimal.user',
      };

      const typed = parser.parseOperatorID(json);
      expect(typed.pyName).toBe('minimal.user');
      expect(typed.pyAccessGroupName).toBeUndefined();
      expect(typed.pyOrgDivision).toBeUndefined();
      expect(typed.pyOrgUnit).toBeUndefined();
      expect(typed.pyLanguage).toBeUndefined();
    });
  });

  // ─── OrgDivision/OrgUnit hierarchy ───────────────────────────────────

  describe('OrgDivision/OrgUnit hierarchy', () => {
    it('parses OrgDivision with name and label', () => {
      const json = {
        pxObjClass: 'Data-Admin-OrgDivision',
        pyName: 'Engineering',
        pyLabel: 'Engineering Division',
      };

      const typed = parser.parseOrgDivision(json);
      expect(typed.pyName).toBe('Engineering');
      expect(typed.pyLabel).toBe('Engineering Division');
    });

    it('parses OrgUnit with division reference', () => {
      const json = {
        pxObjClass: 'Data-Admin-OrgUnit',
        pyName: 'PlatformTeam',
        pyLabel: 'Platform Engineering Team',
        pyDivisionName: 'Engineering',
      };

      const typed = parser.parseOrgUnit(json);
      expect(typed.pyName).toBe('PlatformTeam');
      expect(typed.pyLabel).toBe('Platform Engineering Team');
      expect(typed.pyDivisionName).toBe('Engineering');
    });

    it('links OrgUnit back to OrgDivision via pyDivisionName dependency', () => {
      const json = {
        pxObjClass: 'Data-Admin-OrgUnit',
        pyName: 'QATeam',
        pyDivisionName: 'QualityAssurance',
      };

      const typed = parser.parseOrgUnit(json);
      expect(typed.pyDivisionName).toBe('QualityAssurance');
    });
  });

  // ─── supports() for all Rule-Access-* and Rule-Admin-* ──────────────

  describe('supports() for all Rule-Access-* and Rule-Admin-* prefixes', () => {
    it('returns true for all Rule-Access-* concrete types', () => {
      expect(parser.supports('Rule-Access-')).toBe(true);
      expect(parser.supports('Rule-Access-Deny-')).toBe(true);
      expect(parser.supports('Rule-Access-Deny-Obj')).toBe(true);
      expect(parser.supports('Rule-Access-Privilege')).toBe(true);
      expect(parser.supports('Rule-Access-Role-')).toBe(true);
      expect(parser.supports('Rule-Access-Role-Name')).toBe(true);
      expect(parser.supports('Rule-Access-Role-Obj')).toBe(true);
      expect(parser.supports('Rule-Access-Setting')).toBe(true);
      expect(parser.supports('Rule-Access-When')).toBe(true);
    });

    it('returns true for all Rule-Admin-* concrete types', () => {
      expect(parser.supports('Rule-Admin-')).toBe(true);
      expect(parser.supports('Rule-Admin-Extract')).toBe(true);
      expect(parser.supports('Rule-Admin-Product')).toBe(true);
      expect(parser.supports('Rule-Admin-Skill')).toBe(true);
      expect(parser.supports('Rule-Admin-System')).toBe(true);
      expect(parser.supports('Rule-Admin-System-Settings')).toBe(true);
    });

    it('returns true for Data-Admin-AccessGroup and Data-Admin-Operator-ID', () => {
      expect(parser.supports('Data-Admin-AccessGroup')).toBe(true);
      expect(parser.supports('Data-Admin-Operator-ID')).toBe(true);
    });

    it('returns true for any Rule-Access-* prefix match', () => {
      expect(parser.supports('Rule-Access-Custom')).toBe(true);
      expect(parser.supports('Rule-Access-NewFeature')).toBe(true);
    });

    it('returns true for any Rule-Admin-* prefix match', () => {
      expect(parser.supports('Rule-Admin-Custom')).toBe(true);
    });

    it('returns false for unrelated rule types', () => {
      expect(parser.supports('Rule-Obj-Activity')).toBe(false);
      expect(parser.supports('Rule-Obj-Model')).toBe(false);
      expect(parser.supports('Rule-Connect-REST')).toBe(false);
      expect(parser.supports('Rule-Declare-Expressions')).toBe(false);
      expect(parser.supports('')).toBe(false);
    });
  });
});
