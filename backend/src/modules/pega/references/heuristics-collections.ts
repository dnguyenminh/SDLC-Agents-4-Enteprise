/**
 * Heuristic reference extraction — collection passes 4-11 (BR-18).
 * Activity steps, DT actions, flow shapes, pxRuleReferences, pages,
 * strategy components, top-level params and layout whens.
 */
import type { AddDepFn } from './reference-maps.js';

export function extractCollectionRefs(
  json: Record<string, unknown>,
  className: string,
  addDep: AddDepFn,
): void {
  // 4. Activity steps: pySteps or steps array
  const steps = (json.steps || json.pySteps) as unknown[];
  if (Array.isArray(steps)) {
    for (const s of steps) {
      if (!s || typeof s !== 'object') continue;
      const step = s as Record<string, unknown>;
      const method = step.pyMethod as string || '';
      const params = step.pyMethodParameters as string || '';

      if ((method === 'Call' || method === 'Branch') && params) {
        const dot = params.lastIndexOf('.');
        const stepName = dot >= 0 ? params.substring(dot + 1) : params;
        addDep('Rule-Obj-Activity', stepName, 'pyMethodParameters', 'calls', false);
      }
      if (step.pyWhenCondition) {
        addDep('Rule-Obj-When', step.pyWhenCondition as string, 'pyWhenCondition', 'references', true);
      }
      if (step.pyFlowActionName) {
        addDep('Rule-Obj-FlowAction', step.pyFlowActionName as string, 'pyFlowActionName', 'references', true);
      }
    }
  }

  // 5. Data Transform actions: pyActions
  const actions = json.pyActions as unknown[];
  if (Array.isArray(actions)) {
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      const act = a as Record<string, unknown>;
      if (act.pyTransformName) {
        addDep('Rule-Obj-Model', act.pyTransformName as string, 'pyTransformName', 'references', true);
      }
      if (act.pyWhenCondition) {
        addDep('Rule-Obj-When', act.pyWhenCondition as string, 'pyWhenCondition', 'references', true);
      }
      if (act.pyTarget && (act.pyActionType as string || '').includes('Transform')) {
        addDep('Rule-Obj-Model', act.pyTarget as string, 'pyTarget', 'references', true);
      }
      if (act.pyActivityName) {
        addDep('Rule-Obj-Activity', act.pyActivityName as string, 'pyActivityName', 'calls', true);
      }
    }
  }

  // 6. Flow shapes: pyShapes or shapes
  const shapes = (json.pyShapes || json.shapes) as unknown[];
  if (Array.isArray(shapes)) {
    for (const sh of shapes) {
      if (!sh || typeof sh !== 'object') continue;
      const shape = sh as Record<string, unknown>;
      if (shape.pyFlowActionName) {
        addDep('Rule-Obj-FlowAction', shape.pyFlowActionName as string, 'pyFlowActionName', 'references', true);
      }
      if (shape.pyWhenCondition) {
        addDep('Rule-Obj-When', shape.pyWhenCondition as string, 'pyWhenCondition', 'references', true);
      }
      if (shape.pyClassName && shape.pyClassName !== className) {
        addDep('Rule-Obj-Class', shape.pyClassName as string, 'pyClassName', 'extends', true);
      }
    }
  }

  // 7. pxRuleReferences array (generic)
  const pxRuleReferences = json.pxRuleReferences as unknown[];
  if (Array.isArray(pxRuleReferences)) {
    for (const ref of pxRuleReferences) {
      if (!ref || typeof ref !== 'object') continue;
      const r = ref as Record<string, unknown>;
      const refType = (r.pxRuleObjClass || r.pxRuleClassName) as string;
      const refName = r.pyRuleName as string;
      if (refType && refName) {
        addDep(refType, refName, 'pxRuleReferences', 'references', true);
      }
    }
  }

  // 8. Declare-specific: pyPages, pyResults
  const pages = json.pyPages as unknown[];
  if (Array.isArray(pages)) {
    for (const p of pages) {
      if (!p || typeof p !== 'object') continue;
      const pg = p as Record<string, unknown>;
      if (pg.pySourceClass) {
        addDep('Rule-Obj-Class', pg.pySourceClass as string, 'pySourceClass', 'references', true);
      }
    }
  }

  // 9. Decision/Strategy components
  const components = (json.pyStrategyComponents || json.pyComponents) as unknown[];
  if (Array.isArray(components)) {
    for (const comp of components) {
      if (!comp || typeof comp !== 'object') continue;
      const c = comp as Record<string, unknown>;
      const ref = (c.pyRef || c.pyWhenRef || c.pyTreatment) as string;
      if (typeof ref === 'string' && ref.trim()) {
        addDep('Rule-Decision-Strategy', ref.trim(), 'pyRef', 'references', true);
      }
    }
  }

  // 10. pyMethodParameters (top-level)
  const topParams = json.pyMethodParameters as string;
  if (typeof topParams === 'string' && topParams) {
    const dot = topParams.lastIndexOf('.');
    const paramName = dot >= 0 ? topParams.substring(dot + 1) : topParams;
    addDep('Rule-Obj-Activity', paramName, 'pyMethodParameters', 'calls', true);
  }

  // 11. UI Section layouts: pyLayouts or pxLayouts with when conditions
  const layouts = (json.pyLayouts || json.pxLayouts) as unknown[];
  if (Array.isArray(layouts)) {
    const extractLayoutWhen = (items: unknown[]): void => {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const layout = item as Record<string, unknown>;
        const whenVal = (layout.when || layout.pyWhen) as string;
        if (whenVal && whenVal.trim()) {
          addDep('Rule-Obj-When', whenVal.trim(), 'when', 'references', true);
        }
        const children = layout.children as unknown[];
        if (Array.isArray(children) && children.length > 0) {
          extractLayoutWhen(children);
        }
      }
    };
    extractLayoutWhen(layouts);
  }
}
