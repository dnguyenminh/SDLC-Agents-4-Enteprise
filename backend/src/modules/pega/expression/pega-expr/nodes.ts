/**
 * ast/expr/nodes.ts — Typed AST node factories for the Pega expression language.
 *
 * Node kinds mirror Pega's engine parse-tree semantic nodes (PR*NodeInfo) reconstructed
 * from the ANTLR4 grammar Prpc71Expr.g4:
 *   - BinaryOp   (PRExpressionNodeInfo + PROperatorNodeInfo)
 *   - UnaryOp
 *   - Ternary
 *   - FunctionCall (PRFunctionNodeInfo): @(ruleset:library).name(args) etc.
 *   - Reference    (PRReferenceNodeInfo): scope + segments, each segment may have a subscript
 *   - Constant     (PRConstantNodeInfo): typed literal (ConstantType)
 *   - ErrorExpr    (PRErrorNodeInfo): unparseable text preserved verbatim
 *
 * Every node has a `kind` tag and is a plain object (JSON-serializable) so the whole
 * AST can be emitted to JSON for review.
 */

/** Literal type tags (matches engine IPRNodeInfo.ConstantType). */
export type ConstantTypeName =
  | "INTEGER"
  | "LONG"
  | "DOUBLE"
  | "FLOAT"
  | "CHAR_LITERAL"
  | "QUOTED_STRING"
  | "UNQUOTED_STRING"
  | "ANGLE_BRACKET_IDENTIFIER"
  | "TRUE"
  | "FALSE";

/** Reference scope kinds. */
export type ReferenceScope = "relative" | "page" | "bare" | "current" | "paramPage";

/** Subscript kinds on a reference segment. */
export type SubscriptType = "index" | "key" | "expr" | "symbolic" | "append";

export interface BinaryOpNode {
  kind: "BinaryOp";
  op: string;
  left: ExprNode;
  right: ExprNode;
}

export interface UnaryOpNode {
  kind: "UnaryOp";
  op: string;
  operand: ExprNode;
}

export interface TernaryNode {
  kind: "Ternary";
  cond: ExprNode;
  whenTrue: ExprNode;
  whenFalse: ExprNode;
}

export interface FunctionCallNode {
  kind: "FunctionCall";
  /** Ruleset for `@(RS:Lib).fn(...)`, else null. */
  ruleset: string | null;
  /** Library for `@Lib.fn(...)`, else null. */
  library: string | null;
  name: string;
  args: ExprNode[];
  /** True when invoked via the legacy `@@` prefix. */
  deprecated: boolean;
}

export interface SubscriptNode {
  subType: SubscriptType;
  value: unknown;
}

export interface RefSegmentNode {
  name: string;
  subscript: SubscriptNode | null;
}

export interface KeyedPageParam {
  key: string;
  value: ExprNode;
}

export interface ReferenceNode {
  kind: "Reference";
  scope: ReferenceScope;
  page: string | null;
  segments: RefSegmentNode[];
  /** Present only for scope === "paramPage". */
  pageParams?: KeyedPageParam[];
}

export interface ConstantNode {
  kind: "Constant";
  type: ConstantTypeName;
  value: unknown;
  raw: string;
}

export interface PlaceholderNode {
  kind: "Placeholder";
  name: string;
}

export interface ErrorExprNode {
  kind: "ErrorExpr";
  text: string;
  message: string;
}

/** Any expression AST node. */
export type ExprNode =
  | BinaryOpNode
  | UnaryOpNode
  | TernaryNode
  | FunctionCallNode
  | ReferenceNode
  | ConstantNode
  | PlaceholderNode
  | ErrorExprNode;

/** Frozen map of constant type tags, keyed by short name. */
export const ConstantType = Object.freeze({
  INTEGER: "INTEGER",
  LONG: "LONG",
  DOUBLE: "DOUBLE",
  FLOAT: "FLOAT",
  CHAR: "CHAR_LITERAL",
  STRING: "QUOTED_STRING",
  UNQUOTED_STRING: "UNQUOTED_STRING",
  ANGLE: "ANGLE_BRACKET_IDENTIFIER",
  TRUE: "TRUE",
  FALSE: "FALSE",
} as const);

/**
 * Binary operation node.
 * @param op Operator lexeme (e.g. "+", "==", "&&")
 */
export function BinaryOp(op: string, left: ExprNode, right: ExprNode): BinaryOpNode {
  return { kind: "BinaryOp", op, left, right };
}

/** Unary prefix operation (op in "- + ! ="). */
export function UnaryOp(op: string, operand: ExprNode): UnaryOpNode {
  return { kind: "UnaryOp", op, operand };
}

/** Ternary conditional: cond ? whenTrue : whenFalse. */
export function Ternary(cond: ExprNode, whenTrue: ExprNode, whenFalse: ExprNode): TernaryNode {
  return { kind: "Ternary", cond, whenTrue, whenFalse };
}

/**
 * Function call node.
 * @param ruleset  Ruleset name for @(RS:Lib).fn, else null
 * @param library  Library name, else null (for @fn())
 * @param name     Function name
 * @param args     Argument expression nodes
 * @param deprecated True if invoked via legacy prefix
 */
export function FunctionCall(
  ruleset: string | null,
  library: string | null,
  name: string,
  args: ExprNode[],
  deprecated = false
): FunctionCallNode {
  return { kind: "FunctionCall", ruleset, library, name, args, deprecated };
}

/**
 * A single segment of a property reference, e.g. ".Employee" or ".pxResults(1)".
 * @param name Segment property name
 * @param subscript Subscript node ({subType, value}) or null
 */
export function RefSegment(name: string, subscript: SubscriptNode | null = null): RefSegmentNode {
  return { name, subscript };
}

/**
 * Property reference node.
 * @param scope  Reference scope: "relative" (leading .), "page" (ID.path),
 *               "bare" (single ID), "current" (<current>), "paramPage"
 * @param page   Leading page/scope identifier (Param, Local, a page name), or null
 * @param segments RefSegment[]
 */
export function Reference(
  scope: ReferenceScope,
  page: string | null,
  segments: RefSegmentNode[]
): ReferenceNode {
  return { kind: "Reference", scope, page, segments };
}

/**
 * Subscript on a reference segment.
 * @param subType "index" (INT) | "key" (unquoted ID) | "expr" (computed) |
 *                "symbolic" (<APPEND> etc.) | "append" (empty)
 * @param value   Raw value or nested expr node (for "expr")
 */
export function Subscript(subType: SubscriptType, value: unknown): SubscriptNode {
  return { subType, value };
}

/**
 * Typed constant literal.
 * @param type ConstantType
 * @param value Parsed value (number for numerics, string for text/angle)
 * @param raw  Original lexeme
 */
export function Constant(type: ConstantTypeName, value: unknown, raw: string): ConstantNode {
  return { kind: "Constant", type, value, raw };
}

/**
 * A template placeholder such as {lValue} that appears in function signature templates.
 * @param name Placeholder name (without braces)
 */
export function Placeholder(name: string): PlaceholderNode {
  return { kind: "Placeholder", name };
}

/**
 * Unparseable expression preserved verbatim (never throw on bad input).
 * @param text Original expression text
 * @param message Reason parsing failed
 */
export function ErrorExpr(text: string, message: string): ErrorExprNode {
  return { kind: "ErrorExpr", text, message };
}
