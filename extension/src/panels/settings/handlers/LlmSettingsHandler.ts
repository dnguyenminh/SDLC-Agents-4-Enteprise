/**
 * LlmSettingsHandler — LLM provider settings messages (SA4E-323 refactor).
 * Split out of SettingsMessageHandler for SRP / ≤200-LOC compliance.
 * Behavior-preserving: message types and postMessage payloads unchanged.
 */

import * as vscode from "vscode";
import { SECRET_KEYS } from "../../../models";
import { LlmTestService } from "../../../services/LlmTestService";
import { ProviderConfigService } from "../../../services/ProviderConfigService";

/** Base-URL config key per provider. */
const BASE_URL_KEYS: Record<string, string> = {
  anthropic: "anthropicBaseUrl",
  openai: "openaiBaseUrl",
  lmstudio: "lmstudioBaseUrl",
  openrouter: "openrouterBaseUrl",
};

/** Handles LLM provider/model/key/ollama/test messages for the Settings panel. */
export class LlmSettingsHandler {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly llmTestService: LlmTestService,
    private readonly configService: ProviderConfigService,
    private readonly postMessage: (msg: any) => void
  ) {}

  /** Fetch and post the model list for a provider. */
  async getModels(provider: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const currentModel = config.get<string>("llmModel", "");
    const { models, selected, defaultModel } = await this.configService.getModels(provider, currentModel);
    this.postMessage({ type: "models", provider, models, selected, defaultModel });
  }

  /** Persist a provider-specific base URL (optional override). */
  async setBaseUrl(provider: string, url: string): Promise<void> {
    const key = BASE_URL_KEYS[provider];
    if (key) { await this.configService.updateConfig(key, url); }
  }

  /** Store an API key in SecretStorage. */
  async saveApiKey(provider: string, key: string): Promise<void> {
    const secretKey = SECRET_KEYS[provider];
    if (!secretKey) {
      this.postMessage({ type: "keySaved", provider, success: false, error: "Unknown provider" });
      return;
    }
    try {
      await this.secrets.store(secretKey, key);
      this.postMessage({ type: "keySaved", provider, success: true });
    } catch (err: any) {
      this.postMessage({ type: "keySaved", provider, success: false, error: err.message });
    }
  }

  /** Remove a stored API key. */
  async clearApiKey(provider: string): Promise<void> {
    const secretKey = SECRET_KEYS[provider];
    if (!secretKey) { return; }
    await this.secrets.delete(secretKey);
    this.postMessage({ type: "keyCleared", provider });
  }

  /** Probe a local Ollama server (5s timeout). */
  async testOllama(url: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      const error = response.ok ? undefined : `HTTP ${response.status}`;
      this.postMessage({ type: "ollamaTested", success: response.ok, error });
    } catch (err: any) {
      this.postMessage({ type: "ollamaTested", success: false, error: err.message });
    }
  }

  /** Run an end-to-end LLM test prompt. */
  async testLlm(provider?: string, baseUrl?: string): Promise<void> {
    const result = await this.llmTestService.testLlm(provider, baseUrl);
    this.postMessage({ type: "llmTestResult", ...result });
  }

  /** Auto-test after a provider switch and notify. */
  async autoTest(provider: string): Promise<void> {
    const result = await this.llmTestService.autoTestAndNotify(provider);
    this.postMessage({ type: "llmTestResult", ...result });
  }
}
