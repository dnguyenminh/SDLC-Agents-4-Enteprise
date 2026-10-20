/** Declare parser impls — Expression/OnChange/Trigger/Constraint/Index (BR-18). */
import { parseExpression } from '../expression/pega-expr/parser.js';
import type {
  PegaDeclareExpression, PegaDeclareOnChange, PegaDeclareTrigger,
  PegaDeclareConstraint, PegaDeclareIndex, DeclareOnChangeAction,
} from './PegaDeclareTypes.js';

/**
 * Parse a Declare Expression rule.
 * Uses the embedded POC ANTLR parser to build an AST from the expression string.
 */
export function parseDeclareExpressionImpl(json: Record<string, unknown>): PegaDeclareExpression {
  const targetProperty = (json.pyProperty as string) || (json.pxResult as string) || '';
  const expression = (json.pyExpression as string) || '';

  // POC parseExpression never throws; it returns an ErrorExpr node on bad input.
  // Keep the AST only when it parsed cleanly, otherwise leave it undefined.
  let expressionAst = undefined;
  if (expression) {
    const parsed = parseExpression(expression);
    if (parsed.kind !== 'ErrorExpr') expressionAst = parsed;
  }

  return {
    pxObjClass: 'Rule-Declare-Expressions',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-Expression',
    targetProperty,
    expression,
    expressionAst,
  };
}

/** Parse a Declare OnChange rule. */
export function parseDeclareOnChangeImpl(json: Record<string, unknown>): PegaDeclareOnChange {
  const targetProperty = (json.pyProperty as string) || '';
  const whenCondition = (json.pyWhenCondition as string) || undefined;

  const actions: DeclareOnChangeAction[] = [];
  const rawActions = Array.isArray(json.pyActions) ? json.pyActions : [];

  for (const raw of rawActions) {
    if (typeof raw !== 'object' || !raw) continue;
    const act = raw as Record<string, unknown>;
    const actionType = (act.pyActionType as string) || '';
    const target = (act.pyTarget as string) || (act.pyActivityName as string) || (act.pyTransformName as string) || '';

    let type: DeclareOnChangeAction['type'];
    if (actionType.includes('Activity')) type = 'runActivity';
    else if (actionType.includes('Transform')) type = 'runDataTransform';
    else if (actionType.includes('Report')) type = 'runReport';
    else if (actionType.includes('Set')) type = 'setValue';
    else type = 'runActivity';

    const params: Record<string, string> = {};
    if (act.pyParameters && typeof act.pyParameters === 'object') {
      for (const [k, v] of Object.entries(act.pyParameters as Record<string, unknown>)) {
        params[k] = String(v);
      }
    }

    actions.push({ type, target, params: Object.keys(params).length > 0 ? params : undefined });
  }

  return {
    pxObjClass: 'Rule-Declare-OnChange',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-OnChange',
    targetProperty,
    whenCondition,
    actions,
  };
}

/** Parse a Declare Trigger rule. */
export function parseDeclareTriggerImpl(json: Record<string, unknown>): PegaDeclareTrigger {
  const triggerType = ((json.pyTriggerType as string) || 'after') as 'before' | 'after' | 'instead';
  const operation = ((json.pyOperation as string) || 'save') as 'save' | 'delete' | 'open';
  const targetClass = (json.pyClassName as string) || '';
  const whenCondition = (json.pyWhenCondition as string) || undefined;
  const action = (json.pyActivityName as string) || (json.pyTransformName as string) || '';
  const actionTypeStr = (json.pyActionType as string) || 'Activity';
  const actionType = actionTypeStr === 'DataTransform' ? 'DataTransform' : 'Activity';

  return {
    pxObjClass: 'Rule-Declare-Trigger',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-Trigger',
    triggerType,
    operation,
    targetClass,
    whenCondition,
    action,
    actionType,
  };
}

/** Parse a Declare Constraint rule. */
export function parseDeclareConstraintImpl(json: Record<string, unknown>): PegaDeclareConstraint {
  const property = (json.pyProperty as string) || '';
  const constraintTypeStr = (json.pyConstraintType as string) || 'expression';
  const constraintValue = (json.pyConstraintValue as string) || (json.pyConstraintText as string) || '';
  const message = (json.pyMessage as string) || (json.pyConstraintMessage as string) || undefined;

  let constraintType: PegaDeclareConstraint['constraintType'] = 'expression';
  if (constraintTypeStr === 'min' || constraintTypeStr === 'Min') constraintType = 'min';
  else if (constraintTypeStr === 'max' || constraintTypeStr === 'Max') constraintType = 'max';
  else if (constraintTypeStr === 'pattern' || constraintTypeStr === 'Pattern' || constraintTypeStr === 'regex') constraintType = 'pattern';
  else if (constraintTypeStr === 'list' || constraintTypeStr === 'List') constraintType = 'list';

  return {
    pxObjClass: 'Rule-Declare-Constraints',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-Constraints',
    property,
    constraintType,
    constraintValue,
    message: message || undefined,
  };
}

/** Parse a Declare Index rule. */
export function parseDeclareIndexImpl(json: Record<string, unknown>): PegaDeclareIndex {
  const property = (json.pyProperty as string) || '';
  const indexTypeStr = (json.pyIndexType as string) || '';
  let indexType: PegaDeclareIndex['indexType'] | undefined;
  if (indexTypeStr === 'unique' || indexTypeStr === 'Unique') indexType = 'unique';
  else if (indexTypeStr === 'duplicate' || indexTypeStr === 'Duplicate') indexType = 'duplicate';
  else if (indexTypeStr === 'compound' || indexTypeStr === 'Compound') indexType = 'compound';

  const additionalProperties: string[] = [];
  const rawProps = Array.isArray(json.pyAdditionalProperties) ? json.pyAdditionalProperties : [];
  for (const raw of rawProps) {
    if (typeof raw === 'string') additionalProperties.push(raw);
  }

  return {
    pxObjClass: 'Rule-Declare-Index',
    pyName: (json.pyRuleName as string) || '',
    pyLabel: (json.pyLabel as string) || undefined,
    declareType: 'Declare-Index',
    property,
    indexType,
    additionalProperties: additionalProperties.length > 0 ? additionalProperties : undefined,
  };
}
