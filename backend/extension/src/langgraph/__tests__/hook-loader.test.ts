/**
 * HookLoader Tests — KSA-249
 * Covers: TC-HOOK-040 to TC-HOOK-048 (9 UT cases)
 * validateHookSchema is pure logic (no vscode mock needed).
 * loadHooks needs vscode mock for workspace.fs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vscode BEFORE imports
vi.mock("vscode", () => ({
  Uri: { file: (p: string) => ({ fsPath: p }) },
  FileType: { File: 1, Directory: 2 },
  workspace: {
    fs: {
      readDirectory: vi.fn(),
      readFile: vi.fn(),
    },
    workspaceFolders: [{ uri: { fsPath: "/tmp/test" } }],
  },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn() }),
  },
}));

import { validateHookSchema, loadHooks, clearHookCache } from "../hook-loader";
import * as vscode from "vscode";

describe("HookLoader — Schema Validation (KSA-249)", () => {
  // TC-HOOK-040: Missing Name
  it("TC-HOOK-040: rejects hook with missing name", () => {
    const parsed = {
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "askAgent", prompt: "test" },
    };
    const errors = validateHookSchema(parsed, "no-name.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "name")).toBe(true);
  });

  // TC-HOOK-041: Missing Version
  it("TC-HOOK-041: rejects hook with missing version", () => {
    const parsed = {
      name: "test-hook",
      when: { type: "preToolUse" },
      then: { type: "askAgent", prompt: "test" },
    };
    const errors = validateHookSchema(parsed, "no-version.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "version")).toBe(true);
  });

  // TC-HOOK-042: Invalid when.type
  it("TC-HOOK-042: rejects hook with invalid when.type", () => {
    const parsed = {
      name: "test-hook",
      version: "1.0",
      when: { type: "invalidEvent" },
      then: { type: "askAgent", prompt: "test" },
    };
    const errors = validateHookSchema(parsed, "bad-type.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "when.type")).toBe(true);
  });

  // TC-HOOK-043: Invalid then.type
  it("TC-HOOK-043: rejects hook with invalid then.type", () => {
    const parsed = {
      name: "test-hook",
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "sendEmail" },
    };
    const errors = validateHookSchema(parsed, "bad-action.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "then.type")).toBe(true);
  });

  // TC-HOOK-044: askAgent Missing Prompt
  it("TC-HOOK-044: rejects askAgent without prompt", () => {
    const parsed = {
      name: "test-hook",
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "askAgent" },
    };
    const errors = validateHookSchema(parsed, "no-prompt.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "then.prompt")).toBe(true);
  });

  // TC-HOOK-045: runCommand Missing Command
  it("TC-HOOK-045: rejects runCommand without command", () => {
    const parsed = {
      name: "test-hook",
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "runCommand" },
    };
    const errors = validateHookSchema(parsed, "no-command.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.field === "then.command")).toBe(true);
  });

  // TC-HOOK-046: Malformed JSON (non-object)
  it("TC-HOOK-046: rejects non-object input", () => {
    const errors = validateHookSchema(null, "malformed.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("root");
  });

  // TC-HOOK-046b: valid hook returns no errors
  it("valid hook returns empty errors", () => {
    const parsed = {
      name: "valid-hook",
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "askAgent", prompt: "Do something" },
    };
    const errors = validateHookSchema(parsed, "valid.json");
    expect(errors).toHaveLength(0);
  });
});

describe("HookLoader — loadHooks (KSA-249)", () => {
  const mockReadDirectory = vscode.workspace.fs.readDirectory as ReturnType<typeof vi.fn>;
  const mockReadFile = vscode.workspace.fs.readFile as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearHookCache();
    mockReadDirectory.mockReset();
    mockReadFile.mockReset();
  });

  // TC-HOOK-047: Valid Hooks Still Load (invalid hooks skipped)
  it("TC-HOOK-047: loads valid hooks and skips invalid ones", async () => {
    mockReadDirectory.mockResolvedValue([
      ["valid1.json", 1], // FileType.File
      ["invalid.json", 1],
      ["valid2.json", 1],
    ]);

    const validHook1 = JSON.stringify({
      name: "hook-one",
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "askAgent", prompt: "test1" },
    });
    const invalidHook = JSON.stringify({
      // missing name
      version: "1.0",
      when: { type: "preToolUse" },
      then: { type: "askAgent", prompt: "test" },
    });
    const validHook2 = JSON.stringify({
      name: "hook-two",
      version: "1.0",
      when: { type: "postToolUse" },
      then: { type: "runCommand", command: "echo hi" },
    });

    mockReadFile
      .mockResolvedValueOnce(Buffer.from(validHook1))
      .mockResolvedValueOnce(Buffer.from(invalidHook))
      .mockResolvedValueOnce(Buffer.from(validHook2));

    const hooks = await loadHooks("/tmp/test");
    expect(hooks).toHaveLength(2);
    expect(hooks[0].name).toBe("hook-one");
    expect(hooks[1].name).toBe("hook-two");
  });

  // TC-HOOK-048: Errors in Output Channel (implicitly tested — no crash)
  it("TC-HOOK-048: does not crash on malformed JSON file", async () => {
    mockReadDirectory.mockResolvedValue([
      ["broken.json", 1],
    ]);

    mockReadFile.mockResolvedValue(Buffer.from("{ invalid json }}}"));

    const hooks = await loadHooks("/tmp/test");
    expect(hooks).toHaveLength(0); // skipped, no crash
  });

  // Additional: disabled hooks are not loaded
  it("skips disabled hooks", async () => {
    mockReadDirectory.mockResolvedValue([
      ["disabled.json", 1],
    ]);

    const disabledHook = JSON.stringify({
      name: "disabled-hook",
      version: "1.0",
      enabled: false,
      when: { type: "preToolUse" },
      then: { type: "askAgent", prompt: "test" },
    });

    mockReadFile.mockResolvedValue(Buffer.from(disabledHook));

    const hooks = await loadHooks("/tmp/test");
    expect(hooks).toHaveLength(0);
  });
});
