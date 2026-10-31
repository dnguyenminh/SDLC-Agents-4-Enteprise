/**
 * ProfilesReader — read-only operations for LLM profiles.
 * Extracted from ProfilesService for SRP and line limits.
 */

import { LlmProfile, ProfileTableRow } from "../shared/types/llm-profile.js";
import { loadProfiles, getActiveProfileId, toTableRow, ReadContext } from "./profiles-persistence.js";

export type ProfilesReaderContext = ReadContext;

/**
 * Load all profiles from settings.
 */
export async function listProfiles(ctx: ProfilesReaderContext): Promise<LlmProfile[]> {
  return loadProfiles(ctx);
}

/**
 * Load profiles as table rows for the Settings UI.
 */
export async function listProfileRows(ctx: ProfilesReaderContext): Promise<ProfileTableRow[]> {
  const profiles = await listProfiles(ctx);
  return profiles.map(toTableRow);
}

/**
 * Get the currently active profile ID.
 */
export async function getActiveProfileIdReader(ctx: ProfilesReaderContext): Promise<string | undefined> {
  return getActiveProfileId(ctx);
}

/**
 * Get the active profile object, or undefined if none set.
 */
export async function getActiveProfile(ctx: ProfilesReaderContext): Promise<LlmProfile | undefined> {
  const activeId = await getActiveProfileIdReader(ctx);
  if (!activeId) { return undefined; }
  const profiles = await listProfiles(ctx);
  return profiles.find((p) => p.id === activeId);
}

/**
 * Resolve a profile by its ID.
 */
export async function resolveProfile(ctx: ProfilesReaderContext, profileId: string): Promise<LlmProfile | undefined> {
  const profiles = await listProfiles(ctx);
  return profiles.find((p) => p.id === profileId);
}