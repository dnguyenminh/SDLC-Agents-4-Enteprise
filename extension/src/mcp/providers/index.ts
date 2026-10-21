/**
 * LLM Provider Factory — KSA-210
 * Creates provider instances based on VS Code configuration.
 * Providers are lazy-loaded to minimize extension activation cost.
 * Uses data-driven registry for 20+ providers.
 */

import * as vscode from "vscode";
import type { LlmProvider, LlmProviderType } from "../llm-provider";
import { getProviderDef, PROVIDER_REGISTRY } from "./provider-registry";
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_LEGACY_KEYS } from "../../models/LlmProviderConfig";
import { readLlmApiKey } from "../../config/llm-secret-keys";
import { getSettingWithFallback } from "../../config/settings-migration";

type ExtendedLlmProviderType = LlmProviderType | "onnx" | string;

/** Read a provider API key with migrate-on-read from the legacy namespace. */
function apiKeyReader(secrets: vscode.SecretStorage, providerId: string): () => Promise<string | undefined> {
  return () => readLlmApiKey(secrets, providerId);
}

/**
 * Create an LlmProvider from VS Code settings.
 * Reads sdlcAgents.llm.provider, sdlcAgents.llm.model, sdlcAgents.llm.ollama.baseUrl
 * (SA4E-370 renamed keys; each read falls back to its legacy flat key).
 */
export function createLlmProvider(secrets?: vscode.SecretStorage): LlmProvider {
  const providerType = getSettingWithFallback<string>("llm.provider", "llmProvider", "anthropic");
  const customModel = getSettingWithFallback<string>("llm.model", "llmModel", "");
  const ollamaUrl = getSettingWithFallback<string>("llm.ollama.baseUrl", "ollamaUrl", "http://localhost:11434");

  // Resolve the base URL from the provider-specific config key (single source of truth).
  // Settings UI persists per-provider base URLs (legacy flat keys, e.g. lmstudioBaseUrl,
  // openaiBaseUrl — kept as write targets), so reading only "llmBaseUrl" here would drop
  // the user's configured URL and fall back to the registry default — the root cause of
  // requests hitting the wrong local server.
  const providerBaseUrlKey = PROVIDER_BASE_URL_KEYS[providerType];
  const providerBaseUrl = providerBaseUrlKey
    ? getSettingWithFallback<string>(providerBaseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[providerType], "")
    : "";
  // Keep "llmBaseUrl" as a generic fallback for custom providers without a
  // dedicated key (undocumented — read directly, no rename involved).
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  const customBaseUrl = providerBaseUrl || config.get<string>("llmBaseUrl", "");

  return createProviderByType(providerType, secrets, customModel, ollamaUrl, customBaseUrl, customBaseUrl);
}

/**
 * Create a specific provider type with explicit configuration.
 * Uses registry to resolve OpenAI-compatible providers generically.
 */
export function createProviderByType(
  type: LlmProviderType | ExtendedLlmProviderType,
  secrets?: vscode.SecretStorage,
  customModel?: string,
  ollamaUrl?: string,
  anthropicBaseUrl?: string,
  openaiBaseUrl?: string
): LlmProvider {
  // Special cases: native providers with custom implementations
  switch (type) {
    case "anthropic": {
      const { AnthropicProvider } = require("./anthropic-provider");
      const baseUrl = anthropicBaseUrl
        || getSettingWithFallback<string>("llm.anthropic.baseUrl", "anthropicBaseUrl", "");
      return new AnthropicProvider(
        secrets ? apiKeyReader(secrets, "anthropic") : () => Promise.resolve(undefined),
        baseUrl || undefined,
        customModel || undefined
      );
    }
    case "ollama": {
      const { OllamaProvider } = require("./ollama-provider");
      return new OllamaProvider(ollamaUrl, customModel || undefined);
    }
    case "onnx": {
      const { OnnxProvider } = require("./onnx-provider");
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
      return new OnnxProvider(workspaceRoot, customModel || undefined);
    }
    case "kiro": {
      const gatewayUrl = anthropicBaseUrl
        || getSettingWithFallback<string>("llm.anthropic.baseUrl", "anthropicBaseUrl", "http://127.0.0.1:8990/anthropic");
      const { AnthropicProvider } = require("./anthropic-provider");
      return new AnthropicProvider(
        secrets ? apiKeyReader(secrets, "anthropic") : () => Promise.resolve(undefined),
        gatewayUrl,
        customModel || undefined
      );
    }
  }

  // Generic: all other providers use OpenAI-compatible API
  const providerDef = getProviderDef(type);
  if (providerDef && (providerDef.apiType === "openai-compatible")) {
    const { OpenAIProvider } = require("./openai-provider");
    // Precedence: explicit arg → provider-specific config key → generic llmBaseUrl → registry default.
    const providerBaseUrlKey = PROVIDER_BASE_URL_KEYS[type];
    const providerConfiguredUrl = providerBaseUrlKey
      ? getSettingWithFallback<string>(providerBaseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[type], "")
      : "";
    const config = vscode.workspace.getConfiguration("sdlcAgents");
    const customUrl = openaiBaseUrl || providerConfiguredUrl || config.get<string>("llmBaseUrl", "");
    const baseUrl = customUrl || providerDef.baseUrl;
    const apiKeyFn = providerDef.requiresApiKey && secrets
      ? apiKeyReader(secrets, type)
      : () => Promise.resolve(providerDef.requiresApiKey ? undefined : "not-needed");
    return new OpenAIProvider(apiKeyFn, baseUrl, customModel || undefined);
  }

  // Fallback: try as OpenAI-compatible with custom base URL
  if (openaiBaseUrl) {
    const { OpenAIProvider } = require("./openai-provider");
    const apiKeyFn = secrets ? apiKeyReader(secrets, type) : () => Promise.resolve(undefined);
    return new OpenAIProvider(apiKeyFn, openaiBaseUrl, customModel || undefined);
  }

  throw new Error(`Unknown LLM provider type: ${type}. Add it to provider-registry.ts or provide a base URL.`);
}

/** Re-export registry for settings panel */
export { PROVIDER_REGISTRY, getProviderDef, getProvidersByCategory } from "./provider-registry";
