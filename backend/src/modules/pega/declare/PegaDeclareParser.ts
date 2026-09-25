/**
 * PegaDeclareParser — Strategy parser for all Rule-Declare-* rule types.
 * Integrates with the expression engine (WP1) for Declare Expression.
 *
 * Handles:
 *   - Rule-Declare-Expressions  → PegaDeclareExpression
 *   - Rule-Declare-OnChange     → PegaDeclareOnChange
 *   - Rule-Declare-Trigger      → PegaDeclareTrigger
 *   - Rule-Declare-Pages        → PegaDeclarePages
 *   - Rule-Declare-Constraints  → PegaDeclareConstraint
 *   - Rule-Declare-Index        → PegaDeclareIndex
 *   - Rule-Declare-DecisionTable → PegaDeclareDecisionTable
 *   - Rule-Declare-DecisionTree → PegaDeclareDecisionTree
 */

import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { UnresolvedDependency } from '../models.js';
import { parseExpression } from '../expression/pega-expr/parser.js';
import type {
  PegaDeclareExpression,
  PegaDeclareOnChange,
  PegaDeclareTrigger,
  PegaDeclarePages,
  PegaDeclareConstraint,
  PegaDeclareIndex,
  PegaDeclareDecisionTable,
  PegaDeclareDecisionTree,
  DeclareOnChangeAction,
  DeclarePageDefinition,
  DeclareDecisionRow,
} from './PegaDeclareTypes.js';

/**
 * Set of pxObjClass values handled by this strategy.
 * DecisionTable and DecisionTree are included even though they also
 * work via the original buildDecision path — this strategy provides
 * richer typed output.
 */
const DECLARE_RULE_CLASSES = new Set([
  'Rule-Declare-Expressions',
  'Rule-Declare-OnChange',
  'Rule-Declare-Trigger',
  'Rule-Declare-Pages',
  'Rule-Declare-Constraints',
  'Rule-Declare-Index',
  'Rule-Declare-DecisionTable',
  'Rule-Declare-DecisionTree',
]);

export class PegaDeclareParser implements IPegaRuleParserStrategy {
  public supports(pxObjClass: string): boolean {
    return DECLARE_RULE_CLASSES.has(pxObjClass);
  }

  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || '';
    const className = (json.pyClassName as string) || '@baseclass';
    const name = (json.pyRuleName as string) || (json.pyLabel as string) || 'UnnamedDeclare';
    const fqn = `${pxObjClass}:${className}:${name}`;

    const dependencies: UnresolvedDependency[] = [];

    // Build a logic summary for the symbol
    let logicSummary: string;

    switch (pxObjClass) {
      case 'Rule-Declare-Expressions': {
        const parsed = this.parseDeclareExpression(json);
        logicSummary = `Declare Expression: .${parsed.targetProperty} = ${parsed.expression}`;
        break;
      }
      case 'Rule-Declare-OnChange': {
        const parsed = this.parseDeclareOnChange(json);
        logicSummary = `Declare OnChange: .${parsed.targetProperty} → ${parsed.actions.length} action(s)`;
        for (const action of parsed.actions) {
          if (action.type !== 'setValue') {
            dependencies.push({ ruleType: this.actionRuleType(action.type), className, ruleName: action.target });
          }
        }
        if (parsed.whenCondition) {
          dependencies.push({ ruleType: 'Rule-Obj-When', className, ruleName: parsed.whenCondition });
        }
        break;
      }
      case 'Rule-Declare-Trigger': {
        const parsed = this.parseDeclareTrigger(json);
        logicSummary = `Declare Trigger: ${parsed.triggerType}-${parsed.operation} on ${parsed.targetClass}`;
        dependencies.push({ ruleType: parsed.actionType === 'Activity' ? 'Rule-Obj-Activity' : 'Rule-Obj-Model', className, ruleName: parsed.action });
        if (parsed.whenCondition) {
          dependencies.push({ ruleType: 'Rule-Obj-When', className, ruleName: parsed.whenCondition });
        }
        break;
      }
      case 'Rule-Declare-Pages': {
        const parsed = this.parseDeclarePages(json);
        logicSummary = `Declare Pages: ${parsed.pages.length} page(s)`;
        break;
      }
      case 'Rule-Declare-Constraints': {
        const parsed = this.parseDeclareConstraint(json);
        logicSummary = `Declare Constraint: .${parsed.property} ${parsed.constraintType}=${parsed.constraintValue}`;
        break;
      }
      case 'Rule-Declare-Index': {
        const parsed = this.parseDeclareIndex(json);
        logicSummary = `Declare Index: .${parsed.property}${parsed.indexType ? ' (' + parsed.indexType + ')' : ''}`;
        break;
      }
      case 'Rule-Declare-DecisionTable': {
        const parsed = this.parseDeclareDecisionTable(json);
        logicSummary = `Declare DecisionTable: ${parsed.rows.length} row(s)`;
        break;
      }
      case 'Rule-Declare-DecisionTree': {
        const parsed = this.parseDeclareDecisionTree(json);
        logicSummary = `Declare DecisionTree: ${parsed.rows.length} row(s)`;
        break;
      }
      default:
        logicSummary = `Declare (${pxObjClass})`;
    }

    const symbol = {
      fqn,
      name,
      className,
      ruleType: pxObjClass,
      isRule: true,
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
      logicSummary,
    };

    return { symbol, dependencies };
  }

  /**
   * Parse a Declare Expression rule.
   * Uses the embedded POC ANTLR parser to build an AST from the expression string.
   */
  public parseDeclareExpression(json: Record<string, unknown>): PegaDeclareExpression {
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

  /**
   * Parse a Declare OnChange rule.
   */
  public parseDeclareOnChange(json: Record<string, unknown>): PegaDeclareOnChange {
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

  /**
   * Parse a Declare Trigger rule.
   */
  public parseDeclareTrigger(json: Record<string, unknown>): PegaDeclareTrigger {
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

  /**
   * Parse a Declare Pages rule.
   */
  public parseDeclarePages(json: Record<string, unknown>): PegaDeclarePages {
    const pages: DeclarePageDefinition[] = [];
    const rawPages = Array.isArray(json.pyPages) ? json.pyPages : [];

    for (const raw of rawPages) {
      if (typeof raw !== 'object' || !raw) continue;
      const pg = raw as Record<string, unknown>;
      const name = (pg.pyPageName as string) || '';
      const sourceStr = (pg.pySource as string) || (pg.pyPageSource as string) || 'clipboard';
      const sourceRef = (pg.pySourceClass as string) || (pg.pyRuleName as string) || '';

      let source: DeclarePageDefinition['source'];
      if (sourceStr.includes('DataPage') || sourceStr.includes('dataPage')) source = 'dataPage';
      else if (sourceStr.includes('Transform') || sourceStr.includes('DataTransform')) source = 'dataTransform';
      else if (sourceStr.includes('class') || sourceStr.includes('Class')) source = 'class';
      else source = 'clipboard';

      const scopeStr = (pg.pyScope as string) || '';
      let scope: DeclarePageDefinition['scope'] | undefined;
      if (scopeStr === 'requestor' || scopeStr === 'thread' || scopeStr === 'node') {
        scope = scopeStr;
      }

      const parameters: Record<string, string> = {};
      if (pg.pyParameters && typeof pg.pyParameters === 'object') {
        for (const [k, v] of Object.entries(pg.pyParameters as Record<string, unknown>)) {
          parameters[k] = String(v);
        }
      }

      pages.push({
        name,
        source,
        sourceRef,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        scope,
      });
    }

    return {
      pxObjClass: 'Rule-Declare-Pages',
      pyName: (json.pyRuleName as string) || '',
      pyLabel: (json.pyLabel as string) || undefined,
      declareType: 'Declare-Pages',
      pages,
    };
  }

  /**
   * Parse a Declare Constraint rule.
   */
  public parseDeclareConstraint(json: Record<string, unknown>): PegaDeclareConstraint {
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

  /**
   * Parse a Declare Index rule.
   */
  public parseDeclareIndex(json: Record<string, unknown>): PegaDeclareIndex {
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

  /**
   * Parse a Declare DecisionTable rule.
   */
  public parseDeclareDecisionTable(json: Record<string, unknown>): PegaDeclareDecisionTable {
    const propertyEvaluated = (json.pyPropertyEvaluated as string) || undefined;
    const rows: DeclareDecisionRow[] = [];
    const rawRows = Array.isArray(json.pyDecisionTableRows) ? json.pyDecisionTableRows : [];

    for (const raw of rawRows) {
      if (typeof raw !== 'object' || !raw) continue;
      const row = raw as Record<string, unknown>;
      rows.push({
        condition: (row.pyCondition as string) || '',
        result: (row.pyResult as string) || '',
      });
    }

    return {
      pxObjClass: 'Rule-Declare-DecisionTable',
      pyName: (json.pyRuleName as string) || '',
      pyLabel: (json.pyLabel as string) || undefined,
      declareType: 'Declare-DecisionTable',
      propertyEvaluated,
      rows,
    };
  }

  /**
   * Parse a Declare DecisionTree rule.
   */
  public parseDeclareDecisionTree(json: Record<string, unknown>): PegaDeclareDecisionTree {
    const propertyEvaluated = (json.pyPropertyEvaluated as string) || undefined;
    const rows: DeclareDecisionRow[] = [];
    const rawRows = Array.isArray(json.pyDecisionTableRows) ? json.pyDecisionTableRows : [];

    for (const raw of rawRows) {
      if (typeof raw !== 'object' || !raw) continue;
      const row = raw as Record<string, unknown>;
      rows.push({
        condition: (row.pyCondition as string) || '',
        result: (row.pyResult as string) || '',
      });
    }

    return {
      pxObjClass: 'Rule-Declare-DecisionTree',
      pyName: (json.pyRuleName as string) || '',
      pyLabel: (json.pyLabel as string) || undefined,
      declareType: 'Declare-DecisionTree',
      propertyEvaluated,
      rows,
    };
  }

  /** Map DeclareOnChange action type to rule type for dependency tracking */
  private actionRuleType(type: DeclareOnChangeAction['type']): string {
    switch (type) {
      case 'runActivity': return 'Rule-Obj-Activity';
      case 'runDataTransform': return 'Rule-Obj-Model';
      case 'runReport': return 'Rule-Obj-Report';
      default: return 'Rule-Obj-Activity';
    }
  }
}