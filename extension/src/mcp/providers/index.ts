import { getSetting } from "../../config/settings-migration";
/**
 * LLM Provider Factory — KSA-210
 * Creates provider instances based on VS Code configuration.
 * Providers are lazy-loaded to minimize extension activation cost.
 * Uses data-driven registry for 20+ providers.
 */

import * as vscode from "vscode";
import type { LlmProvider, LlmProviderType } from "../llm-provider";
import { getProviderDef, PROVIDER_REGISTRY } from "./provider-registry";
import { PROVIDER_BASE_URL_KEYS } from "../../models/LlmProviderConfig";
import { readLlmApiKey } from "../../config/llm-secret-keys";

type ExtendedLlmProviderType = LlmProviderType | "onnx" | string;

/** Read a provider API key with migrate-on-read from the legacy namespace. */
function apiKeyReader(secrets: vscode.SecretStorage, providerId: string): () => Promise<string | undefined> {
  return () => readLlmApiKey(secrets, providerId);
}

/**
 * Create an LlmProvider from VS Code settings.
 * Reads sdlcAgents.llm.provider, sdlcAgents.llm.model, sdlcAgents.llm.ollama.baseUrl
 * (SA4E-370 dotted keys; legacy flat values are copied forward once at
 * activation by settings-migration-runner).
 */
export function createLlmProvider(secrets?: vscode.SecretStorage): LlmProvider {
  const providerType = getSetting<string>("llm.provider","llm.provider", "anthropic");
  const customModel = getSetting<string>("llm.model","llm.model", "");
  const ollamaUrl = getSetting<string>("llm.ollama.baseUrl","llm.ollama.baseUrl", "http://localhost:11434");

  // Resolve the base URL from the provider-specific config key (single source of truth).
  // SA4E-370: reads the new dotted per-provider key; the Settings panel now
  // writes the same dotted key, and legacy flat values are copied forward by
  // the one-time activation migration.
  const providerBaseUrlKey = PROVIDER_BASE_URL_KEYS[providerType];
  const providerBaseUrl = providerBaseUrlKey
    ? getSetting<string>(providerBaseUrlKey, "", "")
    : "";
  // Keep "llmBaseUrl" as a generic fallback for custom providers without a
  // dedicated key (undocumented — read directly, no rename involved).
  const customBaseUrl = providerBaseUrl || getSetting<string>("llmBaseUrl", "llmBaseUrl", "");

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
        || getSetting<string>("llm.anthropic.baseUrl","llm.anthropic.baseUrl", "");
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
        || getSetting<string>("llm.anthropic.baseUrl","llm.anthropic.baseUrl", "http://127.0.0.1:8990/anthropic");
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
      ? getSetting<string>(providerBaseUrlKey, "", "")
      : "";
    const customUrl = openaiBaseUrl || providerConfiguredUrl || getSetting<string>("llmBaseUrl", "llmBaseUrl", "");
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
