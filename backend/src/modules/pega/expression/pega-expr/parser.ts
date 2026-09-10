/**
 * ast/expr/parser.ts — Public expression-parsing entry point, backed by an
 * ANTLR-generated parser (grammar/PegaExpr.g4) plus a visitor (astBuilder.ts).
 *
 * parseExpression(text) preserves its previous contract:
 *   - returns a typed expression AST node (see nodes.ts)
 *   - never throws: any lex/parse error yields an ErrorExpr node with the message
 *
 * A custom error listener collects the first syntax error so we can degrade gracefully
 * instead of ANTLR's default console output.
 */

import antlr4, { InputStream, CommonTokenStream } from "antlr4";
import PegaExprLexer from "./generated/PegaExprLexer.js";
import PegaExprParser from "./generated/PegaExprParser.js";
import { AstBuilder } from "./astBuilder.js";
import { ErrorExpr, Constant, ConstantType } from "./nodes.js";
import type { ExprNode } from "./nodes.js";

// The antlr4 default export carries the runtime `error.ErrorListener` base class. Its packaged
// type declarations do not re-export it by that path, so the base is typed loosely here; this is
// the same untyped generated/runtime ANTLR boundary the visitor sits on. Extending the real base
// (rather than a hand-rolled stand-in) is required so ANTLR's full-context-prediction callbacks
// (reportAttemptingFullContext / reportAmbiguity / reportContextSensitivity) inherit their no-op
// implementations.
const ErrorListenerBase: {
  new (): { syntaxError(...args: unknown[]): void };
} = (antlr4 as unknown as { error: { ErrorListener: new () => { syntaxError(...a: unknown[]): void } } }).error.ErrorListener;

/** Error listener that records the first syntax error and suppresses console noise. */
class CollectingErrorListener extends ErrorListenerBase {
  firstError: string | null = null;
  override syntaxError(
    _recognizer: unknown,
    _offendingSymbol: unknown,
    line: number,
    column: number,
    msg: string
  ): void {
    if (this.firstError === null) this.firstError = `line ${line}:${column} ${msg}`;
  }
}

/**
 * How to interpret a doubled double-quote ("") in the input.
 *
 * Pega stores the SAME token with two different meanings depending on where a rule field lives:
 *   - "literal" (default): "" is two adjacent empty-string literals — the normal expression-language
 *     reading (e.g. a When condition like `.a != ""`). Backward-compatible; input is left untouched.
 *   - "escape": "" is an escaped single '"' — the reading Pega uses when serializing function-column
 *     expressions in Report Definition / List View (e.g. `@@crmCaseWhen(.Status,""Completed"")`).
 *     In this mode every "" is collapsed to " BEFORE parsing, so the argument becomes the intended
 *     string literal "Completed".
 *
 * This is a caller-declared contract, not a guess: the library never inspects field context (it is
 * environment-independent). The caller — which alone knows whether a string came from a function
 * column — opts in to "escape" when appropriate.
 */
export type DoubledQuoteMode = "literal" | "escape";

export interface ParseExpressionOptions {
  doubledQuotes?: DoubledQuoteMode;
}

const DEFAULT_OPTIONS: { doubledQuotes: DoubledQuoteMode } = { doubledQuotes: "literal" };

/**
 * Apply caller-selected pre-normalization to the raw expression text.
 * Only "escape" mode changes anything: it collapses every "" to a single ".
 * @param src trimmed source text
 * @param mode
 */
function applyDoubledQuoteMode(src: string, mode: DoubledQuoteMode): string {
  if (mode === "escape") return src.replace(/""/g, '"');
  return src; // "literal" (default) — leave input unchanged
}

/**
 * Parse a Pega expression string into an AST. Never throws.
 * @param text
 * @param options parse options (see {@link DoubledQuoteMode})
 * @returns expression AST node (ErrorExpr on failure)
 */
export function parseExpression(
  text: string,
  options: ParseExpressionOptions = DEFAULT_OPTIONS
): ExprNode {
  const mode = (options && options.doubledQuotes) || "literal";
  const raw = (text ?? "").toString().trim();
  const src = applyDoubledQuoteMode(raw, mode);
  if (!src) return ErrorExpr("", "empty expression");

  // Special case: a bare class literal like "@baseclass" (no call parentheses) is a
  // valid value in Pega but not a function call. Recognize it directly.
  if (/^@[A-Za-z_$][\w$-]*$/.test(src)) {
    return Constant(ConstantType.ANGLE, src, src);
  }

  try {
    const chars = new InputStream(src);
    const lexer = new PegaExprLexer(chars);
    const listener = new CollectingErrorListener();
    lexer.removeErrorListeners();
    lexer.addErrorListener(listener);

    // The generated lexer targets the same antlr4 runtime, but its packaged type
    // declarations don't structurally match CommonTokenStream's Lexer param — the
    // same generated/runtime ANTLR boundary the error listener above sits on.
    const tokens = new CommonTokenStream(lexer as unknown as antlr4.Lexer);
    const parser = new PegaExprParser(tokens);
    parser.removeErrorListeners();
    parser.addErrorListener(listener);

    const tree = parser.exprEntry();
    if (listener.firstError) return ErrorExpr(src, listener.firstError);

    return new AstBuilder().visit(tree) as ExprNode;
  } catch (err) {
    return ErrorExpr(src, (err as Error).message);
  }
}
