/**
 * ProviderConfigAddProfile — Add profile operation for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import { writeLlmApiKey } from "../config/llm-secret-keys.js";
import { invalidateProviderTurnConfigCache } from "../pi-workflow/pi-provider-config-bridge.js";
import type { ProfileTableRow, ProfileOpResult, LlmProviderId } from "../shared/types/llm-profile.js";
import { isValidProvider } from "../shared/types/llm-profile.js";

const PROFILES_KEY = "llm.profiles";
const ACTIVE_PROFILE_KEY = "llm.activeProfileId";

export interface AddProfileDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  invalidateCache: () => void;
  toTableRow: (p: any) => ProfileTableRow;
}

/** Add a new profile. */
export async function addProfile(
  deps: AddProfileDeps,
  payload: {
    id: string;
    label: string;
    provider: LlmProviderId;
    baseUrl?: string;
    model: string;
    useDefaultUrl: boolean;
    apiKey?: string;
  }
): Promise<ProfileOpResult> {
  try {
    const config = deps.getConfig();
    const profiles = config.get<any[]>(PROFILES_KEY, []).map((p) => deps.toTableRow(p));

    // Validate
    if (!/^[a-z0-9-]+$/.test(payload.id)) {
      return { success: false, error: "Profile ID must be a valid slug [a-z0-9-]+" };
    }
    if (profiles.some((p) => p.profileId === payload.id)) {
      return { success: false, error: `Profile ID '${payload.id}' already exists` };
    }
    if (!payload.label?.trim()) {
      return { success: false, error: "Profile label is required" };
    }
    if (!payload.model?.trim()) {
      return { success: false, error: "Model is required" };
    }
    if (!isValidProvider(payload.provider)) {
      return { success: false, error: "Unknown provider" };
    }
    if (!payload.useDefaultUrl && payload.baseUrl) {
      try { new URL(payload.baseUrl); }
      catch { return { success: false, error: "Base URL must be a valid URL" }; }
    }

    const newRow: ProfileTableRow = {
      profileId: payload.id,
      label: payload.label.trim(),
      provider: payload.provider,
      model: payload.model.trim(),
      useDefaultUrl: payload.useDefaultUrl,
      lastTestStatus: "untested",
      lastTestedAt: undefined,
    };

    // Save API key if provided
    if (payload.apiKey?.trim()) {
      await writeLlmApiKey(deps.secrets, payload.id, payload.apiKey.trim(), true);
    }

    // Persist full profile
    const fullProfiles = config.get<any[]>(PROFILES_KEY, []);
    const fullProfile = {
      id: payload.id,
      label: payload.label.trim(),
      provider: payload.provider,
      baseUrl: payload.useDefaultUrl ? undefined : (payload.baseUrl?.trim() || undefined),
      model: payload.model.trim(),
      useDefaultUrl: payload.useDefaultUrl,
      lastTestStatus: "untested" as const,
      lastTestedAt: undefined,
    };
    fullProfiles.push(fullProfile);
    await config.update(PROFILES_KEY, fullProfiles, vscode.ConfigurationTarget.Global);

    // If first profile, make it active
    if (fullProfiles.length === 1) {
      await config.update(ACTIVE_PROFILE_KEY, payload.id, vscode.ConfigurationTarget.Global);
    }

    deps.invalidateCache();
    return { success: true, profiles: [...profiles, newRow], activeProfileId: fullProfiles.length === 1 ? payload.id : undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}