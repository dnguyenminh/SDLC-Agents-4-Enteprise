/**
 * ChatModelManager — handles model list fetching and sending to webview.
 * SA4E-389: Updated to support grouped model picker from connected profiles.
 */

import { getStaticModels, getDefaultModel, fetchGatewayModels } from "./chat-models";
import { ChatExtToWebviewMessage, ModelPickerGroup, ModelPickerItem } from "./message-protocol";
import { readProviderTurnConfig } from "../pi-workflow/pi-provider-config-bridge.js";
import { ProviderConfigService } from "../services/ProviderConfigService";

export class ChatModelManager {
  constructor(
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void,
    private readonly configService?: ProviderConfigService
  ) {}

  /**
   * Build and send the provider-aware model list to the webview (legacy).
   * For gateway providers, attempts /v1/models first, falling back to static catalog.
   * SA4E-369 UAT fix: provider/baseUrl/model read via the SHARED config helper
   * (dot keys + legacy flat-key fallback) — plain config.get('llm.provider')
   * returned the manifest default for users still holding the flat keys
   * (llmProvider=lmstudio), so the webview showed the wrong model list.
   */
  async sendModels(): Promise<void> {
    const { providerId: provider, baseUrl, configuredModelId: llmModel } = readProviderTurnConfig();

    let models = getStaticModels(provider);

    const isLocalGatewayBaseUrl = baseUrl !== undefined && baseUrl.includes("127.0.0.1");
    if (isLocalGatewayBaseUrl || provider === "lmstudio") {
      // Gateway provider (or any provider pointed at a local gateway):
      // the real /v1/models list wins over the static catalog.
      const gatewayBaseUrl = baseUrl
        ?? (provider === "lmstudio" ? "http://localhost:1234/v1" : undefined);
      if (gatewayBaseUrl) {
        const gatewayModels = await fetchGatewayModels(gatewayBaseUrl);
        if (gatewayModels && gatewayModels.length > 0) {
          models = gatewayModels;
        }
      }
    }

    let selected = llmModel;
    if (selected && !models.some((m) => m.id === selected)) {
      models = [...models, { id: selected, name: selected }];
    } else if (!selected) {
      selected = models.length > 0 ? models[0].id : getDefaultModel(provider);
    }

    this.sendToWebview({
      type: "chat:models",
      provider,
      models,
      selected,
      supportsAuto: true,
    });
  }

  /**
   * Send grouped model picker data (connected profiles only, grouped by provider).
   * This is the new SA4E-389 model picker data source.
   */
  async sendModelPickerGroups(): Promise<void> {
    if (!this.configService) {
      console.warn("[ChatModelManager] No configService available for model picker groups");
      this.sendToWebview({ type: "chat:modelPickerGroups", groups: [] });
      return;
    }

    const groups = await this.configService.getModelPickerGroups();
    this.sendToWebview({ type: "chat:modelPickerGroups", groups });
  }

  /**
   * Handle model + profile switch from the grouped picker.
   * Updates the active profile and model in settings.
   */
  async handleSetModelAndProfile(profileId: string, model: string): Promise<void> {
    if (!this.configService) {
      console.warn("[ChatModelManager] No configService available for setModelAndProfile");
      return;
    }

    // Set the active profile
    const profileResult = await this.configService.setActiveProfile(profileId);
    if (!profileResult.success) {
      console.error("[ChatModelManager] Failed to set active profile:", profileResult.error);
      return;
    }

    // Update the model for the active profile
    const editResult = await this.configService.editProfile(profileId, { model });
    if (!editResult.success) {
      console.error("[ChatModelManager] Failed to update model:", editResult.error);
      return;
    }

    // Invalidate config cache so readProviderTurnConfig picks up new values
    const { invalidateProviderTurnConfigCache } = await import("../pi-workflow/pi-provider-config-bridge.js");
    invalidateProviderTurnConfigCache();

    // Send confirmation to webview
    this.sendToWebview({
      type: "chat:modelAndProfileSet",
      profileId,
      model,
    });

    // Also send updated model list for legacy dropdown
    await this.sendModels();
  }
}