/**
 * ProfileSettingsHandler — handles LLM profile management messages for the Settings panel.
 * SA4E-389: Profile CRUD, test connection, set active, grouped model picker data.
 */

import { ProviderConfigService } from "../../../services/ProviderConfigService";
import { LlmTestService } from "../../../services/LlmTestService";
import { LlmProviderId } from "../../../shared/types/llm-profile.js";

export class ProfileSettingsHandler {
  constructor(
    private readonly configService: ProviderConfigService,
    private readonly llmTestService: LlmTestService,
    private readonly postMessage: (msg: any) => void
  ) {}

  /** Handle incoming profile-related messages. Returns true if handled. */
  async handle(msg: any): Promise<boolean> {
    switch (msg.type) {
      case "getProfiles":
        await this.sendProfiles();
        return true;

      case "addProfile":
        await this.addProfile(msg.payload);
        return true;

      case "editProfile":
        await this.editProfile(msg.profileId, msg.payload);
        return true;

      case "deleteProfile":
        await this.deleteProfile(msg.profileId);
        return true;

      case "setActiveProfile":
        await this.setActiveProfile(msg.profileId);
        return true;

      case "testProfile":
        await this.testProfile(msg.profileId);
        return true;

      // SA4E-390 Edit Provider modal: single Save routes to add or edit by id.
      case "saveProfile":
        await this.saveProfile(msg.payload);
        return true;

      // SA4E-390 Edit Provider modal: ad-hoc connection test BEFORE a profile
      // is saved (no profileId in config yet) — test the typed config directly.
      case "testProfileConnection":
        await this.testProfileConnection(msg);
        return true;

      // SA4E-390 Provider Table "Save All": persist every row at once.
      case "saveAllProfiles":
        await this.saveAllProfiles(msg.profiles);
        return true;

      case "getModelPickerGroups":
        await this.sendModelPickerGroups();
        return true;

      // SA4E-390 UX: the Edit Provider modal's Model field is a combobox that
      // auto-fills when the provider/base URL changes. Fetch the provider's
      // live model list (/v1/models) from the Base URL the modal is editing.
      case "getProviderModels":
        await this.sendProviderModels(msg.provider, msg.baseUrl);
        return true;

      default:
        return false;
    }
  }

  /**
   * Fetch a provider's model list for the modal's Model combobox. baseUrl is
   * the value typed in the modal — fetch /v1/models from THAT server so the
   * list matches what the user is configuring (not the saved setting).
   */
  private async sendProviderModels(provider: string, baseUrl?: string): Promise<void> {
    try {
      if (!provider) { this.postMessage({ type: "providerModels", provider, models: [] }); return; }
      const { models } = await this.configService.getModels(provider, "", baseUrl);
      this.postMessage({ type: "providerModels", provider, models });
    } catch (err) {
      // Non-fatal: the combobox just stays free-text. Report empty list.
      this.postMessage({ type: "providerModels", provider, models: [], error: (err as Error).message });
    }
  }

  /**
   * SA4E-390: the Edit Provider modal has a single Save button. Route to
   * editProfile when the id already exists, otherwise addProfile — the
   * webview does not track which mode it is in at the handler boundary.
   */
  private async saveProfile(payload: {
    id: string;
    label: string;
    provider: string;
    baseUrl?: string;
    model: string;
    useDefaultUrl: boolean;
    apiKey?: string;
  }): Promise<void> {
    const existing = await this.configService.getProfileRows();
    if (existing.some((p) => p.profileId === payload.id)) {
      await this.editProfile(payload.id, payload);
    } else {
      await this.addProfile(payload);
    }
  }

  /**
   * SA4E-390: ad-hoc test for the Edit Provider modal. The profile is not yet
   * persisted, so test the typed provider/baseUrl directly via LlmTestService
   * (end-to-end real completion) and report back with the temp profileId.
   */
  private async testProfileConnection(msg: {
    profileId: string;
    provider: string;
    baseUrl?: string;
    model?: string;
  }): Promise<void> {
    this.postMessage({ type: "profileTestStarted", profileId: msg.profileId });
    const result = await this.llmTestService.testProfile(msg.profileId, {
      provider: msg.provider,
      model: msg.model,
      baseUrl: msg.baseUrl,
      useDefaultUrl: !msg.baseUrl,
    });
    this.postMessage({ type: "profileTested", profileId: msg.profileId, ...result });
  }

  /**
   * SA4E-390 Provider Table "Save All": upsert every provided row. API keys
   * are left untouched here (each row carries no secret — keys are saved
   * through the modal), so this persists label/provider/model/baseUrl only.
   */
  private async saveAllProfiles(rows: Array<{
    profileId: string;
    label: string;
    provider: string;
    baseUrl?: string;
    model: string;
    useDefaultUrl?: boolean;
  }>): Promise<void> {
    try {
      const existing = await this.configService.getProfileRows();
      let saved = 0;
      for (const row of rows || []) {
        const payload = {
          id: row.profileId,
          label: row.label,
          provider: row.provider,
          baseUrl: row.baseUrl,
          model: row.model,
          useDefaultUrl: row.useDefaultUrl ?? !row.baseUrl,
        };
        const result = existing.some((p) => p.profileId === row.profileId)
          ? await this.configService.editProfile(row.profileId, payload)
          : await this.configService.addProfile(payload);
        if (!result.success) {
          this.postMessage({ type: "saveAllResult", success: false, error: `${row.label}: ${result.error}` });
          return;
        }
        saved++;
      }
      this.postMessage({ type: "saveAllResult", success: true, message: `Saved ${saved} provider configuration(s).` });
      await this.sendProfiles();
    } catch (err) {
      this.postMessage({ type: "saveAllResult", success: false, error: (err as Error).message });
    }
  }

  /** Send current profile list and active profile to webview. */
  private async sendProfiles(): Promise<void> {
    const profiles = await this.configService.getProfileRows();
    const activeProfile = await this.configService.getActiveProfileRow();
    this.postMessage({ type: "profiles", profiles, activeProfileId: activeProfile?.profileId });
  }

  /** Add a new profile. */
  private async addProfile(payload: {
    id: string;
    label: string;
    provider: string;
    baseUrl?: string;
    model: string;
    useDefaultUrl: boolean;
    apiKey?: string;
  }): Promise<void> {
    // Validate provider
    const validProviders: LlmProviderId[] = ["anthropic", "openai", "lmstudio", "openrouter", "ollama", "onnx"];
    if (!validProviders.includes(payload.provider as LlmProviderId)) {
      this.postMessage({ type: "profileAdded", success: false, error: `Unknown provider: ${payload.provider}` });
      return;
    }

    const result = await this.configService.addProfile({
      id: payload.id,
      label: payload.label,
      provider: payload.provider as LlmProviderId,
      baseUrl: payload.baseUrl,
      model: payload.model,
      useDefaultUrl: payload.useDefaultUrl,
      apiKey: payload.apiKey,
    });
    this.postMessage({ type: "profileAdded", ...result });
    if (result.success) {
      await this.sendProfiles();
    }
  }

  /** Edit an existing profile. */
  private async editProfile(profileId: string, payload: {
    label?: string;
    provider?: string;
    baseUrl?: string;
    model?: string;
    useDefaultUrl?: boolean;
    apiKey?: string;
  }): Promise<void> {
    // Validate provider if provided
    const validProviders: LlmProviderId[] = ["anthropic", "openai", "lmstudio", "openrouter", "ollama", "onnx"];
    if (payload.provider && !validProviders.includes(payload.provider as LlmProviderId)) {
      this.postMessage({ type: "profileEdited", success: false, error: `Unknown provider: ${payload.provider}` });
      return;
    }

    const updates: any = {};
    if (payload.label !== undefined) updates.label = payload.label;
    if (payload.provider !== undefined) updates.provider = payload.provider;
    if (payload.model !== undefined) updates.model = payload.model;
    if (payload.useDefaultUrl !== undefined) updates.useDefaultUrl = payload.useDefaultUrl;
    if (payload.baseUrl !== undefined) updates.baseUrl = payload.baseUrl;
    if (payload.apiKey !== undefined) updates.apiKey = payload.apiKey;

    const result = await this.configService.editProfile(profileId, updates);
    this.postMessage({ type: "profileEdited", ...result });
    if (result.success) {
      await this.sendProfiles();
    }
  }

  /** Delete a profile. */
  private async deleteProfile(profileId: string): Promise<void> {
    const result = await this.configService.deleteProfile(profileId);
    this.postMessage({ type: "profileDeleted", ...result });
    if (result.success) {
      await this.sendProfiles();
    }
  }

  /** Set the active profile. */
  private async setActiveProfile(profileId: string): Promise<void> {
    const result = await this.configService.setActiveProfile(profileId);
    this.postMessage({ type: "activeProfileSet", ...result });
    if (result.success) {
      await this.sendProfiles();
    }
  }

  /** Test a profile's connection and update its status. */
  private async testProfile(profileId: string): Promise<void> {
    // Get profile data
    const profiles = await this.configService.getProfileRows();
    const profile = profiles.find((p) => p.profileId === profileId);
    if (!profile) {
      this.postMessage({ type: "profileTested", profileId, success: false, error: "Profile not found" });
      return;
    }

    // Notify webview that test started
    this.postMessage({ type: "profileTestStarted", profileId });

    // Get full profile data for baseUrl (SA4E-390: Memento-backed store).
    const fullProfile = await this.configService.getProfileById(profileId);

    // Run test
    const result = await this.llmTestService.testProfile(profileId, {
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.useDefaultUrl ? undefined : (fullProfile?.baseUrl),
      useDefaultUrl: profile.useDefaultUrl,
    });

    // Persist status
    if (result.status && result.testedAt) {
      await this.configService.updateProfileTestStatus(profileId, result.status, result.testedAt);
    }

    // Send result
    this.postMessage({ type: "profileTested", ...result });

    // Refresh profiles list
    await this.sendProfiles();
  }

  /** Send grouped model picker data (connected profiles only). */
  private async sendModelPickerGroups(): Promise<void> {
    const groups = await this.configService.getModelPickerGroups();
    this.postMessage({ type: "modelPickerGroups", groups });
  }
}