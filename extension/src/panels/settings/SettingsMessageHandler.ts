/**
 * SettingsMessageHandler — handles all webview messages for the Settings panel.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { SECRET_KEYS } from "../../models";
import { LlmTestService } from "../../services/LlmTestService";
import { ProviderConfigService } from "../../services/ProviderConfigService";
import { AtlassianCredentialService } from "../../services/AtlassianCredentialService";
import { ProxyMessageHandler, PROXY_MESSAGE_TYPES } from "../../proxy/ProxyMessageHandler";

export class SettingsMessageHandler {
  private readonly llmTestService: LlmTestService;
  private readonly configService: ProviderConfigService;
  private readonly proxyHandler: ProxyMessageHandler;
  private readonly atlassianService: AtlassianCredentialService;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly postMessage: (msg: any) => void
  ) {
    this.llmTestService = new LlmTestService(secrets);
    this.configService = new ProviderConfigService(secrets);
    this.proxyHandler = new ProxyMessageHandler(secrets, postMessage);
    this.atlassianService = new AtlassianCredentialService(secrets);
  }

  async handle(msg: any): Promise<void> {
    // Delegate proxy messages to ProxyMessageHandler
    if (PROXY_MESSAGE_TYPES.includes(msg.type)) {
      await this.proxyHandler.handle(msg);
      return;
    }

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
      case "savePegaConfig":
        try {
          await this.configService.updatePegaConfig(msg.endpoint, msg.username, msg.password);
          this.postMessage({ type: "pegaSaved", success: true });
        } catch (err: any) {
          this.postMessage({ type: "pegaSaved", success: false, error: err.message || "Failed to save Pega config" });
        }
        break;
      case "testPegaConnection":
        try {
          await this.handleTestPegaConnection();
        } catch (err: any) {
          this.postMessage({ type: "pegaTestResult", success: false, message: `Connection failed: ${err.message}` });
        }
        break;
      case "fetchPegaContext":
        try {
          await this.handleFetchPegaContext();
        } catch (err: any) {
          this.postMessage({ type: "pegaContextFetched", success: false, message: `Fetch failed: ${err.message}` });
        }
        break;
      case "saveAtlassianConfig":
        await this.handleSaveAtlassianConfig(msg);
        break;
      case "testAtlassianConnection":
        await this.handleTestAtlassianConnection();
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
      "llm-server": "llmServerBaseUrl",
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

  private async handleTestPegaConnection(): Promise<void> {
    try {
      const { PegaHttpClient } = await import("../../services/PegaHttpClient");
      const client = new PegaHttpClient(this.secrets);
      const endpoint = client.getPegaEndpoint();
      // Only check connectivity — no auth, no login
      const res = await fetch(endpoint, { method: "GET" });
      if (res.status > 0) {
        this.postMessage({ type: "pegaTestResult", success: true, message: `✅ Network OK — Pega Server reachable (HTTP ${res.status}). Authentication not tested.` });
      } else {
        this.postMessage({ type: "pegaTestResult", success: false, message: "Connection failed: no response from server" });
      }
    } catch (err: any) {
      this.postMessage({ type: "pegaTestResult", success: false, message: `Connection failed: ${err.message}` });
    }
  }

  private async handleFetchPegaContext(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.postMessage({ type: "pegaContextFetched", success: false, message: "No workspace folder open to save Pega context." });
      return;
    }
    const root = folders[0].uri.fsPath;
    const client = new (await import("../../services/PegaHttpClient")).PegaHttpClient(this.secrets);
    const result = await client.fetchAndSavePegaContext(root);
    this.postMessage({
      type: "pegaContextFetched",
      success: true,
      message: `Fetched context: App "${result.applicationName}" (${result.caseTypesCount} CaseTypes) → saved ${result.filePath}`
    });
  }

  private async handleSaveAtlassianConfig(msg: any): Promise<void> {
    try {
      await this.atlassianService.saveConfig({
        baseUrl: msg.baseUrl,
        email: msg.email,
        apiToken: msg.apiToken,
        connectionType: msg.connectionType || "cloud",
      });
      this.postMessage({ type: "atlassianSaved", success: true });
    } catch (err: any) {
      this.postMessage({ type: "atlassianSaved", success: false, error: err.message });
    }
  }

  private async handleTestAtlassianConnection(): Promise<void> {
    try {
      const result = await this.atlassianService.testConnection();
      this.postMessage({ type: "atlassianTestResult", ...result });
    } catch (err: any) {
      this.postMessage({ type: "atlassianTestResult", success: false, message: err.message });
    }
  }
}
