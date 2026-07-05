/**
 * LlmTestService — handles LLM connection testing logic.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { createProviderByType } from "../langgraph/providers";
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS } from "../models";

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
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const providerType = providerOverride || config.get<string>("llmProvider", "anthropic");
    const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");

    const anthropicBaseUrl = providerType === "anthropic"
      ? (baseUrlOverride || config.get<string>("anthropicBaseUrl", ""))
      : "";
    const openaiBaseUrl = providerType !== "anthropic"
      ? (baseUrlOverride || config.get<string>("openaiBaseUrl", ""))
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
        vscode.commands.executeCommand("kiroSdlc.notifyLlmConnected");
        return { success: true, message: `Connected to ${providerType} successfully.` };
      }
      vscode.commands.executeCommand("kiroSdlc.notifyLlmDisconnected");
      return { success: false, error: "LLM provider is not reachable. Check your base URL." };
    } catch (err: any) {
      vscode.commands.executeCommand("kiroSdlc.notifyLlmDisconnected");
      return { success: false, error: err.message };
    }
  }

  /**
   * Auto-test a provider and notify chat panel badge.
   */
  async autoTestAndNotify(provider: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");

    const baseUrlKey = PROVIDER_BASE_URL_KEYS[provider];
    const defaultUrl = PROVIDER_BASE_URL_DEFAULTS[provider] || "";
    const baseUrl = baseUrlKey
      ? (config.get<string>(baseUrlKey, "") || defaultUrl)
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
        vscode.commands.executeCommand("kiroSdlc.notifyLlmConnected");
        return { success: true, message: `Connected to ${provider} successfully.` };
      }
      vscode.commands.executeCommand("kiroSdlc.notifyLlmDisconnected");
      return { success: false, error: "LLM provider is not reachable." };
    } catch {
      vscode.commands.executeCommand("kiroSdlc.notifyLlmDisconnected");
      return { success: false, error: "Connection test failed." };
    }
  }
}
