/**
 * PegaExprAnnotator.ts — SA4E-236 / GD4.
 *
 * Renders expression-bearing rule fields (When conditions, Data Transform values, decision
 * table cells, Declare Expression targets) into readable, structured pseudo-code by parsing
 * them with the embedded ANTLR expression parser (pega-expr) and re-emitting via exprToString.
 *
 * Purpose: replace raw expression strings in prompt-context / body embeddings with a canonical
 * normalized form so downstream LLM enrichment sees structured logic, not opaque strings.
 * Never throws: an unparseable expression falls back to its original text (ErrorExpr -> text).
 */

import { parseExpression } from './expression/pega-expr/parser.js';
import { exprToString } from './expression/pega-expr/exprEmit.js';
import type { ExprNode } from './expression/pega-expr/nodes.js';

/**
 * Property names that carry a Pega expression (value-language), grouped by how the value
 * should be read. These are the fields GD4 targets for typed-AST parsing.
 */
const EXPRESSION_FIELDS: ReadonlySet<string> = new Set([
  'pyWhenCondition',
  'pyExpression',
  'pyExpressionString',
  'pyValue',
  'pySource',
  'pyCondition',
  'pyResult',
  'pyLabelValue',
]);

/** Report-Definition-style function columns use doubled-quote escaping for string args. */
function isFunctionColumn(text: string): boolean {
  return text.startsWith('@') && text.includes('""');
}

/**
 * Parse an expression string into a typed AST, opting into doubled-quote escape mode only for
 * function-column strings. Returns null for empty/non-string input.
 * @param raw Raw field value
 */
export function parseFieldExpression(raw: unknown): ExprNode | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const opts = isFunctionColumn(raw.trim()) ? { doubledQuotes: 'escape' as const } : undefined;
  return parseExpression(raw, opts);
}

/**
 * Render an expression field to canonical pseudo-code. Unparseable input degrades to the
 * original text (never throws, never loses information).
 * @param raw Raw field value
 * @returns Canonical rendering, or the original string when it is not an expression
 */
export function renderFieldExpression(raw: unknown): string {
  const ast = parseFieldExpression(raw);
  if (!ast) return typeof raw === 'string' ? raw : '';
  if (ast.kind === 'ErrorExpr') return ast.text; // preserve verbatim
  return exprToString(ast);
}

/**
 * True if a property name is known to carry a Pega expression.
 * @param key Property name
 */
export function isExpressionField(key: string): boolean {
  return EXPRESSION_FIELDS.has(key);
}
