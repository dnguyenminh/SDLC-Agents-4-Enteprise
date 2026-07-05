/**
 * ChatModelManager — handles model list fetching and sending to webview.
 */

import * as vscode from "vscode";
import { getStaticModels, getDefaultModel, fetchGatewayModels } from "./chat-models";
import { ChatExtToWebviewMessage } from "./message-protocol";

export class ChatModelManager {
  constructor(
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void
  ) {}

  /**
   * Build and send the provider-aware model list to the webview.
   * For gateway providers, attempts /v1/models first, falling back to static catalog.
   */
  async sendModels(): Promise<void> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const provider = config.get<string>("llmProvider", "anthropic");
    const anthropicBaseUrl = config.get<string>("anthropicBaseUrl", "");

    let models = getStaticModels(provider);

    const isGatewayBaseUrl =
      (provider === "anthropic" && anthropicBaseUrl.includes("127.0.0.1"));

    if (isGatewayBaseUrl) {
      const gatewayModels = await fetchGatewayModels(anthropicBaseUrl);
      if (gatewayModels && gatewayModels.length > 0) {
        models = gatewayModels;
      }
    }

    const llmModel = config.get<string>("llmModel", "");
    let selected = llmModel;
    if (!selected || !models.some((m) => m.id === selected)) {
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
