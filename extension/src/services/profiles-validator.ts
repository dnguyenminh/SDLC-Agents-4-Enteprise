/**
 * ProfilesValidator — validation logic for LLM profiles.
 * Extracted from ProfilesService for SRP and line limits.
 */

import { LlmProfile, LlmProviderId, isValidProfileId, isValidProvider } from "../shared/types/llm-profile.js";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate profile ID format (slug: lowercase alphanumeric + hyphens).
 */
export function validateProfileId(profileId: string): ValidationResult {
  if (!isValidProfileId(profileId)) {
    return { valid: false, error: "Profile ID must be a valid slug [a-z0-9-]+" };
  }
  return { valid: true };
}

/**
 * Validate provider is known.
 */
export function validateProvider(provider: LlmProviderId): ValidationResult {
  if (!isValidProvider(provider)) {
    return { valid: false, error: `Unknown provider: ${provider}` };
  }
  return { valid: true };
}

/**
 * Validate label is non-empty.
 */
export function validateLabel(label: string): ValidationResult {
  if (!label || !label.trim()) {
    return { valid: false, error: "Profile label is required" };
  }
  return { valid: true };
}

/**
 * Validate model is non-empty.
 */
export function validateModel(model: string): ValidationResult {
  if (!model || !model.trim()) {
    return { valid: false, error: "Model is required" };
  }
  return { valid: true };
}

/**
 * Validate base URL format when not using default.
 */
export function validateBaseUrl(baseUrl: string | undefined, useDefaultUrl: boolean): ValidationResult {
  if (!useDefaultUrl && baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      return { valid: false, error: "Base URL must be a valid URL" };
    }
  }
  return { valid: true };
}

/**
 * Validate duplicate profile ID.
 */
export function validateDuplicateId(profileId: string, existingProfiles: LlmProfile[]): ValidationResult {
  if (existingProfiles.some((p) => p.id === profileId)) {
    return { valid: false, error: `Profile ID '${profileId}' already exists` };
  }
  return { valid: true };
}

/**
 * Validate profile not found.
 */
export function validateProfileExists(profileId: string, profiles: LlmProfile[]): ValidationResult {
  if (!profiles.some((p) => p.id === profileId)) {
    return { valid: false, error: `Profile '${profileId}' not found` };
  }
  return { valid: true };
}

/**
 * Validate API key for non-local providers.
 */
export function validateApiKey(apiKey: string | undefined, provider: LlmProviderId, isLocalProvider: boolean): ValidationResult {
  if (!isLocalProvider && (!apiKey || !apiKey.trim())) {
    return { valid: false, error: "API key is required for this provider" };
  }
  return { valid: true };
}

/**
 * Full validation for adding a new profile.
 */
export async function validateAddProfile(
  payload: {
    id: string;
    label: string;
    provider: LlmProviderId;
    model: string;
    useDefaultUrl: boolean;
    baseUrl?: string;
  },
  existingProfiles: LlmProfile[]
): Promise<ValidationResult> {
  const checks = [
    validateProfileId(payload.id),
    validateProvider(payload.provider),
    validateLabel(payload.label),
    validateModel(payload.model),
    validateBaseUrl(payload.baseUrl, payload.useDefaultUrl),
    validateDuplicateId(payload.id, existingProfiles),
  ];

  for (const check of checks) {
    if (!check.valid) { return check; }
  }
  return { valid: true };
}

/**
 * Full validation for editing a profile.
 */
export function validateEditProfile(
  updates: Partial<Pick<LlmProfile, "label" | "provider" | "baseUrl" | "model" | "useDefaultUrl">>,
  current: LlmProfile
): ValidationResult {
  if (updates.provider) {
    const providerCheck = validateProvider(updates.provider);
    if (!providerCheck.valid) { return providerCheck; }
  }

  if (updates.label !== undefined) {
    const labelCheck = validateLabel(updates.label);
    if (!labelCheck.valid) { return labelCheck; }
  }

  if (updates.model !== undefined) {
    const modelCheck = validateModel(updates.model);
    if (!modelCheck.valid) { return modelCheck; }
  }

  const useDefault = updates.useDefaultUrl ?? current.useDefaultUrl;
  const baseUrl = updates.baseUrl !== undefined ? updates.baseUrl : current.baseUrl;
  const baseUrlCheck = validateBaseUrl(baseUrl, useDefault);
  if (!baseUrlCheck.valid) { return baseUrlCheck; }

  return { valid: true };
}