/**
 * PegaDeclareParser — Strategy parser for all Rule-Declare-* rule types.
 * Integrates with the expression engine (WP1) for Declare Expression.
 * Facade (BR-18): parser impls in declare-parsers.ts / declare-parsers-collections.ts,
 * summary + dependency extraction in declare-summary.ts.
 */

import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { UnresolvedDependency } from '../models.js';
import type {
  PegaDeclareExpression, PegaDeclareOnChange, PegaDeclareTrigger,
  PegaDeclarePages, PegaDeclareConstraint, PegaDeclareIndex,
  PegaDeclareDecisionTable, PegaDeclareDecisionTree,
} from './PegaDeclareTypes.js';
import {
  parseDeclareExpressionImpl, parseDeclareOnChangeImpl, parseDeclareTriggerImpl,
  parseDeclareConstraintImpl, parseDeclareIndexImpl,
} from './declare-parsers.js';
import {
  parseDeclarePagesImpl, parseDeclareDecisionTableImpl, parseDeclareDecisionTreeImpl,
} from './declare-parsers-collections.js';
import { summarizeDeclare } from './declare-summary.js';

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

    // Build a logic summary for the symbol (+ collect dependencies per type)
    const { logicSummary, dependencies } = summarizeDeclare(pxObjClass, className, json);

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

  /** Parse a Declare Expression rule (see declare-parsers.ts). */
  public parseDeclareExpression(json: Record<string, unknown>): PegaDeclareExpression {
    return parseDeclareExpressionImpl(json);
  }

  /** Parse a Declare OnChange rule. */
  public parseDeclareOnChange(json: Record<string, unknown>): PegaDeclareOnChange {
    return parseDeclareOnChangeImpl(json);
  }

  /** Parse a Declare Trigger rule. */
  public parseDeclareTrigger(json: Record<string, unknown>): PegaDeclareTrigger {
    return parseDeclareTriggerImpl(json);
  }

  /** Parse a Declare Pages rule. */
  public parseDeclarePages(json: Record<string, unknown>): PegaDeclarePages {
    return parseDeclarePagesImpl(json);
  }

  /** Parse a Declare Constraint rule. */
  public parseDeclareConstraint(json: Record<string, unknown>): PegaDeclareConstraint {
    return parseDeclareConstraintImpl(json);
  }

  /** Parse a Declare Index rule. */
  public parseDeclareIndex(json: Record<string, unknown>): PegaDeclareIndex {
    return parseDeclareIndexImpl(json);
  }

  /** Parse a Declare DecisionTable rule. */
  public parseDeclareDecisionTable(json: Record<string, unknown>): PegaDeclareDecisionTable {
    return parseDeclareDecisionTableImpl(json);
  }

  /** Parse a Declare DecisionTree rule. */
  public parseDeclareDecisionTree(json: Record<string, unknown>): PegaDeclareDecisionTree {
    return parseDeclareDecisionTreeImpl(json);
  }
}
