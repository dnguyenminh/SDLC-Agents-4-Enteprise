/**
 * PegaExprVisitor.d.ts — Type sidecar for the ANTLR-generated visitor base class
 * (PegaExprVisitor.js). The generated JS is not hand-edited; this declaration describes
 * only the surface the hand-written AstBuilder relies on.
 *
 * Parse-tree context objects are the untyped generated-code boundary, hence `any`.
 */
export default class PegaExprVisitor {
  visit(tree: unknown): any;
  visitChildren(node: unknown): any;
}
