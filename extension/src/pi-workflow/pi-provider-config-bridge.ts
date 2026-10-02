import type { CredentialResolver } from './pi-provider.js';
import * as vscode from 'vscode';
import { readLlmApiKey } from '../config/llm-secret-keys.js';

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
