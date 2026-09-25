import { ExpressionParser } from './ExpressionParser.js';
import { ExprNodeEvaluator } from './ExprNodeEvaluator.js';
import { PegaClipboardContext } from './PegaClipboardContext.js';
import { PegValue } from './PegaExpressionAst.js';
import type { ExprNode } from './expressionTypes.js';

export interface EvaluationResult {
  value: PegValue;
  trace: string[];
}

/**
 * Facade over the ANTLR expression pipeline: parse to an ExprNode tree, then
 * evaluate it with the stateless ExprNodeEvaluator. Parsing never throws —
 * syntax failures surface as a PARSE_ERROR PegExpressionError at evaluation time.
 */
export class PegaExpressionEvaluator {
  private nodeEvaluator = new ExprNodeEvaluator();

  evaluate(
    expression: string,
    clipboard: PegaClipboardContext,
    collectTrace: boolean = false,
  ): EvaluationResult {
    return this.evaluateWithAst(ExpressionParser.parseExpression(expression), clipboard, collectTrace);
  }

  evaluateWithAst(
    ast: ExprNode,
    clipboard: PegaClipboardContext,
    collectTrace: boolean = false,
  ): EvaluationResult {
    const value = this.nodeEvaluator.eval(ast, clipboard);
    const trace = collectTrace ? [`[${ast.kind}] -> ${value.text} (${value.type})`] : [];
    return { value, trace };
  }
}
