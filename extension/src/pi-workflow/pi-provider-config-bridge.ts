import type { CredentialResolver } from './pi-provider.js';
import * as vscode from 'vscode';
import { readLlmApiKey } from '../config/llm-secret-keys.js';
import { getSetting } from '../config/settings-migration.js';
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_LEGACY_KEYS } from '../models/LlmProviderConfig.js';

export interface ProviderBridgeInput {
  secrets?: vscode.SecretStorage;
  providerId: string;
}

export interface ProviderBridgeResult {
  credentialResolver?: CredentialResolver;
}

/**
 * FIX A: the provider is NOT initialized at bridge time — model resolution CANNOT
 * happen here (it moved into PiWorkflowEngine.configureProvider, after init +
 * gateway registration). This builder only constructs the credential resolver.
 */
export function buildCredentialResolver(secrets?: vscode.SecretStorage): CredentialResolver | undefined {
  if (!secrets) return undefined;
  // readLlmApiKey resolves the new `sdlcAgents.*` key and migrates the legacy
  // `kiroSdlc.*` value on read; it never throws (fail-open).
  return (providerId: string) => readLlmApiKey(secrets, providerId);
}

/**
 * Local providers serve keyless endpoints (LM Studio / Ollama / local ONNX).
 * A missing API key must NEVER block a turn for these (UAT bug: chat demanded
 * kiroSdlc.lmstudioApiKey even though LM Studio needs no key).
 */
const LOCAL_NO_KEY_PROVIDERS = new Set(["lmstudio", "ollama", "onnx"]);

export function providerRequiresApiKey(providerId?: string): boolean {
  if (!providerId) return true;
  return !LOCAL_NO_KEY_PROVIDERS.has(providerId.trim().toLowerCase());
}

export interface ProviderTurnConfig {
  providerId: string;
  /** Per-provider gateway baseUrl, or undefined when not configured. */
  baseUrl?: string;
  /** Raw configured model id ('' / 'auto' allowed — resolved downstream). */
  configuredModelId: string;
  /** PI-MODEL-FALLBACK: ordered fallback model ids from settings. */
  fallbackModelIds: string[];
}

/** In-memory cache of the resolved active profile config, keyed by a
 *  fingerprint of the raw settings it was derived from — a settings change
 *  (or a test changing the mocked config) always produces a fresh resolve. */
let cacheFingerprint = "";
let cachedActiveProfileConfig: ProviderTurnConfig | null = null;

/** Fingerprint of every raw key resolveActiveProfileConfig() reads. */
function configFingerprint(): string {
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  return JSON.stringify([
    config.get<any[]>("llm.profiles", []),
    config.get<string>("llm.activeProfileId"),
    config.get<string>("llm.provider"),
    config.get<string>("llm.model"),
  ]);
}

/**
 * Invalidate the cached config — defensive escape hatch for settings
 * changes outside the fingerprinted keys.
 */
export function invalidateProviderTurnConfigCache(): void {
  cacheFingerprint = "";
  cachedActiveProfileConfig = null;
}

/**
 * Resolve the active profile's provider config from VS Code settings.
 * Reads `sdlcAgents.llm.activeProfileId` and finds the matching profile in
 * `sdlcAgents.llm.profiles`. Falls back to legacy flat keys if no profiles exist
 * (backward compatibility for pre-migration users).
 * This is the SINGLE SOURCE OF TRUTH for provider/model/baseUrl resolution.
 */
function resolveActiveProfileConfig(): ProviderTurnConfig {
  const config = vscode.workspace.getConfiguration("sdlcAgents");

  // Try new multi-profile config first
  const profiles = (config.get<any[]>("llm.profiles", []) ?? []);
  let activeProfileId = config.get<string>("llm.activeProfileId");

  // If activeProfileId is not set or doesn't match any profile, fall back to providerId
  if (!activeProfileId || !profiles.find((p) => p.id === activeProfileId)) {
    activeProfileId = config.get<string>("llm.provider");
  }

  if (activeProfileId) {
    const activeProfile = profiles.find((p: any) => p.id === activeProfileId);
    if (activeProfile) {
      const providerId = activeProfile.provider; // real provider id for model registry lookup
      const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
      const baseUrl = activeProfile.useDefaultUrl
        ? undefined
        : (activeProfile.baseUrl || (baseUrlKey ? getSetting<string>(baseUrlKey, baseUrlKey, '') : '') || undefined);

      return {
        providerId,
        baseUrl,
        configuredModelId: activeProfile.model || '',
        fallbackModelIds: getSetting<string[]>('llm.fallbackModels', 'llm.fallbackModels', []),
      };
    }
  }

  // Fallback: legacy flat config (pre-migration or no profiles yet)
  const providerId = getSetting<string>('llm.provider', 'llm.provider', 'anthropic') || 'anthropic';
  const baseUrlKey = PROVIDER_BASE_URL_KEYS[providerId];
  const baseUrl = (
    baseUrlKey
      ? getSetting<string>(baseUrlKey, baseUrlKey, '')
      : ''
  ) || undefined;
  const configuredModelId = getSetting<string>('llm.model', 'llm.model', '') || '';
  const fallbackModelIds = getSetting<string[]>('llm.fallbackModels', 'llm.fallbackModels', []);

  return { providerId, baseUrl, configuredModelId, fallbackModelIds };
}

/**
 * SA4E-369 UAT root-cause fix — ONE config-read path for BOTH turn paths.
 * Session (trySessionTurn / selectAgent) and legacy (configureEngineProvider)
 * previously read the same settings with DIFFERENT helpers: the legacy path
 * resolved SA4E-370 dot-notation keys with legacy flat-key fallback
 * (getSetting) while the session path used plain config.get() on
 * the dot keys only — silently missing users who still hold the flat keys
 * (e.g. llmProvider=lmstudio + lmstudioBaseUrl). Every provider-config read
 * now goes through this function (single source of truth).
 *
 * Now reads from the ACTIVE PROFILE (multi-profile) with legacy fallback.
 * Uses in-memory cache for performance; invalidated on settings change.
 */
export function readProviderTurnConfig(): ProviderTurnConfig {
  const fingerprint = configFingerprint();
  if (cachedActiveProfileConfig && fingerprint === cacheFingerprint) {
    return cachedActiveProfileConfig;
  }
  cacheFingerprint = fingerprint;
  cachedActiveProfileConfig = resolveActiveProfileConfig();
  return cachedActiveProfileConfig;
}

/**
 * Dummy credential seeded IN-MEMORY ONLY for keyless local endpoints.
 * pi-ai auth resolution returns undefined (→ "Provider is not configured")
 * without ANY key material; LM Studio / Ollama ignore the header value.
 */
export const LOCAL_KEYLESS_PLACEHOLDER = "keyless-local";

/**
 * Local endpoints fail with raw HTTP errors (401/500/Econn...) that say
 * nothing about WHAT to check. Append the endpoint + model checklist so
 * UAT can self-diagnose (server running? model loaded? URL correct?).
 * Cloud providers and non-HTTP errors pass through unchanged.
 */
export function hintLocalEndpointError(
  message: string,
  providerId?: string,
  baseUrl?: string,
  modelId?: string
): string {
  if (!message || providerRequiresApiKey(providerId)) return message;
  if (!/HTTP (4\d\d|5\d\d)|ECONNREFUSED|fetch failed|ETIMEDOUT|\b401\b|\b403\b|500/i.test(message)) {
    return message;
  }
  return (
    `${message}\n\n[Local endpoint check] provider=${providerId || "(unknown)"} ` +
    `url=${baseUrl || "(not set)"} model=${modelId || "(default)"}. ` +
    `Verify: 1) the local server is RUNNING, 2) the model is LOADED in it, ` +
    `3) the URL is the server base (e.g. http://localhost:1234/v1).`
  );
}

/** Back-compat alias. */
export function bridgeProviderConfig(input: ProviderBridgeInput): ProviderBridgeResult {
  return { credentialResolver: buildCredentialResolver(input.secrets) };
}

let cachedExtensionVersion: string | undefined;

/**
 * Running extension version for diagnostics (kills "old build?" debates:
 * every turn log carries ext=<version>). Resolved once, never throws.
 */
export function getExtensionVersion(): string {
  if (cachedExtensionVersion) return cachedExtensionVersion;
  try {
    const ext = vscode.extensions?.getExtension?.('dnguyenminh.sdlc-agents-4-enterprise');
    const v: unknown = ext?.packageJSON?.version;
    cachedExtensionVersion = typeof v === 'string' && v ? v : 'dev';
  } catch {
    cachedExtensionVersion = 'dev';
  }
  return cachedExtensionVersion;
}