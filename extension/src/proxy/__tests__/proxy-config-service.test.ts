/**
 * Unit tests for ProxyConfigService — config CRUD, credential handling, state building.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProxyConfigService } from "../ProxyConfigService";
import type { ProxyConfig } from "../../models/ProxyModels";

vi.mock("vscode", () => ({
  workspace: { getConfiguration: vi.fn() },
  ConfigurationTarget: { Global: 1 },
}));

import * as vscode from "vscode";

interface ConfigHandle {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeSecrets(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    secrets: {
      get: vi.fn(async (key: string) => store.get(key) ?? undefined),
      store: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
      delete: vi.fn(async (key: string) => { store.delete(key); }),
    },
  };
}

describe("ProxyConfigService", () => {
  let cfg: ConfigHandle;
  let secrets: ReturnType<typeof makeSecrets>["secrets"];

  beforeEach(() => {
    cfg = {
      get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
      update: vi.fn(async () => {}),
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(cfg as never);
    secrets = makeSecrets().secrets;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getConfig returns defaults when no settings are set", () => {
    const service = new ProxyConfigService(secrets);
    const config = service.getConfig();
    expect(config).toEqual({
      mode: "system",
      host: "",
      port: 8080,
      bypass: "localhost,127.0.0.1,::1",
    });
  });

  it("getConfig reads values from VS Code settings", () => {
    cfg.get.mockImplementation((key: string, _default: unknown) => {
      const values: Record<string, string | number> = {
        "proxy.mode": "manual",
        "proxy.host": "proxy.corp",
        "proxy.port": 3128,
        "proxy.bypass": "*.internal",
      };
      return values[key] ?? null;
    });
    const service = new ProxyConfigService(secrets);
    const config = service.getConfig();
    expect(config).toEqual({
      mode: "manual",
      host: "proxy.corp",
      port: 3128,
      bypass: "*.internal",
    });
  });

  it("getCredentials returns null when secrets are missing", async () => {
    const service = new ProxyConfigService(secrets);
    await expect(service.getCredentials()).resolves.toBeNull();
  });

  it("getCredentials returns stored credentials", async () => {
    secrets = makeSecrets({
      "sdlcAgents.proxy.username": "user1",
      "sdlcAgents.proxy.password": "pass1",
    }).secrets;
    const service = new ProxyConfigService(secrets);
    await expect(service.getCredentials()).resolves.toEqual({
      username: "user1",
      password: "pass1",
    });
  });

  it("getCredentials migrates legacy kiroSdlc.proxy.* keys on read", async () => {
    const made = makeSecrets({
      "kiroSdlc.proxy.username": "legacy-user",
      "kiroSdlc.proxy.password": "legacy-pass",
    });
    secrets = made.secrets;
    const service = new ProxyConfigService(secrets);
    await expect(service.getCredentials()).resolves.toEqual({
      username: "legacy-user",
      password: "legacy-pass",
    });
    // migrate-on-read copied the values forward to the new keys
    expect(made.store.get("sdlcAgents.proxy.username")).toBe("legacy-user");
    expect(made.store.get("sdlcAgents.proxy.password")).toBe("legacy-pass");
  });

  it("getState never leaks the password", async () => {
    secrets = makeSecrets({
      "sdlcAgents.proxy.username": "user1",
      "sdlcAgents.proxy.password": "secret-pass",
    }).secrets;
    const service = new ProxyConfigService(secrets);
    const state = await service.getState("http://detected:1", "localhost");
    expect(state.hasCredentials).toBe(true);
    expect(state.username).toBe("user1");
    expect(state).not.toHaveProperty("password");
    expect(JSON.stringify(state)).not.toContain("secret-pass");
    expect(state.detectedProxyUrl).toBe("http://detected:1");
    expect(state.detectedBypass).toBe("localhost");
  });

  it("getState reports hasCredentials false when no credentials", async () => {
    const service = new ProxyConfigService(secrets);
    const state = await service.getState(null, null);
    expect(state.hasCredentials).toBe(false);
    expect(state.username).toBe("");
    expect(state.detectedProxyUrl).toBeNull();
    expect(state.detectedBypass).toBeNull();
  });

  it("setMode updates the proxy.mode setting at Workspace scope", async () => {
    const service = new ProxyConfigService(secrets);
    await service.setMode("none");
    expect(cfg.update).toHaveBeenCalledWith("proxy.mode", "none", vscode.ConfigurationTarget.Workspace);
  });

  it("saveProxy updates host, port, and bypass at Workspace scope", async () => {
    const service = new ProxyConfigService(secrets);
    await service.saveProxy("proxy.corp", 3128, "*.internal,localhost");
    expect(cfg.update).toHaveBeenCalledWith("proxy.host", "proxy.corp", vscode.ConfigurationTarget.Workspace);
    expect(cfg.update).toHaveBeenCalledWith("proxy.port", 3128, vscode.ConfigurationTarget.Workspace);
    expect(cfg.update).toHaveBeenCalledWith("proxy.bypass", "*.internal,localhost", vscode.ConfigurationTarget.Workspace);
  });

  it("saveCredentials stores username and password in SecretStorage", async () => {
    const service = new ProxyConfigService(secrets);
    await service.saveCredentials("user1", "pass1");
    expect(secrets.store).toHaveBeenCalledWith("sdlcAgents.proxy.username", "user1");
    expect(secrets.store).toHaveBeenCalledWith("sdlcAgents.proxy.password", "pass1");
  });

  it("clearCredentials removes both secrets", async () => {
    const service = new ProxyConfigService(secrets);
    await service.clearCredentials();
    expect(secrets.delete).toHaveBeenCalledWith("sdlcAgents.proxy.username");
    expect(secrets.delete).toHaveBeenCalledWith("sdlcAgents.proxy.password");
    // Legacy keys are also cleared so a stale pre-rename value cannot resurrect.
    expect(secrets.delete).toHaveBeenCalledWith("kiroSdlc.proxy.username");
    expect(secrets.delete).toHaveBeenCalledWith("kiroSdlc.proxy.password");
  });
});