/**
 * AST builder functions per rule type (BR-18 extraction from PegaRuleAstParser).
 * Standalone functions selected by getBuilder(); each returns { properties, children }.
 */
import type { AstNode } from './PegaRuleAst.js';
import { SYSTEM_FIELDS, SYSTEM_FIELD_PREFIXES } from './PegaRuleAst.js';

export interface AstBuildResult { properties: Record<string, unknown>; children: AstNode[] }

export function stripSystemFields(json: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(json)) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (SYSTEM_FIELD_PREFIXES.some(p => key.startsWith(p))) continue;
    if (key.startsWith('px') && key !== 'pxObjClass') continue;
    if (key.startsWith('pz')) continue;
    if (typeof val === 'function') continue;
    if (Array.isArray(val) && val.length === 0 && key.endsWith('List')) continue;
    if (val === '' || val === null || val === undefined) continue;
    if (key === 'pyLinks' || key === 'pyLockDefList' || key === 'pyOtherJavaGenerators') continue;
    if (key === 'pyValidRuleSets' || key === 'pxClassSQL' || key === 'pxInternalClassSQL') continue;
    result[key] = val;
  }
  return result;
}

export function buildActivity(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  delete props.steps;
  const steps = Array.isArray(json.steps) ? json.steps : [];
  const children: AstNode[] = steps.map((s: unknown, _i: number) => {
    const step = s as Record<string, unknown>;
    return {
      type: 'Step',
      properties: stripSystemFields(step),
      children: [],
    };
  });
  return { properties: props, children };
}

export function buildDataTransform(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  delete props.pyActions;
  const actions = Array.isArray(json.pyActions) ? json.pyActions : [];
  const children: AstNode[] = actions.map((a: unknown) => {
    const act = a as Record<string, unknown>;
    return {
      type: 'Action',
      properties: stripSystemFields(act),
      children: [],
    };
  });
  return { properties: props, children };
}

export function buildFlow(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  delete props.pyShapes; delete props.shapes;
  const shapes = Array.isArray(json.pyShapes) ? json.pyShapes : Array.isArray(json.shapes) ? json.shapes : [];
  const children: AstNode[] = shapes.map((s: unknown) => {
    const shape = s as Record<string, unknown>;
    return {
      type: (shape.pyShapeType as string) || 'Shape',
      properties: stripSystemFields(shape),
      children: [],
    };
  });
  return { properties: props, children };
}

export function buildFlowAction(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  return { properties: props, children: [] };
}

export function buildClass(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  delete props.pxRuleReferences;
  const refs = Array.isArray(json.pxRuleReferences) ? json.pxRuleReferences : [];
  const children: AstNode[] = refs.map((r: unknown) => ({
    type: 'RuleReference',
    properties: stripSystemFields(r as Record<string, unknown>),
    children: [],
  }));
  return { properties: props, children };
}

export function buildProperty(json: Record<string, unknown>): AstBuildResult {
  return { properties: stripSystemFields(json), children: [] };
}

export function buildWhen(json: Record<string, unknown>): AstBuildResult {
  return { properties: stripSystemFields(json), children: [] };
}

export function buildDeclare(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];

  if (json.pxResults) {
    const results = Array.isArray(json.pxResults) ? json.pxResults : [];
    for (const r of results) {
      children.push({ type: 'Result', properties: stripSystemFields(r as Record<string, unknown>), children: [] });
    }
  }
  if (json.pyPages) {
    const pages = Array.isArray(json.pyPages) ? json.pyPages : [];
    for (const p of pages) {
      children.push({ type: 'Page', properties: stripSystemFields(p as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildDecision(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];

  const rows = json.pyDecisionTableRows || json.pyRows;
  if (Array.isArray(rows)) {
    for (const r of rows) {
      children.push({ type: 'DecisionRow', properties: stripSystemFields(r as Record<string, unknown>), children: [] });
    }
  }

  const strategies = json.pyStrategyComponents || json.pyComponents;
  if (Array.isArray(strategies)) {
    for (const s of strategies) {
      children.push({ type: 'StrategyComponent', properties: stripSystemFields(s as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildConnector(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  delete props.pyHeaders;
  if (Array.isArray(json.pyHeaders)) {
    const hdrs: AstNode[] = (json.pyHeaders as any[]).map(h => ({
      type: 'Header', properties: stripSystemFields(h), children: [],
    }));
    return { properties: props, children: hdrs };
  }
  return { properties: props, children: [] };
}

export function buildService(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  return { properties: props, children: [] };
}

export function buildUi(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  const layouts = json.pyLayouts || json.pxLayouts;
  if (Array.isArray(layouts)) {
    for (const l of layouts) {
      children.push({ type: 'Layout', properties: stripSystemFields(l as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildParse(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  const parts = json.pyParseRules || json.pyParts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      children.push({ type: 'ParsePart', properties: stripSystemFields(p as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildAccess(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  const ops = json.pyOperations || json.pyAccessPrivileges;
  if (Array.isArray(ops)) {
    for (const o of ops) {
      children.push({ type: 'Permission', properties: stripSystemFields(o as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}
