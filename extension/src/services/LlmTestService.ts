/**
 * LlmTestService — handles LLM connection testing logic.
 * Extracted from SettingsPanel for SRP.
 */

import * as vscode from "vscode";
import { createProviderByType } from "../mcp/providers";
import type { LlmProvider } from "../mcp/llm-provider";
import { PROVIDER_BASE_URL_KEYS, PROVIDER_BASE_URL_DEFAULTS, PROVIDER_BASE_URL_LEGACY_KEYS } from "../models";
import { getSetting } from "../config/settings-migration";

const TEST_TIMEOUT_MS = 10000;
const AUTO_TEST_TIMEOUT_MS = 8000;

/**
 * End-to-end LLM probe: send a real minimal completion and require a response.
 *
 * The UI promises Connection Test "verifies your LLM configuration works
 * end-to-end", so a reachable-but-unusable endpoint (server down, wrong/missing
 * API key → 401/403, model not loaded) MUST fail. `provider.isAvailable()` only
 * pings a health endpoint and treats 401/403 as "available" — that is NOT a real
 * check. `provider.chat()` instead exercises the full path (auth + model +
 * completion) and throws on any failure, which is exactly what we want here.
 *
 * @returns null on success (model answered); an actionable error string otherwise.
 */
async function probeLlmEndToEnd(provider: LlmProvider, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const reply = await provider.chat(
      [{ role: "user", content: "ping" }],
      { maxTokens: 1, temperature: 0, signal: controller.signal }
    );
    // A successful HTTP 200 with an empty/garbage body is still a failure:
    // a working model returns a string (may be empty on max_tokens=1, so we
    // only require the call to resolve without throwing).
    if (typeof reply !== "string") {
      return "LLM returned an unexpected response. Check the model name and server.";
    }
    return null;
  } catch (err) {
    return describeLlmError(err as Error);
  } finally {
    clearTimeout(timer);
  }
}

/** Map a raw chat() failure to an actionable, user-facing message. */
function describeLlmError(err: Error): string {
  const raw = err?.message || String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("abort") || lower.includes("timed out") || lower.includes("timeout")) {
    return "Connection timed out — the LLM server did not respond. Is it running at the configured Base URL?";
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "Reachable but authentication failed (401/403). Check the API key for this provider.";
  }
  if (lower.includes("404")) {
    return "Endpoint reached but returned 404 — check the Base URL path and the model name.";
  }
  if (lower.includes("econnrefused") || lower.includes("fetch failed") || lower.includes("network") || lower.includes("enotfound")) {
    return "Cannot reach the LLM server. Verify it is running and the Base URL is correct.";
  }
  return `LLM test failed: ${raw}`;
}

export class LlmTestService {
  // SA4E-390: globalState lets the standalone "Test LLM" button resolve the
  // active profile from the Memento store (profiles no longer live in config).
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState?: vscode.Memento
  ) {}

  /**
   * Test LLM connection with given provider/baseUrl overrides.
   * Returns result and fires appropriate VS Code commands.
   */
  async testLlm(
    providerOverride?: string,
    baseUrlOverride?: string,
    modelOverride?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    // SA4E-390: with the multi-provider table, the standalone "Test LLM" button
    // sends no override — resolve provider/model/baseUrl from the ACTIVE profile
    // first, then fall back to the flat llm.* settings (legacy single-provider).
    const active = this.getActiveProfile();
    const providerType = providerOverride
      || active?.provider
      || getSetting<string>("llm.provider","llm.provider", "anthropic");
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl","llm.ollama.baseUrl", "http://localhost:11434");
    // The end-to-end probe sends a real completion, so it MUST use the model
    // the user configured (e.g. "qwen-text"). Prefer the typed override, then the
    // active profile's model, then the flat setting. Without this the provider
    // falls back to its hard-coded default ("gpt-4o"), which a local
    // llama-server / LM Studio rejects with 400 "No models loaded".
    const configuredModel = (modelOverride && modelOverride.trim())
      || active?.model
      || getSetting<string>("llm.model", "llm.model", "")
      || undefined;
    // Active profile's custom base URL (only when it does not use the default).
    const activeBaseUrl = active && !active.useDefaultUrl ? active.baseUrl : undefined;

    const anthropicBaseUrl = providerType === "anthropic"
      ? (baseUrlOverride || activeBaseUrl || getSetting<string>("llm.anthropic.baseUrl","llm.anthropic.baseUrl", ""))
      : "";
    const openaiBaseUrl = providerType !== "anthropic"
      ? (baseUrlOverride || activeBaseUrl || getSetting<string>("llm.openai.baseUrl","llm.openai.baseUrl", ""))
      : "";

    try {
      const provider = createProviderByType(
        providerType as any, this.secrets, configuredModel,
        ollamaUrl, anthropicBaseUrl, openaiBaseUrl
      );
      const error = await probeLlmEndToEnd(provider, TEST_TIMEOUT_MS);
      provider.dispose();

      if (!error) {
        vscode.commands.executeCommand("sdlcAgents.notifyLlmConnected");
        return { success: true, message: `Connected to ${providerType} successfully.` };
      }
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error };
    } catch (err: any) {
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error: describeLlmError(err as Error) };
    }
  }

  /**
   * SA4E-390: read the active LLM profile (provider/model/baseUrl) from config.
   * Returns undefined when no profile is active (legacy flat-config mode).
   */
  private getActiveProfile(): { provider: string; model: string; baseUrl?: string; useDefaultUrl: boolean } | undefined {
    try {
      // SA4E-390: profiles live in globalState; fall back to config for older state.
      const activeId = this.globalState
        ? this.globalState.get<string>("sdlcAgents.llm.activeProfileId")
        : vscode.workspace.getConfiguration("sdlcAgents").get<string>("llm.activeProfileId");
      if (!activeId) { return undefined; }
      const profiles = this.globalState
        ? this.globalState.get<any[]>("sdlcAgents.llm.profiles", [])
        : vscode.workspace.getConfiguration("sdlcAgents").get<any[]>("llm.profiles", []);
      const p = (profiles || []).find((x) => x && x.id === activeId);
      if (!p) { return undefined; }
      return { provider: p.provider, model: p.model, baseUrl: p.baseUrl, useDefaultUrl: p.useDefaultUrl !== false };
    } catch {
      return undefined;
    }
  }

  /**
   * Auto-test a provider and notify chat panel badge.
   */
  async autoTestAndNotify(provider: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl","llm.ollama.baseUrl", "http://localhost:11434");
    // Use the configured model for the real completion (see testLlm note).
    const configuredModel = getSetting<string>("llm.model", "llm.model", "") || undefined;

    const baseUrlKey = PROVIDER_BASE_URL_KEYS[provider];
    const defaultUrl = PROVIDER_BASE_URL_DEFAULTS[provider] || "";
    const baseUrl = baseUrlKey
      ? (getSetting<string>(baseUrlKey, PROVIDER_BASE_URL_LEGACY_KEYS[provider], "") || defaultUrl)
      : "";

    const anthropicBaseUrl = provider === "anthropic" ? baseUrl : "";
    const openaiBaseUrl = provider !== "anthropic" ? baseUrl : "";

    try {
      const testProvider = createProviderByType(
        provider as any, this.secrets, configuredModel,
        ollamaUrl, anthropicBaseUrl, openaiBaseUrl
      );
      const error = await probeLlmEndToEnd(testProvider, AUTO_TEST_TIMEOUT_MS);
      testProvider.dispose();

      if (!error) {
        vscode.commands.executeCommand("sdlcAgents.notifyLlmConnected");
        return { success: true, message: `Connected to ${provider} successfully.` };
      }
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error };
    } catch (err) {
      vscode.commands.executeCommand("sdlcAgents.notifyLlmDisconnected");
      return { success: false, error: describeLlmError(err as Error) };
    }
  }

  /** Test a specific provider profile config. */
  async testProfile(profileId: string, config: any): Promise<{ success: boolean; message?: string; error?: string; status?: string; testedAt?: string }> {
    const ollamaUrl = getSetting<string>("llm.ollama.baseUrl","llm.ollama.baseUrl", "http://localhost:11434");
    const provider = config.provider;
    
    try {
      const providerInstance = createProviderByType(
        provider as any, this.secrets, config.model || undefined,
        ollamaUrl, 
        provider === "anthropic" ? (config.baseUrl || "") : "",
        provider !== "anthropic" ? (config.baseUrl || "") : ""
      );
      const error = await probeLlmEndToEnd(providerInstance, TEST_TIMEOUT_MS);
      providerInstance.dispose();

      const testedAt = new Date().toISOString();
      const modelNote = config.model ? ` (model: ${config.model})` : "";
      if (!error) {
        return { success: true, message: `Connected to ${provider} successfully${modelNote}.`, status: "connected", testedAt };
      }
      // Surface which model was sent so "No models loaded" is actionable — the
      // user can see whether the model id they typed matches the server.
      return { success: false, error: `${error}${modelNote}`, status: "failed", testedAt };
    } catch (err: any) {
      const testedAt = new Date().toISOString();
      return { success: false, error: describeLlmError(err as Error), status: "failed", testedAt };
    }
  }
}