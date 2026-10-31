/**
 * ProviderConfigService integration tests.
 * STC: IT-01..IT-10 — ProviderConfigService with SecretStorage mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProviderConfigService } from "../ProviderConfigService.ts";
import type { ProfileTableRow, ProfileOpResult } from "../shared/types/llm-profile.ts";
import * as vscode from "vscode";

const { mockConfigValues, mockConfigUpdate } = vi.hoisted(() => ({
  mockConfigValues: {} as Record<string, unknown>,
  mockConfigUpdate: vi.fn().mockImplementation(async (key: string, value: any) => {
    mockConfigValues[key] = value;
  }),
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

describe("ProviderConfigService Integration", () => {
  let service: ProviderConfigService;
  let mockSecrets: any;

  beforeEach(() => {
    mockSecrets = {
      store: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigValues["llm.profiles"] = [];
    mockConfigValues["llm.activeProfileId"] = undefined;
    mockConfigValues["llm.ollama.baseUrl"] = "http://localhost:11434";
    mockConfigValues["backend.allowInsecureRemote"] = false;
    mockConfigValues["mcp.serverPort"] = 9181;
    mockConfigValues["mcp.enabled"] = true;
    mockConfigValues["pega.endpoint"] = "http://localhost:8080/prweb";
    mockConfigValues["pega.username"] = "";
    mockConfigValues["jira.connectionType"] = "cloud";

    service = new ProviderConfigService(mockSecrets);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockConfigUpdate.mockClear();
    Object.keys(mockConfigValues).forEach(k => delete mockConfigValues[k]);
  });

  describe("Profile CRUD", () => {
    it("IT-01: adds a new profile", async () => {
      const result: ProfileOpResult = await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: false,
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-test123",
      });

      expect(result.success).toBe(true);
      expect(result.profiles).toHaveLength(1);
      expect(result.profiles![0].profileId).toBe("anthropic-default");
      expect(result.activeProfileId).toBe("anthropic-default");
      expect(mockConfigUpdate).toHaveBeenCalledWith("llm.profiles", expect.any(Array), expect.anything());
    });

    it("IT-02: rejects duplicate profile ID", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      const result = await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - another",
        provider: "openai",
        model: "gpt-4o",
        useDefaultUrl: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("IT-03: rejects invalid profile ID format", async () => {
      const result = await service.addProfile({
        id: "Invalid ID!",
        label: "Test",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("valid slug");
    });

    it("IT-04: edits an existing profile", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      const result = await service.editProfile("anthropic-default", {
        label: "Anthropic - updated",
        model: "claude-3-opus",
      });

      expect(result.success).toBe(true);
      expect(result.profiles![0].label).toBe("Anthropic - updated");
      expect(result.profiles![0].model).toBe("claude-3-opus");
    });

    it("IT-05: deletes a profile", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });
      await service.addProfile({
        id: "openai-default",
        label: "OpenAI - default",
        provider: "openai",
        model: "gpt-4o",
        useDefaultUrl: true,
      });

      const result = await service.deleteProfile("anthropic-default");
      expect(result.success).toBe(true);
      expect(result.profiles).toHaveLength(1);
      expect(result.profiles![0].profileId).toBe("openai-default");
    });

    it("IT-06: switches active profile on delete", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });
      await service.addProfile({
        id: "openai-default",
        label: "OpenAI - default",
        provider: "openai",
        model: "gpt-4o",
        useDefaultUrl: true,
      });
      await service.setActiveProfile("anthropic-default");

      const result = await service.deleteProfile("anthropic-default");
      expect(result.activeProfileId).toBe("openai-default");
    });

    it("IT-07: sets active profile", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });
      await service.addProfile({
        id: "openai-default",
        label: "OpenAI - default",
        provider: "openai",
        model: "gpt-4o",
        useDefaultUrl: true,
      });

      const result = await service.setActiveProfile("openai-default");
      expect(result.success).toBe(true);
      expect(result.activeProfileId).toBe("openai-default");
    });

    it("IT-08: updates profile test status", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      const result = await service.updateProfileTestStatus("anthropic-default", "connected");
      expect(result.success).toBe(true);
      expect(result.profiles![0].lastTestStatus).toBe("connected");
    });
  });

  describe("State Retrieval", () => {
    it("IT-09: returns current state with profiles", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: false,
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-test123",
      });

      const state = await service.getCurrentState();
      expect(state.provider).toBe("anthropic");
      expect(state.model).toBe("claude-3-sonnet");
      expect(state.baseUrl).toBe("https://api.anthropic.com");
      expect(state.profiles).toHaveLength(1);
      expect(state.activeProfileId).toBe("anthropic-default");
    });

    it("IT-10: returns profile rows", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      const rows = await service.getProfileRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].profileId).toBe("anthropic-default");
    });

    it("IT-11: returns active profile row", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });
      await service.setActiveProfile("anthropic-default");

      const active = await service.getActiveProfileRow();
      expect(active).toBeDefined();
      expect(active!.profileId).toBe("anthropic-default");
    });
  });

  describe("SecretStorage Integration", () => {
    it("IT-12: writes profile API key", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
        apiKey: "sk-ant-test123",
      });

      expect(mockSecrets.store).toHaveBeenCalledWith("sdlcAgents.anthropic-defaultApiKey", "sk-ant-test123");
    });

    it("IT-13: deletes profile API key on profile delete", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      await service.deleteProfile("anthropic-default");
      expect(mockSecrets.delete).toHaveBeenCalledWith("sdlcAgents.anthropic-defaultApiKey");
    });

    it("IT-14: reads profile API key", async () => {
      mockSecrets.get.mockResolvedValueOnce("sk-ant-test123");
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
        apiKey: "sk-ant-test123",
      });

      const key = await service.readProfileApiKey("anthropic-default");
      expect(key).toBe("sk-ant-test123");
    });
  });

  describe("Model Resolution", () => {
    it("IT-15: gets models for active profile", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });
      await service.setActiveProfile("anthropic-default");

      const result = await service.getModelsForActiveProfile();
      expect(result.provider).toBe("anthropic");
      expect(result.selected).toBe("claude-3-sonnet");
      expect(result.models.length).toBeGreaterThan(0);
    });

    it("IT-16: gets model picker groups for connected profiles", async () => {
      await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });
      await service.updateProfileTestStatus("anthropic-default", "connected");

      const groups = await service.getModelPickerGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].provider).toBe("anthropic");
      expect(groups[0].items.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("IT-17: handles SecretStorage failures gracefully", async () => {
      mockSecrets.store.mockRejectedValueOnce(new Error("SecretStorage unavailable"));

      const result = await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
        apiKey: "sk-ant-test123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("SecretStorage");
    });

    it("IT-18: handles config update failures", async () => {
      mockConfigUpdate.mockRejectedValueOnce(new Error("Config update failed"));

      const result = await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: true,
      });

      expect(result.success).toBe(false);
    });

    it("IT-19: validates base URL format", async () => {
      const result = await service.addProfile({
        id: "anthropic-default",
        label: "Anthropic - default",
        provider: "anthropic",
        model: "claude-3-sonnet",
        useDefaultUrl: false,
        baseUrl: "not-a-valid-url",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("valid URL");
    });

    it("IT-20: rejects unknown provider", async () => {
      const result = await service.addProfile({
        id: "unknown-provider",
        label: "Unknown",
        provider: "unknown" as any,
        model: "model",
        useDefaultUrl: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown provider");
    });
  });
});