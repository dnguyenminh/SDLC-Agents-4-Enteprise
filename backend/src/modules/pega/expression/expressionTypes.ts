/**
 * SA4E-233 — expressionTypes.ts
 *
 * Type declarations + discriminated union for the Pega expression AST. Separated from
 * the factory functions (expressionNodes.ts) to satisfy the model/processing split.
 * Ported from the standalone tool's `nodes.js` (type portion).
 */

/** Literal type tags, matching engine IPRNodeInfo.ConstantType. */
export const ConstantType = {
  INTEGER: 'INTEGER',
  LONG: 'LONG',
  DOUBLE: 'DOUBLE',
  FLOAT: 'FLOAT',
  CHAR: 'CHAR_LITERAL',
  STRING: 'QUOTED_STRING',
  UNQUOTED_STRING: 'UNQUOTED_STRING',
  ANGLE: 'ANGLE_BRACKET_IDENTIFIER',
  TRUE: 'TRUE',
  FALSE: 'FALSE',
} as const;

/** Union of all possible constant type tag values. */
export type ConstantTypeValue = (typeof ConstantType)[keyof typeof ConstantType];

/** Reference scope discriminator. */
export type RefScope = 'relative' | 'page' | 'bare' | 'current' | 'paramPage';

/** Subscript discriminator: how a reference segment is indexed. */
export type SubscriptType = 'index' | 'key' | 'expr' | 'symbolic' | 'append';

/** A symbolic subscript that additionally carries an expression (e.g. `<insert> .i`). */
export interface SymbolicWithExpr {
  readonly symbol: string;
  readonly expr: ExprNode;
}

/** Subscript on a reference segment. */
export interface Subscript {
  readonly subType: SubscriptType;
  readonly value: number | string | ExprNode | SymbolicWithExpr;
}

/** A single segment of a property reference, e.g. `.Employee` or `.pxResults(1)`. */
export interface RefSegment {
  readonly name: string;
  readonly subscript: Subscript | null;
}

/** A keyed parameter on a data-page reference: `Key:value`. */
export interface PageParam {
  readonly key: string;
  readonly value: ExprNode;
}

export interface BinaryOpNode {
  readonly kind: 'BinaryOp';
  readonly op: string;
  readonly left: ExprNode;
  readonly right: ExprNode;
}

export interface UnaryOpNode {
  readonly kind: 'UnaryOp';
  readonly op: string;
  readonly operand: ExprNode;
}

export interface TernaryNode {
  readonly kind: 'Ternary';
  readonly cond: ExprNode;
  readonly whenTrue: ExprNode;
  readonly whenFalse: ExprNode;
}

export interface FunctionCallNode {
  readonly kind: 'FunctionCall';
  readonly ruleset: string | null;
  readonly library: string | null;
  readonly name: string;
  readonly args: ExprNode[];
  readonly deprecated: boolean;
}

export interface ReferenceNode {
  readonly kind: 'Reference';
  readonly scope: RefScope;
  readonly page: string | null;
  readonly segments: RefSegment[];
  /** Only present for `paramPage` scope (keyed data-page reference). */
  readonly pageParams?: PageParam[];
}

export interface ConstantNode {
  readonly kind: 'Constant';
  readonly type: ConstantTypeValue;
  readonly value: number | string | boolean;
  readonly raw: string;
}

export interface PlaceholderNode {
  readonly kind: 'Placeholder';
  readonly name: string;
}

export interface ErrorExprNode {
  readonly kind: 'ErrorExpr';
  readonly text: string;
  readonly message: string;
}

/** Discriminated union of every expression AST node, keyed by `kind`. */
export type ExprNode =
  | BinaryOpNode
  | UnaryOpNode
  | TernaryNode
  | FunctionCallNode
  | ReferenceNode
  | ConstantNode
  | PlaceholderNode
  | ErrorExprNode;
