/**
 * Sidebar tree view registration (activation-time, unconditional).
 * Extracted from extension.ts (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { KiroTreeViewProvider } from "../../sidebar/tree-view-provider";
import { runtime } from "./state";

/**
 * Create the sidebar tree view + provider at activation time, with NO
 * mcpManager yet (none exists before a workspace is initialized). The
 * provider renders a valid "server stopped / KB inactive" tree. When a
 * workspace is initialized, initializeWorkspace() calls
 * treeProvider.attachMcpManager() to bind live status.
 */
export function registerTreeView(context: vscode.ExtensionContext): void {
  runtime.treeProvider = new KiroTreeViewProvider();
  const treeView = vscode.window.createTreeView("sdlcAgentsTree", { treeDataProvider: runtime.treeProvider });
  runtime.treeProvider.setTreeView(treeView);
  context.subscriptions.push(treeView);
  treeView.onDidChangeSelection((e) => {
    const selected = e.selection[0];
    if (selected?.contextValue?.startsWith("cmd:")) {
      vscode.commands.executeCommand(selected.contextValue.replace("cmd:", ""));
    }
  });
}
