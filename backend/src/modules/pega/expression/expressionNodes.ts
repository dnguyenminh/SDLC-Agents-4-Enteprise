/**
 * SA4E-233 — expressionNodes.ts
 *
 * Typed AST node factories for the Pega expression language. Ported from the standalone
 * tool's `nodes.js` (factory portion); the type declarations live in expressionTypes.ts
 * and are re-exported here so consumers have a single import surface.
 *
 * Every node is a plain object (JSON-serializable) tagged with `kind`, so the whole AST
 * can be emitted to JSON for review. This shape runs in parallel to the existing
 * hand-written parser (removal is GD2).
 */
import {
  ConstantType,
  type ConstantTypeValue,
  type BinaryOpNode,
  type ConstantNode,
  type ErrorExprNode,
  type ExprNode,
  type FunctionCallNode,
  type PageParam,
  type PlaceholderNode,
  type RefScope,
  type RefSegment as RefSegmentType,
  type ReferenceNode,
  type Subscript as SubscriptNode,
  type SubscriptType,
  type TernaryNode,
  type UnaryOpNode,
} from './expressionTypes.js';

export * from './expressionTypes.js';

/** Create a binary operation node (op e.g. `+`, `==`, `&&`). */
export function BinaryOp(op: string, left: ExprNode, right: ExprNode): BinaryOpNode {
  return { kind: 'BinaryOp', op, left, right };
}

/** Create a unary prefix operation node (op in `- + ! =`). */
export function UnaryOp(op: string, operand: ExprNode): UnaryOpNode {
  return { kind: 'UnaryOp', op, operand };
}

/** Create a ternary conditional node: `cond ? whenTrue : whenFalse`. */
export function Ternary(cond: ExprNode, whenTrue: ExprNode, whenFalse: ExprNode): TernaryNode {
  return { kind: 'Ternary', cond, whenTrue, whenFalse };
}

/**
 * Create a function call node.
 * @param ruleset Ruleset name for `@(RS:Lib).fn`, else null
 * @param library Library name, else null (for `@fn()`)
 * @param name Function name
 * @param args Argument expression nodes
 * @param deprecated True if invoked via a legacy prefix
 */
export function FunctionCall(
  ruleset: string | null,
  library: string | null,
  name: string,
  args: ExprNode[],
  deprecated = false,
): FunctionCallNode {
  return { kind: 'FunctionCall', ruleset, library, name, args, deprecated };
}

/** Create a reference segment (`.name` optionally with a subscript). */
export function RefSegment(name: string, subscript: SubscriptNode | null = null): RefSegmentType {
  return { name, subscript };
}

/**
 * Create a property reference node.
 * @param scope Reference scope
 * @param page Leading page/scope identifier, or null
 * @param segments Ordered reference segments
 * @param pageParams Keyed params for `paramPage` scope
 */
export function Reference(
  scope: RefScope,
  page: string | null,
  segments: RefSegmentType[],
  pageParams?: PageParam[],
): ReferenceNode {
  return pageParams
    ? { kind: 'Reference', scope, page, segments, pageParams }
    : { kind: 'Reference', scope, page, segments };
}

/** Create a subscript on a reference segment. */
export function Subscript(subType: SubscriptType, value: SubscriptNode['value']): SubscriptNode {
  return { subType, value };
}

/** Create a typed constant literal (value already parsed; raw kept for round-trip). */
export function Constant(type: ConstantTypeValue, value: number | string | boolean, raw: string): ConstantNode {
  return { kind: 'Constant', type, value, raw };
}

/** Create a template placeholder node such as `{lValue}` (name without braces). */
export function Placeholder(name: string): PlaceholderNode {
  return { kind: 'Placeholder', name };
}

/** Create an unparseable-expression node preserving the original text verbatim. */
export function ErrorExpr(text: string, message: string): ErrorExprNode {
  return { kind: 'ErrorExpr', text, message };
}
