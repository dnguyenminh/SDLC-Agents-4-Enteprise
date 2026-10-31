/**
 * ProviderConfigSetActiveProfile — Set active profile operation for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import type { ProfileTableRow, ProfileOpResult } from "../shared/types/llm-profile.js";

const PROFILES_KEY = "llm.profiles";
const ACTIVE_PROFILE_KEY = "llm.activeProfileId";

export interface SetActiveProfileDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  invalidateCache: () => void;
  toTableRow: (p: any) => ProfileTableRow;
}

/** Set active profile. */
export async function setActiveProfile(
  deps: SetActiveProfileDeps,
  profileId: string
): Promise<ProfileOpResult> {
  try {
    const config = deps.getConfig();
    const fullProfiles = config.get<any[]>(PROFILES_KEY, []);
    const profile = fullProfiles.find((p: any) => p.id === profileId);
    if (!profile) {
      return { success: false, error: `Profile '${profileId}' not found` };
    }

    await config.update(ACTIVE_PROFILE_KEY, profileId, vscode.ConfigurationTarget.Global);
    deps.invalidateCache();

    const rows = fullProfiles.map((p: any) => deps.toTableRow(p));
    return { success: true, profiles: rows, activeProfileId: profileId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}