/**
 * ProviderConfigGetProfiles — Get profiles queries for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import type { ProfileTableRow } from "../shared/types/llm-profile.js";

const PROFILES_KEY = "llm.profiles";
const ACTIVE_PROFILE_KEY = "llm.activeProfileId";

export interface GetProfilesDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  invalidateCache: () => void;
  toTableRow: (p: any) => ProfileTableRow;
}

/** Get all profiles as table rows. */
export async function getProfileRows(deps: GetProfilesDeps): Promise<ProfileTableRow[]> {
  const config = deps.getConfig();
  const profiles = config.get<any[]>(PROFILES_KEY, []);
  return profiles.map((p) => deps.toTableRow(p));
}

/** Get the active profile row. */
export async function getActiveProfileRow(deps: GetProfilesDeps): Promise<ProfileTableRow | undefined> {
  const config = deps.getConfig();
  const activeProfileId = config.get<string>(ACTIVE_PROFILE_KEY);
  if (!activeProfileId) { return undefined; }
  const profiles = await getProfileRows(deps);
  return profiles.find((p) => p.profileId === activeProfileId);
}