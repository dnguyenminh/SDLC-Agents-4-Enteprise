/**
 * Shared fixtures for Pega expression property-based tests.
 * See PegaExpression*Property.test.ts / PegaClipboardContextProperty.test.ts.
 */
import fc from 'fast-check';
import { ExpressionParser } from '../../expression/ExpressionParser.js';
import { PegaExpressionEvaluator } from '../../expression/PegaExpressionEvaluator.js';
import type { ExprNode } from '../../expression/expressionTypes.js';

export const isSimpleString = (s: string): boolean =>
  !s.includes('"') && !s.includes("'") && !s.includes('\\') && !s.includes('\n') && !s.includes('\t');

// `true`/`false` lex as TRUE/FALSE constants, so they cannot be bare identifiers.
const RESERVED = new Set(['true', 'false']);
export const isValidIdentifier = (s: string): boolean => /^[a-zA-Z_]\w*$/.test(s) && !RESERVED.has(s);

export const evaluator = new PegaExpressionEvaluator();

/** ANTLR entry point: never throws, always returns a node (ErrorExpr on failure). */
export const parse = (src: string): ExprNode => ExpressionParser.parseExpression(src);

export { fc };
