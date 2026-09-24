/**
 * SA4E-110 — AtlassianCredentialService.
 * Manages Atlassian credentials via SecretStorage, provides IPC handler
 * for child server getCredentials requests, and tests connectivity.
 */

import * as vscode from "vscode";
import { ensureMigrated, getWsHash, secretKey, LEGACY_SECRET, type SecretBase } from "./WorkspaceScopeResolver";
import type { CredentialResponse } from "./AtlassianTypes";

/** Atlassian connection configuration */
export interface AtlassianConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  connectionType: "cloud" | "server";
}

/** Result of a connection test */
export interface AtlassianTestResult {
  success: boolean;
  message: string;
}

/**
 * Reads/writes Atlassian credentials from VS Code SecretStorage,
 * tests connectivity, and responds to IPC credential requests.
 */
export class AtlassianCredentialService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Persist Atlassian config to workspace-namespaced secrets after validation. */
  async saveConfig(config: AtlassianConfig): Promise<void> {
    const wsHash = getWsHash();
    if (!wsHash) {
      throw new Error("No workspace folder open — open a folder to configure per-workspace Atlassian credentials.");
    }
    await ensureMigrated(this.secrets);
    this.validateUrl(config.baseUrl);
    if (!(config.email || "").trim() || !(config.apiToken || "").trim()) {
      throw new Error("Atlassian email/API token must not be empty.");
    }
    try {
      await this.secrets.store(secretKey("atlassianBaseUrl", wsHash)!, config.baseUrl);
      await this.secrets.store(secretKey("atlassianEmail", wsHash)!, config.email);
      await this.secrets.store(secretKey("atlassianToken", wsHash)!, config.apiToken);
      await this.storeConnectionType(config.connectionType);
    } catch (err: any) {
      throw new Error(`Failed to save Atlassian config: ${err.message} (password/token may not be saved — retry).`);
    }
  }

  /** Read Atlassian config from workspace secrets. Returns null if incomplete. */
  async getConfig(): Promise<AtlassianConfig | null> {
    await ensureMigrated(this.secrets);
    const wsHash = getWsHash();
    const baseUrl = await this.readSecret(wsHash, "atlassianBaseUrl");
    const email = await this.readSecret(wsHash, "atlassianEmail");
    const apiToken = await this.readSecret(wsHash, "atlassianToken");
    if (!baseUrl || !email || !apiToken) { return null; }
    const connectionType = await this.readConnectionType();
    return { baseUrl, email, apiToken, connectionType };
  }

  /** OI-8: explicit clear of the workspace triple; marker stays. */
  async clearConfig(): Promise<void> {
    const wsHash = getWsHash();
    if (!wsHash) {
      throw new Error("No workspace folder open — open a folder to configure per-workspace Atlassian credentials.");
    }
    await this.secrets.delete(secretKey("atlassianBaseUrl", wsHash)!);
    await this.secrets.delete(secretKey("atlassianEmail", wsHash)!);
    await this.secrets.delete(secretKey("atlassianToken", wsHash)!);
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    await config.update("atlassianConnectionType", undefined, vscode.ConfigurationTarget.Workspace);
  }

  /** Test connection by calling GET /rest/api/2/myself with Basic auth. */
  async testConnection(): Promise<AtlassianTestResult> {
    const config = await this.getConfig();
    if (!config) {
      return { success: false, message: "No credentials configured." };
    }
    return this.performMyselfRequest(config);
  }

  /** Build IPC credential response for a child server request. */
  async handleCredentialRequest(requestId: string): Promise<CredentialResponse> {
    const config = await this.getConfig();
    if (!config) {
      throw new Error("Atlassian credentials not configured in extension.");
    }
    return {
      type: "credentials",
      requestId,
      timestamp: Date.now(),
      credentials: {
        email: config.email,
        apiToken: config.apiToken,
        baseUrl: config.baseUrl,
      },
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("URL must use http or https protocol.");
      }
    } catch {
      throw new Error("Invalid Jira Base URL format.");
    }
  }

  private async storeConnectionType(type: "cloud" | "server"): Promise<void> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    await config.update("atlassianConnectionType", type, vscode.ConfigurationTarget.Workspace);
  }

  private async readConnectionType(): Promise<"cloud" | "server"> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const val = config.get<string>("atlassianConnectionType", "cloud");
    return val === "server" ? "server" : "cloud";
  }

  /** Read a workspace secret; null scope falls back to the legacy flat key. */
  private async readSecret(wsHash: string | null, base: SecretBase): Promise<string | undefined> {
    try {
      const key = wsHash ? secretKey(base, wsHash)! : LEGACY_SECRET[base];
      return await this.secrets.get(key);
    } catch { return undefined; }
  }

  private async performMyselfRequest(config: AtlassianConfig): Promise<AtlassianTestResult> {
    const url = `${config.baseUrl.replace(/\/+$/, "")}/rest/api/2/myself`;
    const token = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Basic ${token}`, Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return this.interpretResponse(res);
    } catch (err: any) {
      return { success: false, message: `Connection failed: ${err.message}` };
    }
  }

  private async interpretResponse(res: Response): Promise<AtlassianTestResult> {
    if (res.ok) {
      const data = await res.json() as { displayName?: string };
      const name = data.displayName || "Unknown User";
      return { success: true, message: `Connected as ${name}` };
    }
    if (res.status === 401) {
      return { success: false, message: "Authentication failed (401). Check email/token." };
    }
    return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
  }
}
