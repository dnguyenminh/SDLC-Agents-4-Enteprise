/**
 * exprEmit.ts — Render an expression AST node back to a readable string.
 * Shared by the pseudo-code and diagram emitters. Produces canonical Pega-ish syntax.
 *
 * Ported verbatim from the standalone pega-rule-parser POC (src/emit/expr.ts); the only
 * change is the import path (nodes live alongside this file in pega-expr/).
 */

import type {
  ExprNode,
  ReferenceNode,
  SubscriptNode,
} from "./nodes.js";

/** Accumulator for collected function/property references. */
export interface ExprRefs {
  functions: Set<string>;
  properties: Set<string>;
}

/** Shape of a "symbolic" subscript value that carries a nested expression. */
interface SymbolicSubscriptValue {
  symbol: string;
  expr: ExprNode;
}

/**
 * Render a reference AST node to a string like ".Employee.Salary" or "Param.x" or ".list(1).y".
 * @param ref Reference node
 */
function refToString(ref: ReferenceNode): string {
  let out = "";
  if (ref.scope === "current") out += ref.page; // "<current>"
  else if (ref.scope === "paramPage") {
    // D_Page[key:value, ...]
    const params = (ref.pageParams || [])
      .map((p) => `${p.key}:${exprToString(p.value)}`)
      .join(", ");
    out += `${ref.page}[${params}]`;
  } else if (ref.scope === "page" || ref.scope === "bare") out += ref.page;
  // relative scope contributes no prefix; the leading '.' comes from the first segment.
  for (const seg of ref.segments) {
    out += "." + seg.name;
    if (seg.subscript) out += "(" + subscriptToString(seg.subscript) + ")";
  }
  return out || (ref.page ?? "");
}

/** Render a subscript to its inner string. */
function subscriptToString(sub: SubscriptNode): string {
  switch (sub.subType) {
    case "index": return String(sub.value);
    case "key": return sub.value as string;
    case "append": return "";
    case "symbolic": {
      if (typeof sub.value === "string") return sub.value;
      const v = sub.value as SymbolicSubscriptValue;
      return `${v.symbol} ${exprToString(v.expr)}`;
    }
    case "expr": return exprToString(sub.value as ExprNode);
    default: return "";
  }
}

/**
 * Render any expression AST node to a string.
 * @param node Expression AST node
 */
export function exprToString(node: ExprNode | null | undefined): string {
  if (node == null) return "";
  switch (node.kind) {
    case "BinaryOp":
      return `${exprToString(node.left)} ${node.op} ${exprToString(node.right)}`;
    case "UnaryOp":
      return `${node.op}${exprToString(node.operand)}`;
    case "Ternary":
      return `${exprToString(node.cond)} ? ${exprToString(node.whenTrue)} : ${exprToString(node.whenFalse)}`;
    case "FunctionCall": {
      const args = node.args.map((a) => exprToString(a)).join(", ");
      // Qualified form @(Ruleset:Library).fn(...) has no legacy @@ variant.
      if (node.ruleset && node.library) return `@(${node.ruleset}:${node.library}).${node.name}(${args})`;
      // Legacy direct-function calls are rendered with the '@@' prefix so the output
      // round-trips back to the same AST (deprecated=true). Non-legacy stays single '@'.
      const prefix = node.deprecated ? "@@" : "@";
      if (node.library) return `${prefix}${node.library}.${node.name}(${args})`;
      return `${prefix}${node.name}(${args})`;
    }
    case "Reference":
      return refToString(node);
    case "Constant":
      // Restore quotes for string/char so the output is unambiguous.
      if (node.type === "QUOTED_STRING") return `"${node.value}"`;
      if (node.type === "CHAR_LITERAL") return `'${node.value}'`;
      return String(node.raw ?? node.value);
    case "Placeholder":
      return `{${node.name}}`;
    case "ErrorExpr":
      return node.text; // preserve the original text verbatim
    default:
      return "";
  }
}

/**
 * Collect referenced rules/functions/properties from an expression AST (for analysis).
 * @param node expression node
 * @param acc accumulator (functions + properties)
 */
export function collectExprRefs(
  node: ExprNode | null | undefined,
  acc: ExprRefs = { functions: new Set(), properties: new Set() }
): ExprRefs {
  if (!node) return acc;
  switch (node.kind) {
    case "FunctionCall":
      acc.functions.add(node.library ? `${node.library}.${node.name}` : node.name);
      node.args.forEach((a) => collectExprRefs(a, acc));
      break;
    case "Reference":
      acc.properties.add(refToString(node));
      break;
    case "BinaryOp":
      collectExprRefs(node.left, acc);
      collectExprRefs(node.right, acc);
      break;
    case "UnaryOp":
      collectExprRefs(node.operand, acc);
      break;
    case "Ternary":
      collectExprRefs(node.cond, acc);
      collectExprRefs(node.whenTrue, acc);
      collectExprRefs(node.whenFalse, acc);
      break;
    default:
      break;
  }
  return acc;
}
