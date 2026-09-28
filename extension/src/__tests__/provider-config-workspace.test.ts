/**
 * SA4E-323 unit tests: ProviderConfigService per-workspace Pega persistence —
 * save/state isolation, blank-password preserve, updateConfig guard, clear.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as vscode from "vscode";
import { ProviderConfigService } from "../services/ProviderConfigService";
import { getWsHash, secretKey, LEGACY_SECRET } from "../services/WorkspaceScopeResolver";
import { setWorkspaceFolders, installConfigStub, installSecretStub } from "./workspace-test-helpers";

const WS = vscode.ConfigurationTarget.Workspace;

beforeEach(() => {
  setWorkspaceFolders(["/ws/a"]);
  installConfigStub();
});

describe("updatePegaConfig", () => {
  it("writes Workspace config + namespaced secret, never flat keys", async () => {
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await svc.updatePegaConfig("https://a/pega", "op.a", "pw-a");
    const h = getWsHash()!;
    expect(store.get(secretKey("pega", h)!)).toBe("pw-a");
    expect(store.get(LEGACY_SECRET.pega)).toBeUndefined();
    expect(cfg.updates).toContainEqual({ key: "pegaEndpoint", value: "https://a/pega", target: WS });
    expect(cfg.updates).toContainEqual({ key: "pegaUsername", value: "op.a", target: WS });
  });

  it("keeps stored password when the save password is blank", async () => {
    const { store, secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await svc.updatePegaConfig("https://a/pega", "op.a", "pw-a");
    const h = getWsHash()!;
    await svc.updatePegaConfig("https://a/pega2", "op.a2", "   ");
    expect(store.get(secretKey("pega", h)!)).toBe("pw-a");
  });

  it("rejects non-http(s) endpoints and persists nothing", async () => {
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await expect(svc.updatePegaConfig("ftp://x", "op", "pw"))
      .rejects.toThrow("Invalid Pega Endpoint URL (http/https required).");
    expect(cfg.updates).toHaveLength(0);
    expect(store.get(secretKey("pega", getWsHash()!)!)).toBeUndefined();
  });

  it("blocks saves with no workspace folder and writes nothing", async () => {
    setWorkspaceFolders(null);
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await expect(svc.updatePegaConfig("https://a/pega", "op", "pw"))
      .rejects.toThrow("No workspace folder open — Pega config requires a workspace to isolate credentials.");
    expect(cfg.updates).toHaveLength(0);
    expect(store.size).toBe(0);
  });
});

describe("getCurrentState isolation", () => {
  it("returns A values in A and empty in B", async () => {
    installConfigStub();
    const { secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await svc.updatePegaConfig("https://a/pega", "op.a", "pw-a");
    const stateA = await svc.getCurrentState();
    expect(stateA.pegaEndpoint).toBe("https://a/pega");
    expect(stateA.hasPegaPassword).toBe(true);

    // Workspace B: its own (empty) settings file, same keychain.
    setWorkspaceFolders(["/ws/b"]);
    installConfigStub();
    const stateB = await svc.getCurrentState();
    expect(stateB.pegaEndpoint).toBe("http://localhost:8080/prweb");
    expect(stateB.pegaUsername).toBe("");
    expect(stateB.hasPegaPassword).toBe(false);

    // Back in A: values intact.
    setWorkspaceFolders(["/ws/a"]);
    installConfigStub({ values: { pegaEndpoint: "https://a/pega", pegaUsername: "op.a" } });
    expect((await svc.getCurrentState()).hasPegaPassword).toBe(true);
  });

  it("falls back to legacy flat secrets with no folder open", async () => {
    installConfigStub({ globals: { pegaEndpoint: "https://legacy/pega", pegaUsername: "legacy-op" } });
    const { secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "legacy-pw" });
    const svc = new ProviderConfigService(secrets);
    setWorkspaceFolders(null);
    const state = await svc.getCurrentState();
    expect(state.pegaEndpoint).toBe("https://legacy/pega");
    expect(state.hasPegaPassword).toBe(true);
  });
});

describe("updateConfig guard", () => {
  it("rejects workspace-scoped keys with the SA4E-323 error", async () => {
    const { secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    for (const k of ["pegaEndpoint", "pegaUsername", "atlassianConnectionType"]) {
      await expect(svc.updateConfig(k, "x"))
        .rejects.toThrow(`Use workspace-scoped method for ${k} (SA4E-323).`);
    }
  });

  it("still allows LLM keys through Global", async () => {
    const cfg = installConfigStub();
    const { secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await svc.updateConfig("llmProvider", "openai");
    expect(cfg.updates).toContainEqual({
      key: "llmProvider", value: "openai", target: vscode.ConfigurationTarget.Global,
    });
  });
});

describe("clearPegaPassword", () => {
  it("deletes only the workspace secret and keeps the marker", async () => {
    const { store, secrets } = installSecretStub();
    const svc = new ProviderConfigService(secrets);
    await svc.updatePegaConfig("https://a/pega", "op.a", "pw-a");
    const h = getWsHash()!;
    await svc.clearPegaPassword();
    expect(store.get(secretKey("pega", h)!)).toBeUndefined();
    expect(store.get(`kiroSdlc.${h}.migrated`)).toBe("1");
    expect((await svc.getCurrentState()).hasPegaPassword).toBe(false);
  });
});
