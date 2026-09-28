/**
 * PegaSettingsHandler — Pega connection settings messages (SA4E-323 refactor).
 * Split out of SettingsMessageHandler for SRP. Behavior-preserving:
 * per-workspace save, 8s connectivity test (OI-7), and context fetch unchanged.
 */

import * as vscode from "vscode";
import { ProviderConfigService } from "../../../services/ProviderConfigService";

/** Handles savePegaConfig / testPegaConnection / fetchPegaContext / clearPegaPassword. */
export class PegaSettingsHandler {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly configService: ProviderConfigService,
    private readonly postMessage: (msg: any) => void,
    private readonly refreshState: () => Promise<void>
  ) {}

  /** Persist Pega endpoint/username/password (workspace-scoped), then refresh. */
  async save(endpoint: string, username: string, password: string): Promise<void> {
    try {
      await this.configService.updatePegaConfig(endpoint, username, password);
      this.postMessage({ type: "pegaSaved", success: true });
      await this.refreshState();
    } catch (err: any) {
      this.postMessage({ type: "pegaSaved", success: false, error: err.message || "Failed to save Pega config" });
    }
  }

  /** Connectivity-only test (no auth) with a bounded 8s timeout (OI-7). */
  async test(): Promise<void> {
    try {
      const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
      const client = new PegaHttpClient(this.secrets);
      const endpoint = client.getPegaEndpoint();
      const res = await fetch(endpoint, { method: "GET", signal: AbortSignal.timeout(8000) });
      const message = res.status > 0
        ? `✅ Network OK — Pega Server reachable (HTTP ${res.status}). Authentication not tested.`
        : "Connection failed: no response from server";
      this.postMessage({ type: "pegaTestResult", success: res.status > 0, message });
    } catch (err: any) {
      this.postMessage({ type: "pegaTestResult", success: false, message: `Connection failed: ${err.message}` });
    }
  }

  /** Fetch and save the Pega application context for the current workspace. */
  async fetchContext(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.postMessage({ type: "pegaContextFetched", success: false, message: "No workspace folder open to save Pega context." });
      return;
    }
    const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
    const client = new PegaHttpClient(this.secrets);
    const result = await client.fetchAndSavePegaContext(folders[0].uri.fsPath);
    this.postMessage({
      type: "pegaContextFetched",
      success: true,
      message: `Fetched context: App "${result.applicationName}" (${result.caseTypesCount} CaseTypes) → saved ${result.filePath}`,
    });
  }

  /** Clear the stored Pega password (migration marker untouched), then refresh. */
  async clearPassword(): Promise<void> {
    try {
      await this.configService.clearPegaPassword();
      this.postMessage({ type: "pegaPasswordCleared", success: true });
      await this.refreshState();
    } catch (err: any) {
      this.postMessage({ type: "pegaPasswordCleared", success: false, error: err.message });
    }
  }
}
