/**
 * config-namespace-migration — one-time copy of user settings from the legacy
 * `kiroSdlc.*` configuration namespace to the current `sdlcAgents.*` namespace.
 *
 * The extension renamed its configuration namespace; without this migration a
 * user who set values under `kiroSdlc.*` would silently lose them after the
 * rename. This module copies each known key's Global and Workspace values into
 * the new namespace when the new value is unset. Legacy keys are NOT deleted
 * (copy-not-move) so a rollback keeps working. Runs exactly once, guarded by a
 * globalState flag, and never throws — a migration failure must not break
 * activation.
 */

import * as vscode from "vscode";

/** Guard flag stored in globalState so migration runs at most once. */
const MIGRATION_FLAG = "sdlcAgents.configMigrated.v1";

const LEGACY_SECTION = "kiroSdlc";
const NEW_SECTION = "sdlcAgents";

/**
 * All configuration keys (suffix only, without the namespace prefix) declared
 * in package.json contributes.configuration.properties. Kept in sync with the
 * manifest — 38 keys.
 */
const CONFIG_KEYS: readonly string[] = [
  "backend.url", "backend.allowInsecureRemote", "backend.ssoEnabled",
  "backend.ssoProviderUrl", "backend.toolCallTimeout", "backend.chatTimeout",
  "turn.maxToolRepeats", "backend.healthCheckInterval", "backend.rateLimitRpm",
  "pega.dedupMaxInMemory", "pega.fetchBatchSize", "pega.ingestConcurrency",
  "pega.ingestChannelCapacity", "mcpServerPort", "enableMcpServer",
  "mcpServerUrl", "configPath", "llmProvider", "llmModel", "llmFallbackModels",
  "anthropicBaseUrl", "openaiBaseUrl", "ollamaUrl", "lmstudioBaseUrl",
  "openrouterBaseUrl", "kiroModel", "pegaEndpoint", "pega.useCatalogExport",
  "pegaUsername", "pegaDeveloperShortName", "atlassianConnectionType",
  "jiraSyncState", "jiraLastProject", "jiraAttachmentChecksums", "proxy.mode",
  "proxy.host", "proxy.port", "proxy.bypass",
];

/**
 * Copy one key's value at a single scope from legacy to new when the new value
 * is unset. Wrapped by the caller in try/catch so a single failing key does not
 * abort the whole migration.
 * @param key Config key suffix (no namespace prefix).
 * @param target Global or Workspace scope to migrate.
 */
async function migrateKeyAtScope(
  key: string, target: vscode.ConfigurationTarget,
): Promise<void> {
  const oldCfg = vscode.workspace.getConfiguration(LEGACY_SECTION);
  const newCfg = vscode.workspace.getConfiguration(NEW_SECTION);
  const isGlobal = target === vscode.ConfigurationTarget.Global;
  const oldInspect = oldCfg.inspect(key);
  const newInspect = newCfg.inspect(key);
  const oldValue = isGlobal ? oldInspect?.globalValue : oldInspect?.workspaceValue;
  const newValue = isGlobal ? newInspect?.globalValue : newInspect?.workspaceValue;
  if (newValue === undefined && oldValue !== undefined) {
    await newCfg.update(key, oldValue, target);
  }
}

/**
 * Migrate one key across both Global and Workspace scopes. Each scope is guarded
 * independently so a workspace-write failure (e.g. no folder open) still lets the
 * global value migrate.
 * @param key Config key suffix (no namespace prefix).
 */
async function migrateKey(key: string): Promise<void> {
  try { await migrateKeyAtScope(key, vscode.ConfigurationTarget.Global); }
  catch (err) { console.warn(`[config-migration] global '${key}' failed:`, (err as Error).message); }
  try { await migrateKeyAtScope(key, vscode.ConfigurationTarget.Workspace); }
  catch (err) { console.warn(`[config-migration] workspace '${key}' failed:`, (err as Error).message); }
}

/**
 * Migrate all known config keys from `kiroSdlc.*` to `sdlcAgents.*` exactly once.
 * Idempotent via a globalState guard flag. Never throws — activation must not be
 * blocked by a migration error; individual key failures are logged and skipped.
 * @param context Extension context providing the globalState guard store.
 */
export async function migrateConfigNamespace(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_FLAG)) { return; }
  for (const key of CONFIG_KEYS) { await migrateKey(key); }
  await context.globalState.update(MIGRATION_FLAG, true);
}
