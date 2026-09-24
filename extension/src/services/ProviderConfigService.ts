/**
 * ProviderConfigService — manages reading/writing LLM provider configuration.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { getStaticModels, fetchGatewayModels, getDefaultModel } from "../chat-panel/chat-models";
import { SECRET_KEYS, PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS } from "../models";
import { getBackendUrl } from "../config/backend-url";
import { ensureMigrated, getWsHash, secretKey, LEGACY_SECRET, type SecretBase } from "./WorkspaceScopeResolver";

/** Config keys isolated per workspace (SA4E-323) — never via generic updateConfig. */
const WORKSPACE_SCOPED_KEYS = ["pegaEndpoint", "pegaUsername", "atlassianConnectionType"];

export class ProviderConfigService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Build current settings state to send to webview.
   */
  async getCurrentState(): Promise<{
    provider: string; model: string; ollamaUrl: string; baseUrl: string;
    hasAnthropicKey: boolean; hasOpenaiKey: boolean;
    backendUrl: string; allowInsecureRemote: boolean;
    mcpServerPort: number; enableMcpServer: boolean;
    pegaEndpoint: string; pegaUsername: string; hasPegaPassword: boolean;
    atlassianBaseUrl: string; atlassianEmail: string; hasAtlassianToken: boolean;
    atlassianConnectionType: string;
  }> {
    await ensureMigrated(this.secrets);
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const provider = config.get<string>("llmProvider", "anthropic");
    const model = config.get<string>("llmModel", "");
    const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");

    const baseUrl = this.getBaseUrlForProvider(provider);
    const backendUrl = getBackendUrl();
    const allowInsecureRemote = config.get<boolean>("backend.allowInsecureRemote", false);
    const mcpServerPort = config.get<number>("mcpServerPort", 9181);
    const enableMcpServer = config.get<boolean>("enableMcpServer", true);

    const anthropicKey = await this.safeGet(SECRET_KEYS.anthropic);
    const openaiKey = await this.safeGet(SECRET_KEYS.openai);
    const wsHash = getWsHash();
    const pegaPassword = await this.readSecret(wsHash, "pega");
    const pegaEndpoint = config.get<string>("pegaEndpoint", "http://localhost:8080/prweb");
    const pegaUsername = config.get<string>("pegaUsername", "");

    const atlassianBaseUrl = (await this.readSecret(wsHash, "atlassianBaseUrl")) || "";
    const atlassianEmail = (await this.readSecret(wsHash, "atlassianEmail")) || "";
    const atlassianToken = await this.readSecret(wsHash, "atlassianToken");
    const atlassianConnectionType = config.get<string>("atlassianConnectionType", "cloud");

    return {
      provider, model, ollamaUrl, baseUrl: baseUrl || "",
      hasAnthropicKey: !!anthropicKey, hasOpenaiKey: !!openaiKey,
      backendUrl, allowInsecureRemote, mcpServerPort, enableMcpServer,
      pegaEndpoint, pegaUsername, hasPegaPassword: !!pegaPassword,
      atlassianBaseUrl, atlassianEmail, hasAtlassianToken: !!atlassianToken,
      atlassianConnectionType,
    };
  }

  async updatePegaConfig(endpoint: string, username: string, password?: string): Promise<void> {
    const wsHash = getWsHash();
    if (!wsHash) {
      throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
    }
    await ensureMigrated(this.secrets);
    const e = (endpoint || "").trim();
    const u = (username || "").trim();
    if (!/^https?:\/\//.test(e)) { throw new Error("Invalid Pega Endpoint URL (http/https required)."); }
    try {
      const config = vscode.workspace.getConfiguration("kiroSdlc");
      await config.update("pegaEndpoint", e, vscode.ConfigurationTarget.Workspace);
      await config.update("pegaUsername", u, vscode.ConfigurationTarget.Workspace);
      if (password && password.trim().length > 0) {
        await this.secrets.store(secretKey("pega", wsHash)!, password);
      }
    } catch (err: any) {
      throw new Error(`Failed to save Pega config: ${err.message} (password may not be saved — retry).`);
    }
  }

  /** OI-8: explicit clear of the workspace Pega password; marker stays. */
  async clearPegaPassword(): Promise<void> {
    const wsHash = getWsHash();
    if (!wsHash) {
      throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
    }
    await this.secrets.delete(secretKey("pega", wsHash)!);
  }

  /**
   * Build the provider-aware model list.
   */
  async getModels(provider: string, currentModel: string): Promise<{
    models: any[]; selected: string; defaultModel: string;
  }> {
    let models = getStaticModels(provider);
    const gatewayBaseUrl = this.getGatewayBaseUrl(provider);
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const lmstudioBaseUrl = config.get<string>("lmstudioBaseUrl", "")
      || "http://localhost:1234/v1";

    const fetchUrl = provider === "lmstudio"
      ? lmstudioBaseUrl
      : gatewayBaseUrl;

    if (fetchUrl) {
      // Pass the provider's API key as a Bearer token — gateways (e.g. OmniRoute)
      // return 401 on /v1/models without it, which caused a silent fallback to the
      // static catalog. Local providers (lmstudio/ollama) don't need auth.
      const providerSecretKey = SECRET_KEYS[provider];
      const apiKey = providerSecretKey ? await this.secrets.get(providerSecretKey) : undefined;
      const authHeader = apiKey ? `Bearer ${apiKey}` : undefined;
      const gatewayModels = await fetchGatewayModels(fetchUrl, authHeader);
      if (gatewayModels && gatewayModels.length > 0) {
        models = gatewayModels;
      }
    }

    let selected = currentModel;
    if (selected && !models.some((m: any) => m.id === selected)) {
      models = [...models, { id: selected, name: selected }];
    } else if (!selected) {
      selected = models.length > 0 ? models[0].id : getDefaultModel(provider);
    }

    return { models, selected, defaultModel: getDefaultModel(provider) };
  }

  /** Update a kiroSdlc configuration key globally. */
  async updateConfig(key: string, value: any): Promise<void> {
    if (WORKSPACE_SCOPED_KEYS.includes(key)) {
      throw new Error(`Use workspace-scoped method for ${key} (SA4E-323).`);
    }
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    await config.update(key, value || undefined, vscode.ConfigurationTarget.Global);
  }

  /** Read a workspace secret; null scope falls back to the legacy flat key. */
  private async readSecret(wsHash: string | null, base: SecretBase): Promise<string | undefined> {
    try {
      const key = wsHash ? secretKey(base, wsHash)! : LEGACY_SECRET[base];
      return await this.secrets.get(key);
    } catch { return undefined; }
  }

  /** Best-effort secret read that never breaks state load (UC-3 EF-3). */
  private async safeGet(key: string): Promise<string | undefined> {
    try { return await this.secrets.get(key); }
    catch { return undefined; }
  }

  private getBaseUrlForProvider(provider: string): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const key = PROVIDER_BASE_URL_KEYS[provider];
    if (!key) { return ""; }
    return config.get<string>(key, "");
  }

  private getGatewayBaseUrl(provider: string): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const key = PROVIDER_BASE_URL_KEYS[provider];
    if (!key) { return ""; }
    const configuredUrl = config.get<string>(key, "");
    return configuredUrl || PROVIDER_BASE_URL_DEFAULTS[provider] || "";
  }
}
