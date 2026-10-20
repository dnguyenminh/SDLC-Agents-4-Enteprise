/** Declare rule summary + dependency extraction (BR-18 extraction). */
import type { UnresolvedDependency } from '../models.js';
import type { DeclareOnChangeAction } from './PegaDeclareTypes.js';
import {
  parseDeclareExpressionImpl, parseDeclareOnChangeImpl, parseDeclareTriggerImpl,
  parseDeclareConstraintImpl, parseDeclareIndexImpl,
} from './declare-parsers.js';
import {
  parseDeclarePagesImpl, parseDeclareDecisionTableImpl, parseDeclareDecisionTreeImpl,
} from './declare-parsers-collections.js';

/** Map DeclareOnChange action type to rule type for dependency tracking */
function actionRuleType(type: DeclareOnChangeAction['type']): string {
  switch (type) {
    case 'runActivity': return 'Rule-Obj-Activity';
    case 'runDataTransform': return 'Rule-Obj-Model';
    case 'runReport': return 'Rule-Obj-Report';
    default: return 'Rule-Obj-Activity';
  }
}

export function summarizeDeclare(
  pxObjClass: string,
  className: string,
  json: Record<string, unknown>,
): { logicSummary: string; dependencies: UnresolvedDependency[] } {
  const dependencies: UnresolvedDependency[] = [];
  const logicSummary = buildSummary(pxObjClass, className, json, dependencies);
  return { logicSummary, dependencies };
}

function buildSummary(
  pxObjClass: string,
  className: string,
  json: Record<string, unknown>,
  dependencies: UnresolvedDependency[],
): string {
  switch (pxObjClass) {
    case 'Rule-Declare-Expressions': {
      const parsed = parseDeclareExpressionImpl(json);
      return `Declare Expression: .${parsed.targetProperty} = ${parsed.expression}`;
    }
    case 'Rule-Declare-OnChange': {
      const parsed = parseDeclareOnChangeImpl(json);
      for (const action of parsed.actions) {
        if (action.type !== 'setValue') {
          dependencies.push({ ruleType: actionRuleType(action.type), className, ruleName: action.target });
        }
      }
      if (parsed.whenCondition) {
        dependencies.push({ ruleType: 'Rule-Obj-When', className, ruleName: parsed.whenCondition });
      }
      return `Declare OnChange: .${parsed.targetProperty} → ${parsed.actions.length} action(s)`;
    }
    case 'Rule-Declare-Trigger': {
      const parsed = parseDeclareTriggerImpl(json);
      dependencies.push({ ruleType: parsed.actionType === 'Activity' ? 'Rule-Obj-Activity' : 'Rule-Obj-Model', className, ruleName: parsed.action });
      if (parsed.whenCondition) {
        dependencies.push({ ruleType: 'Rule-Obj-When', className, ruleName: parsed.whenCondition });
      }
      return `Declare Trigger: ${parsed.triggerType}-${parsed.operation} on ${parsed.targetClass}`;
    }
    case 'Rule-Declare-Pages': {
      const parsed = parseDeclarePagesImpl(json);
      return `Declare Pages: ${parsed.pages.length} page(s)`;
    }
    case 'Rule-Declare-Constraints': {
      const parsed = parseDeclareConstraintImpl(json);
      return `Declare Constraint: .${parsed.property} ${parsed.constraintType}=${parsed.constraintValue}`;
    }
    case 'Rule-Declare-Index': {
      const parsed = parseDeclareIndexImpl(json);
      return `Declare Index: .${parsed.property}${parsed.indexType ? ' (' + parsed.indexType + ')' : ''}`;
    }
    case 'Rule-Declare-DecisionTable': {
      const parsed = parseDeclareDecisionTableImpl(json);
      return `Declare DecisionTable: ${parsed.rows.length} row(s)`;
    }
    case 'Rule-Declare-DecisionTree': {
      const parsed = parseDeclareDecisionTreeImpl(json);
      return `Declare DecisionTree: ${parsed.rows.length} row(s)`;
    }
    default:
      return `Declare (${pxObjClass})`;
  }
}
