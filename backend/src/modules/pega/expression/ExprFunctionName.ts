/** Canonical whitelist key for an ExprNode function call. */
import type { FunctionCallNode } from './expressionTypes.js';

export function canonicalFunctionName(node: FunctionCallNode): string {
  if (node.ruleset && node.library) {
    return `@(${node.ruleset}:${node.library}).${node.name}`;
  }
  if (node.library) return `@${node.library}.${node.name}`;
  return `@${node.name}`;
}
