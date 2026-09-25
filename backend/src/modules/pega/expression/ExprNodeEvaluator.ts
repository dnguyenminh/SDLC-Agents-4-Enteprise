/** Stateless evaluator for ExprNode trees produced by the ANTLR expression parser. */
import type {
  BinaryOpNode,
  ConstantNode,
  ExprNode,
  FunctionCallNode,
  TernaryNode,
  UnaryOpNode,
} from './expressionTypes.js';
import { PegaBuiltinFunctions, PegExpressionError, PegValue } from './PegaExpressionAst.js';
import type { PegaClipboardContext } from './PegaClipboardContext.js';
import { canonicalFunctionName } from './ExprFunctionName.js';
import { referenceToParts } from './ExprReferenceResolver.js';
import { applyBinaryOp, applyUnaryOp } from './ExprOperators.js';

const MAX_DEPTH = 100;

export class ExprNodeEvaluator {
  eval(node: ExprNode, context: PegaClipboardContext, depth = 0): PegValue {
    if (depth > MAX_DEPTH) {
      throw new PegExpressionError(`Expression exceeds max depth of ${MAX_DEPTH}`, 'MAX_DEPTH_EXCEEDED');
    }
    switch (node.kind) {
      case 'Constant': return this.evalConstant(node);
      case 'Reference': return context.resolve(referenceToParts(node));
      case 'BinaryOp': return this.evalBinary(node, context, depth);
      case 'UnaryOp': return this.evalUnary(node, context, depth);
      case 'Ternary': return this.evalTernary(node, context, depth);
      case 'FunctionCall': return this.evalFunction(node, context, depth);
      case 'Placeholder': return this.evalPlaceholder(node);
      case 'ErrorExpr': return this.evalError(node);
    }
  }

  private evalConstant(node: ConstantNode): PegValue {
    if (node.type === 'INTEGER' || node.type === 'LONG' ||
        node.type === 'DOUBLE' || node.type === 'FLOAT') {
      return PegValue.number(Number(node.value));
    }
    if (node.type === 'TRUE') return PegValue.bool(true);
    if (node.type === 'FALSE') return PegValue.bool(false);
    return PegValue.text(String(node.value));
  }

  private evalBinary(node: BinaryOpNode, ctx: PegaClipboardContext, depth: number): PegValue {
    if (node.op === '&&' || node.op === '||') return this.evalLogical(node, ctx, depth);
    const left = this.eval(node.left, ctx, depth + 1);
    const right = this.eval(node.right, ctx, depth + 1);
    return applyBinaryOp(node.op, left, right);
  }

  private evalLogical(node: BinaryOpNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const left = this.eval(node.left, ctx, depth + 1);
    if (node.op === '&&' && !left.boolean) return PegValue.bool(false);
    if (node.op === '||' && left.boolean) return PegValue.bool(true);
    return applyBinaryOp(node.op, left, this.eval(node.right, ctx, depth + 1));
  }

  private evalUnary(node: UnaryOpNode, ctx: PegaClipboardContext, depth: number): PegValue {
    return applyUnaryOp(node.op, this.eval(node.operand, ctx, depth + 1));
  }

  private evalTernary(node: TernaryNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const condition = this.eval(node.cond, ctx, depth + 1);
    const branch = condition.boolean ? node.whenTrue : node.whenFalse;
    return this.eval(branch, ctx, depth + 1);
  }

  private evalFunction(node: FunctionCallNode, ctx: PegaClipboardContext, depth: number): PegValue {
    const args = node.args.map((argument) => this.eval(argument, ctx, depth + 1));
    return PegaBuiltinFunctions.call(canonicalFunctionName(node), args);
  }

  private evalPlaceholder(node: Extract<ExprNode, { kind: 'Placeholder' }>): PegValue {
    throw new PegExpressionError(`Cannot evaluate template placeholder {${node.name}}`, 'PLACEHOLDER_NOT_EVALUABLE');
  }

  private evalError(node: Extract<ExprNode, { kind: 'ErrorExpr' }>): PegValue {
    throw new PegExpressionError(`Cannot evaluate unparsed expression: ${node.message}`, 'PARSE_ERROR');
  }
}
