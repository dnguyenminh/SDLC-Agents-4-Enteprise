/**
 * LLM Provider Factory — KSA-210
 * Creates provider instances based on VS Code configuration.
 * Providers are lazy-loaded to minimize extension activation cost.
 * Uses data-driven registry for 20+ providers.
 */

import * as vscode from "vscode";
import type { LlmProvider, LlmProviderType } from "../core/llm-provider";
import { getProviderDef, PROVIDER_REGISTRY } from "./provider-registry";

type ExtendedLlmProviderType = LlmProviderType | "onnx" | string;

/** VS Code secret keys for each provider */
const SECRET_KEYS: Record<string, string> = {
  anthropic: "kiroSdlc.anthropicApiKey",
  openai: "kiroSdlc.openaiApiKey",
};

/** Get the secret key name for a provider (most use openai key slot) */
function getSecretKey(providerId: string): string {
  if (providerId === "anthropic" || providerId === "kiro") { return SECRET_KEYS.anthropic; }
  return `kiroSdlc.${providerId}ApiKey`;
}

/**
 * Create an LlmProvider from VS Code settings.
 * Reads kiroSdlc.llmProvider, kiroSdlc.llmModel, kiroSdlc.ollamaUrl from workspace config.
 */
export function createLlmProvider(secrets?: vscode.SecretStorage): LlmProvider {
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const providerType = config.get<string>("llmProvider", "anthropic");
  const customModel = config.get<string>("llmModel", "");
  const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");
  const customBaseUrl = config.get<string>("llmBaseUrl", "");

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
      const config = vscode.workspace.getConfiguration("kiroSdlc");
      const baseUrl = anthropicBaseUrl || config.get<string>("anthropicBaseUrl", "");
      return new AnthropicProvider(
        secrets ? () => secrets.get(getSecretKey("anthropic")) : () => Promise.resolve(undefined),
        baseUrl || undefined
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
      const config = vscode.workspace.getConfiguration("kiroSdlc");
      const gatewayUrl = anthropicBaseUrl || config.get<string>("anthropicBaseUrl", "http://127.0.0.1:8990/anthropic");
      const { AnthropicProvider } = require("./anthropic-provider");
      return new AnthropicProvider(
        secrets ? () => secrets.get(getSecretKey("anthropic")) : () => Promise.resolve(undefined),
        gatewayUrl
      );
    }
  }

  // Generic: all other providers use OpenAI-compatible API
  const providerDef = getProviderDef(type);
  if (providerDef && (providerDef.apiType === "openai-compatible")) {
    const { OpenAIProvider } = require("./openai-provider");
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const customUrl = openaiBaseUrl || config.get<string>("llmBaseUrl", "");
    const baseUrl = customUrl || providerDef.baseUrl;
    const apiKeyFn = providerDef.requiresApiKey && secrets
      ? () => secrets.get(getSecretKey(type))
      : () => Promise.resolve(providerDef.requiresApiKey ? undefined : "not-needed");
    return new OpenAIProvider(apiKeyFn, baseUrl);
  }

  // Fallback: try as OpenAI-compatible with custom base URL
  if (openaiBaseUrl) {
    const { OpenAIProvider } = require("./openai-provider");
    const apiKeyFn = secrets ? () => secrets.get(getSecretKey(type)) : () => Promise.resolve(undefined);
    return new OpenAIProvider(apiKeyFn, openaiBaseUrl);
  }

  throw new Error(`Unknown LLM provider type: ${type}. Add it to provider-registry.ts or provide a base URL.`);
}

/** Re-export registry for settings panel */
export { PROVIDER_REGISTRY, getProviderDef, getProvidersByCategory } from "./provider-registry";
