/**
 * SA4E-370 S1: dir-watchers unit tests — hot-reload for agent files.
 * The watcher itself is unchanged (SA4E-189); this test verifies the
 * agent watcher configuration targets .code-intel/agents/*.md and that
 * onFire triggers re-discovery.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockOnDidCreate = vi.fn();
const mockOnDidChange = vi.fn();
const mockOnDidDelete = vi.fn();
const mockDispose = vi.fn();

vi.mock("vscode", () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: mockOnDidCreate,
      onDidChange: mockOnDidChange,
      onDidDelete: mockOnDidDelete,
      dispose: mockDispose,
    })),
  },
  RelativePattern: class {
    constructor(_workspaceRoot: string, public pattern: string) {}
  },
}));

vi.mock("../../../debug-logger", () => ({
  debugLog: vi.fn(),
}));

import { createAgentWatcher } from "../dir-watchers";
import * as vscode from "vscode";

// Real temp workspace — WorkspaceDirWatcher.start() only wires the watcher
// when `<root>/.code-intel/<dir>` actually exists (fs.existsSync guard).
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-dir-watchers-"));
fs.mkdirSync(path.join(ROOT, ".code-intel", "agents"), { recursive: true });

describe("createAgentWatcher (S1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  it("watches .code-intel/agents/*.md for create/change/delete events", () => {
    const onFire = vi.fn();
    const watcher = createAgentWatcher(ROOT, onFire);
    watcher.start();

    expect(mockOnDidCreate).toHaveBeenCalledTimes(1);
    expect(mockOnDidChange).toHaveBeenCalledTimes(1);
    expect(mockOnDidDelete).toHaveBeenCalledTimes(1);

    const createWatcher = vi.mocked(vscode.workspace.createFileSystemWatcher);
    const watcherArg = createWatcher.mock.calls[0][0];
    expect(watcherArg.pattern).toContain("agents");
    expect(watcherArg.pattern).toContain("*.md");

    watcher.dispose();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("onFire is debounced (~300ms)", () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const watcher = createAgentWatcher(ROOT, onFire);
    watcher.start();

    const handler = mockOnDidChange.mock.calls[0][0];
    handler();
    handler();
    handler();

    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onFire).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    watcher.dispose();
  });
});
