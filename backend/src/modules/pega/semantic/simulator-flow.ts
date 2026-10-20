/** Rule simulator impls — Flow + Decision table (BR-18 extraction). */
import type { PegaExpressionEvaluator } from '../expression/PegaExpressionEvaluator.js';
import type { PegaClipboardContext } from '../expression/PegaClipboardContext.js';
import { PegaFlowGraph, type ShapeNode, type Connector } from '../workflow/PegaFlowGraph.js';
import { PegaWorkflowEngine } from '../workflow/PegaWorkflowEngine.js';
import { PegaDecisionTableEvaluator } from '../decision/PegaDecisionTableEvaluator.js';
import type { PegaDecisionTableRow } from '../decision/PegaEvaluationResult.js';
import type { SimulationOptions, SimulationResult, SimulationTrace } from './simulator-types.js';

export function simulateFlowImpl(
  json: Record<string, unknown>,
  context: PegaClipboardContext,
  _options: SimulationOptions | undefined,
  workflowEngine: PegaWorkflowEngine,
): SimulationResult {
  const startTime = Date.now();
  const trace: SimulationTrace[] = [];
  const errors: string[] = [];
  let stepCount = 0;

  const name = (json.pyFlowName as string) || (json.pyRuleName as string) || '';
  const shapes = Array.isArray(json.pyShapes) ? json.pyShapes : Array.isArray(json.shapes) ? json.shapes : [];

  if (shapes.length === 0) {
    return {
      success: false,
      trace: [{ step: 0, action: 'error', detail: 'Flow has no shapes defined', timestamp: Date.now() }],
      errors: ['Flow has no shapes defined'],
      executionTimeMs: Date.now() - startTime,
    };
  }

  const { shapeMap, connectors } = buildFlowGraphParts(shapes);

  const graph = new PegaFlowGraph(shapeMap, connectors);
  const wfResult = workflowEngine.simulate(graph, context);

  for (const log of wfResult.log) {
    trace.push({
      step: stepCount++,
      action: 'flow_step',
      detail: log,
      timestamp: Date.now(),
    });
  }

  trace.push({
    step: stepCount,
    action: wfResult.completed ? 'complete' : 'incomplete',
    detail: wfResult.completed
      ? `Flow "${name}" reached END after ${wfResult.history.length} shape(s)`
      : `Flow "${name}" did not reach END (stopped at shape ${wfResult.currentNodeId})`,
    timestamp: Date.now(),
  });

  return {
    success: wfResult.completed,
    trace,
    errors,
    executionTimeMs: Date.now() - startTime,
  };
}

function buildFlowGraphParts(shapes: unknown[]): { shapeMap: Map<string, ShapeNode>; connectors: Connector[] } {
  const shapeMap = new Map<string, ShapeNode>();
  const connectors: Connector[] = [];

  for (let i = 0; i < shapes.length; i++) {
    const sh = shapes[i] as Record<string, unknown>;
    const shapeId = (sh.pyName as string) || `shape_${i}`;
    const shapeType = (sh.pyShapeType as string) || 'Unknown';
    const shape: ShapeNode = { id: shapeId, type: shapeType, properties: sh as Record<string, unknown> };
    shapeMap.set(shapeId, shape);

    if (i < shapes.length - 1) {
      const nextShape = shapes[i + 1] as Record<string, unknown>;
      const nextId = (nextShape.pyName as string) || `shape_${i + 1}`;
      connectors.push({
        id: `conn_${i}`,
        fromShapeId: shapeId,
        toShapeId: nextId,
        isDefault: true,
      });
    }
  }
  return { shapeMap, connectors };
}

export function simulateDecisionTableImpl(
  json: Record<string, unknown>,
  context: PegaClipboardContext,
  _options: SimulationOptions | undefined,
  expressionEvaluator: PegaExpressionEvaluator,
  decisionTableEvaluator: PegaDecisionTableEvaluator,
): SimulationResult {
  const startTime = Date.now();
  const trace: SimulationTrace[] = [];
  const errors: string[] = [];
  let stepCount = 0;

  const name = (json.pyLabel as string) || (json.pyRuleName as string) || '';
  const rows = Array.isArray(json.pyDecisionTableRows) ? json.pyDecisionTableRows : Array.isArray(json.pyRows) ? json.pyRows : [];

  const dtRows: PegaDecisionTableRow[] = rows.map((r: unknown, i: number) => {
    const row = r as Record<string, unknown>;
    const condText = (row.pyCondition as string) || '';

    const conditions = condText
      ? [parseConditionFromString(condText)]
      : [];

    return {
      rowId: `R${i + 1}`,
      priority: i + 1,
      conditions,
      result: row.pyResult ?? null,
    };
  });

  trace.push({
    step: stepCount++,
    action: 'start',
    detail: `Beginning decision table "${name}" evaluation with ${dtRows.length} row(s)`,
    timestamp: Date.now(),
  });

  try {
    const result = decisionTableEvaluator.evaluate(dtRows, context, expressionEvaluator);

    for (const t of result.tracePath) {
      trace.push({
        step: stepCount++,
        action: 'eval',
        detail: t,
        timestamp: Date.now(),
      });
    }

    trace.push({
      step: stepCount++,
      action: result.status === 'matched' ? 'matched' : 'no_match',
      detail: result.status === 'matched'
        ? `Matched row ${result.matchedRowId} with result: ${JSON.stringify(result.outputValue)}`
        : 'No matching row found',
      timestamp: Date.now(),
    });

    return {
      success: result.status === 'matched' || result.status === 'no_match',
      trace,
      errors,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    errors.push(`Decision table evaluation error: ${err}`);
    trace.push({
      step: stepCount,
      action: 'error',
      detail: `Decision table evaluation failed: ${err}`,
      timestamp: Date.now(),
    });
    return {
      success: false,
      trace,
      errors,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export function parseConditionFromString(condText: string): { field: string; operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER' | 'GREATER_EQUALS' | 'LESS' | 'LESS_EQUALS'; value: unknown } {
  const parts = condText.trim().split(/\s+/);
  if (parts.length >= 3) {
    const field = parts[0];
    const opSymbol = parts[1];
    const value = parts.slice(2).join(' ');

    let operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER' | 'GREATER_EQUALS' | 'LESS' | 'LESS_EQUALS' = 'EQUALS';
    switch (opSymbol) {
      case '>': operator = 'GREATER'; break;
      case '<': operator = 'LESS'; break;
      case '>=': operator = 'GREATER_EQUALS'; break;
      case '<=': operator = 'LESS_EQUALS'; break;
      case '!=': case '<>': operator = 'NOT_EQUALS'; break;
      case '=': operator = 'EQUALS'; break;
      default: {
        if (opSymbol.toLowerCase() === 'equals') operator = 'EQUALS';
        break;
      }
    }

    const numericValue = Number(value);
    return { field, operator, value: isNaN(numericValue) ? value : numericValue };
  }

  if (parts.length === 1 && condText.includes(' ')) {
    return { field: condText, operator: 'EQUALS', value: true };
  }

  return { field: condText, operator: 'EQUALS', value: condText };
}
