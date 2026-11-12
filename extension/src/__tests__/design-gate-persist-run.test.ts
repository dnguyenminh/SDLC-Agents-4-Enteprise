/**
 * SA4E-393 Addendum 4 (SEC-F04/F05) — every runId handed to the agent maps to
 * a {runId}.json report record (BR-12); cache lives apart under cache/.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ImpeccableIntegrationService } from "../slash/integration.service";
import { cacheResult, clearAllCache } from "../slash/detection.cache";

let ws: string;
let prev: string | undefined;
const dgDir = () => path.join(ws, ".code-intel", "design-gate");
const readRec = (id: string) => JSON.parse(fs.readFileSync(path.join(dgDir(), `${id}.json`), "utf-8"));
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "dg-persist-"));
  prev = process.env.WORKSPACE_ROOT;
  process.env.WORKSPACE_ROOT = ws;
  fs.mkdirSync(path.join(ws, "site"));
});
afterEach(() => {
  if (prev === undefined) delete process.env.WORKSPACE_ROOT; else process.env.WORKSPACE_ROOT = prev;
  fs.rmSync(ws, { recursive: true, force: true });
});

describe("(a) runId in the returned report has a record on disk — all modes", () => {
  for (const mode of ["static", "rendered", "both"] as const) {
    it(`mode=${mode}`, async () => {
      const svc = new ImpeccableIntegrationService();
      const r = await svc.runFullDetection(path.join(ws, "site"), "http://evil.example", [], { detectionMode: mode });
      expect(readRec(r.report.runId).report.runId).toBe(r.report.runId);
      expect(svc.getReport(r.report.runId)?.runId).toBe(r.report.runId);
    });
  }
});

describe("(b) cache-hit gets a fresh runId + record with sourceRunId", () => {
  it("second static call", async () => {
    const svc = new ImpeccableIntegrationService();
    const dir = path.join(ws, "site");
    const first = await svc.runStaticDetection(dir);
    const second = await svc.runStaticDetection(dir);
    expect(second.result.cacheHit).toBe(true);
    expect(second.report.runId).not.toBe(first.report.runId);
    const rec = readRec(second.report.runId);
    expect(rec.cacheHit).toBe(true);
    expect(rec.sourceRunId).toBe(first.report.runId);
  });
});

describe("(c) no absolute workspace path is written", () => {
  it("all files under .code-intel/design-gate are relative-only", async () => {
    const svc = new ImpeccableIntegrationService();
    await svc.runStaticDetection(path.join(ws, "site"));
    const files = walk(dgDir());
    expect(files.length).toBeGreaterThan(1); // record + cache entry
    const esc = JSON.stringify(ws).slice(1, -1);
    for (const f of files) {
      const txt = fs.readFileSync(f, "utf-8");
      expect(txt.includes(ws) || txt.includes(esc)).toBe(false);
    }
  });
});

describe("(c2) D1 — real findings: nothing absolute on disk, cache hit stays correct", () => {
  const writeFixture = () => {
    fs.writeFileSync(path.join(ws, "site", "a.css"), "body{font-family: Inter, sans-serif;}\n");
    fs.writeFileSync(path.join(ws, "site", "b.css"), "p{color:red}\n");
  };

  const loaded = async () => {
    process.env.IMPPECABLE_SKILL_PATH = path.resolve(__dirname, "..", "..", "resources", "wasm", "detector.wasm");
    const svc = new ImpeccableIntegrationService();
    expect((await svc.loadDetector({ workspaceRoot: ws })).loadStatus).toBe("success");
    return svc;
  };
  afterEach(() => { delete process.env.IMPPECABLE_SKILL_PATH; });

  it("report record + cache entry contain no absolute/root string; findings are relative", async () => {
    writeFixture();
    const svc = await loaded();
    const first = await svc.runStaticDetection(path.join(ws, "site"));
    expect(first.result.findings.length).toBeGreaterThan(0); // fixture really has a finding
    const files = walk(dgDir());
    expect(files.some((f) => f.includes(`${path.sep}cache${path.sep}`))).toBe(true);
    expect(files.length).toBeGreaterThan(1);
    const esc = JSON.stringify(ws).slice(1, -1);
    for (const f of files) {
      const txt = fs.readFileSync(f, "utf-8");
      expect(txt.includes(ws) || txt.includes(esc) || txt.toLowerCase().includes(ws.toLowerCase())).toBe(false);
    }
    const entry = walk(path.join(dgDir(), "cache")).map((f) => JSON.parse(fs.readFileSync(f, "utf-8")))[0];
    for (const f of entry.result.findings) expect(path.isAbsolute(f.file)).toBe(false);
  });

  it("cache hit returns same findings/fileCount with relative paths", async () => {
    writeFixture();
    const svc = await loaded();
    const first = await svc.runStaticDetection(path.join(ws, "site"));
    expect(first.result.findings.length).toBeGreaterThan(0);
    const second = await svc.runStaticDetection(path.join(ws, "site"));
    expect(second.result.cacheHit).toBe(true);
    expect(second.result.fileCount).toBe(first.result.fileCount);
    expect(second.result.findings.length).toBe(first.result.findings.length);
    for (const f of second.result.findings) expect(path.isAbsolute(f.file)).toBe(false);
  });
});

describe("(e) getReport rejects traversal without reading outside", () => {
  it("returns undefined for hostile ids even when the target exists", () => {
    fs.mkdirSync(dgDir(), { recursive: true });
    const body = JSON.stringify({ runId: "x", result: { findings: [], fileCount: 1 }, report: { runId: "x" } });
    fs.writeFileSync(path.join(ws, ".code-intel", "secret.json"), body);
    fs.writeFileSync(path.join(ws, "x.json"), body);
    const svc = new ImpeccableIntegrationService();
    for (const id of ["../secret", "../../x", "run_1_a/../../x", "run_1_A", "", "run_1_a\0"]) {
      expect(svc.getReport(id)).toBeUndefined();
    }
  });
});

describe("(f) clearAllCache never touches workspace-root json", () => {
  it("keeps package.json, removes cache entries", () => {
    fs.writeFileSync(path.join(ws, "package.json"), "{}");
    cacheResult(ws, path.join(ws, "site"), "static",
      { findings: [], fileCount: 0, durationMs: 1, cacheHit: false, partial: false }, "run_1_a");
    clearAllCache(ws);
    expect(fs.existsSync(path.join(ws, "package.json"))).toBe(true);
    const cacheDir = path.join(dgDir(), "cache");
    expect(fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json")) : []).toEqual([]);
  });
});

describe("(g) legacy / fileCount-less entries are a miss", () => {
  it("entry without fileCount and stray top-level {sha}.json are ignored", async () => {
    fs.mkdirSync(dgDir(), { recursive: true });
    fs.writeFileSync(path.join(dgDir(), "a".repeat(64) + ".json"), JSON.stringify({ result: { findings: [] } }));
    cacheResult(ws, path.join(ws, "site"), "static",
      { findings: [], durationMs: 1, cacheHit: false, partial: false } as never, "run_1_a");
    const r = await new ImpeccableIntegrationService().runStaticDetection(path.join(ws, "site"));
    expect(r.result.cacheHit).toBe(false);
  });
});

describe("write failure is surfaced, not swallowed", () => {
  it("adds 'report not persisted' to the report message", async () => {
    fs.writeFileSync(path.join(ws, ".code-intel"), "blocked");
    const r = await new ImpeccableIntegrationService().runStaticDetection(path.join(ws, "site"));
    expect(r.report.message ?? "").toMatch(/not persisted/i);
  });
});
