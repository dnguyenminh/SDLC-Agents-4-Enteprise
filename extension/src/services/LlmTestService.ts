/**
 * LlmTestService — handles LLM connection testing logic.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { createProviderByType } from "../mcp/providers";
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS, PROVIDER_BASE_URL_LEGACY_KEYS } from "../models";
import { getSetting } from "../config/settings-migration";

const TEST_TIMEOUT_MS = 10000;
const AUTO_TEST_TIMEOUT_MS = 8000;

export class LlmTestService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Test LLM connection with given provider/baseUrl overrides.
   * Returns result and fires appropriate VS Code commands.
   */
  async testLlm(
    providerOverride?: string,
    baseUrlOverride?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const providerType = providerOverride || getSetting<string>("llm.provider", "llmProvider", "anthropic");
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "ollamaUrl", "http://localhost:11434");

    const anthropicBaseUrl = providerType === "anthropic"
      ? (baseUrlOverride || getSetting<string>("llm.anthropic.baseUrl", "anthropicBaseUrl", ""))
      : "";
    const openaiBaseUrl = providerType !== "anthropic"
      ? (baseUrlOverride || getSetting<string>("llm.openai.baseUrl", "openaiBaseUrl", ""))
      : "";

    try {
      const provider = createProviderByType(
        providerType as any, this.secrets, undefined,
        ollamaUrl, anthropicBaseUrl, openaiBaseUrl
      );
      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("Connection test timed out after 10s")), TEST_TIMEOUT_MS)
      );
      const available = await Promise.race([provider.isAvailable(), timeoutPromise]);
      provider.dispose();

      if (available) {
        vscode.commands.executeCommand("sdlcAgents.notifyLlmConnected");
        return { success: true, message: `Connected to ${providerType} successfully.` };
      }
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error: "LLM provider is not reachable. Check your base URL." };
    } catch (err: any) {
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error: err.message };
    }
  }

  /**
   * Auto-test a provider and notify chat panel badge.
   */
  async autoTestAndNotify(provider: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "ollamaUrl", "http://localhost:11434");

    const baseUrlKey = PROVIDER_BASE_URL_KEYS[provider];
    const defaultUrl = PROVIDER_BASE_URL_DEFAULTS[provider] || "";
    const baseUrl = baseUrlKey
      ? (getSetting<string>(baseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[provider], "") || defaultUrl)
      : "";

    const anthropicBaseUrl = provider === "anthropic" ? baseUrl : "";
    const openaiBaseUrl = provider !== "anthropic" ? baseUrl : "";

    try {
      const testProvider = createProviderByType(
        provider as any, this.secrets, undefined,
        ollamaUrl, anthropicBaseUrl, openaiBaseUrl
      );
      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), AUTO_TEST_TIMEOUT_MS)
      );
      const available = await Promise.race([testProvider.isAvailable(), timeoutPromise]);
      testProvider.dispose();

      if (available) {
        vscode.commands.executeCommand("sdlcAgents.notifyLlmConnected");
        return { success: true, message: `Connected to ${provider} successfully.` };
      }
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error: "LLM provider is not reachable." };
    } catch (err) {
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error: `Connection test failed: ${"$"}{(err as Error).message}` };
    }
  }
}

