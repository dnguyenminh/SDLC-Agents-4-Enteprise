/**
 * SA4E-393 bug: design-gate pipeline silently fell back to process.cwd()
 * (via getWorkspaceRoot()) and wrote <cwd>/.code-intel/design-gate.
 * Contract: the workspace root is REQUIRED; a missing root throws a typed
 * "workspace root required" error and nothing is created in process.cwd().
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { listSourceFiles } from "../slash/file-lister";
import { generateQualityReport } from "../slash/report.generator";
import { persistRun, saveReport } from "../slash/report.store";
import { ImpeccableIntegrationService } from "../slash/integration.service";
import { runDetection } from "../slash";
import { isPathSafe } from "../slash/path-guard";
import { DetectionError, DetectionErrorException, QualityReport } from "../slash/types";

const REQUIRED = /workspace root required/i;
const noRoot = undefined as unknown as string;

function sampleReport(): QualityReport {
  return generateQualityReport([], "static", 0.8, undefined, 0, os.tmpdir());
}

describe("design-gate: workspace root is required (no cwd/env fallback)", () => {
  let cwdBefore: string;
  let emptyDir: string;
  let envBefore: string | undefined;

  beforeEach(() => {
    cwdBefore = process.cwd();
    envBefore = process.env.WORKSPACE_ROOT;
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "dg-nocwd-"));
    process.env.WORKSPACE_ROOT = emptyDir; // must be ignored, not honoured
    process.chdir(emptyDir);
  });

  afterEach(() => {
    process.chdir(cwdBefore);
    if (envBefore === undefined) delete process.env.WORKSPACE_ROOT;
    else process.env.WORKSPACE_ROOT = envBefore;
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  function expectNoStore(): void {
    expect(fs.existsSync(path.join(process.cwd(), ".code-intel"))).toBe(false);
  }

  function expectTyped(fn: () => unknown): void {
    try { fn(); } catch (e) {
      expect(e).toBeInstanceOf(DetectionErrorException);
      expect((e as DetectionErrorException).code).toBe(DetectionError.WORKSPACE_ROOT_REQUIRED);
      expect((e as Error).message).toMatch(REQUIRED);
      return;
    }
    throw new Error("expected a throw");
  }

  async function expectRejectsTyped(p: Promise<unknown>): Promise<void> {
    await expect(p).rejects.toMatchObject({ code: DetectionError.WORKSPACE_ROOT_REQUIRED });
    await p.catch((e) => expect(e.message).toMatch(REQUIRED));
  }

  it("listSourceFiles without workspaceRoot throws", async () => {
    // @ts-expect-error WHY: deliberately omits the now-required workspaceRoot to exercise the runtime guard (JS/any callers).
    await expectRejectsTyped(listSourceFiles(emptyDir, {}));
    expectNoStore();
  });

  it("generateQualityReport without workspaceRoot throws", () => {
    expectTyped(() => generateQualityReport([], "static", 0.8, undefined, 0, noRoot));
    expectNoStore();
  });

  it("persistRun / saveReport without root throw and create nothing", () => {
    const report = sampleReport();
    const meta = { sourcePath: ".", cacheHit: false };
    expectTyped(() => persistRun(noRoot, report, meta));
    expectTyped(() => saveReport(noRoot, report, meta));
    expectNoStore();
  });

  it("isPathSafe without root throws", () => {
    expectTyped(() => isPathSafe("a.css", noRoot));
  });

  it("service entry points without workspaceRoot throw", async () => {
    const svc = new ImpeccableIntegrationService();
    // @ts-expect-error WHY: deliberately omits the now-required workspaceRoot to exercise the runtime guard (JS/any callers).
    await expectRejectsTyped(svc.runStaticDetection(emptyDir, {}));
    // @ts-expect-error WHY: deliberately omits the now-required workspaceRoot to exercise the runtime guard (JS/any callers).
    await expectRejectsTyped(svc.runRenderedDetection("http://localhost:1", [], {}));
    // @ts-expect-error WHY: deliberately omits the now-required workspaceRoot to exercise the runtime guard (JS/any callers).
    await expectRejectsTyped(svc.runFullDetection(emptyDir, "http://localhost:1", [], {}));
    expectTyped(() => svc.getReport("run_1_a", undefined as unknown as string));
    expectTyped(() => svc.listReports(undefined as unknown as string));
    expectNoStore();
  });

  it("runDetection without workspaceRoot throws (no process.cwd() default)", async () => {
    // @ts-expect-error WHY: deliberately omits the now-required workspaceRoot to exercise the runtime guard (JS/any callers).
    await expectRejectsTyped(runDetection({ detectionMode: "static", sourceRoot: emptyDir }));
    expectNoStore();
  });
});
