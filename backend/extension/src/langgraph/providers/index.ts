/**
 * LLM Provider Factory — KSA-210
 * Creates provider instances based on VS Code configuration.
 * Providers are lazy-loaded to minimize extension activation cost.
 */

import * as vscode from "vscode";
import type { LlmProvider, LlmProviderType } from "../llm-provider";

/** Extended provider type including onnx */
export type ExtendedLlmProviderType = LlmProviderType | "onnx";

/** VS Code secret keys for each provider */
const SECRET_KEYS: Record<string, string> = {
  anthropic: "kiroSdlc.anthropicApiKey",
  openai: "kiroSdlc.openaiApiKey",
};

/**
 * Create an LlmProvider from VS Code settings.
 * Reads kiroSdlc.llmProvider, kiroSdlc.llmModel, kiroSdlc.ollamaUrl from workspace config.
 */
export function createLlmProvider(secrets?: vscode.SecretStorage): LlmProvider {
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const providerType = config.get<LlmProviderType>("llmProvider", "anthropic");
  const customModel = config.get<string>("llmModel", "");
  const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434");
  const anthropicBaseUrl = config.get<string>("anthropicBaseUrl", "");
  // Read per-provider base URLs
  const openaiBaseUrl = providerType === "lmstudio"
    ? (config.get<string>("lmstudioBaseUrl", "") || "http://localhost:1234/v1")
    : providerType === "openrouter"
    ? (config.get<string>("openrouterBaseUrl", "") || "https://openrouter.ai/api/v1")
    : config.get<string>("openaiBaseUrl", "");

  return createProviderByType(providerType, secrets, customModel, ollamaUrl, anthropicBaseUrl, openaiBaseUrl);
}

/**
 * Create a specific provider type with explicit configuration.
 */
export function createProviderByType(
  type: LlmProviderType | ExtendedLlmProviderType,
  secrets?: vscode.SecretStorage,
  customModel?: string,
  ollamaUrl?: string,
  anthropicBaseUrl?: string,
  openaiBaseUrl?: string
): LlmProvider {
  switch (type) {
    case "anthropic": {
      const { AnthropicProvider } = require("./anthropic-provider");
      return new AnthropicProvider(
        secrets ? () => secrets.get(SECRET_KEYS.anthropic) : () => Promise.resolve(undefined),
        anthropicBaseUrl || undefined
      );
    }
    case "openai": {
      const { OpenAIProvider } = require("./openai-provider");
      return new OpenAIProvider(
        secrets ? () => secrets.get(SECRET_KEYS.openai) : () => Promise.resolve(undefined),
        openaiBaseUrl || undefined
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
      // Backward compat — alias "kiro" to anthropic + the configured gateway
      // base URL. The gateway now runs as the standalone Kiro Gateway extension
      // (default http://127.0.0.1:8990/anthropic via kiroSdlc.anthropicBaseUrl).
      const config2 = vscode.workspace.getConfiguration("kiroSdlc");
      const gatewayUrl = anthropicBaseUrl || config2.get<string>("anthropicBaseUrl", "http://127.0.0.1:8990/anthropic");
      const { AnthropicProvider } = require("./anthropic-provider");
      return new AnthropicProvider(
        secrets ? () => secrets.get(SECRET_KEYS.anthropic) : () => Promise.resolve(undefined),
        gatewayUrl
      );
    }
    case "lmstudio": {
      // LM Studio uses OpenAI-compatible API at localhost:1234
      const { OpenAIProvider } = require("./openai-provider");
      const lmStudioUrl = openaiBaseUrl || "http://localhost:1234/v1";
      return new OpenAIProvider(
        () => Promise.resolve("not-needed"),
        lmStudioUrl
      );
    }
    case "openrouter": {
      // OpenRouter uses OpenAI-compatible API
      const { OpenAIProvider } = require("./openai-provider");
      const orUrl = openaiBaseUrl || "https://openrouter.ai/api/v1";
      return new OpenAIProvider(
        secrets ? () => secrets.get(SECRET_KEYS.openai) : () => Promise.resolve(undefined),
        orUrl
      );
    }
    default:
      throw new Error(`Unknown LLM provider type: ${type}`);
  }
}

/**
 * Get the secret storage key for a given provider type.
 */
export function getSecretKeyForProvider(type: LlmProviderType): string | undefined {
  return SECRET_KEYS[type];
}
