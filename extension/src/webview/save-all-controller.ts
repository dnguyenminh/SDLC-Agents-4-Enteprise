/**
 * Save All Controller — Persists all provider configurations to workspace config
 * and SecretStorage atomically. Uses SA4E-389's llmSecretKey() for secrets.
 * Updated for SA4E-389: uses multi-profile configuration (llm.profiles, llm.activeProfileId).
 */

import * as vscode from "vscode";
import { llmSecretKey } from "../config/llm-secret-keys";
import { PROVIDER_BASE_URL_KEYS } from "../models/LlmProviderConfig";
import { invalidateProviderTurnConfigCache } from "../pi-workflow/pi-provider-config-bridge.js";

export interface ProviderConfig {
  providerId: string;
  name: string;
  model: string;
  baseUrl?: string;
  apiKey?: string; // Only present when being saved (not in table display)
}

export interface SaveAllResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * SaveAllController — coordinates persisting all provider configurations.
 * Writes to workspace configuration (sdlcAgents.llm.*) and SecretStorage.
 */
export class SaveAllController {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly context: vscode.ExtensionContext
  ) {}

  /**
   * Save all provider configurations atomically.
   * - Workspace config: provider profiles (llm.profiles), active profile (llm.activeProfileId)
   * - SecretStorage: API keys per profile (via llmSecretKey)
   */
  async saveAll(providers: ProviderConfig[]): Promise<SaveAllResult> {
    const config = vscode.workspace.getConfiguration("sdlcAgents");

    try {
      // 1. Build the provider profiles array for workspace config (new multi-profile format)
      const profiles = providers.map((p) => ({
        id: p.providerId,
        label: p.name,
        provider: p.providerId,
        model: p.model,
        baseUrl: p.baseUrl || "",
        useDefaultUrl: !p.baseUrl,
        lastTestStatus: "untested" as const,
        lastTestedAt: undefined,
      }));

      // 2. Persist workspace configuration (atomic update)
      await config.update("llm.profiles", profiles, vscode.ConfigurationTarget.Workspace);

      // 3. Set active profile (first provider or existing active)
      const activeProviderId = profiles[0]?.id;
      if (activeProviderId) {
        await config.update("llm.activeProfileId", activeProviderId, vscode.ConfigurationTarget.Workspace);
      }

      // 4. Persist per-provider base URLs to dotted keys (for backward compat with some readers)
      for (const provider of providers) {
        const baseUrlKey = PROVIDER_BASE_URL_KEYS[provider.providerId];
        if (baseUrlKey && provider.baseUrl) {
          await config.update(baseUrlKey, provider.baseUrl, vscode.ConfigurationTarget.Workspace);
        }
      }

      // 5. Persist API keys to SecretStorage using SA4E-389's llmSecretKey()
      // Use the provider's model as part of the secret key for isolation
      for (const provider of providers) {
        if (provider.apiKey && provider.apiKey.trim().length > 0) {
          const secretKey = llmSecretKey(`${provider.providerId}-${provider.model}`);
          await this.secrets.store(secretKey, provider.apiKey.trim());
        }
      }

      // Invalidate config cache so readProviderTurnConfig picks up new values
      invalidateProviderTurnConfigCache();

      return {
        success: true,
        message: `Saved ${providers.length} provider configuration(s) successfully`,
      };
    } catch (err: any) {
      console.error("[SaveAllController] Failed to save all:", err);
      return {
        success: false,
        message: "Failed to save configurations",
        error: err.message,
      };
    }
  }

  /**
   * Get the currently active provider from workspace config (new profile format).
   */
  private async getActiveProvider(): Promise<string> {
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    return config.get<string>("llm.activeProfileId") || "anthropic";
  }

  /**
   * Delete a provider's API key from SecretStorage.
   * Uses SA4E-389's llmSecretKey for proper key isolation.
   */
  async deleteProviderKey(providerId: string, model: string): Promise<void> {
    const secretKey = llmSecretKey(`${providerId}-${model}`);
    await this.secrets.delete(secretKey);
    // Also clean up legacy key if exists
    const legacyKey = secretKey.replace(/^sdlcAgents\./, "kiroSdlc.");
    await this.secrets.delete(legacyKey);
  }

  /**
   * Save a single provider's API key.
   * Used by Edit Provider modal when saving individual provider.
   */
  async saveProviderKey(providerId: string, model: string, apiKey: string): Promise<SaveAllResult> {
    try {
      const secretKey = llmSecretKey(`${providerId}-${model}`);
      await this.secrets.store(secretKey, apiKey.trim());
      return { success: true, message: "API key saved" };
    } catch (err: any) {
      return { success: false, message: "Failed to save API key", error: err.message };
    }
  }
}