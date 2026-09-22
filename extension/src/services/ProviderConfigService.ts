/**
 * ProviderConfigService — manages reading/writing LLM provider configuration.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { getStaticModels, fetchGatewayModels, getDefaultModel } from "../chat-panel/chat-models";
import { SECRET_KEYS, PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS } from "../models";
import { getBackendUrl } from "../config/backend-url";

export class ProviderConfigService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Build current settings state to send to webview.
   */
  async getCurrentState(): Promise<{
    provider: string; model: string; ollamaUrl: string; baseUrl: string;
    hasAnthropicKey: boolean; hasOpenaiKey: boolean;
    backendUrl: string; mcpServerPort: number; enableMcpServer: boolean;
    pegaEndpoint: string; pegaUsername: string; hasPegaPassword: boolean;
    atlassianBaseUrl: string; atlassianEmail: string; hasAtlassianToken: boolean;
    atlassianConnectionType: string;
  }> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const provider = config.get<string>("llmProvider", "anthropic");
    const model = config.get<string>("llmModel", "");
    const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");

    const baseUrl = this.getBaseUrlForProvider(provider);
    const backendUrl = getBackendUrl();
    const mcpServerPort = config.get<number>("mcpServerPort", 9181);
    const enableMcpServer = config.get<boolean>("enableMcpServer", true);

    const anthropicKey = await this.secrets.get(SECRET_KEYS.anthropic);
    const openaiKey = await this.secrets.get(SECRET_KEYS.openai);
    const pegaPassword = await this.secrets.get(SECRET_KEYS.pega);
    const pegaEndpoint = config.get<string>("pegaEndpoint", "http://localhost:8080/prweb");
    const pegaUsername = config.get<string>("pegaUsername", "");

    const atlassianBaseUrl = await this.secrets.get(SECRET_KEYS.atlassianBaseUrl) || "";
    const atlassianEmail = await this.secrets.get(SECRET_KEYS.atlassianEmail) || "";
    const atlassianToken = await this.secrets.get(SECRET_KEYS.atlassianToken);
    const atlassianConnectionType = config.get<string>("atlassianConnectionType", "cloud");

    return {
      provider, model, ollamaUrl, baseUrl: baseUrl || "",
      hasAnthropicKey: !!anthropicKey, hasOpenaiKey: !!openaiKey,
      backendUrl, mcpServerPort, enableMcpServer,
      pegaEndpoint, pegaUsername, hasPegaPassword: !!pegaPassword,
      atlassianBaseUrl, atlassianEmail, hasAtlassianToken: !!atlassianToken,
      atlassianConnectionType,
    };
  }

  async updatePegaConfig(endpoint: string, username: string, password?: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    await config.update("pegaEndpoint", endpoint, vscode.ConfigurationTarget.Global);
    await config.update("pegaUsername", username, vscode.ConfigurationTarget.Global);
    if (password && password.trim().length > 0) {
      await this.secrets.store(SECRET_KEYS.pega, password);
    }
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
      const secretKey = SECRET_KEYS[provider];
      const apiKey = secretKey ? await this.secrets.get(secretKey) : undefined;
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
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    await config.update(key, value || undefined, vscode.ConfigurationTarget.Global);
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
