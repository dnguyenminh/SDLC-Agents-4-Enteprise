/**
 * SA4E-393 Addendum 4 (SEC-F04/F05) — report.store unit tests.
 * One regex + containment guard for runId; atomic JSON writes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  RUN_ID_RE, isValidRunId, resolveInside, toRelSource, writeJsonAtomic,
  saveReport, loadReport, listRunIds, persistRun, designGateDir,
} from "../slash/report.store";
import { generateQualityReport } from "../slash/report.generator";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-store-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const mkReport = () => generateQualityReport([], "static", 0.8, undefined, 1);
const meta = { sourcePath: "src", cacheHit: false };

describe("runId validation (SEC-F05)", () => {
  it("accepts generated ids, rejects traversal / case / NUL / empty", () => {
    expect(RUN_ID_RE.test(mkReport().runId)).toBe(true);
    for (const bad of ["../x", "run_1_a/../../x", "run_1_A", "", "run_1_a\0", "run_1_", "x_1_a"]) {
      expect(isValidRunId(bad)).toBe(false);
    }
    expect(isValidRunId(42)).toBe(false);
    expect(isValidRunId("run_1_" + "a".repeat(80))).toBe(false);
  });

  it("resolveInside blocks traversal and sibling-prefix escapes", () => {
    const dir = path.join(root, "ws");
    expect(resolveInside(dir, "a.json")).toBe(path.join(dir, "a.json"));
    expect(resolveInside(dir, "../a.json")).toBeUndefined();
    expect(resolveInside(dir, "sub/../../a.json")).toBeUndefined();
    expect(resolveInside(dir, "../ws-evil/a.json")).toBeUndefined();
  });

  it("toRelSource is relative with forward slashes, '.' for root", () => {
    expect(toRelSource(root, path.join(root, "a", "b"))).toBe("a/b");
    expect(toRelSource(root, root)).toBe(".");
  });
});

describe("writeJsonAtomic", () => {
  it("writes valid JSON and leaves no tmp file", () => {
    const file = path.join(root, "o.json");
    writeJsonAtomic(file, { a: 1 });
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({ a: 1 });
    expect(fs.readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("failed rename throws, keeps no partial target and cleans the tmp", () => {
    const target = path.join(root, "t.json");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "keep"), "x"); // non-empty dir → rename fails
    expect(() => writeJsonAtomic(target, { a: 1 })).toThrow();
    expect(fs.readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("saveReport / loadReport / listRunIds", () => {
  it("round-trips the report under {runId}.json with relative sourcePath", () => {
    const r = mkReport();
    saveReport(root, r, meta);
    const file = path.join(designGateDir(root), `${r.runId}.json`);
    const rec = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(rec.runId).toBe(r.runId);
    expect(rec.sourcePath).toBe("src");
    expect(loadReport(root, r.runId)?.runId).toBe(r.runId);
    expect(listRunIds(root)).toEqual([r.runId]);
  });

  it("saveReport throws for an invalid runId; loadReport hides bad ids", () => {
    expect(() => saveReport(root, { ...mkReport(), runId: "../evil" }, meta)).toThrow();
    expect(loadReport(root, "../x")).toBeUndefined();
  });

  it("persistRun returns undefined on success and an error text on failure", () => {
    expect(persistRun(root, mkReport(), meta)).toBeUndefined();
    const blocked = fs.mkdtempSync(path.join(os.tmpdir(), "dg-blk-"));
    fs.writeFileSync(path.join(blocked, ".code-intel"), "i am a file");
    expect(persistRun(blocked, mkReport(), meta)).toMatch(/not persisted/i);
    fs.rmSync(blocked, { recursive: true, force: true });
  });
});

describe("loadReport enforces isValidRunId even when the file really exists (QA M2)", () => {
  // Path-safe names that violate RUN_ID_RE / length: only isValidRunId rejects them.
  const longValid = "run_1_" + "a".repeat(80); // matches RUN_ID_RE but > 64 chars
  const cases = ["RUN_1_X", "run_1_A", "run_1_a-b", "run_1_", longValid];

  it.each(cases)("returns undefined for on-disk record %s", (id) => {
    const dir = designGateDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ report: mkReport() }));
    expect(fs.existsSync(path.join(dir, `${id}.json`))).toBe(true);
    expect(resolveInside(dir, `${id}.json`)).toBeDefined(); // containment alone would allow it
    expect(loadReport(root, id)).toBeUndefined();
  });

  it("control: longValid matches the regex yet is rejected by length only", () => {
    expect(RUN_ID_RE.test(longValid)).toBe(true);
    expect(isValidRunId(longValid)).toBe(false);
  });
});
