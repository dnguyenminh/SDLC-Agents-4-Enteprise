/**
 * ProviderConfigMigration — Profile migration logic for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import { readLlmApiKey, writeLlmApiKey, profileSecretKey } from "../config/llm-secret-keys.js";
import { isValidProvider } from "../shared/types/llm-profile.js";
import * as vscode from "vscode";

const MIGRATION_FLAG = "sdlcAgents.llmProfileMigration.v1_55_0.completed";

/** Legacy flat config keys we read during migration. */
const LEGACY_PROVIDER_KEY = "llm.provider";
const LEGACY_MODEL_KEY = "llm.model";
const LEGACY_BASE_URL_KEYS: Record<string, string> = {
  anthropic: "llm.anthropic.baseUrl",
  openai: "llm.openai.baseUrl",
  lmstudio: "llm.lmstudio.baseUrl",
  openrouter: "llm.openrouter.baseUrl",
  ollama: "llm.ollama.baseUrl",
};

/** Provider display name mapping for default label. */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  lmstudio: "LMStudio",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  onnx: "ONNX",
};

/**
 * Run the one-time flat-config → Profile #1 migration.
 * Safe to call multiple times — guarded by globalState flag.
 * @param context VS Code ExtensionContext for globalState access.
 */
export async function runLlmProfileMigration(
  context: vscode.ExtensionContext,
  getConfig: () => vscode.WorkspaceConfiguration
): Promise<void> {
  // Skip if already migrated
  if (context.globalState.get<boolean>(MIGRATION_FLAG, false)) {
    return;
  }

  const config = getConfig();

  // Check if profiles already exist (user may have manually created them)
  const existingProfiles = config.get<any[]>("llm.profiles", []);
  if (existingProfiles.length > 0) {
    // Mark as migrated to prevent future runs
    await context.globalState.update(MIGRATION_FLAG, true);
    return;
  }

  // Read legacy flat config — BACKWARD-COMPAT FALLBACK
  const oldProvider = config.get<string>(LEGACY_PROVIDER_KEY, "anthropic");
  const oldModel = config.get<string>(LEGACY_MODEL_KEY, "");

  // Validate provider
  if (!isValidProvider(oldProvider)) {
    console.warn(`[llm-profile-migration] Unknown provider '${oldProvider}', skipping migration`);
    await context.globalState.update(MIGRATION_FLAG, true);
    return;
  }

  // Read legacy base URL (dot-notation key preferred, legacy flat as fallback) — BACKWARD-COMPAT FALLBACK
  const baseUrlKey = LEGACY_BASE_URL_KEYS[oldProvider];
  const oldBaseUrl = baseUrlKey
    ? config.get<string>(baseUrlKey, "")
    : "";

  // Read legacy API key (via helper — handles migrate-on-read from kiroSdlc.*)
  const oldApiKey = await readLlmApiKey(context.secrets, oldProvider, false);

  // Build Profile #1
  const profileId = oldProvider; // provider IDs are already slug-safe
  const label = `${PROVIDER_LABELS[oldProvider] || oldProvider} - default`;

  const newProfile = {
    id: profileId,
    label,
    provider: oldProvider,
    baseUrl: oldBaseUrl || undefined,
    model: oldModel || "auto",
    useDefaultUrl: !oldBaseUrl,
    lastTestStatus: "untested" as const,
    lastTestedAt: undefined,
  };

  // Persist profile list
  await config.update("llm.profiles", [newProfile], vscode.ConfigurationTarget.Global);

  // Set active profile
  await config.update("llm.activeProfileId", profileId, vscode.ConfigurationTarget.Global);

  // Migrate API key to profile secret
  if (oldApiKey) {
    await writeLlmApiKey(context.secrets, profileId, oldApiKey, true);
  }

  // Migration complete — set flag
  await context.globalState.update(MIGRATION_FLAG, true);

  console.info(`[llm-profile-migration] Created Profile #1: ${profileId} (${label})`);
}

/**
 * Check if the LLM profile migration has already run.
 * @param context VS Code ExtensionContext.
 * @returns True if migration flag is set.
 */
export function isLlmProfileMigrationDone(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<boolean>(MIGRATION_FLAG, false);
}

/**
 * Reset the migration flag (for testing only).
 * @param context VS Code ExtensionContext.
 */
export async function resetLlmProfileMigration(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(MIGRATION_FLAG, false);
}