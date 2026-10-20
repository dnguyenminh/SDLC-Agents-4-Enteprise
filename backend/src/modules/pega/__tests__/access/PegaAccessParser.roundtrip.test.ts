import { describe, it, expect } from 'vitest';
import { PegaAccessParser } from '../../access/PegaAccessParser.js';
import { PegaParserRegistry } from '../../strategies/PegaParserRegistry.js';
import { registerAccessParsers } from '../../access/index.js';

describe('PegaAccessParser', () => {
  const parser = new PegaAccessParser();

  // ─── Round-trip serialize/deserialize ───────────────────────────────

  describe('Round-trip serialize/deserialize', () => {
    it('preserves field values for AccessGroup', () => {
      const json = {
        pxObjClass: 'Data-Admin-AccessGroup',
        pyAccessGroup: 'SupportTeam',
        pyLabel: 'Support Team Access',
        pyOrganization: 'PegaSystems',
        pyDivision: 'Support',
        pyUserRoles: [
          { pyRoleName: 'Agent' },
          { pyRoleName: 'Manager' },
        ],
      };

      const typed = parser.parseAccessGroup(json);
      expect(typed.pxObjClass).toBe('Data-Admin-AccessGroup');
      expect(typed.pyName).toBe('SupportTeam');
      expect(typed.pyOrganization).toBe('PegaSystems');
      expect(typed.pyDivision).toBe('Support');
      expect(typed.pyRoleList).toEqual(['Agent', 'Manager']);
    });

    it('preserves field values for AccessRole', () => {
      const json = {
        pxObjClass: 'Rule-Access-Role-Name',
        pyAccessRole: 'Auditor',
        pyLabel: 'Auditor Role',
        pyPrivileges: [
          { pyPrivilegeName: 'AuditLogAccess', pyActions: ['read'] },
        ],
        pyAccessibleClasses: ['Data-AuditLog'],
      };

      const typed = parser.parseAccessRole(json);
      expect(typed.pxObjClass).toBe('Rule-Access-Role-Name');
      expect(typed.pyName).toBe('Auditor');
      expect(typed.pyLabel).toBe('Auditor Role');
      expect(typed.pyPrivileges).toHaveLength(1);
      expect(typed.pyPrivileges![0].pyPrivilegeName).toBe('AuditLogAccess');
      expect(typed.pyClasses).toEqual(['Data-AuditLog']);
    });

    it('preserves field values for Privilege', () => {
      const json = {
        pxObjClass: 'Rule-Access-Privilege',
        pyPrivilegeName: 'ExportData',
        pyActions: ['export'],
        pyAccessGroup: 'ReportUsers',
      };

      const typed = parser.parsePrivilege(json);
      expect(typed.pxObjClass).toBe('Rule-Access-Privilege');
      expect(typed.pyName).toBe('ExportData');
      expect(typed.pyActions).toEqual(['export']);
      expect(typed.pyAccessGroup).toBe('ReportUsers');
    });

    it('preserves field values for OperatorID', () => {
      const json = {
        pxObjClass: 'Data-Admin-Operator-ID',
        pyUserIdentifier: 'ops.user',
        pyUserName: 'Ops User',
        pyAccessGroup: 'Operations',
        pyLanguage: 'de_DE',
      };

      const typed = parser.parseOperatorID(json);
      expect(typed.pxObjClass).toBe('Data-Admin-Operator-ID');
      expect(typed.pyName).toBe('ops.user');
      expect(typed.pyLabel).toBe('Ops User');
      expect(typed.pyAccessGroupName).toBe('Operations');
      expect(typed.pyLanguage).toBe('de_DE');
    });

    it('preserves field values for SecurityVA', () => {
      const json = {
        pxObjClass: 'Rule-Security-VA',
        pyRuleName: 'AuditLogin',
        pyLabel: 'Audit Login Events',
        pyEventType: 'Login',
        pyEventCategory: 'Authentication',
        pySeverity: 'High',
        pyTargetClass: 'Data-Admin-Operator-ID',
      };

      const typed = parser.parseSecurityVA(json);
      expect(typed.pxObjClass).toBe('Rule-Security-VA');
      expect(typed.pyName).toBe('AuditLogin');
      expect(typed.pyLabel).toBe('Audit Login Events');
      expect(typed.pyEventType).toBe('Login');
      expect(typed.pyEventCategory).toBe('Authentication');
      expect(typed.pySeverity).toBe('High');
      expect(typed.pyTargetClass).toBe('Data-Admin-Operator-ID');
    });
  });

  // ─── Missing optional fields ────────────────────────────────────────

  describe('Missing optional fields', () => {
    it('handles empty AccessGroup', () => {
      const json = { pxObjClass: 'Data-Admin-AccessGroup' };

      const typed = parser.parseAccessGroup(json);
      expect(typed.pyName).toBe('');
      expect(typed.pyOrganization).toBeUndefined();
      expect(typed.pyRoleList).toBeUndefined();
    });

    it('handles empty AccessRole', () => {
      const json = { pxObjClass: 'Rule-Access-Role-Name' };

      const typed = parser.parseAccessRole(json);
      expect(typed.pyName).toBe('');
      expect(typed.pyPrivileges).toBeUndefined();
      expect(typed.pyClasses).toBeUndefined();
    });

    it('handles empty Privilege', () => {
      const json = { pxObjClass: 'Rule-Access-Privilege' };

      const typed = parser.parsePrivilege(json);
      expect(typed.pyName).toBe('');
      expect(typed.pyActions).toBeUndefined();
    });

    it('handles empty OperatorID', () => {
      const json = { pxObjClass: 'Data-Admin-Operator-ID' };

      const typed = parser.parseOperatorID(json);
      expect(typed.pyName).toBe('');
      expect(typed.pyAccessGroupName).toBeUndefined();
      expect(typed.pyLanguage).toBeUndefined();
    });

    it('handles empty json for parse()', () => {
      const json = { pxObjClass: 'Rule-Access-Role-Name' };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('');
      expect(result.symbol.fqn).toBe('Rule-Access-Role-Name:@baseclass:');
      expect(result.dependencies).toHaveLength(0);
    });
  });

  // ─── Registry integration ────────────────────────────────────────────

  describe('Registry integration', () => {
    it('can be registered and used via PegaParserRegistry', () => {
      const registry = new PegaParserRegistry();
      registerAccessParsers(registry);

      const json = {
        pxObjClass: 'Data-Admin-AccessGroup',
        pyAccessGroup: 'DevTeam',
        pyOrganization: 'PegaSystems',
        pyUserRoles: [
          { pyRoleName: 'Developer' },
        ],
      };

      const result = registry.parse(json);
      expect(result.symbol.ruleType).toBe('Data-Admin-AccessGroup');
      expect(result.symbol.name).toBe('DevTeam');
    });

    it('registers before fallback so Access rules are handled first', () => {
      const registry = new PegaParserRegistry();
      registerAccessParsers(registry);

      const result = registry.parse({
        pxObjClass: 'Rule-Access-Privilege',
        pyPrivilegeName: 'TestPrivilege',
      });

      expect(result.symbol.ruleType).toBe('Rule-Access-Privilege');
      expect(result.symbol.name).toBe('TestPrivilege');
    });
  });
});
