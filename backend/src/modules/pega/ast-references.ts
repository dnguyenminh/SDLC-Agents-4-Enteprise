/** AST parser shared helpers + reference extraction (BR-18 extraction). */
import type { AstReference } from './PegaRuleAst.js';
import { SYSTEM_FIELDS } from './PegaRuleAst.js';

export const REFERENCE_FIELDS = new Set([
  'pyClassName', 'pySuperClass', 'pyPatternParent', 'pyDerivesFrom',
  'pyRuleName', 'pyModelName', 'pyActivityName', 'pyTransformName',
  'pyWhenCondition', 'pyOnChangeTrigger',
]);

export function extractAstName(json: Record<string, unknown>): string {
  return (json.pyRuleName as string)
    || (json.pyActivityName as string)
    || (json.pyModelName as string)
    || (json.pyFlowName as string)
    || (json.pyLabel as string)
    || (json.pyClassName as string)
    || '';
}

export function extractReferences(
  json: Record<string, unknown>,
  defaultClass: string,
  ruleType: string,
): AstReference[] {
  const refs: AstReference[] = [];
  const visited = new Set<string>();

  const addRef = (rt: string, cls: string, name: string, role: string) => {
    const key = `${rt}:${cls}:${name}`;
    if (visited.has(key)) return;
    visited.add(key);
    refs.push({ ruleType: rt, className: cls, ruleName: name, role });
  };

  for (const [key, val] of Object.entries(json)) {
    if (!key.startsWith('py') && !key.startsWith('px')) continue;
    if (SYSTEM_FIELDS.has(key)) continue;
    if (typeof val !== 'string' || !val) continue;

    if (REFERENCE_FIELDS.has(key)) {
      const cls = key === 'pyClassName' ? '@baseclass' : (json.pyClassName as string) || defaultClass;
      const rt = key === 'pySuperClass' || key === 'pyPatternParent' || key === 'pyDerivesFrom' || key === 'pyClassName'
        ? 'Rule-Obj-Class' : ruleType;
      addRef(rt, cls, val, key);
      continue;
    }

    if (key === 'pyMethodParameters' && val.includes('.')) {
      const dot = val.lastIndexOf('.');
      addRef('Rule-Obj-Activity', val.substring(0, dot), val.substring(dot + 1), 'call');
      continue;
    }
    if (key === 'pyMethodParameters') {
      addRef('Rule-Obj-Activity', defaultClass, val, 'call');
    }
  }

  extractStepRefs(json, defaultClass, addRef);
  extractActionRefs(json, defaultClass, addRef);
  extractPxRuleRefRefs(json, defaultClass, addRef);
  extractShapeRefs(json, defaultClass, addRef);

  return refs;
}

function extractStepRefs(
  json: Record<string, unknown>, defaultClass: string,
  addRef: (rt: string, cls: string, name: string, role: string) => void,
): void {
  const steps = json.steps || json.pySteps;
  if (Array.isArray(steps)) {
    for (const s of steps) {
      if (typeof s !== 'object' || !s) continue;
      const step = s as Record<string, unknown>;
      const method = step.pyMethod as string || '';
      const params = step.pyMethodParameters as string || '';
      if ((method === 'Call' || method === 'Branch') && params) {
        const dot = params.lastIndexOf('.');
        addRef('Rule-Obj-Activity', dot >= 0 ? params.substring(0, dot) : defaultClass, dot >= 0 ? params.substring(dot + 1) : params, 'calls');
      }
      if (step.pyWhenCondition) {
        addRef('Rule-Obj-When', defaultClass, step.pyWhenCondition as string, 'guards');
      }
      if (step.pyFlowActionName) {
        addRef('Rule-Obj-FlowAction', defaultClass, step.pyFlowActionName as string, 'flow-action');
      }
    }
  }
}

function extractActionRefs(
  json: Record<string, unknown>, defaultClass: string,
  addRef: (rt: string, cls: string, name: string, role: string) => void,
): void {
  const actions = json.pyActions;
  if (Array.isArray(actions)) {
    for (const a of actions) {
      if (typeof a !== 'object' || !a) continue;
      const act = a as Record<string, unknown>;
      if (act.pyTransformName) addRef('Rule-Obj-Model', defaultClass, act.pyTransformName as string, 'applies-transform');
      if (act.pyWhenCondition) addRef('Rule-Obj-When', defaultClass, act.pyWhenCondition as string, 'guards');
      if (act.pyTarget && (act.pyActionType as string || '').includes('Transform')) {
        addRef('Rule-Obj-Model', defaultClass, act.pyTarget as string, 'applies-transform');
      }
    }
  }
}

function extractPxRuleRefRefs(
  json: Record<string, unknown>, defaultClass: string,
  addRef: (rt: string, cls: string, name: string, role: string) => void,
): void {
  const pxRuleReferences = json.pxRuleReferences;
  if (Array.isArray(pxRuleReferences)) {
    for (const ref of pxRuleReferences) {
      if (typeof ref !== 'object' || !ref) continue;
      const r = ref as Record<string, unknown>;
      const refType = (r.pxRuleObjClass || r.pxRuleClassName) as string;
      const refName = r.pyRuleName as string;
      const refClass = r.pxRuleClassName as string || defaultClass;
      if (refType && refName) addRef(refType, refClass || defaultClass, refName, 'references');
    }
  }
}

function extractShapeRefs(
  json: Record<string, unknown>, defaultClass: string,
  addRef: (rt: string, cls: string, name: string, role: string) => void,
): void {
  const shapes = json.pyShapes || json.shapes;
  if (Array.isArray(shapes)) {
    for (const sh of shapes) {
      if (typeof sh !== 'object' || !sh) continue;
      const shape = sh as Record<string, unknown>;
      if (shape.pyFlowActionName) {
        addRef('Rule-Obj-FlowAction', defaultClass, shape.pyFlowActionName as string, 'flow-action');
      }
      if (shape.pyWhenCondition) {
        addRef('Rule-Obj-When', defaultClass, shape.pyWhenCondition as string, 'guards');
      }
      if (shape.pyClassName && shape.pyClassName !== defaultClass) {
        addRef('Rule-Obj-Class', '@baseclass', shape.pyClassName as string, 'references');
      }
    }
  }
}
