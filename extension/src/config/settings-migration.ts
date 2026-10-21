/**
 * settings-migration — backward-compatible reads for renamed config keys
 * (SA4E-370).
 *
 * Every extension setting was standardized on a consistent dot-notation prefix
 * (pega.*, mcp.*, llm.*, jira.*, workspace.*). Users upgrading from a release
 * that stored values under the old flat keys (e.g. `sdlcAgents.pegaEndpoint`)
 * must not lose their configuration, so every READ goes through
 * {@link getSettingWithFallback}: the NEW key wins when set at any scope;
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
 * Read a setting with backward-compatible fallback to the old flat key.
 * Usage: const url = getSettingWithFallback("pega.endpoint", "pegaEndpoint", "http://localhost:8080/prweb");
 *
 * Resolution order:
 *  1. NEW key set at any scope (global/workspace via inspect) → merged get(newKey).
 *  2. OLD flat key set at any scope → merged get(oldKey).
 *  3. Neither set → defaultValue.
 *
 * Never throws — a missing configuration API degrades to the default so reads
 * cannot break activation or service construction.
 *
 * @param newKey SA4E-370 dotted key suffix (without the `sdlcAgents.` prefix).
 * @param oldKey Legacy flat key suffix kept from the pre-rename manifest.
 * @param defaultValue Value returned when neither key is set.
 * @returns The effective setting value.
 */
export function getSettingWithFallback<T>(newKey: string, oldKey: string, defaultValue: T): T {
  const config = vscode.workspace?.getConfiguration?.(CONFIG_SECTION);
  if (!config?.get) { return defaultValue; }

  // Full VS Code host: inspect() distinguishes a user-set value from the
  // manifest default, so the new key wins whenever the user actually set it.
  if (typeof config.inspect === "function") {
    const newValue = config.inspect<T>(newKey);
    if (newValue?.globalValue !== undefined || newValue?.workspaceValue !== undefined) {
      return config.get<T>(newKey, defaultValue);
    }
    const oldValue = config.inspect<T>(oldKey);
    if (oldValue?.globalValue !== undefined || oldValue?.workspaceValue !== undefined) {
      return config.get<T>(oldKey, defaultValue);
    }
    return defaultValue;
  }

  // Degraded host / test stub without inspect(): best-effort — honor the old
  // flat key when it carries a value, else the new key, else the default.
  const legacy = config.get<T | undefined>(oldKey, undefined);
  if (legacy !== undefined) { return legacy; }
  const viaNew = config.get<T>(newKey, defaultValue);
  return viaNew !== undefined ? viaNew : defaultValue;
}
