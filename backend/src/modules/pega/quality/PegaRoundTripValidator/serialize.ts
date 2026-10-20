/**
 * AST → JSON serialization for the Pega round-trip validator.
 * Extracted from PegaRoundTripValidator (BR-18) — no behavior change.
 */

import type { PegaRuleAst } from '../../PegaRuleAst.js';

// Map of rule types to their name-carrying fields (in priority order)
export const RULE_TYPE_NAME_FIELDS: Record<string, string[]> = {
  'Rule-Obj-Activity': ['pyActivityName', 'pyRuleName'],
  'Rule-Obj-Model': ['pyModelName', 'pyRuleName'],
  'Rule-Obj-Flow': ['pyFlowName', 'pyRuleName'],
  'Rule-Obj-FlowAction': ['pyRuleName'],
  'Rule-Obj-Class': ['pyRuleName'],
  'Rule-Obj-When': ['pyRuleName'],
  'Rule-Obj-Property': ['pyRuleName'],
  'Rule-Declare-DecisionTable': ['pyRuleName'],
  'Rule-Declare-DecisionTree': ['pyRuleName'],
  'Rule-Declare-Expressions': ['pyRuleName'],
  'Rule-Declare-Pages': ['pyRuleName'],
  'Rule-Connect-REST': ['pyRuleName'],
  'Rule-Connect-SOAP': ['pyRuleName'],
  'Rule-HTML-Section': ['pyRuleName'],
  'Rule-Utility-Function': ['pyRuleName'],
  'Rule-Access-Role': ['pyRuleName'],
};

export function getPrimaryNameField(ruleType: string): string {
  const fields = RULE_TYPE_NAME_FIELDS[ruleType];
  return fields ? fields[0] : 'pyRuleName';
}

export function serializeAst(ast: PegaRuleAst): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  result.pxObjClass = ast.ruleType;
  result.pyClassName = ast.className;

  // Use the correct name field for the rule type
  if (ast.name) {
    const nameField = getPrimaryNameField(ast.ruleType);
    result[nameField] = ast.name;
  } else {
    result.pyRuleName = '';
  }

  if (ast.ruleset) result.pyRuleset = ast.ruleset;
  if (ast.rulesetVersion) result.pyRuleSetVersion = ast.rulesetVersion;
  if (ast.label) result.pyLabel = ast.label;

  // Restore properties
  for (const [key, val] of Object.entries(ast.properties)) {
    if (val !== undefined && val !== null) {
      result[key] = val;
    }
  }

  serializeChildren(ast, result);

  return result;
}

/** Serialize children back to arrays based on rule type. */
function serializeChildren(ast: PegaRuleAst, result: Record<string, unknown>): void {
  if (ast.children.length === 0) return;
  const firstChild = ast.children[0];
  if (firstChild.type === 'Step') {
    result.steps = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'Action') {
    result.pyActions = ast.children.map(c => ({ ...c.properties }));
  } else if (['Start', 'Assignment', 'Action', 'End'].includes(firstChild.type)) {
    result.pyShapes = ast.children.map(c => ({ pyShapeType: c.type, ...c.properties }));
  } else if (firstChild.type === 'DecisionRow') {
    result.pyDecisionTableRows = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'StrategyComponent') {
    result.pyComponents = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'Header') {
    result.pyHeaders = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'RuleReference') {
    result.pxRuleReferences = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'Page') {
    result.pyPages = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'Parameter') {
    result.pyParameters = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'Permission') {
    result.pyOperations = ast.children.map(c => ({ ...c.properties }));
  } else if (firstChild.type === 'Layout') {
    result.pyLayouts = ast.children.map(c => ({ ...c.properties }));
  } else {
    const arrayKey = `${firstChild.type}List`;
    result[arrayKey] = ast.children.map(c => ({ type: c.type, ...c.properties }));
  }
}
