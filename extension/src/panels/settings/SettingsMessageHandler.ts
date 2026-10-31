/**
 * SettingsMessageHandler — routes webview messages for the Settings panel.
 * Thin router (SA4E-323 refactor + SA4E-389 profiles): delegates each domain to a dedicated
 * handler (Profile / LLM legacy / backend / Pega / Atlassian / proxy) for SRP + ≤200 LOC.
 */

import * as vscode from "vscode";
import { LlmTestService } from "../../services/LlmTestService";
import { ProviderConfigService } from "../../services/ProviderConfigService";
import { AtlassianCredentialService } from "../../services/AtlassianCredentialService";
import { ProxyMessageHandler, PROXY_MESSAGE_TYPES } from "../../proxy/ProxyMessageHandler";
import { LlmSettingsHandler } from "./handlers/LlmSettingsHandler";
import { ProfileSettingsHandler } from "./handlers/ProfileSettingsHandler";
import { BackendSettingsHandler } from "./handlers/BackendSettingsHandler";
import { PegaSettingsHandler } from "./handlers/PegaSettingsHandler";
import { AtlassianSettingsHandler } from "./handlers/AtlassianSettingsHandler";

export class SettingsMessageHandler {
  private readonly configService: ProviderConfigService;
  private readonly proxyHandler: ProxyMessageHandler;
  private readonly llm: LlmSettingsHandler;
  private readonly profile: ProfileSettingsHandler;
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
    this.profile = new ProfileSettingsHandler(this.configService, llmTestService, postMessage);
    this.backend = new BackendSettingsHandler(postMessage);
    this.pega = new PegaSettingsHandler(secrets, this.configService, postMessage, refresh);
    this.atlassian = new AtlassianSettingsHandler(atlassianService, postMessage, refresh);
  }

  async handle(msg: any): Promise<void> {
    if (PROXY_MESSAGE_TYPES.includes(msg.type)) {
      await this.proxyHandler.handle(msg);
      return;
    }
    if (await this.routeProfile(msg)) { return; }
    if (await this.routeLlm(msg)) { return; }
    if (await this.routeBackend(msg)) { return; }
    if (await this.routePega(msg)) { return; }
    await this.routeAtlassian(msg);
  }

  /** Profile management messages (SA4E-389). @returns true when handled. */
  private async routeProfile(msg: any): Promise<boolean> {
    return this.profile.handle(msg);
  }

  /** LLM provider messages (legacy flat-config path, kept for backward compat). @returns true when handled. */
  private async routeLlm(msg: any): Promise<boolean> {
    switch (msg.type) {
      case "ready":
      case "getState": await this.sendCurrentState(); return true;
      case "setProvider":
        // SA4E-389: Use profile-based API instead of flat key
        await this.configService.setActiveProfile(msg.provider);
        await this.sendCurrentState();
        await this.llm.autoTest(msg.provider); return true;
      case "getModels": await this.llm.getModels(msg.provider); return true;
      case "setModel":
        // SA4E-389: Use profile-based API instead of flat key
        const activeProfile = await this.configService.getActiveProfileRow();
        if (activeProfile) {
          await this.configService.editProfile(activeProfile.profileId, { model: msg.model });
        }
        await this.sendCurrentState(); return true;
      case "setOllamaUrl": await this.configService.updateConfig("llm.ollama.baseUrl", msg.url); return true;
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

  /** Post current provider state + model list + profiles to the webview. */
  private async sendCurrentState(): Promise<void> {
    const state = await this.configService.getCurrentState();
    this.postMessage({ type: "state", ...state });
    const { models, selected, defaultModel, provider } = await this.configService.getModelsForActiveProfile();
    this.postMessage({ type: "models", provider, models, selected, defaultModel });
    // Also send profiles for the new table
    await this.sendProfilesState();
  }

  /** Send profiles state for the provider table. */
  private async sendProfilesState(): Promise<void> {
    const profiles = await this.configService.getProfileRows();
    const activeProfile = await this.configService.getActiveProfileRow();
    this.postMessage({ type: "profiles", profiles, activeProfileId: activeProfile?.profileId });
  }
}