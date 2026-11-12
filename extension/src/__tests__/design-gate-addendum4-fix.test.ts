/**
 * SA4E-393 Addendum 4 — regression tests for E2E D6 findings F-1/F-2/F-3.
 * F-1: report carries the real scanned fileCount.
 * F-2: cache hit keeps real fileCount → `both` score == `static` score (no false PASS).
 * F-3: nonexistent source_path never leaks the absolute workspace root.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { generateQualityReport } from "../slash/report.generator";
import { mapReportToPayload } from "../tools/design-gate/design-gate-payload";
import { resolveSourceRoot } from "../tools/design-gate/design-gate-resolve";
import { cacheResult } from "../slash/detection.cache";
import { ImpeccableIntegrationService } from "../slash/integration.service";

let ws: string;

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "dg-a4-"));
  delete process.env.WORKSPACE_ROOT; // SEC-F08: the root is passed explicitly, env must not matter
  fs.mkdirSync(path.join(ws, "fixture"));
});

afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
});

const high = (file: string) => ({
  findingId: "f", runId: "r", mode: "static" as const, file,
  severity: "high" as const, message: "m", line: 1,
});
const lows = (n: number) => Array.from({ length: n }, (_, i) => ({
  ...high("bad.css"), findingId: `l${i}`, severity: "low" as const,
}));

describe("F-1 fileCount in payload", () => {
  it("reports the real scanned file count, not 0", () => {
    const report = generateQualityReport([high("bad.html")], "static", 0.8, undefined, 3);
    const payload = JSON.parse(mapReportToPayload(report, "static", 200));
    expect(payload.fileCount).toBe(3);
  });
});

describe("F-2 cache hit must not corrupt score", () => {
  it("both-after-static (cache hit) score equals static score", async () => {
    const dir = path.join(ws, "fixture");
    const findings = [high("bad.html"), ...lows(21)]; // 22 findings, 3 files
    cacheResult(ws, dir, "static", { findings, fileCount: 3, durationMs: 1, cacheHit: false, partial: false }, "run_1_a");
    const svc = new ImpeccableIntegrationService();
    const stat = await svc.runStaticDetection(dir, { workspaceRoot: ws });
    expect(stat.result.fileCount).toBe(3);
    expect(stat.report.score).toBeCloseTo(0.6667, 3);
    const both = await svc.runFullDetection(dir, "http://evil.example", [], { detectionMode: "both", workspaceRoot: ws });
    expect(both.report.score).toBeCloseTo(stat.report.score, 4);
    expect(both.report.pass).toBe(false);
  });

  it("legacy cache entry without fileCount is a miss, not findings.length", async () => {
    const dir = path.join(ws, "legacy");
    fs.mkdirSync(dir);
    cacheResult(ws, dir, "static", { findings: lows(5), durationMs: 1, cacheHit: false, partial: false } as any, "run_1_b");
    const r = await new ImpeccableIntegrationService().runStaticDetection(dir, { workspaceRoot: ws });
    expect(r.result.cacheHit).toBe(false);
    expect(r.result.fileCount).not.toBe(5);
  });
});

describe("F-3 nonexistent path leaks no absolute path", () => {
  it("resolveSourceRoot returns relative-only error (regex chars safe)", () => {
    const r = resolveSourceRoot("a(b[c*+?^$", ws);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(ws);
      expect(r.message).toContain("a(b[c*+?^$");
    }
  });

  it("service error message is workspace-relative", async () => {
    const r = await new ImpeccableIntegrationService().runStaticDetection(path.join(ws, "nope"), { cacheReuse: false, workspaceRoot: ws });
    expect(r.report.message).not.toContain(ws);
    expect(r.report.message).toContain("nope");
  });
});
