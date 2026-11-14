/**
 * SA4E-393 follow-up — SEC-F01/F02/F03 regression tests (real fs + real PathResolver).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveSourceRoot } from "../tools/design-gate/design-gate-resolve";
import { sanitizeErrorText } from "../tools/design-gate/design-gate-payload";

let tmp: string;
let ws: string;
let outside: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-sec-"));
  ws = path.join(tmp, "ws");
  outside = path.join(tmp, "outside");
  fs.mkdirSync(path.join(ws, "src"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("SEC-F01 resolveSourceRoot message", () => {
  it("does not leak absolute path or workspace root for non-existent paths", () => {
    const r = resolveSourceRoot("..\\..\\escape", ws);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(ws);
      expect(r.message).not.toContain(tmp);
      expect(r.message).toContain("PATH_NOT_FOUND");
      expect(r.message).toContain("source_path does not exist");
    }
  });
});

describe("SEC-F02 symlink/junction escape", () => {
  it("rejects a junction pointing outside the workspace", () => {
    const link = path.join(ws, "link");
    fs.symlinkSync(outside, link, "junction");
    const r = resolveSourceRoot("link", ws);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(outside);
      expect(r.message).toContain("source_path resolves outside the workspace");
    }
  });

  it("rejects an existing directory path outside the workspace", () => {
    const outsideDir = path.join(outside, "existing");
    fs.mkdirSync(outsideDir, { recursive: true });
    const r = resolveSourceRoot(path.relative(ws, outsideDir), ws);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(outsideDir);
      expect(r.message).not.toContain(outside);
      expect(r.message).not.toContain(tmp);
      expect(r.message).toContain("source_path resolves outside the workspace");
    }
  });

  it("accepts a normal in-workspace directory", () => {
    const r = resolveSourceRoot("src", ws);
    expect(r.ok).toBe(true);
  });
});

describe("SEC-F03 sanitizeErrorText", () => {
  it("escapes regex specials in workspace root", () => {
    const root = "C:\\proj\\x.y (1)";
    const out = sanitizeErrorText(new Error(`fail at ${root}\\a.html`), root);
    expect(out).not.toContain("x.y (1)");
    expect(out).toContain("<workspace>");
  });

  it("handles forward-slash form of the root", () => {
    const root = "C:\\proj\\x.y (1)";
    const out = sanitizeErrorText(new Error("fail at C:/proj/x.y (1)/a.html"), root);
    expect(out).not.toContain("x.y (1)");
  });
});
