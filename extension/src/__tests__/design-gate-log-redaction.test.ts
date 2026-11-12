/**
 * SA4E-393 Addendum 4 (SEC-F03 follow-up) — host logs (console.error) must not
 * leak absolute filesystem paths, same as the tool response.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const boundary = vi.hoisted(() => ({ root: undefined as string | undefined }));
vi.mock("../services/PathResolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/PathResolver")>()),
  defaultWorkspaceRootProvider: () => boundary.root,
}));

// The failure path needs a pipeline that throws with the workspace path in message AND stack.
vi.mock("../slash", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../slash")>()),
  runDetection: vi.fn(async () => { throw new Error(`cannot read ${boundary.root}${path.sep}site${path.sep}a.css`); }),
}));
import { handleDesignGateRun } from "../tools/design-gate/design-gate-tool";
import { initDesignGateEnv } from "../tools/design-gate/design-gate-env";
import { ImpeccableIntegrationService } from "../slash/integration.service";
import { cacheResult } from "../slash/detection.cache";

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..");
const DRIVE_PATH = /[A-Za-z]:[\\/]/;
let ws: string;
let spy: ReturnType<typeof vi.spyOn>;
let prevSkill: string | undefined;

const logged = () => spy.mock.calls.map((c) => c.map((a) => String(a)).join(" ")).join("\n");
function expectNoAbsolutePath(text: string): void {
  expect(text).not.toContain(ws);
  expect(text).not.toMatch(DRIVE_PATH);
}

beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "dg-log-"));
  prevSkill = process.env.IMPPECABLE_SKILL_PATH;
  process.env.IMPPECABLE_SKILL_PATH = path.join(ws, "missing", "detector.wasm");
  spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  boundary.root = ws;
  initDesignGateEnv(EXTENSION_ROOT);
});
afterEach(() => {
  spy.mockRestore();
  if (prevSkill === undefined) delete process.env.IMPPECABLE_SKILL_PATH; else process.env.IMPPECABLE_SKILL_PATH = prevSkill;
  fs.rmSync(ws, { recursive: true, force: true });
});

describe("console.error never carries an absolute path", () => {
  it("loadDetector with a missing wasm (wasm.loader / service load path)", async () => {
    const res = await new ImpeccableIntegrationService().loadDetector({ workspaceRoot: ws });
    expect(res.loadStatus).toBe("error");
    expect(spy).toHaveBeenCalled();
    expectNoAbsolutePath(logged());
    expectNoAbsolutePath(res.message);
  });

  it("detection.cache write failure (node error message embeds the path)", () => {
    fs.writeFileSync(path.join(ws, ".code-intel"), "blocked");
    cacheResult(ws, path.join(ws, "site"), "static",
      { findings: [], fileCount: 0, durationMs: 1, cacheHit: false, partial: false }, "run_1_a");
    expect(spy).toHaveBeenCalled();
    expectNoAbsolutePath(logged());
  });

  it("design_gate_run failure log (message AND stack)", async () => {
    delete process.env.WORKSPACE_ROOT;
    const res: any = await handleDesignGateRun({ mode: "static" });
    expect(res.isError).toBe(true);
    expect(spy).toHaveBeenCalled();
    expectNoAbsolutePath(logged());
    expectNoAbsolutePath(res.content[0].text);
  });
});
