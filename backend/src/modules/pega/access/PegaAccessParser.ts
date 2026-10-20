/**
 * PegaAccessParser (facade) — access/admin rule parsing strategy.
 * Supports Rule-Access-* / Rule-Admin-* / operator classes and produces
 * symbols + dependencies + typed entity parsing for the security domain.
 *
 * Implementation submodules (same directory):
 * - PegaAccessEntityParsers.ts — typed entity converters (group/role/privilege/…)
 */

import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { UnresolvedDependency } from '../models.js';
import type {
  AccessGroup, AccessRole, Privilege, OperatorID, OrgDivision, OrgUnit, SecurityVA,
} from './PegaAccessTypes.js';
import {
  extractAccessName, parseAccessGroupEntity, parseAccessRoleEntity,
  parsePrivilegeEntity, parseOperatorIDEntity, parseOrgDivisionEntity,
  parseOrgUnitEntity, parseSecurityVAEntity,
} from './PegaAccessEntityParsers.js';

const ACCESS_AND_ADMIN_CLASSES = new Set([
  'Rule-Access-',
  'Rule-Access-Deny-',
  'Rule-Access-Deny-Obj',
  'Rule-Access-Privilege',
  'Rule-Access-Role-',
  'Rule-Access-Role-Name',
  'Rule-Access-Role-Obj',
  'Rule-Access-Setting',
  'Rule-Access-When',
  'Rule-Admin-',
  'Rule-Admin-Extract',
  'Rule-Admin-Product',
  'Rule-Admin-Skill',
  'Rule-Admin-System',
  'Rule-Admin-System-Settings',
]);

export class PegaAccessParser implements IPegaRuleParserStrategy {
  public supports(pxObjClass: string): boolean {
    if (ACCESS_AND_ADMIN_CLASSES.has(pxObjClass)) return true;
    if (pxObjClass === 'Data-Admin-AccessGroup') return true;
    if (pxObjClass === 'Data-Admin-Operator-ID') return true;
    if (pxObjClass.startsWith('Rule-Access-')) return true;
    if (pxObjClass.startsWith('Rule-Admin-')) return true;
    return false;
  }

  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || '';
    const className = (json.pyClassName as string) || '@baseclass';
    const name = extractAccessName(pxObjClass, json);
    const fqn = `${pxObjClass}:${className}:${name}`;
    const dependencies = this.extractDependencies(json);

    const logicSummary = this.buildLogicSummary(pxObjClass, json);

    const symbol = {
      fqn,
      name,
      className,
      ruleType: pxObjClass,
      isRule: true,
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
      logicSummary,
    };

    return { symbol, dependencies };
  }

  public parseAccessGroup(json: Record<string, unknown>): AccessGroup {
    return parseAccessGroupEntity(json);
  }

  public parseAccessRole(json: Record<string, unknown>): AccessRole {
    return parseAccessRoleEntity(json);
  }

  public parsePrivilege(json: Record<string, unknown>): Privilege {
    return parsePrivilegeEntity(json);
  }

  public parseOperatorID(json: Record<string, unknown>): OperatorID {
    return parseOperatorIDEntity(json);
  }

  public parseOrgDivision(json: Record<string, unknown>): OrgDivision {
    return parseOrgDivisionEntity(json);
  }

  public parseOrgUnit(json: Record<string, unknown>): OrgUnit {
    return parseOrgUnitEntity(json);
  }

  public parseSecurityVA(json: Record<string, unknown>): SecurityVA {
    return parseSecurityVAEntity(json);
  }

  private extractDependencies(json: Record<string, unknown>): UnresolvedDependency[] {
    const deps: UnresolvedDependency[] = [];
    const className = (json.pyClassName as string) || '@baseclass';

    const accessGroup = (json.pyAccessGroup as string);
    if (accessGroup) {
      deps.push({ ruleType: 'Data-Admin-AccessGroup', className: '@baseclass', ruleName: accessGroup });
    }

    const accessRole = (json.pyAccessRole as string);
    if (accessRole) {
      deps.push({ ruleType: 'Rule-Access-Role-Name', className: '@baseclass', ruleName: accessRole });
    }

    const privilegeName = (json.pyPrivilegeName as string);
    if (privilegeName) {
      deps.push({ ruleType: 'Rule-Access-Privilege', className, ruleName: privilegeName });
    }

    const whenRef = (json.pyBlockName as string) || (json.pyWhenCondition as string);
    if (whenRef) {
      deps.push({ ruleType: 'Rule-Access-When', className, ruleName: whenRef });
    }

    return deps;
  }

  private buildLogicSummary(pxObjClass: string, json: Record<string, unknown>): string {
    const lines: string[] = [];
    lines.push(`${pxObjClass}: ${extractAccessName(pxObjClass, json)}`);

    if (pxObjClass === 'Data-Admin-AccessGroup') {
      const roles = json.pyUserRoles as unknown[];
      lines.push(`  Organization: ${(json.pyOrganization as string) || '(not set)'}`);
      lines.push(`  Division: ${(json.pyDivision as string) || '(not set)'}`);
      lines.push(`  Roles: ${Array.isArray(roles) ? roles.length : 0}`);
    } else if (pxObjClass === 'Rule-Access-Role-Name') {
      const privs = json.pyPrivileges as unknown[];
      lines.push(`  Access Role: ${(json.pyAccessRole as string) || '(not set)'}`);
      lines.push(`  Privileges: ${Array.isArray(privs) ? privs.length : 0}`);
    } else if (pxObjClass === 'Rule-Access-Privilege') {
      const actions = json.pyActions as unknown[];
      lines.push(`  Privilege: ${(json.pyPrivilegeName as string) || '(not set)'}`);
      lines.push(`  Actions: ${Array.isArray(actions) ? actions.length : 0}`);
    } else if (pxObjClass === 'Data-Admin-Operator-ID') {
      lines.push(`  User: ${(json.pyUserIdentifier as string) || '(not set)'}`);
      lines.push(`  Access Group: ${(json.pyAccessGroup as string) || '(not set)'}`);
    } else if (pxObjClass.startsWith('Rule-Access-')) {
      const keyField = (json.pyAccessRole as string) || (json.pyPrivilegeName as string) || (json.pyBlockName as string) || '';
      if (keyField) lines.push(`  Key: ${keyField}`);
    } else if (pxObjClass.startsWith('Rule-Admin-')) {
      const desc = (json.pyDescription as string) || '';
      if (desc) lines.push(`  Description: ${desc}`);
    }

    return lines.join('\n');
  }
}
