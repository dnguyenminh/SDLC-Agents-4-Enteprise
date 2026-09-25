/**
 * ExprNodeEvaluator.ts — Evaluates a POC expression AST (ExprNode) against a clipboard
 * context, producing a runtime PegValue. This replaces the hand-written OOP nodes that
 * carried their own `.evaluate()`; the single source of truth for PARSING is now the POC
 * ANTLR parser (pega-expr/), and this class is the single source of truth for EVALUATION.
 *
 * Design: a visitor over the ExprNode discriminated union. Kept small (SRP): reference
 * flattening lives in ExprReferenceResolver, builtin dispatch reuses PegaBuiltinFunctions.
 */

import type {
  ExprNode,
  BinaryOpNode,
  UnaryOpNode,
  TernaryNode,
  FunctionCallNode,
  ConstantNode,
} from './pega-expr/nodes.js';
import { PegValue, PegaBuiltinFunctions, PegExpressionError } from './PegaExpressionAst.js';
import type { PegaClipboardContext } from './PegaClipboardContext.js';
import { referenceToParts } from './ExprReferenceResolver.js';
import { applyBinaryOp, applyUnaryOp } from './ExprOperators.js';

/** Max recursion depth to guard against pathological/hostile expressions. */
const MAX_DEPTH = 100;

/**
 * Evaluates POC ExprNode trees to PegValue. Stateless across calls; pass the clipboard
 * context per evaluation.
 */
export class ExprNodeEvaluator {
  /**
   * Evaluate an expression AST node to a runtime value.
   * @param node Expression AST node (from POC parseExpression)
   * @param ctx Clipboard context used to resolve property references
   * @param depth Current recursion depth (internal)
   * @returns Evaluated PegValue
   * @throws PegExpressionError on depth overflow, unresolved refs, or parse-error nodes
   */
  eval(node: ExprNode, ctx: PegaClipboardContext, depth = 0): PegValue {
    if (depth > MAX_DEPTH) {
      throw new PegExpressionError(`Expression exceeds max depth of ${MAX_DEPTH}`, 'MAX_DEPTH_EXCEEDED');
    }
    switch (node.kind) {
      case 'Constant': return this.evalConstant(node);
      case 'Reference': return ctx.resolve(referenceToParts(node));
      case 'BinaryOp': return this.evalBinary(node, ctx, depth);
      case 'UnaryOp': return this.evalUnary(node, ctx, depth);
      case 'Ternary': return this.evalTernary(node, ctx, depth);
      case 'FunctionCall': return this.evalFunction(node, ctx, depth);
      case 'Placeholder':
        throw new PegExpressionError(`Cannot evaluate template placeholder {${node.name}}`, 'PLACEHOLDER_NOT_EVALUABLE');
      case 'ErrorExpr':
        throw new PegExpressionError(`Cannot evaluate unparsed expression: ${node.message}`, 'PARSE_ERROR');
      default: {
        // Exhaustiveness guard — should be unreachable for a valid ExprNode.
        const _never: never = node;
        throw new PegExpressionError(`Unknown node kind: ${JSON.stringify(_never)}`, 'UNKNOWN_NODE');
      }
    }
  }

  /** Convert a typed constant literal into its runtime PegValue. */
  private evalConstant(node: ConstantNode): PegValue {
    switch (node.type) {
      case 'INTEGER': case 'LONG': case 'DOUBLE': case 'FLOAT':
        return PegValue.number(Number(node.value));
      case 'TRUE': return PegValue.bool(true);
      case 'FALSE': return PegValue.bool(false);
      default:
        // QUOTED_STRING / CHAR_LITERAL / UNQUOTED_STRING / ANGLE_BRACKET_IDENTIFIER
        return PegValue.text(String(node.value));
    }
  }

  /** Evaluate both operands then apply the binary operator. */
  private evalBinary(node: BinaryOpNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const left = this.eval(node.left, ctx, depth + 1);
    const right = this.eval(node.right, ctx, depth + 1);
    return applyBinaryOp(node.op, left, right);
  }

  /** Evaluate the operand then apply the unary operator. */
  private evalUnary(node: UnaryOpNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const operand = this.eval(node.operand, ctx, depth + 1);
    return applyUnaryOp(node.op, operand);
  }

  /** Evaluate condition, then only the taken branch (short-circuit). */
  private evalTernary(node: TernaryNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const cond = this.eval(node.cond, ctx, depth + 1);
    return cond.boolean
      ? this.eval(node.whenTrue, ctx, depth + 1)
      : this.eval(node.whenFalse, ctx, depth + 1);
  }

  /**
   * Evaluate a function call by dispatching to the builtin whitelist.
   * POC stores `name` WITHOUT the leading '@'; the whitelist is keyed WITH '@', so we
   * rebuild the canonical '@name' key here (library-qualified calls use '@Lib.name').
   */
  private evalFunction(node: FunctionCallNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const args = node.args.map((a) => this.eval(a, ctx, depth + 1));
    const key = node.library ? `@${node.library}.${node.name}` : `@${node.name}`;
    return PegaBuiltinFunctions.call(key, args);
  }
}
