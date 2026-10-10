// Unit tests for the hidden ide_* MCP tools (SA4E-352).
//
// Registry-level verification only: registration count, hidden:true
// definitions, and error paths of IdeSessionManager — no real IDE is
// launched (postcondition: no spawned process).
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerLocalTool,
  isLocalTool,
  executeLocalTool,
  getLocalToolDefinitions,
} from "../../backend-local-tools";
import { registerIdeControlTools } from "../ide-control-tools";
import { IdeSessionManager, IdeLaunchError } from "../ide-session-manager";

const IDE_TOOL_NAMES = [
  "ide_launch",
  "ide_attach",
  "ide_list_sessions",
  "ide_screenshot",
  "ide_evaluate",
  "ide_inspect",
  "ide_close",
  "ide_current_executeCommand",
  "ide_current_openFile",
  "ide_current_getActiveTab",
  "ide_current_getWorkspace",
  "ide_current_getSelection",
  "ide_current_getSelectionText",
  "ide_current_runTask",
  "ide_current_screenshot",
];

describe("ide_* MCP tools — registry registration (SA4E-352)", () => {
  beforeEach(() => {
    registerIdeControlTools();
  });

  it("registers all 7 ide_* tools into the local tool registry", () => {
    for (const name of IDE_TOOL_NAMES) {
      expect(isLocalTool(name), `${name} must be a local tool`).toBe(true);
    }
  });

  it("marks every ide_* tool definition as hidden (find_tools-only convention)", () => {
    const defs = getLocalToolDefinitions().filter((d) =>
      d.name.startsWith("ide_"),
    );
    expect(defs.length).toBe(IDE_TOOL_NAMES.length);
    for (const def of defs) {
      expect(def.hidden, `${def.name} must be hidden:true`).toBe(true);
    }
  });

  it("ide_list_sessions executes locally and returns an empty session list", async () => {
    const result: any = await executeLocalTool("ide_list_sessions", {});
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it("ide_launch schema requires no fields and documents the ide enum", () => {
    const def = getLocalToolDefinitions().find((d) => d.name === "ide_launch");
    expect(def).toBeDefined();
    const props = (def!.inputSchema as any).properties;
    expect(props.ide.enum).toEqual(["code", "kiro", "antigravity", "kilo"]);
  });

  it("ide_close requires sessionId", () => {
    const def = getLocalToolDefinitions().find((d) => d.name === "ide_close");
    expect((def!.inputSchema as any).required).toEqual(["sessionId"]);
  });
});

describe("IdeSessionManager — error paths (no real IDE launched)", () => {
  let mgr: IdeSessionManager;

  beforeEach(() => {
    mgr = new IdeSessionManager();
  });

  it("ide_close rejects unknown session ids", async () => {
    await expect(mgr.close("ide-nope")).rejects.toBeInstanceOf(IdeLaunchError);
  });

  it("launch rejects a nonexistent ideBinaryPath (BR-01 fail-fast)", async () => {
    await expect(
      mgr.launch("code", "Z:/does/not/exist/Code.exe"),
    ).rejects.toBeInstanceOf(IdeLaunchError);
  });

  it("attach rejects when no session and no cdpEndpoint are given", async () => {
    await expect(mgr.attach("ide-nope")).rejects.toBeInstanceOf(IdeLaunchError);
  });

  it("operations reject for a session that is not attached", async () => {
    registerLocalTool("ide_test_probe", async () => ({}), {
      name: "ide_test_probe",
      description: "probe",
      inputSchema: {},
      hidden: true,
    });
    await expect(mgr.screenshot("ide-nope")).rejects.toBeInstanceOf(IdeLaunchError);
    await expect(mgr.evaluate("ide-nope", "1+1")).rejects.toBeInstanceOf(IdeLaunchError);
    await expect(mgr.inspect("ide-nope")).rejects.toBeInstanceOf(IdeLaunchError);
  });

  it("session ids are unique per launch", async () => {
    mgr.launch = async () => {
      throw new Error("not used in this test");
    };
    expect(mgr.listSessions()).toEqual([]);
  });
});
