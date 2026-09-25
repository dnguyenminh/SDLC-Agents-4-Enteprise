/**
 * PegaWhenEvaluator — Evaluates a Pega When condition to a boolean pass/fail.
 *
 * Parsing/evaluation is delegated to PegaExpressionEvaluator (POC ANTLR parser +
 * ExprNodeEvaluator). The only When-specific concern here is that Pega When conditions may
 * use the textual logical operators `.AND.` / `.OR.` instead of `&&` / `||`. The grammar
 * only understands `&&`/`||`, so we normalize those two tokens BEFORE parsing.
 *
 * This normalization is intentionally minimal and lossless: it replaces only the two
 * documented Pega logical-operator tokens with their grammar equivalents. It does NOT guess
 * missing leading dots or auto-quote operands (the previous heuristic did, which produced
 * incorrect expressions for inputs outside the sampled data). If a condition is malformed,
 * the parser degrades to an ErrorExpr and evaluation reports a clear failure.
 */

import { PegaClipboardContext } from './PegaClipboardContext.js';
import { PegaExpressionEvaluator } from './PegaExpressionEvaluator.js';

/** Result of a When evaluation: whether it passed, plus a human-readable trace. */
export interface WhenConditionResult {
  passed: boolean;
  trace: string[];
}

/**
 * Replace Pega textual logical operators with grammar operators.
 * `.AND.` -> `&&`, `.OR.` -> `||` (case-insensitive, word-boundary via the dots).
 * @param expr Raw When condition text
 * @returns Expression using `&&`/`||`
 */
function normalizeLogicalOperators(expr: string): string {
  return expr
    .replace(/\.AND\./gi, ' && ')
    .replace(/\.OR\./gi, ' || ');
}

export class PegaWhenEvaluator {
  private readonly evaluator = new PegaExpressionEvaluator();

  /**
   * Evaluate a When condition expression.
   * @param whenExpression When condition text (may use `.AND.`/`.OR.`)
   * @param clipboard Clipboard context for property resolution
   * @returns Pass/fail plus trace
   */
  evaluateWhen(
    whenExpression: string,
    clipboard: PegaClipboardContext,
  ): WhenConditionResult {
    const expression = normalizeLogicalOperators(whenExpression);
    const trace: string[] = [`Evaluating When: ${whenExpression}`];

    try {
      const result = this.evaluator.evaluate(expression, clipboard, true);
      const passed = result.value.boolean;
      trace.push(...result.trace, `-> ${passed ? 'PASS' : 'FAIL'}`);
      return { passed, trace };
    } catch (err) {
      trace.push(`-> ERROR: ${(err as Error).message}`);
      return { passed: false, trace };
    }
  }
}
