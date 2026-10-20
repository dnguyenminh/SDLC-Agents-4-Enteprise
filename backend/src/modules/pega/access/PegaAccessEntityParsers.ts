/**
 * PegaAccessParser — typed entity parsers.
 * Extracted from PegaAccessParser.ts: converts raw JSON into typed Access
 * domain objects (group, role, privilege, operator, org units, security VA).
 */

import type {
  AccessGroup, AccessRole, AccessRoleRef, Privilege, PrivilegeRef,
  OperatorID, OrgDivision, OrgUnit, SecurityVA,
} from './PegaAccessTypes.js';

/** Resolve the rule name from access-specific candidate fields. */
export function extractAccessName(_pxObjClass: string, json: Record<string, unknown>): string {
  return (json.pyRuleName as string)
    || (json.pyUserIdentifier as string)
    || (json.pyPrivilegeName as string)
    || (json.pyAccessRole as string)
    || (json.pyAccessGroup as string)
    || (json.pyName as string)
    || (json.pyLabel as string)
    || '';
}

/** Parse a Data-Admin-AccessGroup into its typed shape. */
export function parseAccessGroupEntity(json: Record<string, unknown>): AccessGroup {
  const roleList = collectStringField(json.pyUserRoles, 'pyRoleName');
  const accessRoleList: AccessRoleRef[] = [];

  const rawAccessRoles = json.pyAccessRoles as unknown[];
  if (Array.isArray(rawAccessRoles)) {
    for (const raw of rawAccessRoles) {
      if (typeof raw !== 'object' || !raw) continue;
      const ar = raw as Record<string, unknown>;
      const privs = collectStrings(ar.pyPrivileges);
      accessRoleList.push({
        pyRoleName: (ar.pyRoleName as string) || '',
        pyPrivileges: privs.length > 0 ? privs : undefined,
      });
    }
  }

  return {
    pxObjClass: (json.pxObjClass as string) || 'Data-Admin-AccessGroup',
    pyName: (json.pyAccessGroup as string) || extractAccessName('', json),
    pyLabel: (json.pyLabel as string) || undefined,
    pyOrganization: (json.pyOrganization as string) || undefined,
    pyDivision: (json.pyDivision as string) || undefined,
    pyRoleList: roleList.length > 0 ? roleList : undefined,
    pyAccessRoleList: accessRoleList.length > 0 ? accessRoleList : undefined,
  };
}

/** Parse a Rule-Access-Role-Name (privileges + accessible classes). */
export function parseAccessRoleEntity(json: Record<string, unknown>): AccessRole {
  const privileges: PrivilegeRef[] = [];
  const rawPrivs = json.pyPrivileges as unknown[];
  if (Array.isArray(rawPrivs)) {
    for (const raw of rawPrivs) {
      if (typeof raw !== 'object' || !raw) continue;
      const p = raw as Record<string, unknown>;
      const actions = collectStrings(p.pyActions);
      privileges.push({
        pyPrivilegeName: (p.pyPrivilegeName as string) || '',
        pyActions: actions.length > 0 ? actions : undefined,
      });
    }
  }

  const classes = collectStrings(json.pyAccessibleClasses);

  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Access-Role-Name',
    pyName: (json.pyAccessRole as string) || extractAccessName('', json),
    pyLabel: (json.pyLabel as string) || undefined,
    pyPrivileges: privileges.length > 0 ? privileges : undefined,
    pyClasses: classes.length > 0 ? classes : undefined,
    pyAccessGroup: (json.pyAccessGroup as string) || undefined,
  };
}

/** Parse a Rule-Access-Privilege. */
export function parsePrivilegeEntity(json: Record<string, unknown>): Privilege {
  const actions = collectStrings(json.pyActions);
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Access-Privilege',
    pyName: (json.pyPrivilegeName as string) || extractAccessName('', json),
    pyLabel: (json.pyLabel as string) || undefined,
    pyActions: actions.length > 0 ? actions : undefined,
    pyAccessGroup: (json.pyAccessGroup as string) || undefined,
    pyClassName: (json.pyClassName as string) || undefined,
  };
}

/** Parse a Data-Admin-Operator-ID. */
export function parseOperatorIDEntity(json: Record<string, unknown>): OperatorID {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Data-Admin-Operator-ID',
    pyName: (json.pyUserIdentifier as string) || extractAccessName('', json),
    pyLabel: (json.pyUserName as string) || (json.pyLabel as string) || undefined,
    pyAccessGroupName: (json.pyAccessGroup as string) || undefined,
    pyOrgDivision: (json.pyDivision as string) || undefined,
    pyOrgUnit: (json.pyUnit as string) || undefined,
    pyLanguage: (json.pyLanguage as string) || undefined,
    pyOrganization: (json.pyOrganization as string) || undefined,
  };
}

/** Parse a Data-Admin-OrgDivision. */
export function parseOrgDivisionEntity(json: Record<string, unknown>): OrgDivision {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Data-Admin-OrgDivision',
    pyName: (json.pyName as string) || (json.pyOrgDivision as string) || extractAccessName('', json),
    pyLabel: (json.pyLabel as string) || undefined,
  };
}

/** Parse a Data-Admin-OrgUnit. */
export function parseOrgUnitEntity(json: Record<string, unknown>): OrgUnit {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Data-Admin-OrgUnit',
    pyName: (json.pyName as string) || (json.pyOrgUnit as string) || extractAccessName('', json),
    pyLabel: (json.pyLabel as string) || undefined,
    pyDivisionName: (json.pyDivisionName as string) || (json.pyOrgDivision as string) || undefined,
  };
}

/** Parse a Rule-Security-VA (security event attribute). */
export function parseSecurityVAEntity(json: Record<string, unknown>): SecurityVA {
  return {
    pxObjClass: (json.pxObjClass as string) || 'Rule-Security-VA',
    pyName: (json.pyRuleName as string) || extractAccessName('', json),
    pyLabel: (json.pyLabel as string) || undefined,
    pyEventType: (json.pyEventType as string) || undefined,
    pyEventCategory: (json.pyEventCategory as string) || undefined,
    pySeverity: (json.pySeverity as string) || undefined,
    pyTargetClass: (json.pyTargetClass as string) || (json.pyClassName as string) || undefined,
  };
}

/** Extract a named string field from each object entry of an array. */
function collectStringField(raw: unknown, field: string): string[] {
  const out: string[] = [];
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (typeof item !== 'object' || !item) continue;
    const val = (item as Record<string, unknown>)[field];
    if (typeof val === 'string' && val) out.push(val);
  }
  return out;
}

/** Collect direct string entries from an array field. */
function collectStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}
