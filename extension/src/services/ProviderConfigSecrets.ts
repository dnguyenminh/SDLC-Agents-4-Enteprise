/**
 * ProviderConfigSecrets — Secret operations for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import * as vscode from "vscode";
import { readLlmApiKey, profileSecretKey, writeLlmApiKey, deleteLlmApiKey } from "../config/llm-secret-keys.js";
import { getWsHash, secretKey, readScopedSecret, type SecretBase } from "./WorkspaceScopeResolver";

export interface SecretOpsDeps {
  secrets: vscode.SecretStorage;
  getConfig: () => vscode.WorkspaceConfiguration;
}

/** Write API key for a profile. */
export async function writeProfileApiKey(deps: SecretOpsDeps, profileId: string, key: string): Promise<void> {
  const targetKey = profileSecretKey(profileId);
  await deps.secrets.store(targetKey, key);
}

/** Delete API key for a profile. */
export async function deleteProfileApiKey(deps: SecretOpsDeps, profileId: string): Promise<void> {
  const targetKey = profileSecretKey(profileId);
  await deps.secrets.delete(targetKey);
}

/** Read API key for a profile. */
export async function readProfileApiKey(deps: SecretOpsDeps, profileId: string): Promise<string | undefined> {
  return readLlmApiKey(deps.secrets, profileId, true);
}

/** Read a workspace secret; null scope falls back to the legacy flat key. */
export async function readSecret(deps: SecretOpsDeps, wsHash: string | null, base: SecretBase): Promise<string | undefined> {
  return readScopedSecret(deps.secrets, base, wsHash);
}

/** Best-effort secret read with migrate-on-read from legacy kiroSdlc.* keys. */
export async function safeGet(deps: SecretOpsDeps, key: string): Promise<string | undefined> {
  try {
    const current = await deps.secrets.get(key);
    if (current) { return current; }
    const legacyKey = key.startsWith("sdlcAgents.")
      ? key.replace(/^sdlcAgents\./, "kiroSdlc.") : undefined;
    if (!legacyKey) { return undefined; }
    const legacy = await deps.secrets.get(legacyKey);
    if (!legacy) { return undefined; }
    try { await deps.secrets.store(key, legacy); } catch { /* fail-open write */ }
    return legacy;
  } catch { return undefined; }
}

/** Get secret key for a workspace-scoped credential. */
export function getSecretKey(base: SecretBase, wsHash: string): string | null {
  return secretKey(base, wsHash);
}