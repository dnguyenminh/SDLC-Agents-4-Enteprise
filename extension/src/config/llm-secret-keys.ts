/**
 * llm-secret-keys — single source of truth for LLM provider API-key secret
 * storage keys, plus migrate-on-read from the legacy `kiroSdlc.*` namespace.
 *
 * The extension renamed its identifier prefix from `kiroSdlc` to `sdlcAgents`.
 * API keys were stored under `kiroSdlc.<provider>ApiKey`; new writes use
 * `sdlcAgents.<provider>ApiKey`. `readLlmApiKey` reads the new key and, when it
 * is empty but a legacy value exists, copies it forward (migrate-on-read) so a
 * user's key survives the rename without a login/re-entry. Reads never throw —
 * a SecretStorage failure resolves to undefined (fail-open read).
 */

import type { SecretStorage } from "vscode";

const NEW_PREFIX = "sdlcAgents";
const LEGACY_PREFIX = "kiroSdlc";

/**
 * Resolve the secret-key suffix for a provider. Anthropic and the `kiro`
 * gateway share the anthropic slot; every other provider uses `<id>ApiKey`.
 * @param providerId Provider identifier (e.g. "anthropic", "openai").
 * @returns Suffix without namespace prefix (e.g. "anthropicApiKey").
 */
function apiKeySuffix(providerId: string): string {
  if (providerId === "anthropic" || providerId === "kiro") { return "anthropicApiKey"; }
  return `${providerId}ApiKey`;
}

/** Current (`sdlcAgents.*`) API-key secret key for a provider. */
export function llmSecretKey(providerId: string): string {
  return `${NEW_PREFIX}.${apiKeySuffix(providerId)}`;
}

/** Legacy (`kiroSdlc.*`) API-key secret key — READ-ONLY fallback source. */
export function legacyLlmSecretKey(providerId: string): string {
  return `${LEGACY_PREFIX}.${apiKeySuffix(providerId)}`;
}

/**
 * Read a provider API key, migrating a legacy value on read. When the new key
 * is empty but the legacy `kiroSdlc.*` key holds a value, that value is copied
 * to the new key and returned. Never throws.
 * @param secrets VS Code SecretStorage.
 * @param providerId Provider identifier.
 * @returns The stored API key, or undefined when neither key is set.
 */
export async function readLlmApiKey(
  secrets: SecretStorage, providerId: string,
): Promise<string | undefined> {
  try {
    const current = await secrets.get(llmSecretKey(providerId));
    if (current) { return current; }
    const legacy = await secrets.get(legacyLlmSecretKey(providerId));
    if (!legacy) { return undefined; }
    try { await secrets.store(llmSecretKey(providerId), legacy); }
    catch (err) { console.warn(`[llm-secret] migrate '${providerId}' failed:`, (err as Error).message); }
    return legacy;
  } catch (err) {
    console.warn(`[llm-secret] read '${providerId}' failed:`, (err as Error).message);
    return undefined;
  }
}
