/**
 * ProviderConfigModels — Model list logic for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import { getStaticModels, fetchGatewayModels, getDefaultModel } from "../chat-panel/chat-models";
import { SECRET_KEYS, PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS } from "../models";
import { readLlmApiKey } from "../config/llm-secret-keys.js";
import type { ProfileTableRow } from "../shared/types/llm-profile.js";
import type { WorkspaceConfiguration } from "vscode";

export interface ModelListResult {
  models: any[];
  selected: string;
  defaultModel: string;
  provider: string;
}

type ConfigGetter = () => WorkspaceConfiguration;

/** Build model list for a provider (legacy flat-config path). */
export async function buildModelListForProvider(
  secrets: any,
  provider: string,
  currentModel: string,
  getConfig: () => any
): Promise<{ models: any[]; selected: string; defaultModel: string }> {
  let models = getStaticModels(provider);
  const gatewayBaseUrl = getGatewayBaseUrlForProvider(provider, getConfig);
  const lmstudioBaseUrl = "http://localhost:1234/v1";

  const fetchUrl = provider === "lmstudio" ? lmstudioBaseUrl : gatewayBaseUrl;

  if (fetchUrl) {
    const providerSecretKey = SECRET_KEYS[provider];
    const apiKey = providerSecretKey ? await readLlmApiKey(secrets, provider) : undefined;
    const authHeader = apiKey ? `Bearer ${apiKey}` : undefined;
    const gatewayModels = await fetchGatewayModels(fetchUrl, authHeader);
    if (gatewayModels && gatewayModels.length > 0) {
      models = gatewayModels;
    }
  }

  let selected = currentModel;
  if (selected && !models.some((m: any) => m.id === selected)) {
    models = [...models, { id: selected, name: selected }];
  } else if (!selected) {
    selected = models.length > 0 ? models[0].id : getDefaultModel(provider);
  }

  return { models, selected, defaultModel: getDefaultModel(provider) };
}

/** Build model list for the active profile (SA4E-389). */
export async function buildModelListForActiveProfile(
  secrets: any,
  activeProfile: ProfileTableRow,
  getConfig: ConfigGetter
): Promise<ModelListResult> {
  const provider = activeProfile.provider;
  let models = getStaticModels(provider);
  const gatewayBaseUrl = getGatewayBaseUrlForProfile(activeProfile, getConfig);
  
  if (gatewayBaseUrl) {
    const apiKey = await readProfileApiKey(secrets, activeProfile.profileId);
    const authHeader = apiKey ? `Bearer ${apiKey}` : undefined;
    const gatewayModels = await fetchGatewayModels(gatewayBaseUrl, authHeader);
    if (gatewayModels && gatewayModels.length > 0) {
      models = gatewayModels;
    }
  }

  let selected = activeProfile.model;
  if (selected && !models.some((m: any) => m.id === selected)) {
    models = [...models, { id: selected, name: selected }];
  } else if (!selected) {
    selected = models.length > 0 ? models[0].id : getDefaultModel(provider);
  }

  return { models, selected, defaultModel: getDefaultModel(provider), provider };
}

/** Get grouped model picker data (connected profiles only, grouped by provider). */
export async function buildModelPickerGroups(
  getConfig: ConfigGetter,
  getProfileRows: () => Promise<ProfileTableRow[]>
): Promise<Array<{ provider: string; items: Array<{ profileId: string; modelId: string; modelName: string; isFree: boolean }> }>> {
  const profiles = await getProfileRows();
  const connectedProfiles = profiles.filter((p) => p.lastTestStatus === "connected");

  const groupsMap = new Map<string, Array<{ profileId: string; modelId: string; modelName: string; isFree: boolean }>>();

  for (const profile of connectedProfiles) {
    const models = getStaticModels(profile.provider);
    for (const model of models) {
      const isFree = model.rateMultiplier === 0;
      const modelName = model.name || model.id;
      if (!groupsMap.has(profile.provider)) {
        groupsMap.set(profile.provider, []);
      }
      groupsMap.get(profile.provider)!.push({
        profileId: profile.profileId,
        modelId: model.id,
        modelName,
        isFree,
      });
    }
  }

  return Array.from(groupsMap.entries()).map(([provider, items]) => ({ provider, items }));
}

/** Get base URL for a provider (legacy flat-config path). */
function getGatewayBaseUrlForProvider(provider: string, getConfig: () => any): string {
  const key = PROVIDER_BASE_URL_KEYS[provider];
  if (!key) { return ""; }
  const configuredUrl = getConfig().get(key, "");
  return configuredUrl || PROVIDER_BASE_URL_DEFAULTS[provider] || "";
}

/** Get gateway base URL for a profile. */
function getGatewayBaseUrlForProfile(profile: ProfileTableRow, getConfig: ConfigGetter): string {
  if (profile.useDefaultUrl) {
    return PROVIDER_BASE_URL_DEFAULTS[profile.provider] || "";
  }
  const fullProfiles = getConfig().get<any[]>("llm.profiles", []);
  const fullProfile = fullProfiles.find((p: any) => p.id === profile.profileId);
  return fullProfile?.baseUrl || PROVIDER_BASE_URL_DEFAULTS[profile.provider] || "";
}

/** Read API key for a profile. */
async function readProfileApiKey(secrets: any, profileId: string): Promise<string | undefined> {
  return readLlmApiKey(secrets, profileId, true);
}