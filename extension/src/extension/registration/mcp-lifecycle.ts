/**
 * MCP server lifecycle wiring — config watcher, status broadcast, auto-spawn.
 * Extracted from extension.ts (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { ConfigWatcher } from "../../config-watcher";
import { writeBundledMcpConfig } from "../../mcp-injector";
import { mapServerStatusToWebview } from "../../types";
import { getSettingWithFallback } from "../../config/settings-migration";
import { runtime } from "./state";

export function setupConfigWatcher(context: vscode.ExtensionContext, workspaceRoot: string, outputChannel: vscode.OutputChannel): void {
  runtime.configWatcher = new ConfigWatcher(workspaceRoot, runtime.mcpManager!, outputChannel);
  context.subscriptions.push(runtime.configWatcher);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    const portChanged =
      event.affectsConfiguration("sdlcAgents.mcp.serverPort") || event.affectsConfiguration("sdlcAgents.mcpServerPort");
    if (!portChanged || !runtime.mcpManager) { return; }
    if (!getSettingWithFallback<boolean>("mcp.enabled", "enableMcpServer", true)) { return; }
    if (runtime.mcpManager.status === "running") { runtime.mcpManager.restart().then(() => vscode.window.showInformationMessage("MCP Server restarted")).catch((err) => vscode.window.showErrorMessage(`MCP Server restart failed: ${(err as Error).message}`)); }
    else { runtime.mcpManager.spawn().catch((err) => vscode.window.showErrorMessage(`MCP Server start failed: ${(err as Error).message}`)); }
  }));
}

export function setupMcpStatusBroadcast(workspaceRoot: string): void {
  runtime.mcpManager!.onStatusChange((status) => {
    const webviewStatus = mapServerStatusToWebview(status);
    runtime.panelManager?.notifyAllPanels({ type: "serverStatus", status: webviewStatus });
    // SA4E-39: Update StatusBarManager connection state from MCP status
    const connState = status === "running" ? "CONNECTED" : status === "starting" ? "CONNECTING" : "DISCONNECTED";
    runtime.statusBarManager?.setConnectionState(connState);
    if (status === "running") {
      runtime.kbEventBus?.connect();
      runtime.configWatcher?.suppressNextChange();
      writeBundledMcpConfig(workspaceRoot, runtime.mcpManager?.port ?? 9181);
    } else if (status === "stopped" || status === "crashed") {
      runtime.kbEventBus?.disconnect();
    }
  });
}

export async function autoSpawnServer(config: vscode.WorkspaceConfiguration, outputChannel: vscode.OutputChannel): Promise<void> {
  // SA4E-370: config param kept for signature stability; the enabled flag is
  // read via the fallback helper (new `mcp.enabled` + legacy `enableMcpServer`).
  void config;
  if (getSettingWithFallback<boolean>("mcp.enabled", "enableMcpServer", true)) {
    try { await runtime.mcpManager!.spawn(); }
    catch (err) {
      const msg = `Auto-spawn failed: ${(err as Error).message}`;
      outputChannel.appendLine(`[WARN] ${msg}`);
      // Show user-visible warning so they know the server did not start
      vscode.window.showWarningMessage(`Kiro: MCP server failed to start. ${msg}. Some features may be unavailable.`);
    }
  } else {
    outputChannel.appendLine("[MCP] Server disabled by setting");
  }
}
