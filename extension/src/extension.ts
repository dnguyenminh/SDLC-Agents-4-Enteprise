/**
 * SDLC Agents 4 Enterprise — VS Code Extension entry point.
 * Thin activation shell — delegates command registration to CommandRegistrar and LlmCommands.
 *
 * BR-18: feature-registration blocks live in ./extension/registration/* — this
 * file is the stable public façade (same import path and symbols).
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getWorkspaceRoot, checkForUpgrade } from "./activation-helpers";
import { runDetection } from "./slash";
import { QualityReport as DesignQualityReport, EnvConfig, DEFAULT_THRESHOLD } from "./slash/types";
import { resolveWasmPath } from "./slash/detector-env";
import { initDesignGateEnv } from "./tools/design-gate/design-gate-env";
import type { RenderedDetectionResult } from "./slash/integration.service";
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
      // SA4E-390: pass globalState so LLM profiles persist in a Memento (Kiro
      // rejects config.update for unregistered keys like sdlcAgents.llm.profiles).
      SettingsPanel.open(context.extensionUri, context.secrets, context.globalState)
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

  // SA4E-393: design-gate local tools resolve the WASM detector from the
  // extension path per call (no bare `vscode` global in the wrapper path).
  initDesignGateEnv(context.extensionPath);

  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    await initializeWorkspace(context, workspaceRoot);
  }

  checkForUpgrade(context);

  // Design quality gate commands (SA4E-393) — REAL pipeline (ImpeccableIntegrationService).
  // TC-04: commands visible; TC-06: report JSON appended to OutputChannel (relative paths only, C5);
  // TC-03: rendered falls back to static when dev server unreachable (AF-1);
  // TC-05: SSRF guard enforced inside fetchLocalhostPage (C4).
  const gateOutput = vscode.window.createOutputChannel("Design Quality Gate");
  context.subscriptions.push(gateOutput);

  const resolveWorkspace = (): string => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      throw new Error("No workspace folder open. Open a project folder first.");
    }
    // Pipeline resolves paths against WORKSPACE_ROOT (EnvConfig) — must point
    // at the live workspace folder, NOT the IDE install cwd.
    process.env[EnvConfig.WORKSPACE_ROOT] = root;
    return root;
  };

  // resolveWasmPath imported from ./slash/detector-env (shared with design-gate tools)
  // Call as: resolveWasmPath(context.extensionPath)

  const showReport = (mode: string, report: DesignQualityReport, extra?: string): void => {
    const status = report.pass ? "PASS" : "FAIL";
    const summary = `Design Quality Gate (${mode}): ${status} - Score: ${report.score.toFixed(2)} - Findings: ${report.totalIssues}${extra ? ` - ${extra}` : ""}`;
    gateOutput.appendLine(`[${new Date().toISOString()}] ${summary}`);
    gateOutput.appendLine(JSON.stringify(report, null, 2));
    gateOutput.show(true);
    if (report.pass) {
      vscode.window.showInformationMessage(summary);
    } else {
      vscode.window.showWarningMessage(summary);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("sdlcAgents.runDesignGateStatic", async () => {
      try {
        const root = resolveWorkspace();
        resolveWasmPath(context.extensionPath);
        const { report } = await runDetection({
          detectionMode: "static",
          sourceRoot: root,
          threshold: DEFAULT_THRESHOLD,
          cacheReuse: true,
        });
        showReport("Static", report);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Design Quality Gate (Static) failed: ${error?.message ?? error}`);
      }
    }),
    vscode.commands.registerCommand("sdlcAgents.runDesignGateRendered", async () => {
      try {
        const root = resolveWorkspace();
        resolveWasmPath(context.extensionPath);
        const { combinedResult, report } = await runDetection({
          detectionMode: "rendered",
          sourceRoot: root,
          threshold: DEFAULT_THRESHOLD,
          cacheReuse: true,
        });
        const rendered = combinedResult as RenderedDetectionResult;
        if (rendered.fetchStatus !== "success") {
          // AF-1 (TC-03): dev server unreachable → graceful fallback to static-only
          gateOutput.appendLine(`[${new Date().toISOString()}] Rendered fetch ${rendered.fetchStatus} — falling back to static-only detection`);
          const { report: staticReport } = await runDetection({
            detectionMode: "static",
            sourceRoot: root,
            threshold: DEFAULT_THRESHOLD,
            cacheReuse: true,
          });
          showReport("Rendered->Static fallback", staticReport, `fetchStatus: ${rendered.fetchStatus}`);
          return;
        }
        showReport("Rendered", report, `fetchStatus: ${rendered.fetchStatus}`);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Design Quality Gate (Rendered) failed: ${error?.message ?? error}`);
      }
    }),
    vscode.commands.registerCommand("sdlcAgents.runDesignGateBoth", async () => {
      try {
        const root = resolveWorkspace();
        resolveWasmPath(context.extensionPath);
        const { report } = await runDetection({
          detectionMode: "both",
          sourceRoot: root,
          threshold: DEFAULT_THRESHOLD,
          cacheReuse: true,
        });
        showReport("Both", report);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Design Quality Gate (Both) failed: ${error?.message ?? error}`);
      }
    })
  );

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
