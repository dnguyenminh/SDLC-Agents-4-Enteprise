/**
 * SA4E-233 — expressionEmit.ts (test support)
 *
 * Renders an expression AST node back to a readable string. Used only by the parser
 * round-trip tests to prove parse→render→parse stability. Ported from the standalone
 * tool's `emit/expr.js`.
 */
import type { ExprNode, ReferenceNode, Subscript } from '../expressionNodes.js';

/** Render a subscript to its inner string. */
function subscriptToString(sub: Subscript): string {
  switch (sub.subType) {
    case 'index': return String(sub.value);
    case 'key': return sub.value as string;
    case 'append': return '';
    case 'symbolic':
      return typeof sub.value === 'string'
        ? sub.value
        : `${(sub.value as { symbol: string }).symbol} ${exprToString((sub.value as { expr: ExprNode }).expr)}`;
    case 'expr': return exprToString(sub.value as ExprNode);
    default: return '';
  }
}

/** Render a reference node to a string like `.Employee.Salary`, `Param.x` or `.list(1).y`. */
function refToString(ref: ReferenceNode): string {
  let out = '';
  if (ref.scope === 'current') out += ref.page ?? '';
  else if (ref.scope === 'paramPage') {
    const params = (ref.pageParams ?? []).map((p) => `${p.key}:${exprToString(p.value)}`).join(', ');
    out += `${ref.page}[${params}]`;
  } else if (ref.scope === 'page' || ref.scope === 'bare') out += ref.page ?? '';
  for (const seg of ref.segments) {
    out += '.' + seg.name;
    if (seg.subscript) out += '(' + subscriptToString(seg.subscript) + ')';
  }
  return out || (ref.page ?? '');
}

/**
 * Render any expression AST node to a canonical Pega-ish string.
 * @param node Expression AST node
 * @returns The rendered expression text
 */
export function exprToString(node: ExprNode | null | undefined): string {
  if (node == null) return '';
  switch (node.kind) {
    case 'BinaryOp': return `${exprToString(node.left)} ${node.op} ${exprToString(node.right)}`;
    case 'UnaryOp': return `${node.op}${exprToString(node.operand)}`;
    case 'Ternary': return `${exprToString(node.cond)} ? ${exprToString(node.whenTrue)} : ${exprToString(node.whenFalse)}`;
    case 'FunctionCall': return functionToString(node);
    case 'Reference': return refToString(node);
    case 'Constant': return constantToString(node);
    case 'Placeholder': return `{${node.name}}`;
    case 'ErrorExpr': return node.text;
    default: return '';
  }
}

/** Render a function call, choosing the right prefix form. */
function functionToString(node: Extract<ExprNode, { kind: 'FunctionCall' }>): string {
  const args = node.args.map(exprToString).join(', ');
  if (node.ruleset && node.library) return `@(${node.ruleset}:${node.library}).${node.name}(${args})`;
  if (node.library) return `@${node.library}.${node.name}(${args})`;
  return `@${node.name}(${args})`;
}

/** Render a constant, restoring quotes for string/char so output is unambiguous. */
function constantToString(node: Extract<ExprNode, { kind: 'Constant' }>): string {
  if (node.type === 'QUOTED_STRING') return `"${node.value}"`;
  if (node.type === 'CHAR_LITERAL') return `'${node.value}'`;
  return String(node.raw ?? node.value);
}
