/**
 * ProviderConfigWorkspace — Workspace-scoped config operations for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import { ensureMigrated, getWsHash, secretKey } from "./WorkspaceScopeResolver";

export interface WorkspaceDeps {
  secrets: vscode.SecretStorage;
  getConfig: () => vscode.WorkspaceConfiguration;
}

/** Update Pega config (workspace-scoped). */
export async function updatePegaConfig(
  deps: WorkspaceDeps,
  endpoint: string,
  username: string,
  password?: string
): Promise<void> {
  const wsHash = getWsHash();
  if (!wsHash) {
    throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
  }
  await ensureMigrated(deps.secrets);
  const e = (endpoint || "").trim();
  const u = (username || "").trim();
  if (!/^https?:\/\//.test(e)) { throw new Error("Invalid Pega Endpoint URL (http/https required)."); }
  try {
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    await config.update("pega.endpoint", e, vscode.ConfigurationTarget.Workspace);
    await config.update("pega.username", u, vscode.ConfigurationTarget.Workspace);
    if (password && password.trim().length > 0) {
      await deps.secrets.store(secretKey("pega", wsHash)!, password);
    }
  } catch (err: any) {
    throw new Error(`Failed to save Pega config: ${err.message} (password may not be saved — retry).`);
  }
}

/** Clear Pega password. */
export async function clearPegaPassword(deps: WorkspaceDeps): Promise<void> {
  const wsHash = getWsHash();
  if (!wsHash) {
    throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
  }
  await deps.secrets.delete(secretKey("pega", wsHash)!);
}

/** Update a configuration key globally. */
export async function updateConfig(
  deps: WorkspaceDeps,
  key: string,
  value: any
): Promise<void> {
  const WORKSPACE_SCOPED_KEYS = ["pega.endpoint", "pega.username", "jira.connectionType"];
  if (WORKSPACE_SCOPED_KEYS.includes(key)) {
    throw new Error(`Use workspace-scoped method for ${key} (SA4E-323).`);
  }
  const config = deps.getConfig();
  await config.update(key, value || undefined, vscode.ConfigurationTarget.Global);
}