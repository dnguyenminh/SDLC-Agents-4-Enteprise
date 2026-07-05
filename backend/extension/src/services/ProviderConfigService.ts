/**
 * ProviderConfigService — manages reading/writing LLM provider configuration.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { getStaticModels, fetchGatewayModels, getDefaultModel } from "../chat-panel/chat-models";
import { SECRET_KEYS, PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS } from "../models";

export class ProviderConfigService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Build current settings state to send to webview.
   */
  async getCurrentState(): Promise<{
    provider: string; model: string; ollamaUrl: string; baseUrl: string;
    hasAnthropicKey: boolean; hasOpenaiKey: boolean;
    backendUrl: string; mcpServerPort: number; enableMcpServer: boolean;
  }> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const provider = config.get<string>("llmProvider", "anthropic");
    const model = config.get<string>("llmModel", "");
    const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");

    const baseUrl = this.getBaseUrlForProvider(provider);
    const backendUrl = config.get<string>("backend.url", "http://127.0.0.1:48721");
    const mcpServerPort = config.get<number>("mcpServerPort", 9181);
    const enableMcpServer = config.get<boolean>("enableMcpServer", true);

    const anthropicKey = await this.secrets.get(SECRET_KEYS.anthropic);
    const openaiKey = await this.secrets.get(SECRET_KEYS.openai);

    return {
      provider, model, ollamaUrl, baseUrl: baseUrl || "",
      hasAnthropicKey: !!anthropicKey, hasOpenaiKey: !!openaiKey,
      backendUrl, mcpServerPort, enableMcpServer,
    };
  }

  /**
   * Build the provider-aware model list.
   */
  async getModels(provider: string, currentModel: string): Promise<{
    models: any[]; selected: string; defaultModel: string;
  }> {
    let models = getStaticModels(provider);
    const gatewayBaseUrl = this.getGatewayBaseUrl(provider);

    if (gatewayBaseUrl) {
      const gatewayModels = await fetchGatewayModels(gatewayBaseUrl);
      if (gatewayModels && gatewayModels.length > 0) {
        models = gatewayModels;
      }
    }

    let selected = currentModel;
    if (!selected || !models.some((m: any) => m.id === selected)) {
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
