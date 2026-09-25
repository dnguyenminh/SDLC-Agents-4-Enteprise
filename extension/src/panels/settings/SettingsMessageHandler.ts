/**
 * SettingsMessageHandler — routes webview messages for the Settings panel.
 * Thin router (SA4E-323 refactor): delegates each domain to a dedicated
 * handler (LLM / backend / Pega / Atlassian / proxy) for SRP + ≤200 LOC.
 * Behavior-preserving: message types and postMessage payloads unchanged.
 */

import * as vscode from "vscode";
import { LlmTestService } from "../../services/LlmTestService";
import { ProviderConfigService } from "../../services/ProviderConfigService";
import { AtlassianCredentialService } from "../../services/AtlassianCredentialService";
import { ProxyMessageHandler, PROXY_MESSAGE_TYPES } from "../../proxy/ProxyMessageHandler";
import { LlmSettingsHandler } from "./handlers/LlmSettingsHandler";
import { BackendSettingsHandler } from "./handlers/BackendSettingsHandler";
import { PegaSettingsHandler } from "./handlers/PegaSettingsHandler";
import { AtlassianSettingsHandler } from "./handlers/AtlassianSettingsHandler";

export class SettingsMessageHandler {
  private readonly configService: ProviderConfigService;
  private readonly proxyHandler: ProxyMessageHandler;
  private readonly llm: LlmSettingsHandler;
  private readonly backend: BackendSettingsHandler;
  private readonly pega: PegaSettingsHandler;
  private readonly atlassian: AtlassianSettingsHandler;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly postMessage: (msg: any) => void
  ) {
    const llmTestService = new LlmTestService(secrets);
    this.configService = new ProviderConfigService(secrets);
    this.proxyHandler = new ProxyMessageHandler(secrets, postMessage);
    const atlassianService = new AtlassianCredentialService(secrets);
    const refresh = () => this.sendCurrentState();

    this.llm = new LlmSettingsHandler(secrets, llmTestService, this.configService, postMessage);
    this.backend = new BackendSettingsHandler(postMessage);
    this.pega = new PegaSettingsHandler(secrets, this.configService, postMessage, refresh);
    this.atlassian = new AtlassianSettingsHandler(atlassianService, postMessage, refresh);
  }

  async handle(msg: any): Promise<void> {
    if (PROXY_MESSAGE_TYPES.includes(msg.type)) {
      await this.proxyHandler.handle(msg);
      return;
    }
    if (await this.routeLlm(msg)) { return; }
    if (await this.routeBackend(msg)) { return; }
    if (await this.routePega(msg)) { return; }
    await this.routeAtlassian(msg);
  }

  /** LLM provider messages. @returns true when handled. */
  private async routeLlm(msg: any): Promise<boolean> {
    switch (msg.type) {
      case "ready":
      case "getState": await this.sendCurrentState(); return true;
      case "setProvider":
        await this.configService.updateConfig("llmProvider", msg.provider);
        await this.sendCurrentState();
        await this.llm.autoTest(msg.provider); return true;
      case "getModels": await this.llm.getModels(msg.provider); return true;
      case "setModel": await this.configService.updateConfig("llmModel", msg.model); return true;
      case "setOllamaUrl": await this.configService.updateConfig("ollamaUrl", msg.url); return true;
      case "setBaseUrl": await this.llm.setBaseUrl(msg.provider, msg.url); return true;
      case "saveApiKey": await this.llm.saveApiKey(msg.provider, msg.key); return true;
      case "clearApiKey": await this.llm.clearApiKey(msg.provider); return true;
      case "testOllamaConnection": await this.llm.testOllama(msg.url); return true;
      case "testLlm":
      case "testLlmConnection": await this.llm.testLlm(msg.provider, msg.baseUrl); return true;
      default: return false;
    }
  }

  /** Backend URL / MCP wrapper messages. @returns true when handled. */
  private async routeBackend(msg: any): Promise<boolean> {
    switch (msg.type) {
      case "setBackendUrl": await this.backend.setBackendUrl(msg.url); return true;
      case "setAllowInsecureRemote": await this.backend.setAllowInsecureRemote(msg.enabled); return true;
      case "testBackendConnection": await this.backend.testBackend(msg.url); return true;
      case "setMcpServerPort": await this.backend.setMcpPort(msg.port); return true;
      case "setEnableMcpServer": await this.backend.setEnableMcp(msg.enabled); return true;
      case "restartMcpServer": await this.backend.restartMcpServer(); return true;
      default: return false;
    }
  }

  /** Pega connection messages. @returns true when handled. */
  private async routePega(msg: any): Promise<boolean> {
    switch (msg.type) {
      case "savePegaConfig": await this.pega.save(msg.endpoint, msg.username, msg.password); return true;
      case "testPegaConnection": await this.pega.test(); return true;
      case "fetchPegaContext": await this.pega.fetchContext(); return true;
      case "clearPegaPassword": await this.pega.clearPassword(); return true;
      default: return false;
    }
  }

  /** Atlassian connection messages. */
  private async routeAtlassian(msg: any): Promise<void> {
    switch (msg.type) {
      case "saveAtlassianConfig": await this.atlassian.save(msg); break;
      case "clearAtlassianConfig": await this.atlassian.clear(); break;
      case "testAtlassianConnection": await this.atlassian.test(); break;
    }
  }

  /** Post current provider state + model list to the webview. */
  private async sendCurrentState(): Promise<void> {
    const state = await this.configService.getCurrentState();
    this.postMessage({ type: "state", ...state });
    const { models, selected, defaultModel } = await this.configService.getModels(state.provider, state.model);
    this.postMessage({ type: "models", provider: state.provider, models, selected, defaultModel });
  }
}
