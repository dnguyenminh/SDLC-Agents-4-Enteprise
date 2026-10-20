/**
 * Semantic analyzer impls — Declare + Generic (BR-18 extraction).
 * Standalone functions; PegaSemanticAnalyzer delegates to these.
 */
import type { PegaClassDefinition } from '../metamodel/PegaClassDefinition.js';
import type { SemanticAnalysis, SideEffect, SemanticDep, ConditionSummary, DataFlowEntry } from './types.js';
import { extractName, extractPropertyRefs } from './analyzer-utils.js';

export function analyzeDeclare(json: Record<string, unknown>): SemanticAnalysis {
  const name = extractName(json);
  const className = (json.pyClassName as string) || '';
  const pxObjClass = (json.pxObjClass as string) || 'Rule-Declare-Expressions';
  const label = (json.pyLabel as string) || name;
  const targetProp = (json.pyTargetProperty as string) || (json.pyPropertyName as string) || '';
  const expression = (json.pyExpression as string) || '';
  const dependencies: SemanticDep[] = [];
  const dataFlow: DataFlowEntry[] = [];
  const conditions: ConditionSummary[] = [];
  const sideEffects: SideEffect[] = [];

  if (expression) {
    const inputs = extractPropertyRefs(expression);
    for (const input of inputs) {
      dataFlow.push({ input, transform: expression, output: targetProp || name });
    }
    dataFlow.push({ input: inputs.join(', ') || 'unknown', transform: expression, output: targetProp || name });
  }

  const when = json.pyWhenCondition as string;
  if (when) {
    conditions.push({
      field: when,
      operator: 'WHEN',
      value: true,
      description: `Applies when "${when}"`,
    });
  }

  const summary = targetProp && expression
    ? `This ${pxObjClass} "${label}" recalculates "${targetProp}" when dependencies change using expression: "${expression}".`
    : `This ${pxObjClass} "${label}" defines a declarative rule.`;

  return {
    ruleType: pxObjClass,
    name,
    className,
    summary,
    intent: targetProp ? `Recalculate ${targetProp} from ${expression || 'expression'}` : `Define declarative rule`,
    sideEffects,
    dependencies,
    conditions,
    dataFlow,
    targetProperty: targetProp,
    expression,
  };
}

export function analyzeGeneric(json: Record<string, unknown>, classDef: PegaClassDefinition): SemanticAnalysis {
  const name = extractName(json);
  const pxObjClass = classDef.pxObjClass || (json.pxObjClass as string) || 'Unknown';
  const description = classDef.description || '';
  const props: string[] = Object.keys(json).filter(k => k.startsWith('py') || k.startsWith('px'));
  const sideEffects: SideEffect[] = [];
  const dependencies: SemanticDep[] = [];
  const dataFlow: DataFlowEntry[] = [];

  for (const prop of classDef.properties) {
    if (prop.isReference && json[prop.name]) {
      dependencies.push({
        type: 'reference',
        target: String(json[prop.name]),
        targetClass: '',
        context: `References "${String(json[prop.name])}" via ${prop.name}`,
      });
    }
  }

  const summary = description
    ? `This ${pxObjClass} "${name}": ${description}. Has ${props.length} relevant propert(ies).`
    : `This ${pxObjClass} "${name}" has ${props.length} relevant propert(ies).`;

  return {
    ruleType: pxObjClass,
    name,
    summary,
    intent: `Configure a ${pxObjClass} with ${props.length} propert(ies)`,
    sideEffects,
    dependencies,
    conditions: [],
    dataFlow,
  };
}
