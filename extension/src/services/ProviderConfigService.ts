/**
 * ProviderConfigService — manages reading/writing LLM provider configuration.
 * Updated for SA4E-389: now works with multi-profile configuration.
 * Reads active profile from `sdlcAgents.llm.profiles` and `sdlcAgents.llm.activeProfileId`.
 * SA4E-390: Split into focused modules (Cache, Models, Migration, Profile Ops, Secrets, State, BaseUrl, Workspace).
 */

import * as vscode from "vscode";
import { ensureMigrated } from "./WorkspaceScopeResolver";
import { ProfileTableRow, LlmProviderId } from "../shared/types/llm-profile.js";
import { invalidateProviderTurnConfigCache, readProviderTurnConfig } from "../pi-workflow/pi-provider-config-bridge.js";
import { ProviderConfigCache } from "./ProviderConfigCache.js";
import { buildModelListForProvider, buildModelListForActiveProfile, buildModelPickerGroups } from "./ProviderConfigModels.js";
import { runLlmProfileMigration } from "./ProviderConfigMigration.js";
import { addProfile } from "./ProviderConfigAddProfile.js";
import { editProfile } from "./ProviderConfigEditProfile.js";
import { deleteProfile } from "./ProviderConfigDeleteProfile.js";
import { setActiveProfile } from "./ProviderConfigSetActiveProfile.js";
import { updateProfileTestStatus } from "./ProviderConfigUpdateTestStatus.js";
import { getProfileRows, getActiveProfileRow } from "./ProviderConfigGetProfiles.js";
import { writeProfileApiKey, deleteProfileApiKey, readProfileApiKey, readSecret, safeGet } from "./ProviderConfigSecrets.js";
import { getCurrentState } from "./ProviderConfigState.js";
import { getBaseUrlForProvider, getBaseUrlForProfile } from "./ProviderConfigBaseUrl.js";
import { updateConfig, updatePegaConfig, clearPegaPassword } from "./ProviderConfigWorkspace.js";

export interface ProfileState {
  profiles: ProfileTableRow[];
  activeProfileId: string | undefined;
  activeProfile: ProfileTableRow | undefined;
}

export interface ProfileOpResult {
  success: boolean;
  profiles?: ProfileTableRow[];
  activeProfileId?: string;
  error?: string;
}

export class ProviderConfigService {
  private readonly cache = new ProviderConfigCache();
  private readonly context?: vscode.ExtensionContext;
  private readonly deps: {
    getConfig: () => vscode.WorkspaceConfiguration;
    secrets: vscode.SecretStorage;
    invalidateCache: () => void;
    toTableRow: (p: any) => ProfileTableRow;
  };

  constructor(
    private readonly secrets: vscode.SecretStorage,
    context?: vscode.ExtensionContext
  ) {
    this.context = context;
    this.deps = {
      getConfig: () => this.getConfig(),
      secrets: this.secrets,
      invalidateCache: () => this.invalidateCache(),
      toTableRow: (p: any) => this.toTableRow(p),
    };
  }

  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("sdlcAgents");
  }

  private async ensureProfileMigration(): Promise<void> {
    if (this.context) await runLlmProfileMigration(this.context, () => this.getConfig());
  }

  private invalidateCache(): void {
    invalidateProviderTurnConfigCache();
    this.cache.invalidate();
  }

  private toTableRow(p: any): ProfileTableRow {
    return { profileId: p.id, label: p.label, provider: p.provider, model: p.model, useDefaultUrl: p.useDefaultUrl ?? true, lastTestStatus: p.lastTestStatus, lastTestedAt: p.lastTestedAt };
  }

  /** Build current settings state for webview. */
  async getCurrentState(): Promise<{
    provider: string; model: string; ollamaUrl: string; baseUrl: string;
    hasAnthropicKey: boolean; hasOpenaiKey: boolean;
    backendUrl: string; allowInsecureRemote: boolean;
    mcpServerPort: number; enableMcpServer: boolean;
    pegaEndpoint: string; pegaUsername: string; hasPegaPassword: boolean;
    atlassianBaseUrl: string; atlassianEmail: string; hasAtlassianToken: boolean;
    atlassianConnectionType: string;
    profiles: ProfileTableRow[];
    activeProfileId: string | undefined;
  }> {
    await ensureMigrated(this.secrets);
    await this.ensureProfileMigration();
    return getCurrentState({
      getConfig: () => this.getConfig(),
      secrets: this.secrets,
      getProfileRows: () => this.getProfileRows(),
      getActiveProfileRow: () => this.getActiveProfileRow(),
      getBaseUrlForProvider: (p) => getBaseUrlForProvider(p),
      getBaseUrlForProfile: (p) => getBaseUrlForProfile({ getConfig: () => this.getConfig() }, p),
      safeGet: (k) => safeGet({ secrets: this.secrets, getConfig: () => this.getConfig() }, k),
      readSecret: (wsHash, base) => readSecret({ secrets: this.secrets, getConfig: () => this.getConfig() }, wsHash, base as "pega" | "atlassianBaseUrl" | "atlassianEmail" | "atlassianToken"),
    });
  }

  async getProfileRows(): Promise<ProfileTableRow[]> {
    return getProfileRows(this.deps);
  }

  async getActiveProfileRow(): Promise<ProfileTableRow | undefined> {
    return getActiveProfileRow(this.deps);
  }

  async addProfile(payload: { id: string; label: string; provider: LlmProviderId; baseUrl?: string; model: string; useDefaultUrl: boolean; apiKey?: string }): Promise<ProfileOpResult> {
    return addProfile(this.deps, payload);
  }

  async editProfile(profileId: string, updates: Partial<Pick<ProfileTableRow, "label" | "provider" | "model" | "useDefaultUrl">> & { baseUrl?: string; apiKey?: string }): Promise<ProfileOpResult> {
    return editProfile(this.deps, profileId, updates);
  }

  async deleteProfile(profileId: string): Promise<ProfileOpResult> {
    return deleteProfile(this.deps, profileId);
  }

  async setActiveProfile(profileId: string): Promise<ProfileOpResult> {
    return setActiveProfile(this.deps, profileId);
  }

  async updateProfileTestStatus(profileId: string, status: "connected" | "failed", timestamp = Date.now()): Promise<ProfileOpResult> {
    return updateProfileTestStatus(this.deps, profileId, status, timestamp);
  }

  async getModels(provider: string, currentModel: string): Promise<{ models: any[]; selected: string; defaultModel: string }> {
    return buildModelListForProvider(this.secrets, provider, currentModel, () => this.getConfig());
  }

  async getModelsForActiveProfile(): Promise<{ models: any[]; selected: string; defaultModel: string; provider: string }> {
    const activeProfile = await this.getActiveProfileRow();
    if (!activeProfile) {
      const turnConfig = readProviderTurnConfig();
      const result = await buildModelListForProvider(this.secrets, turnConfig.providerId, turnConfig.configuredModelId, () => this.getConfig());
      return { ...result, provider: turnConfig.providerId };
    }
    return buildModelListForActiveProfile(this.secrets, activeProfile, () => this.getConfig());
  }

  async getModelPickerGroups(): Promise<Array<{ provider: string; items: Array<{ profileId: string; modelId: string; modelName: string; isFree: boolean }> }>> {
    return buildModelPickerGroups(() => this.getConfig(), () => this.getProfileRows());
  }

  async updateConfig(key: string, value: any): Promise<void> {
    return updateConfig({ secrets: this.secrets, getConfig: () => this.getConfig() }, key, value);
  }

  async updatePegaConfig(endpoint: string, username: string, password?: string): Promise<void> {
    return updatePegaConfig({ secrets: this.secrets, getConfig: () => this.getConfig() }, endpoint, username, password);
  }

  async clearPegaPassword(): Promise<void> {
    return clearPegaPassword({ secrets: this.secrets, getConfig: () => this.getConfig() });
  }

  async writeProfileApiKey(profileId: string, key: string): Promise<void> {
    return writeProfileApiKey({ secrets: this.secrets, getConfig: () => this.getConfig() }, profileId, key);
  }

  async deleteProfileApiKey(profileId: string): Promise<void> {
    return deleteProfileApiKey({ secrets: this.secrets, getConfig: () => this.getConfig() }, profileId);
  }

  async readProfileApiKey(profileId: string): Promise<string | undefined> {
    return readProfileApiKey({ secrets: this.secrets, getConfig: () => this.getConfig() }, profileId);
  }
}