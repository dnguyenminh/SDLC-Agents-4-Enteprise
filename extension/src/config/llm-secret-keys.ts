/**
 * llm-secret-keys — single source of truth for LLM provider/profile API-key
 * secret storage keys, plus migrate-on-read from the legacy `kiroSdlc.*` namespace.
 *
 * The extension renamed its identifier prefix from `kiroSdlc` to `sdlcAgents`.
 * API keys were stored under `kiroSdlc.<provider>ApiKey`; new writes use
 * `sdlcAgents.<provider>ApiKey` or `sdlcAgents.<profileId>ApiKey`.
 * `readLlmApiKey` reads the new key and, when it is empty but a legacy
 * value exists, copies it forward (migrate-on-read) so a user's key survives
 * the rename without a login/re-entry. Reads never throw — a SecretStorage
 * failure resolves to undefined (fail-open read).
 */

import type { SecretStorage } from "vscode";

const NEW_PREFIX = "sdlcAgents";
const LEGACY_PREFIX = "kiroSdlc";

/** Known provider IDs that share the anthropic secret key slot. */
const ANTHROPIC_ALIASES = new Set(["anthropic", "kiro"]);

/**
 * Resolve the secret-key suffix for a provider or profile.
 * For legacy providers (anthropic, kiro), they share "anthropicApiKey".
 * For all others (including profile IDs), use `<id>ApiKey`.
 * @param id Provider identifier OR profile ID (slug).
 * @param isProfileId When true, skip the anthropic alias logic and use `<id>ApiKey` directly.
 * @returns Suffix without namespace prefix (e.g. "anthropicApiKey", "lmstudio-qwenApiKey").
 */
function apiKeySuffix(id: string, isProfileId = false): string {
  if (!isProfileId && ANTHROPIC_ALIASES.has(id)) { return "anthropicApiKey"; }
  return `${id}ApiKey`;
}

/**
 * Current (`sdlcAgents.*`) API-key secret key for a PROVIDER.
 * Used by legacy flat-config migration and non-profile code paths.
 * @param providerId Provider identifier (e.g. "anthropic", "openai").
 * @returns SecretStorage key (e.g. "sdlcAgents.anthropicApiKey").
 */
export function llmSecretKey(providerId: string): string {
  return `${NEW_PREFIX}.${apiKeySuffix(providerId, false)}`;
}

/**
 * Current (`sdlcAgents.*`) API-key secret key for a PROFILE.
 * Profile IDs are slugs ([a-z0-9-]+) and form their own secret key namespace.
 * @param profileId Profile identifier (slug, e.g. "lmstudio-qwen").
 * @returns SecretStorage key (e.g. "sdlcAgents.lmstudio-qwenApiKey").
 */
export function profileSecretKey(profileId: string): string {
  return `${NEW_PREFIX}.${apiKeySuffix(profileId, true)}`;
}

/** Legacy (`kiroSdlc.*`) API-key secret key — READ-ONLY fallback source. */
export function legacyLlmSecretKey(providerId: string): string {
  return `${LEGACY_PREFIX}.${apiKeySuffix(providerId, false)}`;
}

/**
 * Read a provider/profile API key, migrating a legacy value on read.
 * When the new key is empty but the legacy `kiroSdlc.*` key holds a value,
 * that value is copied to the new key and returned. Never throws.
 * @param secrets VS Code SecretStorage.
 * @param id Provider identifier OR profile ID (slug).
 * @param isProfileId When true, treat `id` as a profile ID (uses `profileSecretKey`).
 * @returns The stored API key, or undefined when neither key is set.
 */
export async function readLlmApiKey(
  secrets: SecretStorage,
  id: string,
  isProfileId = false,
): Promise<string | undefined> {
  try {
    const currentKey = isProfileId ? profileSecretKey(id) : llmSecretKey(id);
    const current = await secrets.get(currentKey);
    if (current) { return current; }

    // Legacy fallback only applies to provider IDs, not profile IDs
    if (!isProfileId) {
      const legacy = await secrets.get(legacyLlmSecretKey(id));
      if (!legacy) { return undefined; }
      try { await secrets.store(currentKey, legacy); }
      catch (err) { console.warn(`[llm-secret] migrate '${id}' failed:`, (err as Error).message); }
      return legacy;
    }
    return undefined;
  } catch (err) {
    console.warn(`[llm-secret] read '${id}' failed:`, (err as Error).message);
    return undefined;
  }
}

/**
 * Write an API key for a provider or profile.
 * Always uses the new `sdlcAgents.*` namespace.
 * @param secrets VS Code SecretStorage.
 * @param id Provider identifier OR profile ID (slug).
 * @param key The API key value to store.
 * @param isProfileId When true, treat `id` as a profile ID.
 */
export async function writeLlmApiKey(
  secrets: SecretStorage,
  id: string,
  key: string,
  isProfileId = false,
): Promise<void> {
  const targetKey = isProfileId ? profileSecretKey(id) : llmSecretKey(id);
  await secrets.store(targetKey, key);
}

/**
 * Delete an API key for a provider or profile.
 * Deletes both new and legacy keys to prevent migrate-on-read from resurrecting.
 * @param secrets VS Code SecretStorage.
 * @param id Provider identifier OR profile ID (slug).
 * @param isProfileId When true, treat `id` as a profile ID.
 */
export async function deleteLlmApiKey(
  secrets: SecretStorage,
  id: string,
  isProfileId = false,
): Promise<void> {
  const newKey = isProfileId ? profileSecretKey(id) : llmSecretKey(id);
  await secrets.delete(newKey);
  if (!isProfileId) {
    await secrets.delete(legacyLlmSecretKey(id));
  }
}