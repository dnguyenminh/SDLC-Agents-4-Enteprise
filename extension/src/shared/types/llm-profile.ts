/**
 * LlmProfile — multi-profile LLM configuration data model.
 * Replaces the flat `llm.provider` / `llm.model` configuration with a list
 * of named profiles, each carrying provider, model, base URL, and test status.
 * Profile IDs must be slug-safe ([a-z0-9-]+) to form valid secret keys.
 */

import type { SecretStorage } from "vscode";

/** Valid LLM provider identifiers. */
export type LlmProviderId =
  | "anthropic"
  | "openai"
  | "lmstudio"
  | "openrouter"
  | "ollama"
  | "onnx";

/** Result of the last connection test for a profile. */
export type LlmTestStatus = "connected" | "failed" | "untested";

/**
 * Validates that a string matches the profile ID slug pattern.
 * Profile IDs form part of the secret key: `sdlcAgents.<profileId>ApiKey`.
 * @param id Candidate profile ID.
 * @returns True if the ID is a valid slug.
 */
export function isValidProfileId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

/**
 * Validates that a provider ID is recognized.
 * @param provider Provider identifier.
 * @returns True if the provider is in the known list.
 */
export function isValidProvider(provider: string): provider is LlmProviderId {
  const known: LlmProviderId[] = [
    "anthropic",
    "openai",
    "lmstudio",
    "openrouter",
    "ollama",
    "onnx",
  ];
  return known.includes(provider as LlmProviderId);
}

/**
 * Core data model for a single LLM configuration profile.
 */
export interface LlmProfile {
  /** Internal identifier — MUST match slug pattern [a-z0-9-]+. */
  id: string;

  /** Human-readable display name. */
  label: string;

  /** Provider identifier (e.g., "lmstudio", "openrouter"). */
  provider: LlmProviderId;

  /**
   * Override base URL for the provider's API gateway.
   * When undefined or empty, the provider's default URL is used.
   */
  baseUrl?: string;

  /** Model identifier as known by the provider (or "auto"). */
  model: string;

  /** Whether to use the provider's default base URL (true) or the override (false). */
  useDefaultUrl: boolean;

  /** Status of the last connection test. */
  lastTestStatus?: LlmTestStatus;

  /** Timestamp (epoch ms) of the last connection test. */
  lastTestedAt?: number;
}

/**
 * Row data for the Profile Table in the Settings panel.
 * Derived from LlmProfile for UI display.
 */
export interface ProfileTableRow {
  profileId: string;
  label: string;
  provider: LlmProviderId;
  model: string;
  useDefaultUrl: boolean;
  lastTestStatus?: LlmTestStatus;
  lastTestedAt?: number;
}

/**
 * Model picker item displayed in the Chat window.
 * Grouped by provider; only connected profiles are shown.
 */
export interface ModelPickerItem {
  /** Provider name — used for grouping. */
  provider: LlmProviderId;

  /** Display name of the model (e.g., "Qwen 7B"). */
  modelName: string;

  /** Whether the model is free (green "Free" badge). */
  isFree: boolean;

  /** Profile ID that owns this model — used to resolve provider/baseUrl/key. */
  profileId: string;

  /** Raw model ID as used by the provider API. */
  modelId: string;
}

/**
 * Grouped model picker structure: one group per provider.
 */
export interface ModelPickerGroup {
  provider: LlmProviderId;
  items: ModelPickerItem[];
}

/**
 * Configuration payload sent from webview to create/update a profile.
 */
export interface ProfileCreatePayload {
  id: string;
  label: string;
  provider: LlmProviderId;
  baseUrl?: string;
  model: string;
  useDefaultUrl: boolean;
  apiKey?: string;
}

/**
 * Result of profile operations for the webview.
 */
export interface ProfileOpResult {
  success: boolean;
  profiles?: ProfileTableRow[];
  activeProfileId?: string;
  error?: string;
}

/**
 * Migration result data for the one-time flat-config → Profile #1 migration.
 */
export interface MigrationResult {
  oldProviderId: string;
  oldModel: string;
  oldBaseUrl?: string;
  newProfileId: string;
  newProfile: LlmProfile;
  migrationTimestamp: number;
}

/**
 * Read an API key for a profile via the secret-key helper.
 * This is the ONLY way to read LLM API keys — never call secrets.get() directly.
 * @param secrets VS Code SecretStorage.
 * @param profileId Profile identifier (slug).
 * @returns The API key or undefined.
 */
export async function readProfileApiKey(
  secrets: SecretStorage,
  profileId: string,
): Promise<string | undefined> {
  // Import dynamically to avoid circular dependency
  const { readLlmApiKey } = await import("../../config/llm-secret-keys.js");
  return readLlmApiKey(secrets, profileId);
}

/**
 * Get the secret key name for a profile's API key.
 * @param profileId Profile identifier (slug).
 * @returns SecretStorage key name (e.g., "sdlcAgents.lmstudio-qwenApiKey").
 */
export function profileSecretKey(profileId: string): string {
  const { llmSecretKey } = require("../../config/llm-secret-keys.js");
  return llmSecretKey(profileId);
}