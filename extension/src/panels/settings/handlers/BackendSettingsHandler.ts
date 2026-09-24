/**
 * BackendSettingsHandler — backend URL / MCP wrapper settings messages
 * (SA4E-323 refactor). Split out of SettingsMessageHandler for SRP.
 * Behavior-preserving: preserves SA4E-320 HTTPS-enforcement + fail-closed logic
 * and all message types / payloads.
 */

import * as vscode from "vscode";
import { validateBackendUrl, getAllowInsecureRemote } from "../../../config/backend-url";

/** Handles backend.url, allowInsecureRemote, backend health test, and MCP wrapper messages. */
export class BackendSettingsHandler {
  constructor(private readonly postMessage: (msg: any) => void) {}

  /** Validate + persist backend.url (SA4E-320: HTTPS enforced unless bypass ON). */
  async setBackendUrl(url: string): Promise<void> {
    try {
      const validated = validateBackendUrl(url, { allowInsecureRemote: getAllowInsecureRemote() });
      // SA4E-320/323: backend.url is workspace-scoped (each workspace keeps its
      // own value). Untrusted repos cannot abuse this because the key is listed
      // in package.json capabilities.untrustedWorkspaces.restrictedConfigurations
      // (VS Code ignores its workspace value while the workspace is untrusted).
      await vscode.workspace.getConfiguration("kiroSdlc")
        .update("backend.url", validated, vscode.ConfigurationTarget.Workspace);
      this.postMessage({ type: "backendUrlSaved", success: true });
    } catch (err: any) {
      this.postMessage({ type: "backendUrlSaved", success: false, message: err.message });
    }
  }

  /** Persist the HTTPS-bypass flag; on disable, re-validate the stored URL (SA4E-320 #5/#6). */
  async setAllowInsecureRemote(enabled: unknown): Promise<void> {
    // Finding #6: coerce to strict boolean before persisting (fail-closed).
    const boolEnabled = enabled === true;
    // SA4E-320/323: allowInsecureRemote is workspace-scoped (each workspace keeps
    // its own opt-in). Untrusted repos cannot force it on: the key is in
    // capabilities.untrustedWorkspaces.restrictedConfigurations, so VS Code
    // ignores its workspace value while the workspace is untrusted, and the
    // trust gate blocks credential ops regardless.
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("backend.allowInsecureRemote", boolEnabled, vscode.ConfigurationTarget.Workspace);
    if (!boolEnabled) { this.revalidateStoredUrl(); }
  }

  /** Finding #5: surface an error if the stored URL is now invalid with bypass OFF. */
  private revalidateStoredUrl(): void {
    try {
      const url = vscode.workspace.getConfiguration("kiroSdlc").get<string>("backend.url", "");
      if (url) { validateBackendUrl(url, { allowInsecureRemote: false }); }
    } catch (err: any) {
      this.postMessage({
        type: "backendUrlSaved",
        success: false,
        message: `Bypass disabled — current URL is invalid: ${err?.message || String(err)}`,
      });
    }
  }

  /** Validate then probe backend /health. */
  async testBackend(url: string): Promise<void> {
    try {
      validateBackendUrl(url, { allowInsecureRemote: getAllowInsecureRemote() });
    } catch (err: any) {
      this.postMessage({ type: "backendTestResult", success: false, message: err.message });
      return;
    }
    await this.fetchBackendHealth(url);
  }

  /** GET {url}/health with a 5s timeout and report latency. */
  private async fetchBackendHealth(url: string): Promise<void> {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      const message = response.ok ? "Connected" : `HTTP ${response.status}`;
      this.postMessage({ type: "backendTestResult", success: response.ok, message, latencyMs });
    } catch (err: any) {
      this.postMessage({ type: "backendTestResult", success: false, message: err.message });
    }
  }

  /** Persist the local MCP wrapper server port. */
  async setMcpPort(port: number): Promise<void> {
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("mcpServerPort", port, vscode.ConfigurationTarget.Workspace);
  }

  /** Persist the "enable MCP wrapper on startup" flag. */
  async setEnableMcp(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("enableMcpServer", enabled, vscode.ConfigurationTarget.Workspace);
  }

  /** Restart the local MCP wrapper server via command. */
  async restartMcpServer(): Promise<void> {
    try {
      await vscode.commands.executeCommand("kiroSdlc.restartMcpServer");
      this.postMessage({ type: "mcpServerRestarted", success: true, message: "MCP wrapper server restarted successfully." });
    } catch (err: any) {
      this.postMessage({ type: "mcpServerRestarted", success: false, message: `Restart failed: ${err.message}` });
    }
  }
}
