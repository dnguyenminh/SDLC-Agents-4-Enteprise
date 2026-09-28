/**
 * ANTLR-backed public expression parsing entry point.
 * Produces the JSON-serializable ExprNode model defined in expressionTypes.ts.
 * Syntax failures are represented by ErrorExpr so callers never receive a partial AST.
 */
import { CharStreams, CommonTokenStream, ErrorListener, type Recognizer, type Token } from 'antlr4';
import PegaExprLexer from './generated/PegaExprLexer.js';
import PegaExprParser from './generated/PegaExprParser.js';
import { ExpressionAstBuilder } from './ExpressionAstBuilder.js';
import { ErrorExpr, Constant, ConstantType, type ExprNode } from './expressionNodes.js';

const BARE_CLASS_LITERAL = /^@[A-Za-z_$][\w$-]*$/;

interface ErrorSink {
  firstError: string | null;
}

class CollectingErrorListener<TSymbol> extends ErrorListener<TSymbol> {
  constructor(private readonly sink: ErrorSink) {
    super();
  }

  override syntaxError(
    _recognizer: Recognizer<TSymbol>,
    _offendingSymbol: TSymbol,
    line: number,
    column: number,
    message: string,
  ): void {
    if (this.sink.firstError === null) {
      this.sink.firstError = `line ${line}:${column} ${message}`;
    }
  }
}

/** Public ANTLR expression parser used by every expression-engine caller. */
export class ExpressionParser {
  static parseExpression(text: string): ExprNode {
    const source = (text ?? '').toString().trim();
    if (!source) return ErrorExpr('', 'empty expression');
    if (BARE_CLASS_LITERAL.test(source)) {
      return Constant(ConstantType.ANGLE, source, source);
    }

    try {
      return this.runAntlr(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return ErrorExpr(source, message);
    }
  }

  private static runAntlr(source: string): ExprNode {
    const sink: ErrorSink = { firstError: null };
    const lexer = new PegaExprLexer(CharStreams.fromString(source));
    lexer.removeErrorListeners();
    lexer.addErrorListener(new CollectingErrorListener<number>(sink));
    const parser = new PegaExprParser(new CommonTokenStream(lexer));
    parser.removeErrorListeners();
    parser.addErrorListener(new CollectingErrorListener<Token>(sink));
    const tree = parser.exprEntry();
    if (sink.firstError) return ErrorExpr(source, sink.firstError);
    return new ExpressionAstBuilder().visit(tree) as ExprNode;
  }
}
