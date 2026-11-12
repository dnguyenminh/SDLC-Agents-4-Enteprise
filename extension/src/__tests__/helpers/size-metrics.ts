/**
 * SA4E-393 — TS-AST size metrics for the design-gate size guard.
 * Standard: file <= 200 lines, function body <= 20 lines (code-standards).
 */
import * as fs from "fs";
import * as ts from "typescript";

export interface LongFunction { name: string; bodyLines: number; line: number }
export interface FileMetrics { file: string; lines: number; longFunctions: LongFunction[] }

/** Body lines excluding the signature line and the closing brace. */
function bodyLinesOf(sf: ts.SourceFile, node: ts.FunctionLikeDeclaration): number | undefined {
  if (!node.body) return undefined;
  const start = sf.getLineAndCharacterOfPosition(node.body.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(node.body.getEnd()).line;
  return ts.isBlock(node.body) ? end - start - 1 : end - start + 1;
}

/** `describe(...)` callbacks are grouping containers (bounded by the 200-line file cap); `it` bodies are still held to 20 lines. */
function isDescribeCallback(node: ts.Node): boolean {
  const call = node.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression)) return false;
  const callee = call.expression.getText().replace(/\.(skip|only|each\(.*\))$/, "");
  return callee === "describe";
}
function nameOf(node: ts.FunctionLikeDeclaration): string {
  const n = (node as { name?: ts.Node }).name;
  if (n) return n.getText();
  const p = node.parent;
  return ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) ? p.name.getText() : "<anonymous>";
}

/** Measure one TypeScript file (line count + functions over `maxBody` lines). */
export function measureFile(file: string, maxBody = 20): FileMetrics {
  const text = fs.readFileSync(file, "utf-8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const longFunctions: LongFunction[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && "body" in node) {
      const fn = node as ts.FunctionLikeDeclaration;
      const bodyLines = bodyLinesOf(sf, fn);
      if (bodyLines !== undefined && bodyLines > maxBody && !isDescribeCallback(node)) {
        longFunctions.push({ name: nameOf(fn), bodyLines, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { file, lines: text.split(/\r?\n/).length, longFunctions };
}
