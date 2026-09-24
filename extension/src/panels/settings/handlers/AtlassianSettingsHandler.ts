/**
 * AtlassianSettingsHandler — Atlassian connection settings messages
 * (SA4E-323 refactor). Split out of SettingsMessageHandler for SRP.
 * Behavior-preserving: save/test/clear semantics and payloads unchanged.
 */

import { AtlassianCredentialService } from "../../../services/AtlassianCredentialService";

/** Handles saveAtlassianConfig / testAtlassianConnection / clearAtlassianConfig. */
export class AtlassianSettingsHandler {
  constructor(
    private readonly atlassianService: AtlassianCredentialService,
    private readonly postMessage: (msg: any) => void,
    private readonly refreshState: () => Promise<void>
  ) {}

  /** Persist Atlassian credentials (workspace-scoped secrets), then refresh. */
  async save(msg: any): Promise<void> {
    try {
      await this.atlassianService.saveConfig({
        baseUrl: msg.baseUrl,
        email: msg.email,
        apiToken: msg.apiToken,
        connectionType: msg.connectionType || "cloud",
      });
      this.postMessage({ type: "atlassianSaved", success: true });
      await this.refreshState();
    } catch (err: any) {
      this.postMessage({ type: "atlassianSaved", success: false, error: err.message });
    }
  }

  /** Test the Atlassian connection (gated by workspace trust in the service). */
  async test(): Promise<void> {
    try {
      const result = await this.atlassianService.testConnection();
      this.postMessage({ type: "atlassianTestResult", ...result });
    } catch (err: any) {
      this.postMessage({ type: "atlassianTestResult", success: false, message: err.message });
    }
  }

  /** Clear stored Atlassian credentials, then refresh. */
  async clear(): Promise<void> {
    try {
      await this.atlassianService.clearConfig();
      this.postMessage({ type: "atlassianCleared", success: true });
      await this.refreshState();
    } catch (err: any) {
      this.postMessage({ type: "atlassianCleared", success: false, error: err.message });
    }
  }
}
