/**
 * ExprNodeValidator.ts — Security/safety validation over a POC expression AST (ExprNode).
 *
 * Replaces the old validator that walked the hand-written OOP AST. Parsing is now done by
 * the POC ANTLR parser; this class validates the resulting ExprNode tree BEFORE evaluation:
 *   - every FunctionCall must be on the whitelist (deny-by-default)
 *   - the tree must not exceed the max nesting depth
 *
 * The whitelist is keyed WITH a leading '@' (e.g. '@upper'); the POC stores FunctionCall.name
 * WITHOUT '@', so we rebuild the canonical key ('@name' or '@Lib.name') before lookup — the
 * same normalization ExprNodeEvaluator uses, keeping validate/eval in lock-step.
 */

import type { ExprNode, FunctionCallNode } from './pega-expr/nodes.js';
import { PegaFunctionWhitelist } from '../security/PegaFunctionWhitelist.js';

/** Validation outcome with a structured error list (never throws). */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** A single validation failure. */
export interface ValidationError {
  code: string;
  message: string;
}

/** Max nesting depth allowed in an expression tree. */
const MAX_DEPTH = 100;

/** Rebuild the canonical whitelist key for a function-call node. */
function whitelistKey(node: FunctionCallNode): string {
  return node.library ? `@${node.library}.${node.name}` : `@${node.name}`;
}

/**
 * Validates POC expression ASTs against the function whitelist and depth limit.
 */
export class ExprNodeValidator {
  private readonly whitelist = new PegaFunctionWhitelist();

  /**
   * Validate an expression AST node.
   * @param root Expression AST node (from POC parseExpression)
   * @returns Validation result; `valid` is false when any error is present
   */
  validate(root: ExprNode): ValidationResult {
    const errors: ValidationError[] = [];
    this.walk(root, 0, errors);
    return { valid: errors.length === 0, errors };
  }

  /** Depth-first walk collecting whitelist and depth violations. */
  private walk(node: ExprNode, depth: number, errors: ValidationError[]): void {
    if (depth > MAX_DEPTH) {
      errors.push({ code: 'MAX_DEPTH_EXCEEDED', message: `Expression exceeds max depth of ${MAX_DEPTH}` });
      return;
    }
    switch (node.kind) {
      case 'FunctionCall': return this.walkFunction(node, depth, errors);
      case 'BinaryOp':
        this.walk(node.left, depth + 1, errors);
        this.walk(node.right, depth + 1, errors);
        return;
      case 'UnaryOp':
        this.walk(node.operand, depth + 1, errors);
        return;
      case 'Ternary':
        this.walk(node.cond, depth + 1, errors);
        this.walk(node.whenTrue, depth + 1, errors);
        this.walk(node.whenFalse, depth + 1, errors);
        return;
      default:
        // Reference / Constant / Placeholder / ErrorExpr — no sub-expressions to validate.
        return;
    }
  }

  /** Validate a function call node against the whitelist, then recurse into its args. */
  private walkFunction(node: FunctionCallNode, depth: number, errors: ValidationError[]): void {
    const key = whitelistKey(node);
    if (!this.whitelist.isAllowed(key)) {
      errors.push({ code: 'FUNCTION_NOT_ALLOWED', message: `Function '${key}' is not in whitelist` });
    }
    for (const arg of node.args) {
      this.walk(arg, depth + 1, errors);
    }
  }
}
