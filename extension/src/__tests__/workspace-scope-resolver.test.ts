/**
 * SA4E-323 unit tests: WorkspaceScopeResolver — normalization, wsHash
 * determinism, secret-key derivation, and ensureMigrated semantics.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as vscode from "vscode";
import { createHash } from "crypto";
import {
  getWorkspaceFolder, normalizePath, getWsHash, secretKey,
  migrationMarkerKey, ensureMigrated, LEGACY_SECRET,
} from "../services/WorkspaceScopeResolver";
import { setWorkspaceFolders, installConfigStub, installSecretStub } from "./workspace-test-helpers";

function hashOf(normalized: string): string {
  return createHash("sha256").update("ws:" + normalized).digest("hex").slice(0, 12);
}

beforeEach(() => {
  setWorkspaceFolders(["/ws/a"]);
  installConfigStub();
});

describe("normalizePath", () => {
  it("unifies backslashes to forward slashes", () => {
    expect(normalizePath("C:\\Work\\App")).toBe("c:/Work/App");
  });

  it("strips trailing slashes but keeps root", () => {
    expect(normalizePath("/ws/a/")).toBe("/ws/a");
    expect(normalizePath("/")).toBe("/");
  });

  it("lowercases Windows drive letters only", () => {
    expect(normalizePath("D:/Proj")).toBe("d:/Proj");
    expect(normalizePath("/WS/Mixed")).toBe("/WS/Mixed");
  });
});

describe("workspace scope", () => {
  it("uses workspaceFolders[0] as canonical folder", () => {
    setWorkspaceFolders(["/ws/a", "/ws/b"]);
    expect(getWorkspaceFolder()).toBe("/ws/a");
  });

  it("returns null when no folder is open", () => {
    setWorkspaceFolders(null);
    expect(getWorkspaceFolder()).toBeNull();
    expect(getWsHash()).toBeNull();
    expect(secretKey("pega")).toBeNull();
  });

  it("derives a stable 12-hex wsHash", () => {
    const h1 = getWsHash();
    const h2 = getWsHash();
    expect(h1).toMatch(/^[0-9a-f]{12}$/);
    expect(h1).toBe(h2);
    expect(h1).toBe(hashOf("/ws/a"));
  });

  it("maps normalized variants of the same folder to one hash", () => {
    setWorkspaceFolders(["C:\\Work\\App\\"]);
    const backslash = getWsHash();
    setWorkspaceFolders(["c:/Work/App"]);
    expect(getWsHash()).toBe(backslash);
  });

  it("maps different folders to different hashes", () => {
    const hashA = getWsHash();
    setWorkspaceFolders(["/ws/b"]);
    expect(getWsHash()).not.toBe(hashA);
  });
});

describe("secretKey", () => {
  it("builds namespaced keys for all bases", () => {
    const h = getWsHash()!;
    expect(secretKey("pega", h)).toBe(`kiroSdlc.${h}.pegaPassword`);
    expect(secretKey("atlassianBaseUrl", h)).toBe(`kiroSdlc.${h}.atlassian.baseUrl`);
    expect(secretKey("atlassianEmail", h)).toBe(`kiroSdlc.${h}.atlassian.email`);
    expect(secretKey("atlassianToken", h)).toBe(`kiroSdlc.${h}.atlassian.apiToken`);
    expect(migrationMarkerKey(h)).toBe(`kiroSdlc.${h}.migrated`);
  });

  it("defaults to the current workspace hash", () => {
    expect(secretKey("pega")).toBe(secretKey("pega", getWsHash()));
  });
});

describe("ensureMigrated", () => {
  it("copies legacy globals into workspace scope and marks", async () => {
    const cfg = installConfigStub({ globals: { pegaEndpoint: "https://a/pega", pegaUsername: "op.a" } });
    const { store, secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "pw-a" });
    await ensureMigrated(secrets);
    const h = getWsHash()!;
    expect(store.get(`kiroSdlc.${h}.pegaPassword`)).toBe("pw-a");
    expect(store.get(`kiroSdlc.${h}.migrated`)).toBe("1");
    expect(store.get(LEGACY_SECRET.pega)).toBe("pw-a");
    const ws = vscode.ConfigurationTarget.Workspace;
    expect(cfg.updates).toContainEqual({ key: "pegaEndpoint", value: "https://a/pega", target: ws });
    expect(cfg.updates).toContainEqual({ key: "pegaUsername", value: "op.a", target: ws });
  });

  it("is idempotent — second run writes nothing new", async () => {
    installConfigStub({ globals: { pegaEndpoint: "https://a/pega" } });
    const { store, secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "pw-a" });
    await ensureMigrated(secrets);
    secrets.store.mockClear();
    await ensureMigrated(secrets);
    expect(secrets.store).not.toHaveBeenCalled();
    expect(store.get(`kiroSdlc.${getWsHash()!}.migrated`)).toBe("1");
  });

  it("workspace-wins — never overwrites existing workspace values", async () => {
    installConfigStub({
      values: { pegaEndpoint: "https://mine/pega" },
      globals: { pegaEndpoint: "https://legacy/pega" },
    });
    const h = getWsHash()!;
    const { store, secrets } = installSecretStub({
      [`kiroSdlc.${h}.pegaPassword`]: "mine",
      [LEGACY_SECRET.pega]: "legacy",
    });
    await ensureMigrated(secrets);
    expect(store.get(`kiroSdlc.${h}.pegaPassword`)).toBe("mine");
  });

  it("skips invalid legacy values but still marks", async () => {
    installConfigStub({ globals: { pegaEndpoint: "ftp://bad", atlassianConnectionType: "bogus" } });
    const { store, secrets } = installSecretStub();
    await ensureMigrated(secrets);
    const h = getWsHash()!;
    expect(store.get(`kiroSdlc.${h}.migrated`)).toBe("1");
  });

  it("sets no marker when a secret copy fails (retry-safe)", async () => {
    installConfigStub();
    const h = getWsHash()!;
    const nsKey = `kiroSdlc.${h}.pegaPassword`;
    const { store, secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "pw" }, [nsKey]);
    await ensureMigrated(secrets);
    expect(store.get(`kiroSdlc.${h}.migrated`)).toBeUndefined();
    expect(store.get(LEGACY_SECRET.pega)).toBe("pw");
  });

  it("cleared-stays-cleared — no resurrection after intentional clear", async () => {
    installConfigStub();
    const h = getWsHash()!;
    const nsKey = `kiroSdlc.${h}.pegaPassword`;
    const { store, secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "pw" });
    await ensureMigrated(secrets);
    expect(store.get(nsKey)).toBe("pw");
    await secrets.delete(nsKey);
    await ensureMigrated(secrets);
    expect(store.get(nsKey)).toBeUndefined();
  });

  it("migrates each workspace independently (per-workspace lazy)", async () => {
    installConfigStub({ globals: { pegaUsername: "legacy-op" } });
    const { store, secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "pw" });
    await ensureMigrated(secrets);
    const hashA = getWsHash()!;
    setWorkspaceFolders(["/ws/b"]);
    await ensureMigrated(secrets);
    const hashB = getWsHash()!;
    expect(hashB).not.toBe(hashA);
    expect(store.get(`kiroSdlc.${hashB}.pegaPassword`)).toBe("pw");
    expect(store.get(`kiroSdlc.${hashB}.migrated`)).toBe("1");
    expect(store.get(`kiroSdlc.${hashA}.pegaPassword`)).toBe("pw");
  });

  it("is a no-op without a workspace folder", async () => {
    setWorkspaceFolders(null);
    installConfigStub({ globals: { pegaUsername: "legacy-op" } });
    const { store, secrets } = installSecretStub({ [LEGACY_SECRET.pega]: "pw" });
    await ensureMigrated(secrets);
    expect(store.size).toBe(1);
  });
});
