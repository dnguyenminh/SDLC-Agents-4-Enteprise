/**
 * SA4E-233 — ExpressionParser.ts
 *
 * Public expression-parsing entry point, backed by the ANTLR-generated parser
 * (grammar/PegaExpr.g4) plus the ExpressionAstBuilder visitor. Ported from the
 * standalone tool's `parser.js`.
 *
 * Contract of `parseExpression(text)`:
 *   - returns a typed expression AST node (see expressionNodes.ts)
 *   - NEVER throws: any lex/parse error yields an ErrorExpr node with the message,
 *     preserving the original text verbatim.
 *
 * This parser runs in parallel to the existing hand-written PegaExpressionParser
 * (removal is GD2).
 */
import { CharStreams, CommonTokenStream, ErrorListener, type Recognizer, type Token } from 'antlr4';
import PegaExprLexer from './generated/PegaExprLexer.js';
import PegaExprParser from './generated/PegaExprParser.js';
import { ExpressionAstBuilder } from './ExpressionAstBuilder.js';
import { ErrorExpr, Constant, ConstantType, type ExprNode } from './expressionNodes.js';

/** Matches a bare class literal such as `@baseclass` (no call parentheses). */
const BARE_CLASS_LITERAL = /^@[A-Za-z_$][\w$-]*$/;

/** Mutable holder for the first syntax error, shared between lexer and parser listeners. */
interface ErrorSink {
  firstError: string | null;
}

/**
 * Error listener that records the first syntax error into a shared sink and suppresses
 * ANTLR's default console output so we can degrade gracefully to an ErrorExpr.
 *
 * Generic over the recognizer symbol type: the lexer emits `number` symbols while the
 * parser emits `Token` symbols, so a single generic class serves both correctly-typed.
 * @typeParam TSymbol Recognizer symbol type (number for lexer, Token for parser)
 */
class CollectingErrorListener<TSymbol> extends ErrorListener<TSymbol> {
  /** @param sink Shared sink that receives the first error across both recognizers. */
  constructor(private readonly sink: ErrorSink) {
    super();
  }

  /** @inheritdoc */
  override syntaxError(
    _recognizer: Recognizer<TSymbol>,
    _offendingSymbol: TSymbol,
    line: number,
    column: number,
    msg: string,
  ): void {
    if (this.sink.firstError === null) this.sink.firstError = `line ${line}:${column} ${msg}`;
  }
}

/**
 * Parse a Pega expression string into a typed AST. Never throws.
 * @param text Raw expression text (from a When condition, DT cell, etc.)
 * @returns An expression AST node; an ErrorExpr on any lex/parse failure.
 */
export function parseExpression(text: string): ExprNode {
  const src = (text ?? '').toString().trim();
  if (!src) return ErrorExpr('', 'empty expression');

  // Special case: `@baseclass` is a valid Pega value but not a function call.
  if (BARE_CLASS_LITERAL.test(src)) return Constant(ConstantType.ANGLE, src, src);

  try {
    return runAntlr(src);
  } catch (err) {
    // NEVER throw: preserve the original text and the failure reason.
    const message = err instanceof Error ? err.message : String(err);
    return ErrorExpr(src, message);
  }
}

/** Run the ANTLR lex/parse pipeline and build the AST; returns ErrorExpr on syntax error. */
function runAntlr(src: string): ExprNode {
  const sink: ErrorSink = { firstError: null };
  const chars = CharStreams.fromString(src);
  const lexer = new PegaExprLexer(chars);
  lexer.removeErrorListeners();
  lexer.addErrorListener(new CollectingErrorListener<number>(sink));

  const tokens = new CommonTokenStream(lexer);
  const parser = new PegaExprParser(tokens);
  parser.removeErrorListeners();
  parser.addErrorListener(new CollectingErrorListener<Token>(sink));

  const tree = parser.exprEntry();
  if (sink.firstError) return ErrorExpr(src, sink.firstError);
  return new ExpressionAstBuilder().visit(tree) as ExprNode;
}
