/**
 * ProviderConfigDeleteProfile — Delete profile operation for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import { deleteLlmApiKey } from "../config/llm-secret-keys.js";
import type { ProfileTableRow, ProfileOpResult } from "../shared/types/llm-profile.js";

const PROFILES_KEY = "llm.profiles";
const ACTIVE_PROFILE_KEY = "llm.activeProfileId";

export interface DeleteProfileDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  invalidateCache: () => void;
  toTableRow: (p: any) => ProfileTableRow;
}

/** Delete a profile. */
export async function deleteProfile(
  deps: DeleteProfileDeps,
  profileId: string
): Promise<ProfileOpResult> {
  try {
    const config = deps.getConfig();
    const fullProfiles = config.get<any[]>(PROFILES_KEY, []);
    const index = fullProfiles.findIndex((p: any) => p.id === profileId);
    if (index === -1) {
      return { success: false, error: `Profile '${profileId}' not found` };
    }

    const wasActive = (config.get<string>(ACTIVE_PROFILE_KEY)) === profileId;

    // Delete API key
    await deleteLlmApiKey(deps.secrets, profileId, true);

    fullProfiles.splice(index, 1);
    await config.update(PROFILES_KEY, fullProfiles, vscode.ConfigurationTarget.Global);

    let newActiveId: string | undefined;
    if (wasActive) {
      newActiveId = fullProfiles.length > 0 ? fullProfiles[0].id : undefined;
      await config.update(ACTIVE_PROFILE_KEY, newActiveId, vscode.ConfigurationTarget.Global);
    }

    deps.invalidateCache();
    const rows = fullProfiles.map((p: any) => deps.toTableRow(p));
    return { success: true, profiles: rows, activeProfileId: newActiveId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}