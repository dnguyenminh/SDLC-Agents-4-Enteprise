/**
 * Semantic analyzer impls — Activity + Data Transform (BR-18 extraction).
 * Standalone functions; PegaSemanticAnalyzer delegates to these.
 */
import type { SemanticAnalysis, SideEffect, SemanticDep, ConditionSummary, DataFlowEntry } from './types.js';
import { extractName } from './analyzer-utils.js';

export function analyzeActivity(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const label = (json.pyLabel as string) || name;
  const steps = Array.isArray(json.steps) ? json.steps : [];
  const stepDescs: string[] = [];
  const sideEffects: SideEffect[] = [];
  const dependencies: SemanticDep[] = [];
  const conditions: ConditionSummary[] = [];
  const dataFlow: DataFlowEntry[] = [];
  const calledActivities: string[] = [];
  const setProperties: string[] = [];

  for (const s of steps) {
    const step = s as Record<string, unknown>;
    const method = (step.pyMethod as string) || '';
    const params = (step.pyMethodParameters as string) || '';
    const stepLabel = (step.pyLabel as string) || '';
    const stepDesc = stepLabel || `${method} ${params}`;

    if (method === 'Call' || method === 'Branch') {
      const dotIdx = params.lastIndexOf('.');
      const calledClass = dotIdx >= 0 ? params.substring(0, dotIdx) : className;
      const calledName = dotIdx >= 0 ? params.substring(dotIdx + 1) : params;
      calledActivities.push(calledName);
      dependencies.push({
        type: 'activity',
        target: calledName,
        targetClass: calledClass,
        context: `Step calls ${calledName}`,
      });
      sideEffects.push({
        type: 'api_call',
        target: `${calledClass}.${calledName}`,
        detail: `Calls activity ${calledName}`,
      });
      stepDescs.push(`calls activity "${calledName}"`);
    } else if (method === 'Property-Set' || method === 'Property-Copy') {
      const target = params.replace(/^\./, '');
      if (target) {
        setProperties.push(target);
        sideEffects.push({
          type: 'page_update',
          target,
          detail: `Sets property ${target}`,
        });
        dataFlow.push({
          input: '',
          transform: `${method} -> ${target}`,
          output: target,
        });
        stepDescs.push(`sets property "${target}"`);
      }
    } else if (method === 'Obj-Save' || method === 'Save') {
      sideEffects.push({
        type: 'db_write',
        target: className || params,
        detail: `Saves object to database`,
      });
      stepDescs.push(`saves "${params}" to database`);
    } else if (method === 'Obj-Delete') {
      sideEffects.push({
        type: 'db_write',
        target: params,
        detail: `Deletes object from database`,
      });
      stepDescs.push(`deletes "${params}" from database`);
    } else if (method === 'Page-New') {
      sideEffects.push({
        type: 'page_update',
        target: params,
        detail: `Creates new page "${params}"`,
      });
      stepDescs.push(`creates new page "${params}"`);
    } else {
      stepDescs.push(stepDesc || `step ${steps.indexOf(s) + 1}`);
    }

    const when = step.pyWhenCondition as string;
    if (when) {
      conditions.push({
        field: when,
        operator: 'WHEN',
        value: true,
        description: `Guarded by when condition "${when}"`,
      });
    }
  }

  const summary = `This activity "${label}" ${steps.length === 0 ? 'has 0 step(s)' : `executes ${steps.length} step(s): ${stepDescs.join('; ')}`}.`;
  const intentParts: string[] = [];
  if (calledActivities.length > 0) intentParts.push(`calls ${calledActivities.length} sub-activity(ies)`);
  if (setProperties.length > 0) intentParts.push(`sets ${setProperties.length} property(ies)`);
  const intent = intentParts.length > 0 ? intentParts.join(' and ') : 'performs configured operations';

  return {
    ruleType: 'Rule-Obj-Activity',
    name,
    className,
    summary,
    intent,
    sideEffects,
    dependencies,
    conditions,
    dataFlow,
    steps: steps.length,
    calledActivities,
    setProperties,
  };
}

export function analyzeDataTransform(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const label = (json.pyLabel as string) || name;
  const actions = Array.isArray(json.pyActions) ? json.pyActions : [];
  const mappings: { from: string; to: string; condition?: string }[] = [];
  const dependencies: SemanticDep[] = [];
  const conditions: ConditionSummary[] = [];
  const sideEffects: SideEffect[] = [];
  const dataFlow: DataFlowEntry[] = [];

  for (const a of actions) {
    const act = a as Record<string, unknown>;
    const actionType = (act.pyActionType as string) || '';
    const target = (act.pyTarget as string) || '';
    const source = (act.pySource as string) || '';

    if (actionType === 'Set' && target && source) {
      const from = source.replace(/^\./, '');
      const to = target.replace(/^\./, '');
      mappings.push({ from, to });
      dataFlow.push({ input: from, transform: `Set ${from} -> ${to}`, output: to });
    }

    if ((actionType === 'Apply Data Transform' || actionType === 'Page-New-Transform') && target) {
      dependencies.push({
        type: 'data_transform',
        target,
        targetClass: className,
        context: `Applies data transform "${target}"`,
      });
      sideEffects.push({
        type: 'page_update',
        target: target,
        detail: `Applies data transform "${target}"`,
      });
    }

    const when = act.pyWhenCondition as string;
    if (when) {
      conditions.push({
        field: when,
        operator: 'WHEN',
        value: true,
        description: `Conditionally applied when "${when}"`,
      });
    }
  }

  const mappingDesc = mappings.map(m => `maps "${m.from}" to "${m.to}"`).join('; ');
  const summary = mappingDesc
    ? `This data transform "${label}" applies ${actions.length} action(s): ${mappingDesc}.`
    : `This data transform "${label}" applies ${actions.length} action(s).`;

  return {
    ruleType: 'Rule-Obj-Model',
    name,
    className,
    summary,
    intent: `Transform data by applying ${actions.length} action(s)`,
    sideEffects,
    dependencies,
    conditions,
    dataFlow,
    propertyMappings: mappings,
  };
}
