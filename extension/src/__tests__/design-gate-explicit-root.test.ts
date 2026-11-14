/**
 * SA4E-393 Addendum 4 (SEC-F08) — workspace root is passed EXPLICITLY
 * (DetectionConfig.workspaceRoot), never through process-global env.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const boundary = vi.hoisted(() => ({ root: undefined as string | undefined }));
vi.mock("../services/PathResolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/PathResolver")>()),
  defaultWorkspaceRootProvider: () => boundary.root,
}));

import { handleDesignGateRun } from "../tools/design-gate/design-gate-tool";
import { initDesignGateEnv } from "../tools/design-gate/design-gate-env";
import { runDetection } from "../slash";
import { resolveWasmPath } from "../slash/detector-env";
import { generateQualityReport } from "../slash/report.generator";

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..");
const BAD_HTML = '<html><body><img src="x.png"></body></html>';

function makeWs(prefix: string, fileName: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(ws, fileName), BAD_HTML);
  return ws;
}

describe("(a) design_gate_run does not write process-global WORKSPACE_ROOT", () => {
  let ws: string;
  beforeAll(() => { ws = makeWs("dg-env-", "a.html"); });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));
  beforeEach(() => {
    delete process.env.WORKSPACE_ROOT;
    boundary.root = ws;
    initDesignGateEnv(EXTENSION_ROOT);
  });

  it("env stays unset after a successful run, and the run still resolves the root", async () => {
    const res: any = await handleDesignGateRun({ mode: "static" });
    expect(res.isError).toBe(false);
    expect(process.env.WORKSPACE_ROOT).toBeUndefined();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.fileCount).toBe(1);
    expect(fs.existsSync(path.join(ws, ".code-intel", "design-gate", `${payload.runId}.json`))).toBe(true);
  });
});

describe("(b) two workspaces in parallel never mix cache / report / paths", () => {
  let wsA: string;
  let wsB: string;
  beforeAll(() => {
    wsA = makeWs("dg-par-A-", "only-in-a.html");
    wsB = makeWs("dg-par-B-", "only-in-b.html");
    delete process.env.WORKSPACE_ROOT;
    resolveWasmPath(EXTENSION_ROOT);
  });
  afterAll(() => {
    fs.rmSync(wsA, { recursive: true, force: true });
    fs.rmSync(wsB, { recursive: true, force: true });
  });

  it("each run sees only its own files and writes only under its own root", async () => {
    const run = (root: string) =>
      runDetection({ detectionMode: "static", sourceRoot: root, workspaceRoot: root, cacheReuse: true });
    const [ra, rb] = await Promise.all([run(wsA), run(wsB)]);
    expect(ra.report.findings.length).toBeGreaterThan(0);
    expect(ra.report.findings.every((f) => f.file === "only-in-a.html")).toBe(true);
    expect(rb.report.findings.every((f) => f.file === "only-in-b.html")).toBe(true);
    const rec = (root: string, id: string) => path.join(root, ".code-intel", "design-gate", `${id}.json`);
    expect(fs.existsSync(rec(wsA, ra.report.runId))).toBe(true);
    expect(fs.existsSync(rec(wsB, rb.report.runId))).toBe(true);
    expect(fs.existsSync(rec(wsA, rb.report.runId))).toBe(false);
    expect(fs.existsSync(rec(wsB, ra.report.runId))).toBe(false);
    expect(process.env.WORKSPACE_ROOT).toBeUndefined();
  });
});

describe("(c) report.generator relativises against the root it is given", () => {
  it("absolute file under the passed root → relative; env/cwd are ignored", () => {
    delete process.env.WORKSPACE_ROOT;
    const root = path.join(os.tmpdir(), "dg-report-root");
    const finding = { findingId: "f1", runId: "", mode: "static" as const, file: path.join(root, "sub", "a.css"), severity: "high" as const, message: "m", line: 1 };
    const report = generateQualityReport([finding], "static", 0.8, undefined, 1, root);
    expect(report.findings[0].file).toBe(path.join("sub", "a.css"));
  });

  it("absolute file outside the passed root → unknown", () => {
    const root = path.join(os.tmpdir(), "dg-report-root");
    const outside = { findingId: "f2", runId: "", mode: "static" as const, file: path.join(os.tmpdir(), "elsewhere", "a.css"), severity: "high" as const, message: "m", line: 1 };
    expect(generateQualityReport([outside], "static", 0.8, undefined, 1, root).findings[0].file).toBe("unknown");
  });
});
