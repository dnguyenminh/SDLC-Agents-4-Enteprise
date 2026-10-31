/**
 * ProviderConfigUpdateTestStatus — Update profile test status for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import type { ProfileTableRow, ProfileOpResult } from "../shared/types/llm-profile.js";

const PROFILES_KEY = "llm.profiles";

export interface UpdateTestStatusDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  invalidateCache: () => void;
  toTableRow: (p: any) => ProfileTableRow;
}

/** Update test status of a profile. */
export async function updateProfileTestStatus(
  deps: UpdateTestStatusDeps,
  profileId: string,
  status: "connected" | "failed",
  timestamp = Date.now()
): Promise<ProfileOpResult> {
  try {
    const config = deps.getConfig();
    const fullProfiles = config.get<any[]>(PROFILES_KEY, []);
    const index = fullProfiles.findIndex((p: any) => p.id === profileId);
    if (index === -1) {
      return { success: false, error: `Profile '${profileId}' not found` };
    }

    fullProfiles[index] = {
      ...fullProfiles[index],
      lastTestStatus: status,
      lastTestedAt: timestamp,
    };

    await config.update(PROFILES_KEY, fullProfiles, vscode.ConfigurationTarget.Global);
    deps.invalidateCache();

    const rows = fullProfiles.map((p: any) => deps.toTableRow(p));
    return { success: true, profiles: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}