/**
 * HookCommands Tests — KSA-249
 * Covers: TC-HOOK-001 to TC-HOOK-005 (5 IT cases)
 * Mocks: vscode.commands, vscode.window, loadHooks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vscode — all mocks inline to avoid hoisting issues
vi.mock("vscode", () => {
  const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
  const appendLine = vi.fn();
  return {
    Uri: { file: (p: string) => ({ fsPath: p }) },
    FileType: { File: 1, Directory: 2 },
    workspace: {
      fs: {
        readDirectory: vi.fn().mockResolvedValue([]),
        readFile: vi.fn(),
      },
      workspaceFolders: [{ uri: { fsPath: "/tmp/test" } }],
    },
    window: {
      createOutputChannel: () => ({ appendLine }),
      setStatusBarMessage: vi.fn(),
      showWarningMessage: vi.fn(),
    },
    commands: {
      registerCommand,
    },
  };
});

// Mock loadHooks
vi.mock("../hook-loader", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    loadHooks: vi.fn().mockResolvedValue([]),
  };
});

import { HookCommands } from "../hook-commands";
import { loadHooks } from "../hook-loader";
import type { HookDefinition } from "../hook-loader";
import * as vscode from "vscode";

const mockLoadHooks = loadHooks as ReturnType<typeof vi.fn>;
const mockRegisterCommand = vscode.commands.registerCommand as ReturnType<typeof vi.fn>;

function makeUserTriggeredHook(name: string, enabled = true, actionType: "askAgent" | "runCommand" = "askAgent"): HookDefinition {
  return {
    name,
    version: "1.0",
    enabled,
    when: { type: "userTriggered" },
    then: actionType === "askAgent"
      ? { type: "askAgent", prompt: `Execute ${name}` }
      : { type: "runCommand", command: "echo hello" },
    filePath: `.kiro/hooks/${name}.json`,
  };
}

describe("HookCommands (KSA-249)", () => {
  let hookCommands: HookCommands;
  let outputAppendLine: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRegisterCommand.mockClear();
    mockRegisterCommand.mockReturnValue({ dispose: vi.fn() });
    mockLoadHooks.mockReset();
    outputAppendLine = vi.fn();
    hookCommands = new HookCommands("/tmp/test", { appendLine: outputAppendLine } as any);
  });

  // TC-HOOK-001: userTriggered Command Registration
  describe("TC-HOOK-001: command registration", () => {
    it("registers VS Code command for userTriggered hook", async () => {
      const hook = makeUserTriggeredHook("My Hook");
      mockLoadHooks.mockResolvedValue([hook]);

      await hookCommands.registerCommands();

      expect(mockRegisterCommand).toHaveBeenCalledWith(
        "kiro-sdlc.hook.my-hook",
        expect.any(Function)
      );
    });

    it("sanitizes hook name to valid command ID", async () => {
      const hook = makeUserTriggeredHook("Complex Hook Name!!!");
      mockLoadHooks.mockResolvedValue([hook]);

      await hookCommands.registerCommands();

      expect(mockRegisterCommand).toHaveBeenCalledWith(
        "kiro-sdlc.hook.complex-hook-name",
        expect.any(Function)
      );
    });
  });

  // TC-HOOK-002: userTriggered Disabled Hook Not Registered
  describe("TC-HOOK-002: disabled hook not registered", () => {
    it("does not register command for disabled hook", async () => {
      const hook = makeUserTriggeredHook("Disabled Hook", false);
      mockLoadHooks.mockResolvedValue([hook]);

      await hookCommands.registerCommands();

      expect(mockRegisterCommand).not.toHaveBeenCalled();
    });
  });

  // TC-HOOK-003: userTriggered askAgent Execution
  describe("TC-HOOK-003: askAgent execution via command", () => {
    it("executes askAgent when command is invoked", async () => {
      const hook = makeUserTriggeredHook("Ask Hook", true, "askAgent");
      mockLoadHooks.mockResolvedValue([hook]);

      await hookCommands.registerCommands();

      // Get the registered callback
      const callback = mockRegisterCommand.mock.calls[0][1];
      await callback();

      // Should log execution
      expect(outputAppendLine).toHaveBeenCalledWith(
        expect.stringContaining("Ask Hook")
      );
    });
  });

  // TC-HOOK-004: userTriggered runCommand Execution
  describe("TC-HOOK-004: runCommand execution via command", () => {
    it("executes runCommand when command is invoked", async () => {
      const hook = makeUserTriggeredHook("Run Hook", true, "runCommand");
      mockLoadHooks.mockResolvedValue([hook]);

      await hookCommands.registerCommands();

      const callback = mockRegisterCommand.mock.calls[0][1];
      await callback();

      expect(outputAppendLine).toHaveBeenCalledWith(
        expect.stringContaining("Run Hook")
      );
    });
  });

  // TC-HOOK-005: Hook Refresh on File Change (dispose + re-register)
  describe("TC-HOOK-005: refresh disposes old and re-registers", () => {
    it("disposes previous commands before re-registering", async () => {
      const disposeFn = vi.fn();
      mockRegisterCommand.mockReturnValue({ dispose: disposeFn });

      const hook1 = makeUserTriggeredHook("Hook A");
      mockLoadHooks.mockResolvedValue([hook1]);

      // First registration
      await hookCommands.registerCommands();
      expect(mockRegisterCommand).toHaveBeenCalledTimes(1);

      // Second registration (simulates refresh)
      const hook2 = makeUserTriggeredHook("Hook B");
      mockLoadHooks.mockResolvedValue([hook1, hook2]);

      await hookCommands.registerCommands();

      // Old disposable should have been disposed
      expect(disposeFn).toHaveBeenCalled();
      // New commands registered
      expect(mockRegisterCommand).toHaveBeenCalledTimes(3); // 1 + 2
    });
  });

  // getRegisteredCommands
  describe("getRegisteredCommands", () => {
    it("returns list of registered command IDs", async () => {
      mockLoadHooks.mockResolvedValue([
        makeUserTriggeredHook("Hook One"),
        makeUserTriggeredHook("Hook Two"),
      ]);

      const commands = await hookCommands.getRegisteredCommands();
      expect(commands).toContain("kiro-sdlc.hook.hook-one");
      expect(commands).toContain("kiro-sdlc.hook.hook-two");
    });
  });

  // dispose
  describe("dispose", () => {
    it("disposes all registered commands", async () => {
      const disposeFn = vi.fn();
      mockRegisterCommand.mockReturnValue({ dispose: disposeFn });

      mockLoadHooks.mockResolvedValue([makeUserTriggeredHook("Test")]);
      await hookCommands.registerCommands();

      hookCommands.dispose();
      expect(disposeFn).toHaveBeenCalled();
    });
  });
});
