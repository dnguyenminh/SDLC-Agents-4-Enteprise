/**
 * settings-migration — backward-compatible reads for renamed config keys
 * (SA4E-370).
 *
 * Every extension setting was standardized on a consistent dot-notation prefix
 * (pega.*, mcp.*, llm.*, jira.*, workspace.*). Users upgrading from a release
 * that stored values under the old flat keys (e.g. `sdlcAgents.pegaEndpoint`)
 * must not lose their configuration, so every READ goes through
 * {@link getSetting}: the NEW key wins when set at any scope;
 * otherwise the OLD flat key is honored as a fallback. Writes intentionally
 * keep targeting the OLD flat keys (legacy settings.json values stay the
 * single write target; reads resolve them through the fallback).
 *
 * Why inspect(): a key declared in package.json returns its manifest DEFAULT
 * from plain get() even when the user never set it, so get() alone cannot
 * distinguish "user-set" from "default". inspect() exposes per-scope values,
 * making the fallback decision reliable.
 */

import * as vscode from "vscode";

/** Configuration section prefix shared by all extension settings. */
const CONFIG_SECTION = "sdlcAgents";

/**
 * settings-migration — post-migration reads for standardized config keys
 * (SA4E-370).
 *
 * All settings were standardized on consistent dot-notation prefixes
 * (pega.*, mcp.*, llm.*, jira.*, workspace.*). The one-time migration runner
 * ({@link ../settings-migration-runner}) copies OLD flat key values → NEW
 * dotted keys at extension activation (guarded by a globalState flag).
 *
 * After migration completes, this function reads ONLY the NEW key —
 * no runtime fallback. The `oldKey` parameter is kept in the signature
 * for API compatibility with existing call sites but is IGNORED.
 *
 * @param newKey SA4E-370 dotted key suffix (without the `sdlcAgents.` prefix).
 * @param _oldKey Legacy flat key — IGNORED (handled by one-time migration runner).
 * @param defaultValue Value returned when the new key is not set.
 * @returns The effective setting value.
 */
export function getSetting<T>(newKey: string, _oldKey: string, defaultValue: T): T {
  const config = vscode.workspace?.getConfiguration?.(CONFIG_SECTION);
  if (!config?.get) { return defaultValue; }
  // Post-migration: read ONLY the new key (old key handled by migration runner)
  return config.get<T>(newKey, defaultValue);
}
