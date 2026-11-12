/**
 * SA4E-393 Addendum 4 — size guard (code-standards): every design-gate source
 * and test file <= 200 lines, every function body <= 20 lines.
 * Scope: src/slash/*.ts, src/tools/design-gate/*.ts, src/__tests__/design-gate*.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { measureFile } from "./helpers/size-metrics";

const SRC = path.resolve(__dirname, "..");
const MAX_FILE_LINES = 200;

function tsFilesIn(dir: string, accept: (name: string) => boolean = () => true): string[] {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && accept(e.name))
    .map((e) => path.join(dir, e.name));
}

const GUARDED = [
  ...tsFilesIn(path.join(SRC, "slash")),
  ...tsFilesIn(path.join(SRC, "tools", "design-gate")),
  ...tsFilesIn(path.join(SRC, "__tests__"), (n) => n.startsWith("design-gate")),
  ...tsFilesIn(path.join(SRC, "__tests__", "helpers"), (n) => n.startsWith("size-metrics")),
];

describe("design-gate size guard (file <= 200 lines, function <= 20 lines)", () => {
  it("guards a non-trivial file set", () => {
    expect(GUARDED.length).toBeGreaterThan(30);
  });

  it("no file exceeds 200 lines", () => {
    const over = GUARDED.map((f) => measureFile(f))
      .filter((m) => m.lines > MAX_FILE_LINES)
      .map((m) => `${path.relative(SRC, m.file)}: ${m.lines} lines`);
    expect(over).toEqual([]);
  });

  it("no function body exceeds 20 lines", () => {
    const over = GUARDED.flatMap((f) => measureFile(f).longFunctions
      .map((fn) => `${path.relative(SRC, f)}:${fn.line} ${fn.name} (${fn.bodyLines} lines)`));
    expect(over).toEqual([]);
  });
});
