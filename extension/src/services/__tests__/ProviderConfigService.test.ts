/**
 * SA4E-289 / PLAN-dynamic-editable-model-selector — TASK 1 + TASK 4 tests.
 * Proves ProviderConfigService.getModels() passes the provider's API key as a
 * Bearer token to fetchGatewayModels (fixes silent 401 → fallback to the static
 * catalog when the gateway requires auth on /v1/models).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as vscode from "vscode";
import { ProviderConfigService } from "../ProviderConfigService";
import { fetchGatewayModels, getStaticModels } from "../../chat-panel/chat-models";

const { mockVars } = vi.hoisted(() => ({
  mockVars: {
    config: {} as Record<string, unknown>,
    secrets: {} as Record<string, string>,
  },
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (k: string, d: unknown) => (k in mockVars.config ? mockVars.config[k] : d),
      update: vi.fn().mockResolvedValue(undefined),
    })),
  },
  window: { createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }) },
}));

vi.mock("../../chat-panel/chat-models", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchGatewayModels: vi.fn(),
  };
});

describe("ProviderConfigService.getModels — gateway fetch includes Authorization (SA4E-289)", () => {
  let service: ProviderConfigService;
  const secrets: vscode.SecretStorage = {
    get: async (key: string) => mockVars.secrets[key],
    store: async () => {},
    delete: async () => {},
    onDidChange: vi.fn(),
  } as unknown as vscode.SecretStorage;

  beforeEach(() => {
    mockVars.config = {};
    mockVars.secrets = {};
    vi.clearAllMocks();
    service = new ProviderConfigService(secrets);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes 'Bearer <key>' when the provider has a saved API key and a custom baseUrl", async () => {
    mockVars.config.openaiBaseUrl = "http://localhost:20128/v1";
    mockVars.secrets["kiroSdlc.openaiApiKey"] = "sk-test-123";

    const gatewayModels = [{ id: "free-tier-models", name: "Free Tier Models" }];
    vi.mocked(fetchGatewayModels).mockResolvedValue(gatewayModels);

    const result = await service.getModels("openai", "");

    // fetchGatewayModels must receive the auth header (fixes the 401 → static fallback)
    expect(fetchGatewayModels).toHaveBeenCalledWith(
      "http://localhost:20128/v1",
      "Bearer sk-test-123"
    );
    // And the dynamic gateway list is used instead of the static catalog
    expect(result.models).toEqual(gatewayModels);
  });

  it("still fetches WITHOUT a header when no key is saved (compat: local/no-auth providers)", async () => {
    mockVars.config.openaiBaseUrl = "http://localhost:20128/v1";
    // no key in secrets

    const gatewayModels = [{ id: "free-tier-models", name: "Free Tier Models" }];
    vi.mocked(fetchGatewayModels).mockResolvedValue(gatewayModels);

    await service.getModels("openai", "");

    expect(fetchGatewayModels).toHaveBeenCalledWith("http://localhost:20128/v1", undefined);
  });

  it("falls back to the static catalog when the gateway returns null/empty (unchanged behavior)", async () => {
    mockVars.config.openaiBaseUrl = "http://localhost:20128/v1";
    mockVars.secrets["kiroSdlc.openaiApiKey"] = "sk-test-123";

    vi.mocked(fetchGatewayModels).mockResolvedValue(null);

    const result = await service.getModels("openai", "");

    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models[0].id).toBeDefined();
    // static catalog is the fallback list
    expect(getStaticModels("openai").length).toBeGreaterThan(0);
  });

  it("does NOT hit the gateway when there is no baseUrl (official API path unchanged)", async () => {
    mockVars.config.openaiBaseUrl = "";
    mockVars.secrets["kiroSdlc.openaiApiKey"] = "sk-test-123";

    await service.getModels("openai", "");

    expect(fetchGatewayModels).not.toHaveBeenCalled();
  });
});