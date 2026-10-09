/**
 * Regression test — fetchPegaContext must keep the HELD project id.
 *
 * Bug: the command re-derived the id via deriveProjectId(root) and overwrote
 * the held one. When `root` was a temp folder created by the LLM (no
 * project.json, no git remote), the derivation minted a random uuid-hash id
 * and overwrote the held id — so every later ingest (which correctly uses
 * getProjectId()) posted under a phantom project (row 3e268111b055).
 *
 * Fix: the command only READS the held id (getProjectId). PegaContextClient
 * .persistProjectId already persists + sets the Pega app id on success.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { registerCommands } from "../commands/CommandRegistrar";

const registered = vi.hoisted(() => new Map<string, () => unknown>());
const extensionMocks = vi.hoisted(() => ({
  getProjectId: vi.fn(() => "held-id-123"),
  setProjectId: vi.fn(),
  deriveProjectId: vi.fn(),
}));
const pegaMocks = vi.hoisted(() => ({
  PegaHttpClient: vi.fn(function () {
    return {
      fetchAndSavePegaContext: vi.fn(async () => ({ applicationName: "App", caseTypesCount: 3 })),
    };
  }),
}));

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn((id: string, fn: () => unknown) => {
      registered.set(id, fn);
      return { dispose: vi.fn() };
    }),
  },
  window: {
    showInformationMessage: vi.fn(async () => undefined),
    showErrorMessage: vi.fn(async () => undefined),
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: "C:\\work\\real-root" } }] },
}));

vi.mock("../extension", () => extensionMocks);
vi.mock("../services/PegaHttpClient", () => pegaMocks);
vi.mock("../injector", () => ({ injectAll: vi.fn(), injectSelective: vi.fn(), safeUpdate: vi.fn(), checkStatus: vi.fn(), getVersionReport: vi.fn() }));
vi.mock("../indexer", () => ({ promptIndexAfterInject: vi.fn(), handleIndexWorkspace: vi.fn() }));
vi.mock("../mcp-server-manager", () => ({ McpServerManager: vi.fn() }));
vi.mock("../webview-panel-manager", () => ({ WebviewPanelManager: vi.fn() }));
vi.mock("../mcp-injector", () => ({ removeBundledMcpConfig: vi.fn() }));
vi.mock("../symbol-search", () => ({ registerSymbolSearch: vi.fn() }));
vi.mock("../diagnostics-provider", () => ({ registerDiagnosticsProvider: vi.fn() }));
vi.mock("../ai-context-commands", () => ({ registerAIContextCommands: vi.fn() }));
vi.mock("../panels/security-panel", () => ({ SecurityPanel: vi.fn() }));
vi.mock("../panels/impact-panel", () => ({ showImpactAnalysis: vi.fn() }));
vi.mock("../panels/settings-panel", () => ({ SettingsPanel: vi.fn() }));
vi.mock("../panels/login-panel", () => ({ LoginPanel: vi.fn() }));
vi.mock("../panels/pega-ingester-panel", () => ({ PegaIngesterPanel: vi.fn() }));
vi.mock("../auth/AuthManager", () => ({ AuthManager: vi.fn() }));
vi.mock("../sidebar/tree-view-provider", () => ({ KiroTreeViewProvider: vi.fn() }));
vi.mock("../utils/panel-utils", () => ({ showUserError: vi.fn() }));
vi.mock("../utils/mcp-config-file", () => ({ writeJsonFile: vi.fn() }));
vi.mock("../commands/ConfigCommands", () => ({ registerConfigCommands: vi.fn() }));

describe("fetchPegaContext — held project id is never overwritten", () => {
  beforeEach(() => {
    registered.clear();
    vi.clearAllMocks();
    extensionMocks.getProjectId.mockReturnValue("held-id-123");
  });

  it("uses the held project id — no re-derive, no setProjectId overwrite", async () => {
    const context = { subscriptions: [] as unknown[] } as unknown as vscode.ExtensionContext;
    registerCommands(context, { workspaceRoot: "C:\\work\\real-root" });
    const handler = registered.get("sdlcAgents.fetchPegaContext");
    expect(handler).toBeTruthy();
    await handler!();
    expect(extensionMocks.deriveProjectId).not.toHaveBeenCalled();
    expect(extensionMocks.setProjectId).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("projectId=held-id-123"),
    );
  });
});
