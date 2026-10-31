/**
 * EditProviderValidation — validation logic for edit provider modal.
 * Extracted from EditProviderModal for SRP and line limits.
 */

import { EditProviderFormData } from "./edit-provider-modal.js";

const LOCAL_PROVIDERS = ["lmstudio", "ollama", "onnx"];

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/** Validate URL format. */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch { return false; }
}

/** Validate form and return all errors. */
export function validateForm(
  providerId: string,
  apiKey: string,
  model: string,
  baseUrl: string
): ValidationResult {
  const isLocal = LOCAL_PROVIDERS.includes(providerId);
  const errors: Record<string, string> = {};

  if (!providerId) {
    errors.provider = "Please select a provider";
  }

  if (!isLocal && !apiKey.trim()) {
    errors.apiKey = "API key is required for this provider";
  }

  if (!model.trim()) {
    errors.model = "Model ID is required";
  }

  if (baseUrl.trim() && !isValidUrl(baseUrl.trim())) {
    errors.baseUrl = "Invalid URL format";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Get API key hint for a provider. */
export function getApiKeyHint(providerId: string): string {
  if (providerId === "lmstudio") {
    return "Optional for LM Studio (local server typically doesn't require auth)";
  }
  if (providerId === "ollama") {
    return "Not required for Ollama (local server)";
  }
  return "";
}