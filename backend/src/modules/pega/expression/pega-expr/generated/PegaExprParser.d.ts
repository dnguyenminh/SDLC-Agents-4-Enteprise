/**
 * PegaExprParser.d.ts — Type sidecar for the ANTLR-generated parser (PegaExprParser.js).
 * Describes only the constructor, error-listener methods, and the `exprEntry` entry rule
 * used by parser.ts. The returned parse-tree context is the untyped generated boundary.
 */
import { CommonTokenStream, ErrorListener } from "antlr4";

export default class PegaExprParser {
  constructor(input: CommonTokenStream);
  removeErrorListeners(): void;
  addErrorListener(listener: ErrorListener<unknown>): void;
  exprEntry(): unknown;
}
