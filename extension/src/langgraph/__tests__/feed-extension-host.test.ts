/**
 * Diagnostics Feed extension-host smoke tests — SA4E-185 (E2E-UI level, D4).
 *
 * STC-66..71 were originally planned as Playwright / @vscode/test-electron tests
 * against a real Extension Development Host. Those deps are NOT installed in this
 * repo yet, so the full host-level suite is NOT executable headlessly today.
 * This file delivers the agreed fallback (per defect D4):
 *   - STC-66 smoke: package.json declares the setting with default true,
 *   - adapter registration smoke: ChatPanelProvider wires the feed into the engine,
 *   - Playwright-less webview message-handler stub (mocked webview round-trip).
 * Remaining gap (STC-68/69/70/71 — real LSP editor, real settings UI, restart):
 *   documented below as a UAT-gate todo; requires @vscode/test-electron + Playwright.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "C:\\ws\\test" } }],
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: boolean) => d,
      update: vi.fn().mockResolvedValue(undefined),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: "file" }),
    joinPath: (base: { fsPath?: string }, ...segs: string[]) => ({
      fsPath: [base.fsPath ?? "", ...segs].join("/"),
      scheme: "file",
    }),
  },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), append: vi.fn(), show: vi.fn(), dispose: vi.fn() }),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
  commands: { registerCommand: vi.fn(), executeCommand: vi.fn().mockResolvedValue(undefined) },
  languages: {
    onDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
    getDiagnostics: vi.fn(() => []),
    textDocuments: [],
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Disposable: class { dispose() {} },
  TreeItem: class { constructor(public label: string) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}));

vi.mock("../../extension", () => ({
  getProjectId: vi.fn(() => "test-project"),
  setProjectId: vi.fn(),
}));

vi.mock("../../chat-panel/ChatHtmlBuilder", () => ({
  ChatHtmlBuilder: { build: () => "<html>mock</html>" },
}));

import { ChatPanelProvider } from "../../chat-panel/chat-panel-provider";
import { DiagnosticsFeedService } from "../diagnostics/diagnostics-feed-service";

const EXTENSION_ROOT = path.resolve(__dirname, "../../.."); // extension/ (package.json)
const PACKAGE_JSON = path.join(EXTENSION_ROOT, "package.json");

function mockMcpManager() {
  return { status: "disconnected", onStatusChange: vi.fn(() => ({ dispose: vi.fn() })) } as any;
}

function createProvider(): any {
  return new ChatPanelProvider(
    { fsPath: EXTENSION_ROOT } as any,
    mockMcpManager(),
    "C:\\ws\\test",
    undefined,
    { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }
  );
}

describe("E2E-UI smoke — diagnostics feed extension host (SA4E-185 / D4)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("STC-66: kiroSdlc.enableDiagnosticsFeed declared boolean with default true", () => {
    const manifest = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf-8"));
    const prop = manifest.contributes.configuration.properties["kiroSdlc.enableDiagnosticsFeed"];
    expect(prop).toBeDefined();
    expect(prop.type).toBe("boolean");
    expect(prop.default).toBe(true);
    expect(prop.description).toContain("diagnostics");
  });

  it("adapter registers: setDiagnosticsFeedService reaches LangGraphEngine.diagnosticsFeed", () => {
    const feed = new DiagnosticsFeedService("C:\\ws\\test");
    const provider = createProvider();
    provider.setDiagnosticsFeedService(feed);

    const engine = provider.getEngine(); // established reflective test pattern (private getter)
    expect(engine.diagnosticsFeed).toBe(feed);
    provider.dispose();
  });

  it("adapter lifecycle: provider.dispose() disposes the registered feed", () => {
    const feed = new DiagnosticsFeedService("C:\\ws\\test");
    const disposeSpy = vi.spyOn(feed, "dispose");
    const provider = createProvider();
    provider.setDiagnosticsFeedService(feed);

    provider.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("stub: webview message routes through provider -> engine without a real extension host", async () => {
    // Playwright-less stub: drive the exact handler the provider registers at
    // resolveWebviewView (onDidReceiveMessage -> routeMessage) with a mock webview.
    const postMessage = vi.fn().mockResolvedValue(true);
    const provider = createProvider();
    (provider as any).view = { webview: { postMessage } } as any;

    await (provider as any).routeMessage({ type: "chat:cancelStream" });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "chat:workingStatus", working: false }));
    provider.dispose();
  });

  it.todo(
    "STC-68/69/70/71 (real LSP editor, settings UI, restart) — implement when " +
      "@vscode/test-electron + Playwright are added to devDependencies (UAT gate; headless host unavailable)."
  );
});