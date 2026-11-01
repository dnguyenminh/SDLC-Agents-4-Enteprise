/**
 * ChatModelManager — handles model list fetching and sending to webview.
 */

import { getStaticModels, getDefaultModel, fetchGatewayModels } from "./chat-models";
import { ChatExtToWebviewMessage } from "./message-protocol";
import { readProviderTurnConfig } from "../pi-workflow/pi-provider-config-bridge.js";

export class ChatModelManager {
  constructor(
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void
  ) {}

  /**
   * Build and send the provider-aware model list to the webview.
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
}
