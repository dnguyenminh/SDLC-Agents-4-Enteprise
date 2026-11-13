/**
 * SA4E-393 Addendum 4 — batch 3: D2 (single containment impl in scoring),
 * S-1 (error report has a valid runId + audit record), S-2 (file-lister
 * realpath containment with a real junction/symlink).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { sanitizeFilePath } from "../slash/report.scoring";
import { generateQualityReport } from "../slash/report.generator";
import { RUN_ID_RE, persistRun, loadReport } from "../slash/report.store";
import { listSourceFiles } from "../slash/file-lister";
import { cacheResult, getCachedResult } from "../slash/detection.cache";

let base: string;
let ws: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "dg-b3-"));
  ws = path.join(base, "root");
  fs.mkdirSync(ws);
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe("D2 sanitizeFilePath uses isPathWithinRoot", () => {
  it("keeps '..dots/a.css' inside root as a relative path", () => {
    expect(sanitizeFilePath("..dots/a.css", ws)).toBe(path.normalize("..dots/a.css"));
    expect(sanitizeFilePath(path.join(ws, "..dots", "a.css"), ws)).toBe(path.join("..dots", "a.css"));
  });
  it("outside root → unknown", () => {
    expect(sanitizeFilePath("../x.css", ws)).toBe("unknown");
    expect(sanitizeFilePath("../root-evil/x.css", ws)).toBe("unknown");
    expect(sanitizeFilePath(path.join(base, "other", "x.css"), ws)).toBe("unknown");
  });
  it("normal relative path unchanged", () => {
    expect(sanitizeFilePath("a/b.css", ws)).toBe(path.normalize("a/b.css"));
  });
});

describe("D1 cacheResult stores workspace-relative finding paths (boundary invariant)", () => {
  it("absolute finding.file is relativised on disk and on read", () => {
    const abs = path.join(ws, "site", "a.css");
    const finding = { findingId: "f1", runId: "r", mode: "static" as const, file: abs, severity: "high" as const, message: "m" };
    cacheResult(ws, path.join(ws, "site"), "static",
      { findings: [finding], fileCount: 2, durationMs: 1, cacheHit: false, partial: false }, "run_1_a");
    const cacheDir = path.join(ws, ".code-intel", "design-gate", "cache");
    const txt = fs.readdirSync(cacheDir).map((f) => fs.readFileSync(path.join(cacheDir, f), "utf-8")).join("\n");
    expect(txt.includes(ws) || txt.includes(JSON.stringify(ws).slice(1, -1))).toBe(false);
    const hit = getCachedResult(ws, path.join(ws, "site"), "static");
    expect(hit?.result.fileCount).toBe(2);
    expect(hit?.result.findings[0].file).toBe(path.join("site", "a.css"));
  });
});

describe("S-1 error report gets a valid runId and an audit record", () => {
  it("runId matches RUN_ID_RE and persists", () => {
    const report = generateQualityReport(null as never, "static", 0.8, undefined, 0, ws);
    expect(RUN_ID_RE.test(report.runId)).toBe(true);
    expect(persistRun(ws, report, { sourcePath: ".", cacheHit: false })).toBeUndefined();
    expect(loadReport(ws, report.runId)?.runId).toBe(report.runId);
  });
});

describe("S-2 listSourceFiles realpath containment", () => {
  it("rejects a sourceRoot that is a junction/symlink to outside the workspace", async () => {
    const outside = path.join(base, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "leak.css"), "a{}");
    const link = path.join(ws, "link");
    try {
      fs.symlinkSync(outside, link, "junction");
    } catch (e) {
      console.warn(`SKIP S-2 junction: cannot create (${(e as Error).message})`);
      return;
    }
    await expect(listSourceFiles(link, { workspaceRoot: ws })).rejects.toThrow();
  });
  it("still lists a normal in-workspace directory", async () => {
    fs.mkdirSync(path.join(ws, "site"));
    fs.writeFileSync(path.join(ws, "site", "a.css"), "a{}");
    expect(await listSourceFiles(path.join(ws, "site"), { workspaceRoot: ws })).toEqual([path.join("site", "a.css")]);
  });
});
