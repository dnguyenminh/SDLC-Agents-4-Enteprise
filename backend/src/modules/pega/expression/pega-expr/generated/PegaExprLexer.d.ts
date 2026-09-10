/**
 * PegaExprLexer.d.ts — Type sidecar for the ANTLR-generated lexer (PegaExprLexer.js).
 * Describes only the constructor and error-listener methods used by parser.ts.
 */
import { InputStream, ErrorListener } from "antlr4";

export default class PegaExprLexer {
  // ANTLR's InputStream is the concrete char stream passed by parser.ts.
  constructor(input: InputStream);
  removeErrorListeners(): void;
  addErrorListener(listener: ErrorListener<number>): void;
}
