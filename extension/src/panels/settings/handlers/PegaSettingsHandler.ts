/**
 * PegaSettingsHandler — Pega connection settings messages (SA4E-323 refactor).
 * Split out of SettingsMessageHandler for SRP. Per-workspace save, 8s
 * auth-aware connectivity test (OI-7), and fail-loud context fetch (SA4E-349).
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

  /** Auth-aware connectivity test with a bounded 8s timeout (OI-7). */
  async test(): Promise<void> {
    try {
      const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
      const client = new PegaHttpClient(this.secrets);
      const base = client.getPegaEndpoint().replace(/\/$/, "");
      const authHeader = await client.getAuthHeader();
      const res = await fetch(`${base}/api/v1/data/D_OperatorID`, {
        method: "GET",
        headers: { Authorization: authHeader, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      this.postMessage(this.buildTestResult(res.status));
    } catch (err: any) {
      this.postMessage({ type: "pegaTestResult", success: false, message: `Connection failed: ${err.message}` });
    }
  }

  /** Map an HTTP status to a user-facing Pega test result (keeps test() ≤20 lines). */
  private buildTestResult(status: number): { type: string; success: boolean; message: string } {
    if (status === 200) {
      return { type: "pegaTestResult", success: true, message: "✅ Connected — credentials accepted (HTTP 200)." };
    }
    if (status === 401 || status === 403) {
      return { type: "pegaTestResult", success: false, message: `❌ Authentication failed (HTTP ${status}). Check Operator ID / password or account status.` };
    }
    return { type: "pegaTestResult", success: false, message: `❌ Unexpected response (HTTP ${status}).` };
  }

  /** Fetch and save the Pega application context for the current workspace. */
  async fetchContext(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.postMessage({ type: "pegaContextFetched", success: false, message: "No workspace folder open to save Pega context." });
      return;
    }
    try {
      const { PegaHttpClient } = await import("../../../services/PegaHttpClient");
      const client = new PegaHttpClient(this.secrets);
      const result = await client.fetchAndSavePegaContext(folders[0].uri.fsPath);
      this.postMessage({
        type: "pegaContextFetched",
        success: true,
        message: `Fetched context: App "${result.applicationName}" (${result.caseTypesCount} CaseTypes) → saved ${result.filePath}`,
      });
    } catch (err: any) {
      this.postMessage({ type: "pegaContextFetched", success: false, message: `❌ Fetch Pega Context failed: ${err.message}` });
    }
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
