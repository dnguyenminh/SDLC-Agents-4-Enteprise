import { ExpressionParser } from '../expression/ExpressionParser.js';
import { canonicalFunctionName } from '../expression/ExprFunctionName.js';
import type { ExprNode, ReferenceNode } from '../expression/expressionTypes.js';
import { PegaFunctionWhitelist } from './PegaFunctionWhitelist.js';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  message: string;
}

/** Static validation of an expression before it is handed to the sandbox. */
export class PegaExpressionValidator {
  private whitelist = new PegaFunctionWhitelist();
  private maxDepth = 100;
  private maxExpressionLength = 100_000;

  validate(expression: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (!expression || expression.trim().length === 0) {
      errors.push({ code: 'EMPTY_EXPRESSION', message: 'Expression cannot be empty' });
      return { valid: false, errors };
    }

    if (expression.length > this.maxExpressionLength) {
      errors.push({
        code: 'EXPRESSION_TOO_LONG',
        message: `Expression exceeds max length of ${this.maxExpressionLength} characters`,
      });
      return { valid: false, errors };
    }

    const ast = ExpressionParser.parseExpression(expression);
    if (ast.kind === 'ErrorExpr') {
      errors.push({ code: 'PARSE_ERROR', message: ast.message });
      return { valid: false, errors };
    }

    this.validateAstNode(ast, 0, errors);

    return { valid: errors.length === 0, errors };
  }

  private validateAstNode(node: ExprNode, depth: number, errors: ValidationError[]): void {
    if (depth > this.maxDepth) {
      errors.push({
        code: 'MAX_DEPTH_EXCEEDED',
        message: `Expression exceeds max depth of ${this.maxDepth}`,
      });
      return;
    }

    switch (node.kind) {
      case 'FunctionCall': {
        const name = canonicalFunctionName(node);
        if (!this.whitelist.isAllowed(name)) {
          errors.push({ code: 'FUNCTION_NOT_ALLOWED', message: `Function '${name}' is not in whitelist` });
        }
        for (const arg of node.args) this.validateAstNode(arg, depth + 1, errors);
        return;
      }
      case 'BinaryOp':
        this.validateAstNode(node.left, depth + 1, errors);
        this.validateAstNode(node.right, depth + 1, errors);
        return;
      case 'UnaryOp':
        this.validateAstNode(node.operand, depth + 1, errors);
        return;
      case 'Ternary':
        this.validateAstNode(node.cond, depth + 1, errors);
        this.validateAstNode(node.whenTrue, depth + 1, errors);
        this.validateAstNode(node.whenFalse, depth + 1, errors);
        return;
      case 'Reference':
        this.validateReference(node, depth, errors);
        return;
      default:
        return;
    }
  }

  /** Subscripts and keyed data-page params may themselves contain expressions. */
  private validateReference(node: ReferenceNode, depth: number, errors: ValidationError[]): void {
    for (const segment of node.segments) {
      const value = segment.subscript?.value;
      if (!value || typeof value !== 'object') continue;
      const nested = 'kind' in value ? (value as ExprNode) : (value as { expr?: ExprNode }).expr;
      if (nested) this.validateAstNode(nested, depth + 1, errors);
    }
    for (const param of node.pageParams ?? []) {
      this.validateAstNode(param.value, depth + 1, errors);
    }
  }
}
