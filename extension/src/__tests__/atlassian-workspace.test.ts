/**
 * SA4E-323 unit tests: AtlassianCredentialService per-workspace isolation —
 * namespaced triple, empty-string reject, type default/coerce, IPC shape, clear.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as vscode from "vscode";
import { AtlassianCredentialService } from "../services/AtlassianCredentialService";
import { getWsHash, secretKey, LEGACY_SECRET } from "../services/WorkspaceScopeResolver";
import { setWorkspaceFolders, installConfigStub, installSecretStub } from "./workspace-test-helpers";

const WS = vscode.ConfigurationTarget.Workspace;
const TRIPLE = {
  baseUrl: "https://a.atlassian.net",
  email: "a@corp.local",
  apiToken: "token-a",
  connectionType: "cloud" as const,
};

beforeEach(() => {
  setWorkspaceFolders(["/ws/a"]);
  installConfigStub();
});

describe("saveConfig", () => {
  it("stores the namespaced triple + Workspace type, never flat keys", async () => {
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await svc.saveConfig(TRIPLE);
    const h = getWsHash()!;
    expect(store.get(secretKey("atlassianBaseUrl", h)!)).toBe(TRIPLE.baseUrl);
    expect(store.get(secretKey("atlassianEmail", h)!)).toBe(TRIPLE.email);
    expect(store.get(secretKey("atlassianToken", h)!)).toBe(TRIPLE.apiToken);
    expect(store.get(LEGACY_SECRET.atlassianBaseUrl)).toBeUndefined();
    expect(store.get(LEGACY_SECRET.atlassianEmail)).toBeUndefined();
    expect(store.get(LEGACY_SECRET.atlassianToken)).toBeUndefined();
    expect(cfg.updates).toContainEqual({ key: "atlassianConnectionType", value: "cloud", target: WS });
  });

  it("rejects empty email/token and persists nothing", async () => {
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await expect(svc.saveConfig({ ...TRIPLE, email: "  " }))
      .rejects.toThrow("Atlassian email/API token must not be empty.");
    await expect(svc.saveConfig({ ...TRIPLE, apiToken: "" }))
      .rejects.toThrow("Atlassian email/API token must not be empty.");
    const h = getWsHash()!;
    expect(store.get(secretKey("atlassianBaseUrl", h)!)).toBeUndefined();
    expect(store.get(secretKey("atlassianEmail", h)!)).toBeUndefined();
    expect(store.get(secretKey("atlassianToken", h)!)).toBeUndefined();
    expect(cfg.updates).toHaveLength(0);
  });

  it("rejects invalid base URLs verbatim and persists nothing", async () => {
    const { secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await expect(svc.saveConfig({ ...TRIPLE, baseUrl: "ftp://x" }))
      .rejects.toThrow("Invalid Jira Base URL format.");
    await expect(svc.saveConfig({ ...TRIPLE, baseUrl: "not-a-url" }))
      .rejects.toThrow("Invalid Jira Base URL format.");
  });

  it("blocks saves with no workspace folder and writes nothing", async () => {
    setWorkspaceFolders(null);
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await expect(svc.saveConfig(TRIPLE))
      .rejects.toThrow("No workspace folder open — open a folder to configure per-workspace Atlassian credentials.");
    expect(cfg.updates).toHaveLength(0);
    expect(store.size).toBe(0);
  });
});

describe("getConfig isolation", () => {
  it("returns A triple in A and null in B", async () => {
    installConfigStub();
    const { secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await svc.saveConfig({ ...TRIPLE, connectionType: "server" });
    expect((await svc.getConfig())?.email).toBe("a@corp.local");

    setWorkspaceFolders(["/ws/b"]);
    installConfigStub();
    expect(await svc.getConfig()).toBeNull();

    setWorkspaceFolders(["/ws/a"]);
    installConfigStub({ values: { atlassianConnectionType: "server" } });
    const back = await svc.getConfig();
    expect(back?.baseUrl).toBe(TRIPLE.baseUrl);
    expect(back?.connectionType).toBe("server");
  });

  it("reads the legacy flat triple with no folder open", async () => {
    installConfigStub();
    const { secrets } = installSecretStub({
      [LEGACY_SECRET.atlassianBaseUrl]: TRIPLE.baseUrl,
      [LEGACY_SECRET.atlassianEmail]: TRIPLE.email,
      [LEGACY_SECRET.atlassianToken]: TRIPLE.apiToken,
    });
    const svc = new AtlassianCredentialService(secrets);
    setWorkspaceFolders(null);
    expect((await svc.getConfig())?.email).toBe(TRIPLE.email);
  });
});

describe("connection type", () => {
  it("defaults to cloud and coerces corrupt values", async () => {
    installConfigStub();
    const { secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await svc.saveConfig(TRIPLE);
    expect((await svc.getConfig())?.connectionType).toBe("cloud");

    installConfigStub({ values: { atlassianConnectionType: "bogus" } });
    const h = getWsHash()!;
    const { secrets: s2 } = installSecretStub({
      [secretKey("atlassianBaseUrl", h)!]: TRIPLE.baseUrl,
      [secretKey("atlassianEmail", h)!]: TRIPLE.email,
      [secretKey("atlassianToken", h)!]: TRIPLE.apiToken,
    });
    const svc2 = new AtlassianCredentialService(s2);
    expect((await svc2.getConfig())?.connectionType).toBe("cloud");
  });
});

describe("testConnection + IPC", () => {
  it("reports not-configured without network when the triple is incomplete", async () => {
    installConfigStub();
    const { secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    expect(await svc.testConnection()).toEqual({ success: false, message: "No credentials configured." });
    await expect(svc.handleCredentialRequest("r1"))
      .rejects.toThrow("Atlassian credentials not configured in extension.");
  });

  it("returns the workspace triple in the frozen IPC shape", async () => {
    installConfigStub();
    const { secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await svc.saveConfig(TRIPLE);
    const res = await svc.handleCredentialRequest("req-7");
    expect(res.type).toBe("credentials");
    expect(res.requestId).toBe("req-7");
    expect(res.credentials).toEqual({ email: TRIPLE.email, apiToken: TRIPLE.apiToken, baseUrl: TRIPLE.baseUrl });
  });
});

describe("clearConfig", () => {
  it("deletes the workspace triple, unsets the type, keeps the marker", async () => {
    const cfg = installConfigStub();
    const { store, secrets } = installSecretStub();
    const svc = new AtlassianCredentialService(secrets);
    await svc.saveConfig(TRIPLE);
    const h = getWsHash()!;
    await svc.clearConfig();
    expect(store.get(secretKey("atlassianToken", h)!)).toBeUndefined();
    expect(store.get(`kiroSdlc.${h}.migrated`)).toBe("1");
    expect(cfg.updates).toContainEqual({ key: "atlassianConnectionType", value: undefined, target: WS });
    expect(await svc.getConfig()).toBeNull();
  });
});
