/**
 * ProviderConfigEditProfile — Edit profile operation for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import { writeLlmApiKey, deleteLlmApiKey } from "../config/llm-secret-keys.js";
import type { ProfileTableRow, ProfileOpResult } from "../shared/types/llm-profile.js";

const PROFILES_KEY = "llm.profiles";

export interface EditProfileDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  invalidateCache: () => void;
  toTableRow: (p: any) => ProfileTableRow;
}

/** Edit an existing profile. */
export async function editProfile(
  deps: EditProfileDeps,
  profileId: string,
  updates: Partial<Pick<ProfileTableRow, "label" | "provider" | "model" | "useDefaultUrl">> & { baseUrl?: string; apiKey?: string }
): Promise<ProfileOpResult> {
  try {
    const config = deps.getConfig();
    const fullProfiles = config.get<any[]>(PROFILES_KEY, []);
    const index = fullProfiles.findIndex((p: any) => p.id === profileId);
    if (index === -1) {
      return { success: false, error: `Profile '${profileId}' not found` };
    }

    const current = fullProfiles[index];

    // Validate
    if (updates.provider && !["anthropic", "openai", "lmstudio", "openrouter", "ollama", "onnx"].includes(updates.provider)) {
      return { success: false, error: `Unknown provider: ${updates.provider}` };
    }
    if (updates.label !== undefined && !updates.label.trim()) {
      return { success: false, error: "Profile label cannot be empty" };
    }
    if (updates.model !== undefined && !updates.model.trim()) {
      return { success: false, error: "Model cannot be empty" };
    }
    const useDefault = updates.useDefaultUrl ?? current.useDefaultUrl;
    const baseUrl = updates.baseUrl !== undefined ? updates.baseUrl : current.baseUrl;
    if (!useDefault && baseUrl) {
      try { new URL(baseUrl); }
      catch { return { success: false, error: "Base URL must be a valid URL" }; }
    }

    // Update full profile
    fullProfiles[index] = {
      ...current,
      label: updates.label?.trim() ?? current.label,
      provider: updates.provider ?? current.provider,
      baseUrl: useDefault ? undefined : (baseUrl?.trim() || undefined),
      model: updates.model?.trim() ?? current.model,
      useDefaultUrl: useDefault,
      lastTestStatus: current.lastTestStatus,
      lastTestedAt: current.lastTestedAt,
    };

    // Handle API key
    if (updates.apiKey !== undefined) {
      if (updates.apiKey.trim()) {
        await writeLlmApiKey(deps.secrets, profileId, updates.apiKey.trim(), true);
      } else {
        await deleteLlmApiKey(deps.secrets, profileId, true);
      }
    }

    await config.update(PROFILES_KEY, fullProfiles, vscode.ConfigurationTarget.Global);
    deps.invalidateCache();

    const rows = fullProfiles.map((p: any) => deps.toTableRow(p));
    return { success: true, profiles: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}