/**
 * ProfilesService — CRUD operations for LLM profiles (write operations).
 * Persists to VS Code settings: `sdlcAgents.llm.profiles` (array) and
 * `sdlcAgents.llm.activeProfileId` (string). All API key operations go
 * through the llm-secret-keys helper — never direct SecretStorage access.
 * Uses ProfilesValidator, ProfilesPersistence, and ProfilesReader for SRP compliance.
 */

import * as vscode from "vscode";
import { LlmProfile, ProfileTableRow, LlmProviderId } from "../shared/types/llm-profile.js";
import { readLlmApiKey, profileSecretKey } from "../config/llm-secret-keys.js";
import {
  validateAddProfile,
  validateEditProfile,
  validateProfileExists,
} from "./profiles-validator.js";
import {
  persistProfiles,
  persistActiveProfileId,
  saveApiKey,
  deleteApiKey,
  addProfile,
  updateProfile,
  deleteProfile,
  setActiveProfile,
  updateTestStatus,
} from "./profiles-persistence.js";
import {
  listProfiles,
  listProfileRows,
  getActiveProfileIdReader,
  getActiveProfile,
  resolveProfile,
} from "./profiles-reader.js";

/** Result of a profile operation. */
export interface ProfileResult {
  success: boolean;
  profile?: LlmProfile;
  profiles?: LlmProfile[];
  activeProfileId?: string;
  error?: string;
}

/**
 * Service for managing LLM configuration profiles.
 * Delegates validation to ProfilesValidator, persistence to ProfilesPersistence,
 * and read operations to ProfilesReader.
 */
export class ProfilesService {
  private readonly ctx: { secrets: vscode.SecretStorage; getConfig: () => vscode.WorkspaceConfiguration };

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.ctx = {
      secrets,
      getConfig: () => vscode.workspace.getConfiguration("sdlcAgents"),
    };
  }

  async listProfiles(): Promise<LlmProfile[]> { return listProfiles(this.ctx); }
  async listProfileRows(): Promise<ProfileTableRow[]> { return listProfileRows(this.ctx); }
  async getActiveProfileId(): Promise<string | undefined> { return getActiveProfileIdReader(this.ctx); }
  async getActiveProfile(): Promise<LlmProfile | undefined> { return getActiveProfile(this.ctx); }
  async resolveProfile(profileId: string): Promise<LlmProfile | undefined> { return resolveProfile(this.ctx, profileId); }

  async addProfile(payload: {
    id: string; label: string; provider: LlmProviderId;
    baseUrl?: string; model: string; useDefaultUrl: boolean; apiKey?: string;
  }): Promise<ProfileResult> {
    const existing = await this.listProfiles();
    const validation = await validateAddProfile(payload, existing);
    if (!validation.valid) return { success: false, error: validation.error };

    const profile: LlmProfile = {
      id: payload.id, label: payload.label.trim(), provider: payload.provider,
      baseUrl: payload.useDefaultUrl ? undefined : (payload.baseUrl?.trim() || undefined),
      model: payload.model.trim(), useDefaultUrl: payload.useDefaultUrl,
      lastTestStatus: "untested", lastTestedAt: undefined,
    };

    if (payload.apiKey?.trim()) await saveApiKey(this.ctx, payload.id, payload.apiKey.trim());

    const { profiles, activeProfileId } = await addProfile(this.ctx, profile);
    return { success: true, profile, profiles, activeProfileId };
  }

  async editProfile(
    profileId: string,
    updates: Partial<Pick<LlmProfile, "label" | "provider" | "baseUrl" | "model" | "useDefaultUrl">> & { apiKey?: string }
  ): Promise<ProfileResult> {
    const profiles = await this.listProfiles();
    const current = profiles.find((p) => p.id === profileId);
    if (!current) return { success: false, error: `Profile '${profileId}' not found` };

    const validation = validateEditProfile(updates, current);
    if (!validation.valid) return { success: false, error: validation.error };

    if (updates.apiKey !== undefined) {
      if (updates.apiKey.trim()) await saveApiKey(this.ctx, profileId, updates.apiKey.trim());
      else await deleteApiKey(this.ctx, profileId);
    }

    const useDefault = updates.useDefaultUrl ?? current.useDefaultUrl;
    const baseUrl = updates.baseUrl !== undefined ? updates.baseUrl : current.baseUrl;
    const updated: LlmProfile = {
      ...current, label: updates.label?.trim() ?? current.label, provider: updates.provider ?? current.provider,
      baseUrl: useDefault ? undefined : (baseUrl?.trim() || undefined),
      model: updates.model?.trim() ?? current.model, useDefaultUrl: useDefault,
      lastTestStatus: current.lastTestStatus, lastTestedAt: current.lastTestedAt,
    };

    const updatedProfiles = await updateProfile(this.ctx, profileId, updated);
    return { success: true, profile: updated, profiles: updatedProfiles };
  }

  async deleteProfile(profileId: string): Promise<ProfileResult> {
    const validation = validateProfileExists(profileId, await this.listProfiles());
    if (!validation.valid) return { success: false, error: validation.error };

    const { profiles, newActiveId } = await deleteProfile(this.ctx, profileId);
    return { success: true, profiles, activeProfileId: newActiveId };
  }

  async setActiveProfile(profileId: string): Promise<ProfileResult> {
    const validation = validateProfileExists(profileId, await this.listProfiles());
    if (!validation.valid) return { success: false, error: validation.error };

    await setActiveProfile(this.ctx, profileId);
    const profile = await this.resolveProfile(profileId);
    return { success: true, profile, activeProfileId: profileId };
  }

  async updateTestStatus(profileId: string, status: "connected" | "failed", timestamp = Date.now()): Promise<ProfileResult> {
    const validation = validateProfileExists(profileId, await this.listProfiles());
    if (!validation.valid) return { success: false, error: validation.error };

    const profile = await updateTestStatus(this.ctx, profileId, status, timestamp);
    if (!profile) return { success: false, error: `Profile '${profileId}' not found` };
    return { success: true, profile, profiles: await this.listProfiles() };
  }

  async getApiKey(profileId: string): Promise<string | undefined> { return readLlmApiKey(this.secrets, profileId, true); }
  getSecretKeyName(profileId: string): string { return profileSecretKey(profileId); }
}