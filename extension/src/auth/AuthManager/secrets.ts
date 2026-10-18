/**
 * AuthManager — keychain secret keys + migrate-on-read helper.
 */

import * as vscode from "vscode";

export const SECRET_ACCESS_TOKEN = "sdlcAgents.accessToken";
/** Opaque refresh credential stored beside the access token (dual-token). */
export const SECRET_REFRESH_TOKEN = "sdlcAgents.refreshToken";
export const SECRET_LAST_USERNAME = "sdlcAgents.lastUsername";
/** Pre-rename secret keys — READ-ONLY migration/fallback sources. */
export const LEGACY_SECRET_ACCESS_TOKEN = "kiroSdlc.accessToken";
export const LEGACY_SECRET_LAST_USERNAME = "kiroSdlc.lastUsername";

/**
 * Read a secret from the new key, migrating a legacy value on read.
 * When the new key is empty but a pre-rename `kiroSdlc.*` value exists, the
 * value is copied to the new key (migrate-on-read) and returned. A store
 * failure is logged, not thrown, so a read never breaks auth (fail-open read).
 * @param newKey Current `sdlcAgents.*` secret key.
 * @param legacyKey Pre-rename `kiroSdlc.*` fallback key.
 * @returns The stored secret, or undefined when neither key is set.
 */
export async function readMigratedSecret(secrets: vscode.SecretStorage, newKey: string, legacyKey: string): Promise<string | undefined> {
  const current = await secrets.get(newKey);
  if (current) { return current; }
  const legacy = await secrets.get(legacyKey);
  if (!legacy) { return undefined; }
  try { await secrets.store(newKey, legacy); }
  catch (err) { console.warn(`Failed to migrate secret ${newKey}:`, (err as Error).message); }
  return legacy;
}
