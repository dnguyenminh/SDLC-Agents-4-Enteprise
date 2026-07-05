/**
 * Chat Panel Model Catalog — KSA-237
 * Single source of truth for the per-provider model list shown in the Chat
 * Panel model dropdown. Mirrors the catalog used by the Settings panel so the
 * dropdown reflects the provider configured in SDLC Settings
 * (kiroSdlc.llmProvider) instead of a hardcoded mixed list.
 *
 * When the Anthropic base URL points at the local gateway (127.0.0.1),
 * the model list is fetched live from GET http://127.0.0.1:{port}/v1/models
 * which surfaces all available Kiro models. Falls back to this static catalog
 * when the gateway is unreachable.
 */

import type { ChatModelEntry } from "./message-protocol";

/** Provider id as stored in kiroSdlc.llmProvider */
export type ChatProvider = "anthropic" | "openai" | "ollama" | "onnx" | "lmstudio" | "openrouter";

/** Default model id per provider (used when no override is configured). */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  kiro: "auto",
  openai: "gpt-4o",
  ollama: "llama3.1",
  onnx: "phi-3-mini",
  lmstudio: "local-model",
  openrouter: "anthropic/claude-sonnet-4",
};

/** Available models per provider — static catalog (fallback when gateway is unreachable). */
export const AVAILABLE_MODELS: Record<string, ChatModelEntry[]> = {
  kiro: [
    { id: "auto", name: "Auto" },
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", rateMultiplier: 2.2 },
    { id: "claude-opus-4-7", name: "Claude Opus 4.7", rateMultiplier: 2.2 },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", rateMultiplier: 1.3 },
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", rateMultiplier: 1.3 },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", rateMultiplier: 1.3 },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", rateMultiplier: 0.4 },
    { id: "deepseek-v3-2", name: "Deepseek v3.2", rateMultiplier: 0.25 },
    { id: "minimax-m2-5", name: "MiniMax M2.5", rateMultiplier: 0.25 },
  ],
  anthropic: [
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", rateMultiplier: 2.2 },
    { id: "claude-opus-4-7", name: "Claude Opus 4.7", rateMultiplier: 2.2 },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", rateMultiplier: 2.2 },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", rateMultiplier: 1.3 },
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", rateMultiplier: 1.3 },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", rateMultiplier: 1.3 },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", rateMultiplier: 0.4 },
    { id: "deepseek-v3-2", name: "Deepseek v3.2", rateMultiplier: 0.25 },
    { id: "minimax-m2-5", name: "MiniMax M2.5", rateMultiplier: 0.25 },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    { id: "o1", name: "o1" },
    { id: "o1-mini", name: "o1 Mini" },
    { id: "o3", name: "o3" },
    { id: "o3-mini", name: "o3 Mini" },
    { id: "o4-mini", name: "o4 Mini" },
  ],
  ollama: [
    { id: "llama3.1", name: "Llama 3.1" },
    { id: "llama3.2", name: "Llama 3.2" },
    { id: "codellama", name: "Code Llama" },
    { id: "mistral", name: "Mistral" },
    { id: "mixtral", name: "Mixtral" },
    { id: "deepseek-coder-v2", name: "DeepSeek Coder v2" },
    { id: "qwen2.5-coder", name: "Qwen 2.5 Coder" },
  ],
  onnx: [
    { id: "phi-3-mini", name: "Phi-3 Mini (3.8B)" },
    { id: "smollm2-360m", name: "SmolLM2 (360M)" },
  ],
  lmstudio: [
    { id: "local-model", name: "Local Model (auto-detect)" },
    { id: "qwen2.5-coder-32b", name: "Qwen 2.5 Coder 32B" },
    { id: "deepseek-coder-v2-lite", name: "DeepSeek Coder V2 Lite" },
    { id: "codellama-34b", name: "Code Llama 34B" },
    { id: "mistral-7b", name: "Mistral 7B" },
    { id: "llama-3.1-8b", name: "Llama 3.1 8B" },
    { id: "phi-3-medium", name: "Phi-3 Medium (14B)" },
  ],
  openrouter: [
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-opus-4", name: "Claude Opus 4" },
    { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "openai/o3", name: "o3" },
    { id: "openai/o4-mini", name: "o4 Mini" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    { id: "deepseek/deepseek-v3", name: "DeepSeek V3" },
    { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
    { id: "qwen/qwen3-235b", name: "Qwen3 235B" },
  ],
};

/** Get the static fallback model list for a provider (never undefined). */
export function getStaticModels(provider: string): ChatModelEntry[] {
  return AVAILABLE_MODELS[provider] ?? AVAILABLE_MODELS.anthropic;
}

/** Get the default model id for a provider. */
export function getDefaultModel(provider: string): string {
  return DEFAULT_MODELS[provider] ?? "";
}

/**
 * Fetch the model list from an Anthropic-compatible gateway (`{baseUrl}/v1/models`).
 * `baseUrl` is the configured gateway base URL (e.g. http://127.0.0.1:8990/anthropic).
 * Returns the parsed model entries, or null on any failure so the caller can
 * fall back to the static catalog.
 */
export async function fetchGatewayModels(baseUrl: string): Promise<ChatModelEntry[] | null> {
  if (!baseUrl) {
    return null;
  }
  const cleanBase = baseUrl.replace(/\/$/, "");
  // If base URL already ends with /v1, don't double it
  const modelsUrl = cleanBase.endsWith("/v1") 
    ? `${cleanBase}/models`
    : `${cleanBase}/v1/models`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    // Anthropic /v1/models envelope extended with Kiro fields: { data: [{ id, display_name, description, rate_multiplier }] }
    const json = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string; name?: string; description?: string; rate_multiplier?: number }>;
    };
    const data = Array.isArray(json?.data) ? json.data : [];
    const models: ChatModelEntry[] = data
      .filter((m) => typeof m?.id === "string" && m.id.length > 0)
      .map((m) => {
        const entry: ChatModelEntry = {
          id: m.id as string,
          name: m.display_name || m.name || (m.id as string),
        };
        // KSA-237: carry description + rate_multiplier for rich dropdown rendering
        if (typeof m.description === "string" && m.description.trim()) {
          entry.description = m.description.trim();
        }
        if (typeof m.rate_multiplier === "number") {
          entry.rateMultiplier = m.rate_multiplier;
        }
        return entry;
      });

    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}
