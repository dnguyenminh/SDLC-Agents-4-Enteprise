/**
 * BUG-SA4E-393 — design_gate_run / design_gate_list_rules must work in the
 * wrapper-server context (execute_dynamic_tool → LOCAL_TOOL_REGISTRY) where
 * NO global `vscode` identifier exists (esbuild CJS bundle: `vscode` is only
 * reachable through require("vscode")).
 *
 * Real handlers + real detection pipeline (nothing from ../slash is mocked).
 * The ONLY seam replaced is the VS Code workspace boundary
 * (PathResolver.defaultWorkspaceRootProvider), because require("vscode")
 * cannot resolve outside the extension host — asserted below.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";

/** Live-workspace stub: what vscode.workspace.workspaceFolders[0] would return. */
const boundary = vi.hoisted(() => ({ root: undefined as string | undefined }));
vi.mock("../services/PathResolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/PathResolver")>()),
  defaultWorkspaceRootProvider: () => boundary.root,
}));

import { handleDesignGateRun, handleDesignGateListRules } from "../tools/design-gate/design-gate-tool";
import { initDesignGateEnv } from "../tools/design-gate/design-gate-env";

/** Extension install root (contains resources/wasm/detector.wasm). */
const EXTENSION_ROOT = path.resolve(__dirname, "..", "..");

describe("BUG-SA4E-393: design gate without global vscode", () => {
  let ws: string;

  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "dg-novscode-"));
    fs.writeFileSync(path.join(ws, "a.html"), "<html><body><p>hi</p></body></html>");
  });

  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  beforeEach(() => {
    // Wrapper context: no global vscode, no env pre-seeded by activation/router.
    delete (globalThis as any).vscode;
    delete process.env.WORKSPACE_ROOT;
    delete process.env.IMPPECABLE_SKILL_PATH;
    boundary.root = ws;
    initDesignGateEnv(EXTENSION_ROOT);
  });

  it("BUG-SA4E-393: precondition — no global vscode and require('vscode') fails", () => {
    expect((globalThis as any).vscode).toBeUndefined();
    expect(() => createRequire(__filename)("vscode")).toThrow();
  });

  it("BUG-SA4E-393: design_gate_list_rules works without vscode", () => {
    const res: any = handleDesignGateListRules({});
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.content[0].text).ruleCount).toBe(30);
  });

  it("BUG-SA4E-393: design_gate_run (static) runs the real pipeline without vscode", async () => {
    const res: any = await handleDesignGateRun({ mode: "static" });
    expect(res.content[0].text).not.toMatch(/vscode is not defined/);
    expect(res.isError).toBe(false);
    const payload = JSON.parse(res.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.runId).toMatch(/^run_/);
    expect(payload.detectionMode).toBe("static");
    // WASM resolved from the EXTENSION path, never from the workspace root.
    expect(process.env.IMPPECABLE_SKILL_PATH).toBe(path.join(EXTENSION_ROOT, "resources", "wasm", "detector.wasm"));
  });

  it("BUG-SA4E-393: no workspace open → typed tool error, not ReferenceError", async () => {
    boundary.root = undefined;
    const res: any = await handleDesignGateRun({ mode: "static" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("No workspace folder open");
  });

  it("BUG-SA4E-393: regression guard — no bare `declare const vscode` in shipped source", () => {
    const offenders = listSourceFiles(path.join(EXTENSION_ROOT, "src"))
      .filter((f) => /declare\s+(const|let|var)\s+vscode\b/.test(fs.readFileSync(f, "utf-8")));
    expect(offenders).toEqual([]);
  });
});

/** Recursively list non-test .ts files (tests may legitimately stub globals). */
function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "test" ? [] : listSourceFiles(full);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [full] : [];
  });
}
