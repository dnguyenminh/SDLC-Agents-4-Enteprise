/** Rule simulator impls — Activity + Data Transform (BR-18 extraction). */
import type { PegaExpressionEvaluator } from '../expression/PegaExpressionEvaluator.js';
import type { PegaClipboardContext } from '../expression/PegaClipboardContext.js';
import type { SimulationOptions, SimulationResult, SimulationTrace } from './simulator-types.js';

function traceEntry(step: number, action: string, detail: string): SimulationTrace {
  return { step, action, detail, timestamp: Date.now() };
}

export function simulateActivityImpl(
  json: Record<string, unknown>,
  context: PegaClipboardContext,
  options: SimulationOptions | undefined,
  expressionEvaluator: PegaExpressionEvaluator,
): SimulationResult {
  const startTime = Date.now();
  const trace: SimulationTrace[] = [];
  const errors: string[] = [];
  let stepCount = 0;
  const maxSteps = options?.maxSteps ?? 100;

  const name = (json.pyActivityName as string) || (json.pyRuleName as string) || '';
  const steps = Array.isArray(json.steps) ? json.steps : [];

  trace.push(traceEntry(stepCount++, 'start', `Beginning simulation of activity "${name}" with ${steps.length} step(s)`));

  for (const s of steps) {
    if (stepCount > maxSteps) {
      errors.push(`Simulation exceeded max steps (${maxSteps})`);
      break;
    }

    const step = s as Record<string, unknown>;
    const method = (step.pyMethod as string) || '';
    const params = (step.pyMethodParameters as string) || '';
    const stepLabel = (step.pyLabel as string) || '';

    const when = step.pyWhenCondition as string;
    if (when) {
      const guard = evaluateWhenGuard(expressionEvaluator, when, context, options, stepLabel || method, trace, stepCount, errors);
      if (guard.skipped) { stepCount = guard.nextStep; continue; }
      stepCount = guard.nextStep;
    }

    stepCount = traceStepAction(trace, stepCount, method, params, stepLabel);
  }

  trace.push(traceEntry(stepCount, 'complete', `Activity "${name}" simulation complete (${steps.length} steps processed)`));

  return {
    success: errors.length === 0,
    trace,
    errors,
    executionTimeMs: Date.now() - startTime,
  };
}

type WhenGuardResult = { skipped: boolean; nextStep: number };

/** Evaluate a step's when condition; records skip/error trace entries. */
function evaluateWhenGuard(
  expressionEvaluator: PegaExpressionEvaluator,
  when: string,
  context: PegaClipboardContext,
  options: SimulationOptions | undefined,
  stepLabel: string,
  trace: SimulationTrace[],
  stepCount: number,
  errors: string[],
): WhenGuardResult {
  try {
    const whenResult = expressionEvaluator.evaluate(when, context, options?.collectTrace);
    if (!whenResult.value.boolean) {
      trace.push(traceEntry(stepCount, 'skip', `Step "${stepLabel}" skipped (when condition "${when}" evaluated to false)`));
      return { skipped: true, nextStep: stepCount + 1 };
    }
    return { skipped: false, nextStep: stepCount };
  } catch (err) {
    errors.push(`When condition evaluation error: ${err}`);
    trace.push(traceEntry(stepCount, 'error', `When condition "${when}" evaluation failed: ${err}`));
    return { skipped: true, nextStep: stepCount + 1 };
  }
}

/** Map a step's method to a trace action entry; returns the next step number. */
function traceStepAction(trace: SimulationTrace[], stepCount: number, method: string, params: string, stepLabel: string): number {
  if (method === 'Call' || method === 'Branch') {
    trace.push(traceEntry(stepCount, 'call', `Calling activity ${params} (${stepLabel || 'no label'})`));
  } else if (method === 'Property-Set' || method === 'Property-Copy') {
    const target = params.replace(/^\./, '');
    trace.push(traceEntry(stepCount, 'set', `Setting property "${target}"`));
  } else if (method === 'Obj-Save' || method === 'Save') {
    trace.push(traceEntry(stepCount, 'db_write', `Saving "${params}" to database`));
  } else if (method === 'Obj-Delete') {
    trace.push(traceEntry(stepCount, 'db_write', `Deleting "${params}" from database`));
  } else if (method === 'Page-New') {
    trace.push(traceEntry(stepCount, 'page_new', `Creating new page "${params}"`));
  } else if (method) {
    trace.push(traceEntry(stepCount, 'execute', `Executing step method="${method}" params="${params}"`));
  } else {
    trace.push(traceEntry(stepCount, 'noop', `Step with no method`));
  }
  return stepCount + 1;
}

export function simulateDataTransformImpl(
  json: Record<string, unknown>,
  context: PegaClipboardContext,
  options: SimulationOptions | undefined,
  expressionEvaluator: PegaExpressionEvaluator,
): SimulationResult {
  const startTime = Date.now();
  const trace: SimulationTrace[] = [];
  const errors: string[] = [];
  let stepCount = 0;

  const name = (json.pyModelName as string) || (json.pyRuleName as string) || '';
  const actions = Array.isArray(json.pyActions) ? json.pyActions : [];

  trace.push(traceEntry(stepCount++, 'start', `Beginning simulation of data transform "${name}" with ${actions.length} action(s)`));

  for (const a of actions) {
    const act = a as Record<string, unknown>;
    const actionType = (act.pyActionType as string) || '';
    const target = (act.pyTarget as string) || '';

    const when = act.pyWhenCondition as string;
    if (when) {
      const guard = evaluateWhenGuard(expressionEvaluator, when, context, options, actionType, trace, stepCount, errors);
      if (guard.skipped) { stepCount = guard.nextStep; continue; }
      stepCount = guard.nextStep;
    }

    if (actionType === 'Set') {
      const source = (act.pySource as string) || '';
      trace.push(traceEntry(stepCount++, 'set', `Mapping "${source}" -> "${target}"`));
    } else if (actionType === 'Apply Data Transform' || actionType === 'Page-New-Transform') {
      trace.push(traceEntry(stepCount++, 'apply_transform', `Applying sub-transform "${target}"`));
    } else {
      trace.push(traceEntry(stepCount++, 'execute', `Executing action "${actionType}" on target "${target}"`));
    }
  }

  trace.push(traceEntry(stepCount, 'complete', `Data transform "${name}" simulation complete`));

  return {
    success: errors.length === 0,
    trace,
    errors,
    executionTimeMs: Date.now() - startTime,
  };
}
