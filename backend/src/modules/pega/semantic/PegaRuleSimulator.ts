import { PegaClipboardContext } from '../expression/PegaClipboardContext.js';
import { PegaExpressionEvaluator } from '../expression/PegaExpressionEvaluator.js';
import { PegaWorkflowEngine } from '../workflow/PegaWorkflowEngine.js';
import { PegaDecisionTableEvaluator } from '../decision/PegaDecisionTableEvaluator.js';
import { simulateActivityImpl, simulateDataTransformImpl } from './simulator-activity.js';
import { simulateFlowImpl, simulateDecisionTableImpl } from './simulator-flow.js';
import type { SimulationOptions, SimulationRequest, SimulationResult } from './simulator-types.js';

export type {
  SimulationOptions, SimulationTrace, SimulationRequest, SimulationResult,
} from './simulator-types.js';

/**
 * PegaRuleSimulator — facade (BR-18): simulation impls live in
 * simulator-activity.ts / simulator-flow.ts; shared types in simulator-types.ts.
 */
export class PegaRuleSimulator {
  private expressionEvaluator: PegaExpressionEvaluator;
  private workflowEngine: PegaWorkflowEngine;
  private decisionTableEvaluator: PegaDecisionTableEvaluator;

  constructor() {
    this.expressionEvaluator = new PegaExpressionEvaluator();
    this.workflowEngine = new PegaWorkflowEngine();
    this.decisionTableEvaluator = new PegaDecisionTableEvaluator();
  }

  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    const startTime = Date.now();
    const { pxObjClass, json, inputClipboard, options } = request;
    const clipboard = new PegaClipboardContext(inputClipboard || {}, 'pyWorkPage');

    switch (true) {
      case pxObjClass === 'Rule-Obj-Activity':
        return this.simulateActivity(json, clipboard, options);
      case pxObjClass === 'Rule-Obj-Model':
        return this.simulateDataTransform(json, clipboard, options);
      case pxObjClass === 'Rule-Obj-Flow':
        return this.simulateFlow(json, clipboard, options);
      case pxObjClass === 'Rule-Declare-DecisionTable' || pxObjClass === 'Rule-Declare-DecisionTree':
        return this.simulateDecisionTable(json, clipboard, options);
      default:
        return {
          success: false,
          trace: [{ step: 0, action: 'unsupported', detail: `Simulation not available for rule type: ${pxObjClass}`, timestamp: Date.now() }],
          errors: [`Unsupported rule type: ${pxObjClass}`],
          executionTimeMs: Date.now() - startTime,
        };
    }
  }

  simulateActivity(
    json: Record<string, unknown>,
    context: PegaClipboardContext,
    options?: SimulationOptions,
  ): SimulationResult {
    return simulateActivityImpl(json, context, options, this.expressionEvaluator);
  }

  simulateDataTransform(
    json: Record<string, unknown>,
    context: PegaClipboardContext,
    options?: SimulationOptions,
  ): SimulationResult {
    return simulateDataTransformImpl(json, context, options, this.expressionEvaluator);
  }

  simulateFlow(
    json: Record<string, unknown>,
    context: PegaClipboardContext,
    options?: SimulationOptions,
  ): SimulationResult {
    return simulateFlowImpl(json, context, options, this.workflowEngine);
  }

  simulateDecisionTable(
    json: Record<string, unknown>,
    context: PegaClipboardContext,
    options?: SimulationOptions,
  ): SimulationResult {
    return simulateDecisionTableImpl(json, context, options, this.expressionEvaluator, this.decisionTableEvaluator);
  }

  evaluateExpression(expression: string, context: PegaClipboardContext): unknown {
    const result = this.expressionEvaluator.evaluate(expression, context);
    return result.value.value;
  }
}
