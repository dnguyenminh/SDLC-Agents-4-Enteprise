/**
 * SA4E-393 Addendum 4 (SEC-F07) — fs.adapter containment uses the single
 * PathResolver.isPathWithinRoot implementation (no startsWith / startsWith("..")).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { isPathSafe, readSourceFile } from "../slash/fs.adapter";

let base: string;
let ws: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "dg-fs-"));
  ws = path.join(base, "root");
  fs.mkdirSync(path.join(base, "root-evil"));
  fs.mkdirSync(path.join(ws, "..dots"), { recursive: true });
  fs.writeFileSync(path.join(ws, "..dots", "a.css"), "a{}");
  fs.writeFileSync(path.join(base, "root-evil", "x.css"), "x{}");
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe("SEC-F07 containment", () => {
  it("blocks sibling directory sharing the root prefix", () => {
    expect(isPathSafe(path.join(base, "root-evil", "x.css"), ws)).toBe(false);
    expect(isPathSafe("../root-evil/x.css", ws)).toBe(false);
    expect(() => readSourceFile("../root-evil/x.css", ws)).toThrow();
  });

  it("allows an in-workspace entry whose name merely starts with '..'", () => {
    expect(isPathSafe("..dots/a.css", ws)).toBe(true);
    expect(readSourceFile("..dots/a.css", ws)).toBe("a{}");
  });

  it("blocks parent traversal and accepts normal files", () => {
    expect(isPathSafe("../x", ws)).toBe(false);
    expect(isPathSafe("..dots", ws)).toBe(true);
  });
});
