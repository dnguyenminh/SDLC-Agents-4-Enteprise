/**
 * ProfileSettingsHandler — handles LLM profile management messages for the Settings panel.
 * SA4E-389: Profile CRUD, test connection, set active, grouped model picker data.
 */

import * as vscode from "vscode";
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

      case "getModelPickerGroups":
        await this.sendModelPickerGroups();
        return true;

      default:
        return false;
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

    // Get full profile data for baseUrl
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    const fullProfiles = config.get<any[]>("llm.profiles", []);
    const fullProfile = fullProfiles.find((p: any) => p.id === profileId);

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