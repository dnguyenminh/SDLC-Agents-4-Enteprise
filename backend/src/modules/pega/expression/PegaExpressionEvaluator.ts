/**
 * PegaExpressionEvaluator — Evaluates a Pega expression string to a runtime PegValue.
 *
 * Parsing is delegated to the module's ANTLR parser (ExpressionParser — grammar
 * grammar/PegaExpr.g4, the single source of truth that carries the Pega keyword tokens
 * .AND./.OR./.NOT./.ISNULL); the resulting ExprNode is evaluated by ExprNodeEvaluator.
 * This replaces the previous hand-written parser + self-evaluating OOP nodes, giving a
 * single source of truth for parsing (the ANTLR grammar) and evaluation
 * (ExprNodeEvaluator). The legacy pega-expr/generated parser predates the keyword tokens
 * and must not be used for evaluation.
 *
 * Public API is unchanged so existing callers (When/Constraint evaluators, sandbox) keep
 * working: `evaluate(string)` and `evaluateWithAst(ExprNode)` both return an EvaluationResult.
 */

import { ExpressionParser } from './ExpressionParser.js';
import type { ExprNode } from './pega-expr/nodes.js';
import { PegaClipboardContext } from './PegaClipboardContext.js';
import { PegValue } from './PegaExpressionAst.js';
import { ExprNodeEvaluator } from './ExprNodeEvaluator.js';

/** Result of evaluating an expression: the value plus an optional human-readable trace. */
export interface EvaluationResult {
  value: PegValue;
  trace: string[];
}

export class PegaExpressionEvaluator {
  private readonly evaluator = new ExprNodeEvaluator();

  /**
   * Parse and evaluate an expression string.
   * @param expression Raw Pega expression text
   * @param clipboard Clipboard context for property resolution
   * @param collectTrace When true, records a one-line trace of the result
   * @returns Evaluation result (value + trace)
   */
  evaluate(
    expression: string,
    clipboard: PegaClipboardContext,
    collectTrace: boolean = false,
  ): EvaluationResult {
    const ast = ExpressionParser.parseExpression(expression);
    return this.evaluateWithAst(ast, clipboard, collectTrace);
  }

  /**
   * Evaluate an already-parsed expression AST.
   * @param ast Expression AST node (from POC parseExpression)
   * @param clipboard Clipboard context for property resolution
   * @param collectTrace When true, records a one-line trace of the result
   * @returns Evaluation result (value + trace)
   */
  evaluateWithAst(
    ast: ExprNode,
    clipboard: PegaClipboardContext,
    collectTrace: boolean = false,
  ): EvaluationResult {
    const value = this.evaluator.eval(ast, clipboard);
    const trace: string[] = [];
    if (collectTrace) {
      trace.push(`[${ast.kind}] -> ${value.text} (${value.type})`);
    }
    return { value, trace };
  }
}
