/**
 * ProviderConfigBaseUrl — Base URL helpers for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import { getSetting } from "../config/settings-migration";
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS } from "../models";
import type { ProfileTableRow } from "../shared/types/llm-profile.js";
import type { WorkspaceConfiguration } from "vscode";

export interface BaseUrlDeps {
  getConfig: () => WorkspaceConfiguration;
}

/** Get base URL for a provider (legacy flat-config path). */
export function getBaseUrlForProvider(provider: string): string {
  const key = PROVIDER_BASE_URL_KEYS[provider];
  if (!key) { return ""; }
  return getSetting(key, key, "");
}

/** Get base URL for a profile. */
export function getBaseUrlForProfile(deps: BaseUrlDeps, profile: ProfileTableRow): string {
  if (profile.useDefaultUrl) { return ""; }
  // For ProfileTableRow, baseUrl is not directly stored; need to get from full profile
  const fullProfiles = deps.getConfig().get<any[]>("llm.profiles", []);
  const fullProfile = fullProfiles.find((p: any) => p.id === profile.profileId);
  if (fullProfile?.baseUrl) { return fullProfile.baseUrl; }
  // Fallback to provider default
  const key = PROVIDER_BASE_URL_KEYS[profile.provider];
  return key ? getSetting(key, key, "") : "";
}

/** Get gateway base URL for a provider (legacy). */
export function getGatewayBaseUrl(provider: string): string {
  const key = PROVIDER_BASE_URL_KEYS[provider];
  if (!key) { return ""; }
  const configuredUrl = getSetting(key, key, "");
  return configuredUrl || PROVIDER_BASE_URL_DEFAULTS[provider] || "";
}

/** Get gateway base URL for a profile. */
export function getGatewayBaseUrlForProfile(deps: BaseUrlDeps, profile: ProfileTableRow): string {
  if (profile.useDefaultUrl) {
    return PROVIDER_BASE_URL_DEFAULTS[profile.provider] || "";
  }
  const fullProfiles = deps.getConfig().get<any[]>("llm.profiles", []);
  const fullProfile = fullProfiles.find((p: any) => p.id === profile.profileId);
  return fullProfile?.baseUrl || PROVIDER_BASE_URL_DEFAULTS[profile.provider] || "";
}