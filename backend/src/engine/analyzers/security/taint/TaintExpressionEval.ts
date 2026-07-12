/**
 * KSA-164: Taint Expression Evaluator — Evaluates expressions for taint propagation.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import type { TaintStep, TaintSinkType } from '../types/index.js';
import { TaintRegistry } from './TaintRegistry.js';
import type { TaintState } from './taint-types.js';

export interface ExpressionTaintResult {
  tainted: boolean;
  sourceType: string;
  sourceLine: number;
  steps: TaintStep[];
  action: TaintStep['action'];
}

const NOT_TAINTED: ExpressionTaintResult = { tainted: false, sourceType: '', sourceLine: 0, steps: [], action: 'assign' };

export function evaluateExpression(
  node: SyntaxNode,
  state: Map<string, TaintState>,
  registry: TaintRegistry,
): ExpressionTaintResult {
  if (node.type === 'identifier') return evaluateIdentifier(node, state);
  if (node.type === 'member_expression') return evaluateMemberExpr(node, state, registry);
  if (node.type === 'call_expression') return evaluateCallExpr(node, state, registry);
  if (node.type === 'template_string') return evaluateTemplateString(node, state, registry);
  if (node.type === 'binary_expression') return evaluateBinaryExpr(node, state, registry);
  if (node.type === 'subscript_expression') return evaluateSubscript(node, state, registry);
  if (node.type === 'await_expression') {
    const child = node.namedChild(0);
    return child ? evaluateExpression(child, state, registry) : NOT_TAINTED;
  }
  return NOT_TAINTED;
}

function evaluateIdentifier(node: SyntaxNode, state: Map<string, TaintState>): ExpressionTaintResult {
  const existing = state.get(node.text);
  if (existing?.tainted) {
    return { tainted: true, sourceType: existing.sourceType, sourceLine: existing.sourceLine, steps: existing.steps, action: 'pass_through' };
  }
  return NOT_TAINTED;
}

function evaluateMemberExpr(node: SyntaxNode, state: Map<string, TaintState>, registry: TaintRegistry): ExpressionTaintResult {
  const sourceMatch = registry.matchSource(node.text);
  if (sourceMatch) {
    return { tainted: true, sourceType: sourceMatch.type, sourceLine: node.startPosition.row + 1, steps: [], action: 'assign' };
  }
  const obj = node.childForFieldName('object');
  if (obj) {
    const objTaint = evaluateExpression(obj, state, registry);
    if (objTaint.tainted) return { ...objTaint, action: 'pass_through' };
  }
  return NOT_TAINTED;
}

function evaluateCallExpr(node: SyntaxNode, state: Map<string, TaintState>, registry: TaintRegistry): ExpressionTaintResult {
  if (isSanitizerCall(node, registry)) return NOT_TAINTED;
  const fn = node.childForFieldName('function');
  if (!fn) return NOT_TAINTED;
  const sourceMatch = registry.matchSource(fn.text);
  if (sourceMatch) {
    return { tainted: true, sourceType: sourceMatch.type, sourceLine: node.startPosition.row + 1, steps: [], action: 'function_call' };
  }
  const args = node.childForFieldName('arguments');
  if (args) {
    for (let i = 0; i < args.namedChildCount; i++) {
      const arg = args.namedChild(i);
      if (arg) {
        const argTaint = evaluateExpression(arg, state, registry);
        if (argTaint.tainted) return { ...argTaint, action: 'function_call' };
      }
    }
  }
  return NOT_TAINTED;
}

function evaluateTemplateString(node: SyntaxNode, state: Map<string, TaintState>, registry: TaintRegistry): ExpressionTaintResult {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && child.type === 'template_substitution') {
      const expr = child.namedChild(0);
      if (expr) {
        const exprTaint = evaluateExpression(expr, state, registry);
        if (exprTaint.tainted) return { ...exprTaint, action: 'template_literal' };
      }
    }
  }
  return NOT_TAINTED;
}

function evaluateBinaryExpr(node: SyntaxNode, state: Map<string, TaintState>, registry: TaintRegistry): ExpressionTaintResult {
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  if (left) {
    const leftTaint = evaluateExpression(left, state, registry);
    if (leftTaint.tainted) return { ...leftTaint, action: 'concat' };
  }
  if (right) {
    const rightTaint = evaluateExpression(right, state, registry);
    if (rightTaint.tainted) return { ...rightTaint, action: 'concat' };
  }
  return NOT_TAINTED;
}

function evaluateSubscript(node: SyntaxNode, state: Map<string, TaintState>, registry: TaintRegistry): ExpressionTaintResult {
  const obj = node.childForFieldName('object');
  if (obj) {
    const objTaint = evaluateExpression(obj, state, registry);
    if (objTaint.tainted) return { ...objTaint, action: 'pass_through' };
  }
  return NOT_TAINTED;
}

export function isSanitizerCall(node: SyntaxNode, registry: TaintRegistry): boolean {
  const fn = node.type === 'call_expression' ? node.childForFieldName('function') : null;
  if (!fn) return false;
  const fnText = fn.text;
  const sinkTypes: TaintSinkType[] = ['sql_query', 'shell_exec', 'html_output', 'file_path', 'url_fetch'];
  for (const sinkType of sinkTypes) {
    if (registry.isSanitizer(fnText, sinkType)) return true;
  }
  return false;
}
