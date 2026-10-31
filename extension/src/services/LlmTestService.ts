/**
 * LlmTestService — handles LLM connection testing logic for profiles.
 * Updated for SA4E-389: tests a specific profile and persists status.
 */

import * as vscode from "vscode";
import { createProviderByType } from "../mcp/providers";
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS, PROVIDER_BASE_URL_LEGACY_KEYS } from "../models";
import { getSetting } from "../config/settings-migration";
import { readLlmApiKey } from "../config/llm-secret-keys.js";
import { readProviderTurnConfig } from "../pi-workflow/pi-provider-config-bridge.js";

const TEST_TIMEOUT_MS = 10000;
const AUTO_TEST_TIMEOUT_MS = 8000;

export interface LlmTestResult {
  success: boolean;
  message?: string;
  error?: string;
  profileId?: string;
  status?: "connected" | "failed";
  testedAt?: number;
}

export class LlmTestService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Test a specific profile's connection.
   * Returns result with profileId and status for persistence.
   */
  async testProfile(
    profileId: string,
    profileData: {
      provider: string;
      model: string;
      baseUrl?: string;
      useDefaultUrl: boolean;
    }
  ): Promise<LlmTestResult> {
    const providerType = profileData.provider;
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "llm.ollama.baseUrl", "http://localhost:11434");

    // Determine base URL for the provider
    let anthropicBaseUrl = "";
    let openaiBaseUrl = "";

    if (providerType === "anthropic") {
      anthropicBaseUrl = profileData.useDefaultUrl
        ? (PROVIDER_BASE_URL_DEFAULTS.anthropic || "")
        : (profileData.baseUrl || "");
    } else {
      const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerType];
      const defaultUrl = PROVIDER_BASE_URL_DEFAULTS[providerType] || "";
      openaiBaseUrl = profileData.useDefaultUrl
        ? defaultUrl
        : (profileData.baseUrl || defaultUrl);
    }

    try {
      const provider = createProviderByType(
        providerType as any,
        this.secrets,
        undefined,
        ollamaUrl,
        anthropicBaseUrl,
        openaiBaseUrl
      );

      const timeoutPromise = new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("Connection test timed out after 10s")), TEST_TIMEOUT_MS)
      );

      const available = await Promise.race([provider.isAvailable(), timeoutPromise]);
      provider.dispose();

      const status = available ? "connected" : "failed";
      const testedAt = Date.now();

      if (available) {
        vscode.commands.executeCommand("sdlcAgents.notifyLlmConnected");
        return {
          success: true,
          message: `Connected to ${providerType} successfully.`,
          profileId,
          status,
          testedAt,
        };
      }

      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return {
        success: false,
        error: "LLM provider is not reachable. Check your base URL and API key.",
        profileId,
        status,
        testedAt,
      };
    } catch (err: any) {
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      const status = "failed" as const;
      const testedAt = Date.now();
      return {
        success: false,
        error: err.message,
        profileId,
        status,
        testedAt,
      };
    }
  }

  /**
   * Test LLM connection with given provider/baseUrl overrides (legacy path).
   * Used by the old test button — kept for backward compatibility.
   */
  async testLlm(
    providerOverride?: string,
    baseUrlOverride?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const { providerId: providerType } = readProviderTurnConfig();
    const finalProvider = providerOverride || providerType;
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "llm.ollama.baseUrl", "http://localhost:11434");

    const anthropicBaseUrl = providerType === "anthropic"
      ? (baseUrlOverride || getSetting<string>("llm.anthropic.baseUrl", "llm.anthropic.baseUrl", ""))
      : "";
    const openaiBaseUrl = providerType !== "anthropic"
      ? (baseUrlOverride || getSetting<string>("llm.openai.baseUrl", "llm.openai.baseUrl", ""))
      : "";

    try {
      const provider = createProviderByType(
        providerType as any,
        this.secrets,
        undefined,
        ollamaUrl,
        anthropicBaseUrl,
        openaiBaseUrl
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
   * Auto-test a provider and notify chat panel badge (legacy path).
   */
  async autoTestAndNotify(provider: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "llm.ollama.baseUrl", "http://localhost:11434");

    const baseUrlKey = PROVIDER_BASE_URL_KEYS[provider];
    const defaultUrl = PROVIDER_BASE_URL_DEFAULTS[provider] || "";
    const baseUrl = baseUrlKey
      ? (getSetting<string>(baseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[provider], "") || defaultUrl)
      : "";

    const anthropicBaseUrl = provider === "anthropic" ? baseUrl : "";
    const openaiBaseUrl = provider !== "anthropic" ? baseUrl : "";

    try {
      const testProvider = createProviderByType(
        provider as any,
        this.secrets,
        undefined,
        ollamaUrl,
        anthropicBaseUrl,
        openaiBaseUrl
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
      return { success: false, error: `Connection test failed: ${(err as Error).message}` };
    }
  }
}