import { describe, it, expect } from 'vitest';
import { PegaAccessParser } from '../../access/PegaAccessParser.js';

describe('PegaAccessParser', () => {
  const parser = new PegaAccessParser();

  // ─── AccessGroup parsing ────────────────────────────────────────────

  describe('AccessGroup parsing', () => {
    it('parses AccessGroup with roles from pyUserRoles', () => {
      const json = {
        pxObjClass: 'Data-Admin-AccessGroup',
        pyAccessGroup: 'JiraDevelopers',
        pyLabel: 'Jira Developers Access',
        pyOrganization: 'PegaSystems',
        pyDivision: 'Engineering',
        pyUserRoles: [
          { pyRoleName: 'Developer' },
          { pyRoleName: 'Tester' },
          { pyRoleName: 'Admin' },
        ],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('JiraDevelopers');
      expect(result.symbol.ruleType).toBe('Data-Admin-AccessGroup');

      const typed = parser.parseAccessGroup(json);
      expect(typed.pyName).toBe('JiraDevelopers');
      expect(typed.pyOrganization).toBe('PegaSystems');
      expect(typed.pyDivision).toBe('Engineering');
      expect(typed.pyRoleList).toEqual(['Developer', 'Tester', 'Admin']);
      expect(typed.pyAccessRoleList).toBeUndefined();
    });

    it('parses AccessGroup with access role references', () => {
      const json = {
        pxObjClass: 'Data-Admin-AccessGroup',
        pyAccessGroup: 'Managers',
        pyOrganization: 'PegaSystems',
        pyAccessRoles: [
          { pyRoleName: 'ManagerRole', pyPrivileges: ['ApproveExpense', 'HireEmployee'] },
          { pyRoleName: 'ReadOnlyRole' },
        ],
      };

      const typed = parser.parseAccessGroup(json);
      expect(typed.pyAccessRoleList).toHaveLength(2);
      expect(typed.pyAccessRoleList![0].pyRoleName).toBe('ManagerRole');
      expect(typed.pyAccessRoleList![0].pyPrivileges).toEqual(['ApproveExpense', 'HireEmployee']);
      expect(typed.pyAccessRoleList![1].pyRoleName).toBe('ReadOnlyRole');
      expect(typed.pyAccessRoleList![1].pyPrivileges).toBeUndefined();
    });

    it('handles AccessGroup with missing optional fields', () => {
      const json = {
        pxObjClass: 'Data-Admin-AccessGroup',
        pyAccessGroup: 'MinimalGroup',
      };

      const typed = parser.parseAccessGroup(json);
      expect(typed.pyName).toBe('MinimalGroup');
      expect(typed.pyOrganization).toBeUndefined();
      expect(typed.pyDivision).toBeUndefined();
      expect(typed.pyRoleList).toBeUndefined();
      expect(typed.pyAccessRoleList).toBeUndefined();
    });
  });

  // ─── AccessRole parsing with privileges ─────────────────────────────

  describe('AccessRole parsing with privileges', () => {
    it('parses AccessRole with privilege refs and classes', () => {
      const json = {
        pxObjClass: 'Rule-Access-Role-Name',
        pyAccessRole: 'SeniorDev',
        pyLabel: 'Senior Developer Role',
        pyPrivileges: [
          { pyPrivilegeName: 'CodeAccess', pyActions: ['read', 'write'] },
          { pyPrivilegeName: 'DeployAccess', pyActions: ['execute'] },
        ],
        pyAccessibleClasses: ['Work-Order', 'Work-Ticket', 'Data-Customer'],
        pyAccessGroup: 'JiraDevelopers',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('SeniorDev');
      expect(result.symbol.logicSummary).toContain('SeniorDev');
      expect(result.symbol.logicSummary).toContain('Privileges: 2');

      const typed = parser.parseAccessRole(json);
      expect(typed.pyName).toBe('SeniorDev');
      expect(typed.pyLabel).toBe('Senior Developer Role');
      expect(typed.pyPrivileges).toHaveLength(2);
      expect(typed.pyPrivileges![0].pyPrivilegeName).toBe('CodeAccess');
      expect(typed.pyPrivileges![0].pyActions).toEqual(['read', 'write']);
      expect(typed.pyPrivileges![1].pyPrivilegeName).toBe('DeployAccess');
      expect(typed.pyPrivileges![1].pyActions).toEqual(['execute']);
      expect(typed.pyClasses).toEqual(['Work-Order', 'Work-Ticket', 'Data-Customer']);
      expect(typed.pyAccessGroup).toBe('JiraDevelopers');
    });

    it('parses AccessRole with empty privileges', () => {
      const json = {
        pxObjClass: 'Rule-Access-Role-Name',
        pyAccessRole: 'NoPrivilegeRole',
      };

      const typed = parser.parseAccessRole(json);
      expect(typed.pyPrivileges).toBeUndefined();
      expect(typed.pyClasses).toBeUndefined();
      expect(typed.pyAccessGroup).toBeUndefined();
    });

    it('extracts AccessRole dependency from parse()', () => {
      const json = {
        pxObjClass: 'Rule-Access-Role-Name',
        pyClassName: 'Work-Cover-Jira',
        pyRuleName: 'ReviewerRole',
        pyAccessRole: 'Reviewer',
        pyPrivileges: [
          { pyPrivilegeName: 'ReadAccess' },
        ],
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('ReviewerRole');
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]).toEqual({
        ruleType: 'Rule-Access-Role-Name',
        className: '@baseclass',
        ruleName: 'Reviewer',
      });
    });
  });

  // ─── Privilege with actions ─────────────────────────────────────────

  describe('Privilege with actions', () => {
    it('parses Privilege with action list', () => {
      const json = {
        pxObjClass: 'Rule-Access-Privilege',
        pyPrivilegeName: 'FullControl',
        pyLabel: 'Full Control Privilege',
        pyActions: ['read', 'write', 'delete', 'execute'],
        pyAccessGroup: 'Admins',
        pyClassName: 'Work-Order',
      };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('FullControl');

      const typed = parser.parsePrivilege(json);
      expect(typed.pyName).toBe('FullControl');
      expect(typed.pyLabel).toBe('Full Control Privilege');
      expect(typed.pyActions).toEqual(['read', 'write', 'delete', 'execute']);
      expect(typed.pyAccessGroup).toBe('Admins');
      expect(typed.pyClassName).toBe('Work-Order');
    });

    it('parses Privilege with no actions', () => {
      const json = {
        pxObjClass: 'Rule-Access-Privilege',
        pyPrivilegeName: 'ReadOnly',
      };

      const typed = parser.parsePrivilege(json);
      expect(typed.pyActions).toBeUndefined();
      expect(typed.pyAccessGroup).toBeUndefined();
    });

    it('handles empty action array', () => {
      const json = {
        pxObjClass: 'Rule-Access-Privilege',
        pyPrivilegeName: 'EmptyActions',
        pyActions: [],
      };

      const typed = parser.parsePrivilege(json);
      expect(typed.pyActions).toBeUndefined();
    });
  });
});
