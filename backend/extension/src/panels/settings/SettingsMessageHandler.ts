/**
 * SettingsMessageHandler — handles all webview messages for the Settings panel.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { SECRET_KEYS } from "../../models";
import { LlmTestService } from "../../services/LlmTestService";
import { ProviderConfigService } from "../../services/ProviderConfigService";

export class SettingsMessageHandler {
  private readonly llmTestService: LlmTestService;
  private readonly configService: ProviderConfigService;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly postMessage: (msg: any) => void
  ) {
    this.llmTestService = new LlmTestService(secrets);
    this.configService = new ProviderConfigService(secrets);
  }

  async handle(msg: any): Promise<void> {
    switch (msg.type) {
      case "ready":
      case "getState":
        await this.sendCurrentState();
        break;
      case "setProvider":
        await this.configService.updateConfig("llmProvider", msg.provider);
        await this.sendCurrentState();
        await this.handleAutoTest(msg.provider);
        break;
      case "getModels":
        await this.handleGetModels(msg.provider);
        break;
      case "setModel":
        await this.configService.updateConfig("llmModel", msg.model);
        break;
      case "setOllamaUrl":
        await this.configService.updateConfig("ollamaUrl", msg.url);
        break;
      case "setBaseUrl":
        await this.handleSetBaseUrl(msg.provider, msg.url);
        break;
      case "saveApiKey":
        await this.handleSaveApiKey(msg.provider, msg.key);
        break;
      case "clearApiKey":
        await this.handleClearApiKey(msg.provider);
        break;
      case "testOllamaConnection":
        await this.handleTestOllama(msg.url);
        break;
      case "testLlm":
      case "testLlmConnection":
        await this.handleTestLlm(msg.provider, msg.baseUrl);
        break;
      case "setBackendUrl":
        await this.handleSetBackendUrl(msg.url);
        break;
      case "testBackendConnection":
        await this.handleTestBackend(msg.url);
        break;
      case "setMcpServerPort":
        await this.handleSetMcpPort(msg.port);
        break;
      case "setEnableMcpServer":
        await this.handleSetEnableMcp(msg.enabled);
        break;
      case "restartMcpServer":
        await this.handleRestartMcpServer();
        break;
    }
  }

  private async sendCurrentState(): Promise<void> {
    const state = await this.configService.getCurrentState();
    this.postMessage({ type: "state", ...state });
    const { models, selected, defaultModel } = await this.configService.getModels(state.provider, state.model);
    this.postMessage({ type: "models", provider: state.provider, models, selected, defaultModel });
  }

  private async handleGetModels(provider: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const currentModel = config.get<string>("llmModel", "");
    const { models, selected, defaultModel } = await this.configService.getModels(provider, currentModel);
    this.postMessage({ type: "models", provider, models, selected, defaultModel });
  }

  private async handleSetBaseUrl(provider: string, url: string): Promise<void> {
    const keyMap: Record<string, string> = {
      anthropic: "anthropicBaseUrl",
      openai: "openaiBaseUrl",
      lmstudio: "lmstudioBaseUrl",
      openrouter: "openrouterBaseUrl",
    };
    const key = keyMap[provider];
    if (key) { await this.configService.updateConfig(key, url); }
  }

  private async handleSaveApiKey(provider: string, key: string): Promise<void> {
    const secretKey = SECRET_KEYS[provider];
    if (!secretKey) {
      this.postMessage({ type: "keySaved", provider, success: false, error: "Unknown provider" });
      return;
    }
    try {
      await this.secrets.store(secretKey, key);
      this.postMessage({ type: "keySaved", provider, success: true });
    } catch (err: any) {
      this.postMessage({ type: "keySaved", provider, success: false, error: err.message });
    }
  }

  private async handleClearApiKey(provider: string): Promise<void> {
    const secretKey = SECRET_KEYS[provider];
    if (!secretKey) { return; }
    await this.secrets.delete(secretKey);
    this.postMessage({ type: "keyCleared", provider });
  }

  private async handleTestOllama(url: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        this.postMessage({ type: "ollamaTested", success: true });
      } else {
        this.postMessage({ type: "ollamaTested", success: false, error: `HTTP ${response.status}` });
      }
    } catch (err: any) {
      this.postMessage({ type: "ollamaTested", success: false, error: err.message });
    }
  }

  private async handleTestLlm(provider?: string, baseUrl?: string): Promise<void> {
    const result = await this.llmTestService.testLlm(provider, baseUrl);
    this.postMessage({ type: "llmTestResult", ...result });
  }

  private async handleAutoTest(provider: string): Promise<void> {
    const result = await this.llmTestService.autoTestAndNotify(provider);
    this.postMessage({ type: "llmTestResult", ...result });
  }

  private async handleSetBackendUrl(url: string): Promise<void> {
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("backend.url", url, vscode.ConfigurationTarget.Workspace);
  }

  private async handleTestBackend(url: string): Promise<void> {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      if (response.ok) {
        this.postMessage({ type: "backendTestResult", success: true, message: "Connected", latencyMs });
      } else {
        this.postMessage({ type: "backendTestResult", success: false, message: `HTTP ${response.status}`, latencyMs });
      }
    } catch (err: any) {
      this.postMessage({ type: "backendTestResult", success: false, message: err.message });
    }
  }

  private async handleSetMcpPort(port: number): Promise<void> {
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("mcpServerPort", port, vscode.ConfigurationTarget.Workspace);
  }

  private async handleSetEnableMcp(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration("kiroSdlc")
      .update("enableMcpServer", enabled, vscode.ConfigurationTarget.Workspace);
  }

  private async handleRestartMcpServer(): Promise<void> {
    try {
      await vscode.commands.executeCommand("kiroSdlc.restartMcpServer");
      this.postMessage({ type: "mcpServerRestarted", success: true, message: "MCP wrapper server restarted successfully." });
    } catch (err: any) {
      this.postMessage({ type: "mcpServerRestarted", success: false, message: `Restart failed: ${err.message}` });
    }
  }
}
