/**
 * ProfilesPersistence — storage operations for LLM profiles.
 * Extracted from ProfilesService for SRP and line limits.
 */

import * as vscode from "vscode";
import { LlmProfile, ProfileTableRow } from "../shared/types/llm-profile.js";
import { writeLlmApiKey, deleteLlmApiKey } from "../config/llm-secret-keys.js";
import { invalidateProviderTurnConfigCache } from "../pi-workflow/pi-provider-config-bridge.js";

const PROFILES_KEY = "llm.profiles";
const ACTIVE_PROFILE_KEY = "llm.activeProfileId";

export interface PersistenceContext {
  secrets: vscode.SecretStorage;
  getConfig: () => vscode.WorkspaceConfiguration;
}

export interface ReadContext {
  getConfig: () => vscode.WorkspaceConfiguration;
}

export async function loadProfiles(ctx: ReadContext): Promise<LlmProfile[]> {
  const config = ctx.getConfig();
  return config.get<LlmProfile[]>(PROFILES_KEY, []).map(normalizeProfile);
}

export async function getActiveProfileId(ctx: ReadContext): Promise<string | undefined> {
  return ctx.getConfig().get<string>(ACTIVE_PROFILE_KEY);
}

export async function persistProfiles(ctx: PersistenceContext, profiles: LlmProfile[]): Promise<void> {
  await ctx.getConfig().update(PROFILES_KEY, profiles, vscode.ConfigurationTarget.Global);
  invalidateProviderTurnConfigCache();
}

export async function persistActiveProfileId(ctx: PersistenceContext, profileId: string | undefined): Promise<void> {
  await ctx.getConfig().update(ACTIVE_PROFILE_KEY, profileId, vscode.ConfigurationTarget.Global);
  invalidateProviderTurnConfigCache();
}

export async function saveApiKey(ctx: PersistenceContext, profileId: string, apiKey: string): Promise<void> {
  await writeLlmApiKey(ctx.secrets, profileId, apiKey.trim(), true);
}

export async function deleteApiKey(ctx: PersistenceContext, profileId: string): Promise<void> {
  await deleteLlmApiKey(ctx.secrets, profileId, true);
}

export async function addProfile(
  ctx: PersistenceContext,
  profile: LlmProfile
): Promise<{ profiles: LlmProfile[]; activeProfileId?: string }> {
  const existing = await loadProfiles(ctx);
  const updated = [...existing, profile];
  await persistProfiles(ctx, updated);

  let newActiveId: string | undefined;
  if (updated.length === 1) {
    newActiveId = profile.id;
    await persistActiveProfileId(ctx, newActiveId);
  }
  return { profiles: updated, activeProfileId: newActiveId };
}

export async function updateProfile(
  ctx: PersistenceContext,
  profileId: string,
  updatedProfile: LlmProfile
): Promise<LlmProfile[]> {
  const profiles = await loadProfiles(ctx);
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) throw new Error(`Profile '${profileId}' not found`);
  profiles[index] = updatedProfile;
  await persistProfiles(ctx, profiles);
  return profiles;
}

export async function deleteProfile(
  ctx: PersistenceContext,
  profileId: string
): Promise<{ profiles: LlmProfile[]; newActiveId?: string }> {
  const profiles = await loadProfiles(ctx);
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) throw new Error(`Profile '${profileId}' not found`);

  const wasActive = (await getActiveProfileId(ctx)) === profileId;
  await deleteApiKey(ctx, profileId);
  profiles.splice(index, 1);
  await persistProfiles(ctx, profiles);

  let newActiveId: string | undefined;
  if (wasActive) {
    newActiveId = profiles.length > 0 ? profiles[0].id : undefined;
    await persistActiveProfileId(ctx, newActiveId);
  }
  return { profiles, newActiveId };
}

export async function setActiveProfile(ctx: PersistenceContext, profileId: string): Promise<void> {
  await persistActiveProfileId(ctx, profileId);
}

export async function updateTestStatus(
  ctx: PersistenceContext,
  profileId: string,
  status: "connected" | "failed",
  timestamp = Date.now()
): Promise<LlmProfile | null> {
  const profiles = await loadProfiles(ctx);
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) return null;
  profiles[index] = { ...profiles[index], lastTestStatus: status, lastTestedAt: timestamp };
  await persistProfiles(ctx, profiles);
  return profiles[index];
}

export function toTableRow(p: LlmProfile): ProfileTableRow {
  return {
    profileId: p.id, label: p.label, provider: p.provider,
    model: p.model, useDefaultUrl: p.useDefaultUrl,
    lastTestStatus: p.lastTestStatus, lastTestedAt: p.lastTestedAt,
  };
}

function normalizeProfile(p: any): LlmProfile {
  return {
    id: p.id, label: p.label, provider: p.provider, baseUrl: p.baseUrl,
    model: p.model ?? "auto", useDefaultUrl: p.useDefaultUrl ?? true,
    lastTestStatus: p.lastTestStatus, lastTestedAt: p.lastTestedAt,
  };
}