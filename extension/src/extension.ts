/**
 * SDLC Agents 4 Enterprise — VS Code Extension entry point.
 * Thin activation shell — delegates command registration to CommandRegistrar and LlmCommands.
 *
 * BR-18: feature-registration blocks live in ./extension/registration/* — this
 * file is the stable public façade (same import path and symbols).
 */

import * as vscode from "vscode";
import { getWorkspaceRoot, checkForUpgrade } from "./activation-helpers";
import { SettingsPanel } from "./panels/settings/SettingsPanel";
import { ProxyAgentFactory } from "./proxy/ProxyAgentFactory";
import { ProxyConfigService } from "./proxy/ProxyConfigService";
import { ProxyDetectionService } from "./proxy/ProxyDetectionService";
import { applyGlobalFetchPatch } from "./proxy/global-fetch-patch";
import { migrateConfigNamespace } from "./config/config-namespace-migration";
import { runConfigMigration } from "./config/settings-migration-runner";
import { runtime } from "./extension/registration/state";
import { initializeWorkspace } from "./extension/registration/workspace-init";
import { registerTreeView } from "./extension/registration/tree-view";
import {
  getProjectId,
  setProjectId,
  requireProjectId,
  deriveProjectId,
} from "./extension/registration/project-id";

export { getProjectId, setProjectId, requireProjectId, deriveProjectId };

/** SA4E-99: Enrichment service accessor for IndexingService cross-module call. */
export function getEnrichmentService(): { pollNow(): void } | null { return null; }

export async function activate(context: vscode.ExtensionContext) {
  // SA4E-99: Removed duplicate createStatusBar() — StatusBarManager handles status display

  // Migrate user settings from the legacy `kiroSdlc.*` namespace to `sdlcAgents.*`
  // BEFORE any config is read below. Never let a migration error break activation.
  try {
    await migrateConfigNamespace(context);
  } catch (err) {
    console.warn(`[config-migration] namespace migration failed: ${(err as Error).message}`);
  }

  // SA4E-370: one-time config key migration — copies old flat key values
  // (e.g. sdlcAgents.pegaEndpoint) to the new dot-notation keys
  // (sdlcAgents.pega.endpoint). Guarded by a globalState flag; shows a popup
  // with the migration table when keys were copied. Never break activation.
  try {
    await runConfigMigration(context);
  } catch (err) {
    console.warn(`[config-migration] key migration failed: ${(err as Error).message}`);
  }

  // Register Settings command early — must work even without a workspace folder.
  context.subscriptions.push(
    vscode.commands.registerCommand("sdlcAgents.openSettings", () =>
      SettingsPanel.open(context.extensionUri, context.secrets)
    )
  );

  // Register the sidebar tree view EARLY and UNCONDITIONALLY so the
  // "sdlcAgentsTree" view always has a data provider — even with no workspace
  // folder open, or when workspace init later fails. (Fixes "There is no data
  // provider registered that can provide view data.")
  registerTreeView(context);

  // Initialize proxy support (machine-specific, works without workspace)
  const proxyConfigService = new ProxyConfigService(context.secrets);
  const proxyDetectionService = new ProxyDetectionService();
  ProxyAgentFactory.initialize(proxyConfigService, proxyDetectionService);
  // Patch globalThis.fetch so ALL fetch() callers in this process route through proxy
  applyGlobalFetchPatch();

  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    await initializeWorkspace(context, workspaceRoot);
  }

  checkForUpgrade(context);
}

export async function deactivate(): Promise<void> {
  runtime.configWatcher?.dispose();
  runtime.panelManager?.disposeAll();
  runtime.chatEngineAdapter?.dispose();
  runtime.diffTracker?.dispose();
  runtime.sessionLifecycle?.dispose();
  await runtime.sessionManager?.cleanup();
  // Must await kill() so VS Code waits for the HTTP server to release its port
  // before reloading — prevents EADDRINUSE on reload window.
  try {
    await runtime.mcpManager?.kill();
  } catch (err) {
    console.error("[Kiro] Deactivate kill failed:", (err as Error).message);
  }
}
