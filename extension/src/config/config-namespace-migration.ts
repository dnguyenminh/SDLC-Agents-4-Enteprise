/**
 * config-namespace-migration — one-time copy of user settings from the legacy
 * `kiroSdlc.*` configuration namespace to the current `sdlcAgents.*` namespace.
 *
 * The extension renamed its configuration namespace; without this migration a
 * user who set values under `kiroSdlc.*` would silently lose them after the
 * rename. This module copies each known key's Global and Workspace values into
 * the new namespace when the new value is unset. SA4E-370: the legacy namespace
 * only ever had FLAT key suffixes, so values are copied to the canonical
 * dotted keys (e.g. kiroSdlc.llmProvider → sdlcAgents.llm.provider). Legacy
 * keys are NOT deleted (copy-not-move) so a rollback keeps working. Runs
 * exactly once, guarded by a globalState flag, and never throws — a migration
 * failure must not break activation.
 */

import * as vscode from "vscode";

/** Guard flag stored in globalState so migration runs at most once. */
const MIGRATION_FLAG = "sdlcAgents.configMigrated.v1";

const LEGACY_SECTION = "kiroSdlc";
const NEW_SECTION = "sdlcAgents";

/**
 * Key migration pairs for the SA4E-370 dot-notation rename: the legacy
 * `kiroSdlc.*` namespace only ever used FLAT key suffixes, while the canonical
 * `sdlcAgents.*` keys are now dotted. Each pair is [legacyFlatKey, newKey];
 * non-renamed keys map to themselves. Reads of legacy `sdlcAgents.*` flat keys
 * still work at runtime via config/settings-migration.ts (inspect fallback).
 */
const CONFIG_KEY_PAIRS: readonly (readonly [string, string])[] = [
  ["backend.url", "backend.url"], ["backend.allowInsecureRemote", "backend.allowInsecureRemote"],
  ["backend.ssoEnabled", "backend.ssoEnabled"], ["backend.ssoProviderUrl", "backend.ssoProviderUrl"],
  ["backend.toolCallTimeout", "backend.toolCallTimeout"], ["backend.chatTimeout", "backend.chatTimeout"],
  ["turn.maxToolRepeats", "turn.maxToolRepeats"], ["backend.healthCheckInterval", "backend.healthCheckInterval"],
  ["backend.rateLimitRpm", "backend.rateLimitRpm"], ["backend.indexRetryRounds", "backend.indexRetryRounds"],
  ["pega.dedupMaxInMemory", "pega.dedupMaxInMemory"], ["pega.fetchBatchSize", "pega.fetchBatchSize"],
  ["pega.ingestConcurrency", "pega.ingestConcurrency"],
  ["pega.ingestChannelCapacity", "pega.ingestChannelCapacity"],
  ["pega.useCatalogExport", "pega.useCatalogExport"],
  ["mcpServerPort", "mcp.serverPort"], ["mcpMaxBodyBytes", "mcp.maxBodyBytes"],
  ["enableMcpServer", "mcp.enabled"], ["mcpServerUrl", "mcp.serverUrl"],
  ["configPath", "workspace.configPath"], ["llmProvider", "llm.provider"],
  ["llmModel", "llm.model"], ["llmFallbackModels", "llm.fallbackModels"],
  ["anthropicBaseUrl", "llm.anthropic.baseUrl"], ["openaiBaseUrl", "llm.openai.baseUrl"],
  ["ollamaUrl", "llm.ollama.baseUrl"], ["lmstudioBaseUrl", "llm.lmstudio.baseUrl"],
  ["openrouterBaseUrl", "llm.openrouter.baseUrl"], ["kiroModel", "llm.kiro.model"],
  ["pegaEndpoint", "pega.endpoint"], ["pegaUsername", "pega.username"],
  ["pegaDeveloperShortName", "pega.developerShortName"],
  ["atlassianConnectionType", "jira.connectionType"],
  ["jiraSyncState", "jira.syncState"], ["jiraLastProject", "jira.lastProject"],
  ["jiraAttachmentChecksums", "jira.attachmentChecksums"],
  ["proxy.mode", "proxy.mode"], ["proxy.host", "proxy.host"],
  ["proxy.port", "proxy.port"], ["proxy.bypass", "proxy.bypass"],
];

/**
 * Copy one pair's value at a single scope from legacy to new when the new value
 * is unset. Wrapped by the caller in try/catch so a single failing key does not
 * abort the whole migration.
 * @param legacyKey Flat key suffix in the legacy namespace (read source).
 * @param newKey SA4E-370 dotted key suffix in the current namespace (write target).
 * @param target Global or Workspace scope to migrate.
 */
async function migrateKeyAtScope(
  legacyKey: string, newKey: string, target: vscode.ConfigurationTarget,
): Promise<void> {
  const oldCfg = vscode.workspace.getConfiguration(LEGACY_SECTION);
  const newCfg = vscode.workspace.getConfiguration(NEW_SECTION);
  const isGlobal = target === vscode.ConfigurationTarget.Global;
  const oldInspect = oldCfg.inspect(legacyKey);
  const newInspect = newCfg.inspect(newKey);
  const oldValue = isGlobal ? oldInspect?.globalValue : oldInspect?.workspaceValue;
  const newValue = isGlobal ? newInspect?.globalValue : newInspect?.workspaceValue;
  if (newValue === undefined && oldValue !== undefined) {
    await newCfg.update(newKey, oldValue, target);
  }
}

/**
 * Migrate one pair across both Global and Workspace scopes. Each scope is
 * guarded independently so a workspace-write failure (e.g. no folder open)
 * still lets the global value migrate.
 * @param legacyKey Flat key suffix in the legacy namespace (read source).
 * @param newKey SA4E-370 dotted key suffix in the current namespace (write target).
 */
async function migrateKey(legacyKey: string, newKey: string): Promise<void> {
  try { await migrateKeyAtScope(legacyKey, newKey, vscode.ConfigurationTarget.Global); }
  catch (err) { console.warn(`[config-migration] global '${legacyKey}'→'${newKey}' failed:`, (err as Error).message); }
  try { await migrateKeyAtScope(legacyKey, newKey, vscode.ConfigurationTarget.Workspace); }
  catch (err) { console.warn(`[config-migration] workspace '${legacyKey}'→'${newKey}' failed:`, (err as Error).message); }
}

/**
 * Migrate all known config keys from `kiroSdlc.*` (flat suffixes) to the
 * canonical `sdlcAgents.*` dotted keys exactly once. Idempotent via a
 * globalState guard flag. Never throws — activation must not be blocked by a
 * migration error; individual key failures are logged and skipped.
 * @param context Extension context providing the globalState guard store.
 */
export async function migrateConfigNamespace(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_FLAG)) { return; }
  for (const [legacyKey, newKey] of CONFIG_KEY_PAIRS) { await migrateKey(legacyKey, newKey); }
  await context.globalState.update(MIGRATION_FLAG, true);
}
