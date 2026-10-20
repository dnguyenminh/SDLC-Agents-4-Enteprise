/**
 * Semantic analyzer impls — Flow + Decision (BR-18 extraction).
 * Standalone functions; PegaSemanticAnalyzer delegates to these.
 */
import type { SemanticAnalysis, SideEffect, SemanticDep, ConditionSummary, DataFlowEntry } from './types.js';
import { extractName } from './analyzer-utils.js';

export function analyzeFlow(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const label = (json.pyLabel as string) || name;
  const shapes = Array.isArray(json.pyShapes) ? json.pyShapes : Array.isArray(json.shapes) ? json.shapes : [];
  const shapeTypes: string[] = [];
  const dependencies: SemanticDep[] = [];
  const conditions: ConditionSummary[] = [];
  const sideEffects: SideEffect[] = [];
  const dataFlow: DataFlowEntry[] = [];

  for (const s of shapes) {
    const shape = s as Record<string, unknown>;
    const shapeType = (shape.pyShapeType as string) || 'Unknown';
    shapeTypes.push(shapeType);

    if (shape.pyFlowActionName) {
      dependencies.push({
        type: 'flow_action',
        target: shape.pyFlowActionName as string,
        targetClass: className,
        context: `Flow action "${shape.pyFlowActionName}"`,
      });
    }

    if (shape.pyWhenCondition) {
      conditions.push({
        field: shape.pyWhenCondition as string,
        operator: 'WHEN',
        value: true,
        description: `Branches on "${shape.pyWhenCondition}"`,
      });
    }

    if (shape.pyClassName && shape.pyClassName !== className) {
      dataFlow.push({
        input: '',
        transform: `References class ${shape.pyClassName}`,
        output: shape.pyClassName as string,
      });
    }
  }

  const startIdx = shapeTypes.indexOf('Start');
  const endIdx = shapeTypes.lastIndexOf('End');
  const route = startIdx >= 0 && endIdx >= 0 && endIdx > startIdx
    ? `starts at "${shapes[startIdx] && (shapes[startIdx] as Record<string, unknown>).pyName || 'Start'}", routes through ${shapeTypes.length - 2} shape(s), ends at "${shapes[endIdx] && (shapes[endIdx] as Record<string, unknown>).pyName || 'End'}"`
    : `contains ${shapeTypes.length} shape(s)`;

  const summary = `This flow "${label}" ${route}.`;
  return {
    ruleType: 'Rule-Obj-Flow',
    name,
    className,
    summary,
    intent: `Orchestrate ${shapeTypes.length} step(s) through a business process`,
    sideEffects,
    dependencies,
    conditions,
    dataFlow,
    shapeTypes,
  };
}

export function analyzeDecision(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const pxObjClass = (json.pxObjClass as string) || 'Rule-Declare-DecisionTable';
  const label = (json.pyLabel as string) || name;
  const rows = Array.isArray(json.pyDecisionTableRows) ? json.pyDecisionTableRows : Array.isArray(json.pyRows) ? json.pyRows : [];
  const conditions: ConditionSummary[] = [];
  const dependencies: SemanticDep[] = [];
  const dataFlow: DataFlowEntry[] = [];
  const propertyEvaluated = (json.pyPropertyEvaluated as string) || '';

  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const condText = (row.pyCondition as string) || '';
    const resultText = (row.pyResult as string) || '';

    if (condText) {
      const parts = condText.split(/\s+/);
      conditions.push({
        field: parts[0] || condText,
        operator: parts[1] || '?',
        value: parts.slice(2).join(' ') || '',
        description: condText,
      });
    }

    if (propertyEvaluated) {
      dataFlow.push({
        input: propertyEvaluated,
        transform: `Decision evaluates "${condText}"`,
        output: resultText,
      });
    }
  }

  const returnActions = json.pyReturnActions;
  if (Array.isArray(returnActions)) {
    for (const ra of returnActions) {
      const ract = ra as Record<string, unknown>;
      if (ract.pyTransformName) {
        dependencies.push({
          type: 'data_transform',
          target: ract.pyTransformName as string,
          targetClass: className,
          context: `Decision triggers transform "${ract.pyTransformName}"`,
        });
      }
    }
  }

  const summary = conditions.length > 0
    ? `This ${pxObjClass} "${label}" evaluates ${propertyEvaluated || 'properties'} across ${rows.length} row(s) and returns a matched result.`
    : `This ${pxObjClass} "${label}" has ${rows.length} row(s).`;

  return {
    ruleType: pxObjClass,
    name,
    className,
    summary,
    intent: `Evaluate ${rows.length} condition row(s) to determine output value`,
    sideEffects: [],
    dependencies,
    conditions,
    dataFlow,
    decisionRows: rows.length,
    propertyEvaluated,
  };
}
