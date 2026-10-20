/**
 * Rule-reference extraction from ingested Pega rule JSON.
 * Extracted from PegaCrawler (BR-18) — pure functions; no behavior change.
 */

import type { UnresolvedDependency } from '../models.js';

export function extractRuleReferences(json: Record<string, unknown>): UnresolvedDependency[] {
  const deps: UnresolvedDependency[] = [];
  const visited = new Set<string>();

  const pushDep = (ruleType: string, className: string, ruleName: string, exactInsKey?: string) => {
    const key = exactInsKey || `${ruleType}:${className}:${ruleName}`;
    if (visited.has(key)) return;
    visited.add(key);
    deps.push({ insKey: exactInsKey, ruleType, className, ruleName });
  };

  if (json.pxObjClass) {
    const pzKey = (json.pzInsKey as string) || (json.pxInsId as string);
    pushDep(json.pxObjClass as string, (json.pyClassName as string) || '@baseclass', (json.pyRuleName as string) || '', pzKey);
  }

  if (json.pyAccessGroup) {
    pushDep('Data-Admin-Operator-AccessGroup', '@baseclass', json.pyAccessGroup as string, `DATA-ADMIN-OPERATOR-ACCESSGROUP ${json.pyAccessGroup}`);
  }

  if (json.pyApplication && json.pyApplicationVersion) {
    pushDep('Rule-Application', '@baseclass', json.pyApplication as string, `RULE-APPLICATION ${json.pyApplication} ${json.pyApplicationVersion}`);
  }

  if (json.pyClassName && json.pyClassName !== '@baseclass') {
    pushDep('Rule-Obj-Class', '@baseclass', json.pyClassName as string);
  }

  if (json.pySuperClass) {
    pushDep('Rule-Obj-Class', '@baseclass', json.pySuperClass as string);
  }

  if (json.pyPatternParent) {
    pushDep('Rule-Obj-Class', '@baseclass', json.pyPatternParent as string);
  }

  if (json.pyDerivesFrom) {
    pushDep('Rule-Obj-Class', '@baseclass', json.pyDerivesFrom as string);
  }

  extractPxRuleReferences(json, pushDep);
  extractStepReferences(json, pushDep);
  extractPageClassReferences(json, pushDep);
  extractFlowActionReferences(json, pushDep);

  return deps;
}

type PushDep = (ruleType: string, className: string, ruleName: string, exactInsKey?: string) => void;

function extractPxRuleReferences(json: Record<string, unknown>, pushDep: PushDep): void {
  const pxRuleReferences = json.pxRuleReferences;
  if (!Array.isArray(pxRuleReferences)) return;
  for (const ref of pxRuleReferences) {
    if (ref && typeof ref === 'object') {
      const r = ref as Record<string, unknown>;
      const refObjClass = (r.pxRuleObjClass as string) || '';
      const refClassName = (r.pxRuleClassName as string) || '@baseclass';
      const refName = r.pyRuleName as string | undefined;
      if (!refObjClass || !refName) continue;

      // Rule-Obj-Class refs are always 2-token insKeys
      if (refObjClass === 'Rule-Obj-Class') {
        pushDep('Rule-Obj-Class', '@baseclass', refName);
      } else {
        pushDep(refObjClass, refClassName, refName);
      }
    }
  }
}

function extractStepReferences(json: Record<string, unknown>, pushDep: PushDep): void {
  const steps = json.steps || json.pySteps;
  if (!Array.isArray(steps)) return;
  for (const step of steps) {
    if (typeof step !== 'object' || !step) continue;
    const s = step as Record<string, unknown>;
    const method = (s.pyMethod as string) || '';
    const params = (s.pyMethodParameters as string) || '';

    if ((method === 'Call' || method === 'Branch') && params) {
      const parts = params.split('.');
      if (parts.length >= 2) {
        pushDep('Rule-Obj-Activity', parts[0], parts[1]);
      } else {
        pushDep('Rule-Obj-Activity', '@baseclass', params);
      }
    }

    if (method === 'Property-Set' && params && params.includes('.')) {
      const dot = params.lastIndexOf('.');
      const cls = params.substring(0, dot);
      const prop = params.substring(dot + 1);
      if (cls && prop) {
        pushDep('Rule-Obj-Property', cls, prop);
      }
    }
  }
}

function extractPageClassReferences(json: Record<string, unknown>, pushDep: PushDep): void {
  const pages = json.pyPagesAndClasses || json.pxPagesAndClasses;
  if (!Array.isArray(pages)) return;
  for (const p of pages) {
    if (p && typeof p === 'object') {
      const page = p as Record<string, unknown>;
      const pageClass = (page.pyPagesAndClassesClass || page.pxPagesAndClassesClass) as string | undefined;
      if (pageClass && pageClass !== '@baseclass' && !pageClass.startsWith('Code-') && !pageClass.startsWith('Data-')) {
        pushDep('Rule-Obj-Class', '@baseclass', pageClass);
      }
    }
  }
}

function extractFlowActionReferences(json: Record<string, unknown>, pushDep: PushDep): void {
  const flowActions = json.pyFlowActions;
  if (!Array.isArray(flowActions)) return;
  for (const fa of flowActions) {
    if (fa && typeof fa === 'object') {
      const f = fa as Record<string, unknown>;
      if (f.pyFlowActionName) {
        pushDep('Rule-Obj-FlowAction', (json.pyClassName as string) || '@baseclass', f.pyFlowActionName as string);
      }
    }
  }
}
