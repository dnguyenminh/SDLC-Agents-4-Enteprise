/**
 * ProviderConfigState — State retrieval for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import { getSetting } from "../config/settings-migration";
import { getBackendUrl } from "../config/backend-url";
import { getWsHash } from "./WorkspaceScopeResolver";
import { invalidateProviderTurnConfigCache, readProviderTurnConfig } from "../pi-workflow/pi-provider-config-bridge.js";
import type { ProfileTableRow } from "../shared/types/llm-profile.js";

export interface StateDeps {
  getConfig: () => vscode.WorkspaceConfiguration;
  secrets: vscode.SecretStorage;
  getProfileRows: () => Promise<ProfileTableRow[]>;
  getActiveProfileRow: () => Promise<ProfileTableRow | undefined>;
  getBaseUrlForProvider: (provider: string) => string;
  getBaseUrlForProfile: (profile: ProfileTableRow) => string;
  safeGet: (key: string) => Promise<string | undefined>;
  readSecret: (wsHash: string | null, base: string) => Promise<string | undefined>;
}

export interface CurrentState {
  provider: string;
  model: string;
  ollamaUrl: string;
  baseUrl: string;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  backendUrl: string;
  allowInsecureRemote: boolean;
  mcpServerPort: number;
  enableMcpServer: boolean;
  pegaEndpoint: string;
  pegaUsername: string;
  hasPegaPassword: boolean;
  atlassianBaseUrl: string;
  atlassianEmail: string;
  hasAtlassianToken: boolean;
  atlassianConnectionType: string;
  profiles: ProfileTableRow[];
  activeProfileId: string | undefined;
}

/** Build current settings state to send to webview. */
export async function getCurrentState(deps: StateDeps): Promise<CurrentState> {
  const config = deps.getConfig();

  // Load profiles
  const profiles = await deps.getProfileRows();
  const activeProfileId = config.get<string>("llm.activeProfileId");
  const activeProfile = profiles.find((p) => p.profileId === activeProfileId);

  // Get provider/model from active profile or legacy fallback
  let provider: string;
  let model: string;
  let baseUrl: string;

  if (activeProfile) {
    provider = activeProfile.provider;
    model = activeProfile.model;
    baseUrl = deps.getBaseUrlForProfile(activeProfile);
  } else {
    // Legacy fallback - use SSOT readProviderTurnConfig
    const turnConfig = readProviderTurnConfig();
    provider = turnConfig.providerId;
    model = turnConfig.configuredModelId;
    baseUrl = deps.getBaseUrlForProvider(provider);
  }

  const ollamaUrl = getSetting<string>("llm.ollama.baseUrl", "llm.ollama.baseUrl", "http://localhost:11434");
  const backendUrl = getBackendUrl();
  const allowInsecureRemote = config.get<boolean>("backend.allowInsecureRemote", false);
  const mcpServerPort = getSetting<number>("mcp.serverPort", "mcp.serverPort", 9181);
  const enableMcpServer = getSetting<boolean>("mcp.enabled", "mcp.enabled", true);

  const anthropicKey = await deps.safeGet("sdlcAgents.anthropicApiKey");
  const openaiKey = await deps.safeGet("sdlcAgents.openaiApiKey");
  const wsHash = getWsHash();
  const pegaPassword = await deps.readSecret(wsHash, "pega");
  const pegaEndpoint = getSetting<string>("pega.endpoint", "pega.endpoint", "http://localhost:8080/prweb");
  const pegaUsername = getSetting<string>("pega.username", "pega.username", "");

  const atlassianBaseUrl = (await deps.readSecret(wsHash, "atlassianBaseUrl")) || "";
  const atlassianEmail = (await deps.readSecret(wsHash, "atlassianEmail")) || "";
  const atlassianToken = await deps.readSecret(wsHash, "atlassianToken");
  const atlassianConnectionType = getSetting<string>("jira.connectionType", "jira.connectionType", "cloud");

  return {
    provider, model, ollamaUrl, baseUrl: baseUrl || "",
    hasAnthropicKey: !!anthropicKey, hasOpenaiKey: !!openaiKey,
    backendUrl, allowInsecureRemote, mcpServerPort, enableMcpServer,
    pegaEndpoint, pegaUsername, hasPegaPassword: !!pegaPassword,
    atlassianBaseUrl, atlassianEmail, hasAtlassianToken: !!atlassianToken,
    atlassianConnectionType,
    profiles,
    activeProfileId,
  };
}