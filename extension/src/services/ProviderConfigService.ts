/**
 * ProviderConfigService — manages reading/writing LLM provider configuration.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { getStaticModels, fetchGatewayModels, getDefaultModel } from "../chat-panel/chat-models";
import { SECRET_KEYS, PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS, PROVIDER_BASE_URL_LEGACY_KEYS } from "../models";
import { getBackendUrl } from "../config/backend-url";
import { getSetting } from "../config/settings-migration";
import { ensureMigrated, getWsHash, secretKey, readScopedSecret, type SecretBase } from "./WorkspaceScopeResolver";
import {
  type LlmProfile,
  type LlmProviderId,
  type LlmTestStatus,
  type ProfileOpResult,
  type ProfileTableRow,
  type ModelPickerGroup,
  type ModelPickerItem,
  isValidProfileId,
  isValidProvider,
} from "../shared/types/llm-profile.js";

/** Config keys isolated per workspace (SA4E-323) — never via generic updateConfig. */
const WORKSPACE_SCOPED_KEYS = ["pega.endpoint", "pega.username", "jira.connectionType"];

export class ProviderConfigService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /**
   * Build current settings state to send to webview.
   */
  async getCurrentState(): Promise<{
    provider: string; model: string; ollamaUrl: string; baseUrl: string;
    hasAnthropicKey: boolean; hasOpenaiKey: boolean;
    backendUrl: string; allowInsecureRemote: boolean;
    mcpServerPort: number; enableMcpServer: boolean;
    pegaEndpoint: string; pegaUsername: string; hasPegaPassword: boolean;
    atlassianBaseUrl: string; atlassianEmail: string; hasAtlassianToken: boolean;
    atlassianConnectionType: string;
    profiles: ProfileTableRow[]; activeProfileId?: string;
  }> {
    await ensureMigrated(this.secrets);
    let provider = getSetting<string>("llm.provider", "llm.provider", "anthropic");
    let model = getSetting<string>("llm.model", "llm.model", "");
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "llm.ollama.baseUrl", "http://localhost:11434");

    let baseUrl = this.getBaseUrlForProvider(provider);
    // Multi-profile mode: the active profile drives provider/model/baseUrl (SA4E-389).
    const rows = await this.readRows();
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    const activeRaw = rows.find((p) => p.id === config.get<string>("llm.activeProfileId"));
    if (activeRaw) {
      provider = activeRaw.provider;
      model = activeRaw.model;
      baseUrl = activeRaw.useDefaultUrl
        ? this.getBaseUrlForProvider(activeRaw.provider)
        : (activeRaw.baseUrl ?? "");
    }

    const backendUrl = getBackendUrl();
    const allowInsecureRemote = config.get<boolean>("backend.allowInsecureRemote", false);
    const mcpServerPort = getSetting<number>("mcp.serverPort", "mcp.serverPort", 9181);
    const enableMcpServer = getSetting<boolean>("mcp.enabled", "mcp.enabled", true);

    const anthropicKey = await this.safeGet(SECRET_KEYS.anthropic);
    const openaiKey = await this.safeGet(SECRET_KEYS.openai);
    const wsHash = getWsHash();
    const pegaPassword = await this.readSecret(wsHash, "pega");
    const pegaEndpoint = getSetting<string>("pega.endpoint", "pega.endpoint", "http://localhost:8080/prweb");
    const pegaUsername = getSetting<string>("pega.username", "pega.username", "");

    const atlassianBaseUrl = (await this.readSecret(wsHash, "atlassianBaseUrl")) || "";
    const atlassianEmail = (await this.readSecret(wsHash, "atlassianEmail")) || "";
    const atlassianToken = await this.readSecret(wsHash, "atlassianToken");
    const atlassianConnectionType = getSetting<string>("jira.connectionType", "jira.connectionType", "cloud");

    return {
      provider, model, ollamaUrl, baseUrl: baseUrl || "",
      hasAnthropicKey: !!anthropicKey, hasOpenaiKey: !!openaiKey,
      backendUrl, allowInsecureRemote, mcpServerPort, enableMcpServer,
      pegaEndpoint, pegaUsername, hasPegaPassword: !!pegaPassword,
      atlassianBaseUrl, atlassianEmail, hasAtlassianToken: !!atlassianToken,
      atlassianConnectionType,
      profiles: rows.map((p) => this.toTableRow(p)),
      activeProfileId: activeRaw?.id,
    };
  }

  async updatePegaConfig(endpoint: string, username: string, password?: string): Promise<void> {
    const wsHash = getWsHash();
    if (!wsHash) {
      throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
    }
    await ensureMigrated(this.secrets);
    const e = (endpoint || "").trim();
    const u = (username || "").trim();
    if (!/^https?:\/\//.test(e)) { throw new Error("Invalid Pega Endpoint URL (http/https required)."); }
    try {
      const config = vscode.workspace.getConfiguration("sdlcAgents");
      await config.update("pega.endpoint", e, vscode.ConfigurationTarget.Workspace);
      await config.update("pega.username", u, vscode.ConfigurationTarget.Workspace);
      if (password && password.trim().length > 0) {
        await this.secrets.store(secretKey("pega", wsHash)!, password);
      }
    } catch (err: any) {
      throw new Error(`Failed to save Pega config: ${err.message} (password may not be saved — retry).`);
    }
  }

  /** OI-8: explicit clear of the workspace Pega password; marker stays. */
  async clearPegaPassword(): Promise<void> {
    const wsHash = getWsHash();
    if (!wsHash) {
      throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
    }
    await this.secrets.delete(secretKey("pega", wsHash)!);
  }

  /**
   * Build the provider-aware model list.
   */
  async getModels(provider: string, currentModel: string): Promise<{
    models: { id: string; name: string; isFree?: boolean }[]; selected: string; defaultModel: string;
  }> {
    let models = getStaticModels(provider);
    const gatewayBaseUrl = this.getGatewayBaseUrl(provider);
    const lmstudioBaseUrl = getSetting<string>("llm.lmstudio.baseUrl", "llm.lmstudio.baseUrl", "")
      || "http://localhost:1234/v1";

    const fetchUrl = provider === "lmstudio"
      ? lmstudioBaseUrl
      : gatewayBaseUrl;

    if (fetchUrl) {
      // Pass the provider's API key as a Bearer token — gateways (e.g. OmniRoute)
      // return 401 on /v1/models without it, which caused a silent fallback to the
      // static catalog. Local providers (lmstudio/ollama) don't need auth.
      const providerSecretKey = SECRET_KEYS[provider];
      const apiKey = providerSecretKey ? await this.safeGet(providerSecretKey) : undefined;
      const authHeader = apiKey ? `Bearer ${apiKey}` : undefined;
      const gatewayModels = await fetchGatewayModels(fetchUrl, authHeader);
      if (gatewayModels && gatewayModels.length > 0) {
        models = gatewayModels;
      }
    }

    let selected = currentModel;
    if (selected && !models.some((m: any) => m.id === selected)) {
      models = [...models, { id: selected, name: selected }];
    } else if (!selected) {
      selected = models.length > 0 ? models[0].id : getDefaultModel(provider);
    }

    return { models, selected, defaultModel: getDefaultModel(provider) };
  }

  /** Update a kiroSdlc configuration key globally. */
  async updateConfig(key: string, value: any): Promise<void> {
    if (WORKSPACE_SCOPED_KEYS.includes(key)) {
      throw new Error(`Use workspace-scoped method for ${key} (SA4E-323).`);
    }
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    await config.update(key, value || undefined, vscode.ConfigurationTarget.Global);
  }

  /**
   * Read a workspace secret; null scope falls back to the legacy flat key.
   * SA4E-323: delegates to the shared readScopedSecret choke-point (BR-18) so
   * scope/legacy resolution lives in exactly one place.
   */
  private async readSecret(wsHash: string | null, base: SecretBase): Promise<string | undefined> {
    return readScopedSecret(this.secrets, base, wsHash);
  }

  /**
   * Best-effort secret read that never breaks state load (UC-3 EF-3).
   * Migrates on read: when a `sdlcAgents.*` key is empty but the pre-rename
   * `kiroSdlc.*` value exists, copy it forward and return it.
   */
  private async safeGet(key: string): Promise<string | undefined> {
    try {
      const current = await this.secrets.get(key);
      if (current) { return current; }
      const legacyKey = key.startsWith("sdlcAgents.")
        ? key.replace(/^sdlcAgents\./, "kiroSdlc.") : undefined;
      if (!legacyKey) { return undefined; }
      const legacy = await this.secrets.get(legacyKey);
      if (!legacy) { return undefined; }
      try { await this.secrets.store(key, legacy); } catch { /* fail-open write */ }
      return legacy;
    } catch { return undefined; }
  }

  private getBaseUrlForProvider(provider: string): string {
    const key = PROVIDER_BASE_URL_KEYS[provider];
    if (!key) { return ""; }
    return getSetting<string>(key, key, "");
  }

  private getGatewayBaseUrl(provider: string): string {
    const key = PROVIDER_BASE_URL_KEYS[provider];
    if (!key) { return ""; }
    const configuredUrl = getSetting<string>(key, key, "");
    return configuredUrl || PROVIDER_BASE_URL_DEFAULTS[provider] || "";
  }

  /** Map an LlmProfile to its webview row shape (profileId-keyed). */
  private toTableRow(p: LlmProfile): ProfileTableRow {
    return {
      profileId: p.id,
      label: p.label,
      provider: p.provider,
      model: p.model,
      useDefaultUrl: p.useDefaultUrl,
      lastTestStatus: p.lastTestStatus,
      lastTestedAt: p.lastTestedAt,
    };
  }

  /** Secret key that stores a profile's API key: `sdlcAgents.<profileId>ApiKey`. */
  private profileApiKeySecretKey(profileId: string): string {
    return `sdlcAgents.${profileId}ApiKey`;
  }

  /** Raw profiles list from configuration. */
  private async readRows(): Promise<LlmProfile[]> {
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    return config.get<LlmProfile[]>("llm.profiles", []);
  }

  /**
   * Get all profile rows (webview row shape) from the global config.
   */
  async getProfileRows(): Promise<ProfileTableRow[]> {
    return (await this.readRows()).map((p) => this.toTableRow(p));
  }

  /** Get the active profile row, or null when none is active. */
  async getActiveProfileRow(): Promise<ProfileTableRow | null> {
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    const activeId = config.get<string>("llm.activeProfileId");
    if (!activeId) { return null; }
    const active = (await this.readRows()).find((p) => p.id === activeId);
    return active ? this.toTableRow(active) : null;
  }

  /** Add a new profile; the first profile automatically becomes active. */
  async addProfile(payload: {
    id: string;
    label: string;
    provider: string;
    baseUrl?: string;
    model: string;
    useDefaultUrl: boolean;
    apiKey?: string;
  }): Promise<ProfileOpResult> {
    try {
      const profiles = await this.readRows();
      if (!isValidProfileId(payload.id)) {
        return { success: false, error: "Profile ID must be a valid slug [a-z0-9-]+" };
      }
      if (profiles.some((p) => p.id === payload.id)) {
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
      if (payload.apiKey?.trim()) {
        await this.secrets.store(this.profileApiKeySecretKey(payload.id), payload.apiKey.trim());
      }

      const newProfile: LlmProfile = {
        id: payload.id,
        label: payload.label.trim(),
        provider: payload.provider as LlmProviderId,
        baseUrl: payload.useDefaultUrl ? undefined : (payload.baseUrl?.trim() || undefined),
        model: payload.model.trim(),
        useDefaultUrl: payload.useDefaultUrl,
        lastTestStatus: "untested",
      };
      const updated = [...profiles, newProfile];
      const config = vscode.workspace.getConfiguration("sdlcAgents");
      await config.update("llm.profiles", updated, vscode.ConfigurationTarget.Global);

      let activeProfileId: string | undefined;
      if (updated.length === 1) {
        activeProfileId = payload.id;
        await config.update("llm.activeProfileId", payload.id, vscode.ConfigurationTarget.Global);
      }
      return { success: true, profiles: updated.map((p) => this.toTableRow(p)), activeProfileId };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** Edit an existing profile by profileId. */
  async editProfile(profileId: string, updates: {
    label?: string;
    provider?: string;
    baseUrl?: string;
    model?: string;
    useDefaultUrl?: boolean;
    apiKey?: string;
  }): Promise<ProfileOpResult> {
    try {
      const profiles = await this.readRows();
      const index = profiles.findIndex((p) => p.id === profileId);
      if (index === -1) {
        return { success: false, error: "Profile not found" };
      }
      if (updates.provider !== undefined && !isValidProvider(updates.provider)) {
        return { success: false, error: "Unknown provider" };
      }
      if (updates.baseUrl !== undefined && !updates.useDefaultUrl && updates.baseUrl) {
        try { new URL(updates.baseUrl); }
        catch { return { success: false, error: "Base URL must be a valid URL" }; }
      }

      const profile = profiles[index];
      if (updates.label !== undefined) { profile.label = updates.label.trim(); }
      if (updates.provider !== undefined) { profile.provider = updates.provider as LlmProviderId; }
      if (updates.model !== undefined) { profile.model = updates.model.trim(); }
      if (updates.useDefaultUrl !== undefined) { profile.useDefaultUrl = updates.useDefaultUrl; }
      if (updates.baseUrl !== undefined) {
        profile.baseUrl = updates.useDefaultUrl ? undefined : (updates.baseUrl?.trim() || undefined);
      }
      if (updates.apiKey !== undefined && updates.apiKey.trim()) {
        await this.secrets.store(this.profileApiKeySecretKey(profileId), updates.apiKey.trim());
      }

      const config = vscode.workspace.getConfiguration("sdlcAgents");
      await config.update("llm.profiles", profiles, vscode.ConfigurationTarget.Global);
      return { success: true, profiles: profiles.map((p) => this.toTableRow(p)) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** Delete a profile, its API key, and fix the active pointer. */
  async deleteProfile(profileId: string): Promise<ProfileOpResult> {
    try {
      const profiles = await this.readRows();
      const updated = profiles.filter((p) => p.id !== profileId);
      if (updated.length === profiles.length) {
        return { success: false, error: "Profile not found" };
      }
      await this.secrets.delete(this.profileApiKeySecretKey(profileId));

      const config = vscode.workspace.getConfiguration("sdlcAgents");
      await config.update("llm.profiles", updated, vscode.ConfigurationTarget.Global);

      let activeProfileId: string | undefined;
      if (config.get<string>("llm.activeProfileId") === profileId) {
        activeProfileId = updated.length > 0 ? updated[0].id : undefined;
        await config.update("llm.activeProfileId", activeProfileId, vscode.ConfigurationTarget.Global);
      }
      return { success: true, profiles: updated.map((p) => this.toTableRow(p)), activeProfileId };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** Set the active profile by profileId. */
  async setActiveProfile(profileId: string): Promise<ProfileOpResult> {
    try {
      const profiles = await this.readRows();
      if (!profiles.some((p) => p.id === profileId)) {
        return { success: false, error: "Profile not found" };
      }
      const config = vscode.workspace.getConfiguration("sdlcAgents");
      await config.update("llm.activeProfileId", profileId, vscode.ConfigurationTarget.Global);
      return { success: true, activeProfileId: profileId };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** Persist a profile's last connection-test outcome (testedAt: epoch ms or ISO). */
  async updateProfileTestStatus(
    profileId: string,
    status: LlmTestStatus | string,
    testedAt?: number | string,
  ): Promise<ProfileOpResult> {
    try {
      const profiles = await this.readRows();
      const index = profiles.findIndex((p) => p.id === profileId);
      if (index === -1) {
        return { success: false, error: "Profile not found" };
      }
      const at = typeof testedAt === "string" ? Date.parse(testedAt) : (testedAt ?? Date.now());
      profiles[index] = {
        ...profiles[index],
        lastTestStatus: status as LlmTestStatus,
        lastTestedAt: Number.isNaN(at) ? Date.now() : at,
      };
      const config = vscode.workspace.getConfiguration("sdlcAgents");
      await config.update("llm.profiles", profiles, vscode.ConfigurationTarget.Global);
      return { success: true, profiles: profiles.map((p) => this.toTableRow(p)) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /** Read the API key stored for a profile. */
  async readProfileApiKey(profileId: string): Promise<string | undefined> {
    try {
      return await this.secrets.get(this.profileApiKeySecretKey(profileId));
    } catch {
      return undefined;
    }
  }

  /**
   * Get models for the active profile (or the flat-config fallback).
   */
  async getModelsForActiveProfile(): Promise<{
    provider: string; selected: string; models: { id: string; name: string; isFree?: boolean }[];
  }> {
    const active = await this.getActiveProfileRow();
    if (!active) {
      const provider = getSetting<string>("llm.provider", "llm.provider", "anthropic");
      const fallback = getStaticModels(provider);
      const selected = getSetting<string>("llm.model", "llm.model", "") || (fallback[0]?.id ?? "");
      return { provider, selected, models: fallback };
    }
    const { models, selected } = await this.getModels(active.provider, active.model);
    return { provider: active.provider, selected, models };
  }

  /** Get model picker groups (connected profiles only, one item per profile). */
  async getModelPickerGroups(): Promise<ModelPickerGroup[]> {
    const rows = await this.getProfileRows();
    const byProvider = new Map<LlmProviderId, ModelPickerItem[]>();
    for (const row of rows) {
      if (row.lastTestStatus !== "connected") { continue; }
      const items = byProvider.get(row.provider) ?? [];
      items.push({
        provider: row.provider,
        modelName: row.model,
        isFree: false,
        profileId: row.profileId,
        modelId: row.model,
      });
      byProvider.set(row.provider, items);
    }
    return [...byProvider.entries()].map(([provider, items]) => ({ provider, items }));
  }
}
