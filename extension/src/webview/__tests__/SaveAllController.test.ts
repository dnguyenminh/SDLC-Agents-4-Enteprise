/**
 * SaveAllController unit tests.
 * STC: UT-36..UT-40 — SaveAllController persistence logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SaveAllController } from "../save-all-controller.ts";
import type { ProviderConfig, SaveAllResult } from "../save-all-controller.ts";
import * as vscode from "vscode";

const { mockConfigValues, mockConfigUpdate } = vi.hoisted(() => ({
  mockConfigValues: {} as Record<string, unknown>,
  mockConfigUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: unknown) => (k in mockConfigValues ? mockConfigValues[k] : d),
      update: mockConfigUpdate,
      inspect: vi.fn(),
    })),
  },
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }) },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

describe("SaveAllController", () => {
  let controller: SaveAllController;
  let mockSecrets: any;

  beforeEach(() => {
    mockSecrets = {
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigValues["llm.profiles"] = [];
    mockConfigValues["llm.activeProfileId"] = undefined;
    mockConfigValues["llm.anthropic.baseUrl"] = "";
    mockConfigValues["llm.openai.baseUrl"] = "";
    mockConfigValues["llm.ollama.baseUrl"] = "";
    mockConfigValues["llm.openrouter.baseUrl"] = "";
    mockConfigValues["llm.lmstudio.baseUrl"] = "";

    mockConfigUpdate.mockClear();

    controller = new SaveAllController(mockSecrets);
  });

  afterEach(() => {
    vi.clearAllMocks();
    Object.keys(mockConfigValues).forEach(k => delete mockConfigValues[k]);
  });

  const mockProviders: ProviderConfig[] = [
    { providerId: "anthropic", name: "Anthropic - default", model: "claude-3-sonnet", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant-test123" },
    { providerId: "openai", name: "OpenAI - default", model: "gpt-4o", baseUrl: "https://api.openai.com", apiKey: "sk-test456" },
    { providerId: "ollama", name: "Ollama - default", model: "llama3", baseUrl: "http://localhost:11434", apiKey: undefined },
  ];

  it("UT-55: saves all provider configurations", async () => {
    const result: SaveAllResult = await controller.saveAll(mockProviders);
    expect(result.success).toBe(true);
    expect(result.message).toContain("3 provider configuration(s)");
    expect(mockConfigUpdate).toHaveBeenCalledTimes(4); // profiles + activeProfileId + 2 baseUrls (anthropic, openai)
  });

  it("UT-56: persists profiles to workspace config", async () => {
    await controller.saveAll(mockProviders);
    const profilesCall = mockConfigUpdate.mock.calls.find((call: any) => call[0] === "llm.profiles");
    expect(profilesCall).toBeDefined();
    const profiles = profilesCall[1];
    expect(profiles).toHaveLength(3);
    expect(profiles[0]).toMatchObject({
      id: "anthropic",
      label: "Anthropic - default",
      provider: "anthropic",
      model: "claude-3-sonnet",
    });
  });

  it("UT-57: sets active profile to first provider", async () => {
    await controller.saveAll(mockProviders);
    const activeCall = mockConfigUpdate.mock.calls.find((call: any) => call[0] === "llm.activeProfileId");
    expect(activeCall).toBeDefined();
    expect(activeCall[1]).toBe("anthropic");
  });

  it("UT-58: persists base URLs to dotted keys", async () => {
    await controller.saveAll(mockProviders);
    const anthropicUrlCall = mockConfigUpdate.mock.calls.find((call: any) => call[0] === "llm.anthropic.baseUrl");
    const openaiUrlCall = mockConfigUpdate.mock.calls.find((call: any) => call[0] === "llm.openai.baseUrl");
    expect(anthropicUrlCall).toBeDefined();
    expect(anthropicUrlCall[1]).toBe("https://api.anthropic.com");
    expect(openaiUrlCall).toBeDefined();
    expect(openaiUrlCall[1]).toBe("https://api.openai.com");
  });

  it("UT-59: stores API keys using llmSecretKey", async () => {
    await controller.saveAll(mockProviders);
    expect(mockSecrets.store).toHaveBeenCalledTimes(2); // Only for providers with API keys
    expect(mockSecrets.store).toHaveBeenCalledWith("sdlcAgents.anthropic-claude-3-sonnetApiKey", "sk-ant-test123");
    expect(mockSecrets.store).toHaveBeenCalledWith("sdlcAgents.openai-gpt-4oApiKey", "sk-test456");
  });

  it("UT-60: skips API key storage for providers without keys", async () => {
    await controller.saveAll(mockProviders);
    // Ollama has no API key, so only 2 store calls
    const storeCalls = mockSecrets.store.mock.calls;
    const keys = storeCalls.map((call: any) => call[0]);
    expect(keys).not.toContain("sdlcAgents.ollama-llama3ApiKey");
  });

  it("UT-61: handles empty providers array", async () => {
    const result = await controller.saveAll([]);
    expect(result.success).toBe(true);
    expect(result.message).toContain("0 provider configuration(s)");
  });

  it("UT-62: handles save failure gracefully", async () => {
    mockConfigUpdate.mockRejectedValueOnce(new Error("Config update failed"));
    const result = await controller.saveAll(mockProviders);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Config update failed");
  });

  it("UT-63: saves single provider key", async () => {
    const result = await controller.saveProviderKey("anthropic", "claude-3-sonnet", "sk-ant-newkey");
    expect(result.success).toBe(true);
    expect(mockSecrets.store).toHaveBeenCalledWith("sdlcAgents.anthropic-claude-3-sonnetApiKey", "sk-ant-newkey");
  });

  it("UT-64: handles single key save failure", async () => {
    mockSecrets.store.mockRejectedValueOnce(new Error("SecretStorage failed"));
    const result = await controller.saveProviderKey("anthropic", "claude-3-sonnet", "sk-ant-newkey");
    expect(result.success).toBe(false);
    expect(result.error).toBe("SecretStorage failed");
  });

  it("UT-65: deletes provider key and legacy key", async () => {
    await controller.deleteProviderKey("anthropic", "claude-3-sonnet");
    expect(mockSecrets.delete).toHaveBeenCalledWith("sdlcAgents.anthropic-claude-3-sonnetApiKey");
    expect(mockSecrets.delete).toHaveBeenCalledWith("kiroSdlc.anthropic-claude-3-sonnetApiKey");
  });
});