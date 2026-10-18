/**
 * CommandRegistrar — registers all non-LLM VS Code commands.
 * Extracted from extension.ts for SRP. Handler implementations live in
 * ./command-handlers (BR-18); this file stays the registration surface.
 */
import * as vscode from "vscode";
import { handleIndexWorkspace } from "../indexer";
import { IServerManager } from "../types/server-types";
import { WebviewPanelManager } from "../webview-panel-manager";
import { registerSymbolSearch } from "../symbol-search";
import { registerDiagnosticsProvider } from "../diagnostics-provider";
import { registerAIContextCommands } from "../ai-context-commands";
import { SecurityPanel } from "../panels/security-panel";
import { showImpactAnalysis } from "../panels/impact-panel";
import { PegaIngesterPanel } from "../panels/pega-ingester-panel";
import { AuthManager } from "../auth/AuthManager";
import { KiroTreeViewProvider } from "../sidebar/tree-view-provider";
import { registerConfigCommands } from "./ConfigCommands";
import {
  getWorkspaceRoot,
  handleInjectAll, handleInjectSelective, handleUpdate, handleStatus,
  handleLogin, handleLoginEntra, handleLogout,
  handleRestartServer, handleStopServer, handleOpenKbBrowser,
  handleEditConfig, handleChangeConfig,
} from "./command-handlers";

interface CommandDeps {
  mcpManager?: IServerManager;
  panelManager?: WebviewPanelManager;
  authManager?: AuthManager;
  treeProvider?: KiroTreeViewProvider;
  workspaceRoot?: string;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { mcpManager, panelManager, authManager, treeProvider, workspaceRoot } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("sdlcAgents.injectAll", () => handleInjectAll(context, mcpManager)),
    vscode.commands.registerCommand("sdlcAgents.injectSelective", () => handleInjectSelective(context, mcpManager)),
    vscode.commands.registerCommand("sdlcAgents.update", () => handleUpdate(context)),
    vscode.commands.registerCommand("sdlcAgents.status", () => handleStatus(context)),
    vscode.commands.registerCommand("sdlcAgents.indexWorkspace", () => handleIndexWorkspace(
        authManager?.getTokenSync(),
        context.secrets,
        async () => { await authManager?.refreshToken(); return authManager?.getTokenSync() || undefined; }
    )),
    vscode.commands.registerCommand("sdlcAgents.login", () => handleLogin(context, authManager, treeProvider)),
    vscode.commands.registerCommand("sdlcAgents.loginEntra", () => handleLoginEntra(authManager)),
    vscode.commands.registerCommand("sdlcAgents.logout", () => handleLogout(authManager, panelManager)),
    vscode.commands.registerCommand("sdlcAgents.openKbGraph", () => panelManager?.openPanel("graph")),
    vscode.commands.registerCommand("sdlcAgents.openKbDashboard", () => panelManager?.openPanel("dashboard")),
    vscode.commands.registerCommand("sdlcAgents.openKbTags", () => panelManager?.openPanel("tags")),
    vscode.commands.registerCommand("sdlcAgents.openKbQuality", () => panelManager?.openPanel("quality")),
    vscode.commands.registerCommand("sdlcAgents.openKbAnalytics", () => panelManager?.openPanel("analytics")),
    vscode.commands.registerCommand("sdlcAgents.restartMcpServer", () => handleRestartServer(mcpManager)),
    vscode.commands.registerCommand("sdlcAgents.stopMcpServer", () => handleStopServer(mcpManager, workspaceRoot)),
    vscode.commands.registerCommand("sdlcAgents.openKbBrowser", () => handleOpenKbBrowser(mcpManager)),
    vscode.commands.registerCommand("sdlcAgents.editConfig", () => handleEditConfig()),
    vscode.commands.registerCommand("sdlcAgents.changeConfig", () => handleChangeConfig(mcpManager)),
    vscode.commands.registerCommand("sdlcAgents.refreshToken", () => {
      if (!authManager) return Promise.resolve();
      const token = authManager.getTokenSync();
      if (!token) {
        handleLogin(context, authManager, treeProvider);
        return new Promise<void>((resolve) => {
          const d = authManager!.onStateChange((state) => {
            if (state === "AUTHENTICATED") { d.dispose(); resolve(); }
          });
        });
      }
      return authManager.refreshToken();
    }),
    vscode.commands.registerCommand("sdlcAgents.fetchPegaContext", async () => {
      const root = workspaceRoot || getWorkspaceRoot();
      if (!root) { vscode.window.showErrorMessage("No workspace folder open."); return; }
      try {
        const client = new (await import("../services/PegaHttpClient")).PegaHttpClient(context.secrets);
        const res = await client.fetchAndSavePegaContext(root);
        // Always use the project id the extension ALREADY HOLDS — never re-derive
        // from an arbitrary root. `root` may be a temp folder created by the LLM;
        // re-deriving there mints a random uuid-hash id and overwrites the held
        // id, so every later ingest (which correctly uses getProjectId()) posts
        // under a phantom project. PegaContextClient.persistProjectId already
        // persisted + set the Pega app id when the fetch succeeded.
        const { getProjectId } = await import("../extension");
        const pid = getProjectId();
        vscode.window.showInformationMessage(`✅ Fetched Pega Context: App "${res.applicationName}" (${res.caseTypesCount} CaseTypes) → projectId=${pid}`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to fetch Pega Context: ${err.message}`);
      }
    }),
    vscode.commands.registerCommand("sdlcAgents.openPegaIngester", () => {
      PegaIngesterPanel.open(context.extensionUri);
    }),
  );

  if (mcpManager) {
    registerSymbolSearch(context, mcpManager);
    registerDiagnosticsProvider(context, mcpManager);
    registerAIContextCommands(context, mcpManager);    context.subscriptions.push(
      vscode.commands.registerCommand("sdlcAgents.openSecurityPanel", () => { new SecurityPanel(mcpManager, context.extensionUri).loadData(); }),
      vscode.commands.registerCommand("sdlcAgents.impactAnalysis", () => showImpactAnalysis(mcpManager, context.extensionUri)),
    );
  }

  // SA4E-193: Register config commands (create-new-agent, create-new-hook, etc.)
  registerConfigCommands(context, workspaceRoot);
}
