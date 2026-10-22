/**
 * SA4E-370 — unit tests for the config key rename read-path fallback helper
 * (config/settings-migration.ts). Uses a local vscode stub with in-memory
 * global/workspace stores so inspect()-based resolution is exercised without
 * the global mock.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- vscode stub (mutable per-test config object) ---------------------------
const Global = 1;
const Workspace = 2;

interface ScopeStore { global: Map<string, unknown>; workspace: Map<string, unknown>; }
const store: ScopeStore = { global: new Map(), workspace: new Map() };

/** Installed config object; undefined simulates a host without the config API. */
let configStub: Record<string, unknown> | undefined;

function installFullConfig(): void {
  configStub = {
    // Merged read like real VS Code: workspace value wins, else global, else default.
    get: (key: string, def?: unknown) =>
      (store.workspace.has(key) ? store.workspace.get(key)
        : store.global.has(key) ? store.global.get(key) : def),
    inspect: (key: string) => ({
      key,
      globalValue: store.global.has(key) ? store.global.get(key) : undefined,
      workspaceValue: store.workspace.has(key) ? store.workspace.get(key) : undefined,
    }),
    update: (key: string, value: unknown, target: number) => {
      (target === Global ? store.global : store.workspace).set(key, value);
      return Promise.resolve();
    },
  };
}

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => configStub,
  },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

import { getSetting } from "../settings-migration";

function reset(): void {
  store.global.clear();
  store.workspace.clear();
  configStub = undefined;
}

describe("getSetting (SA4E-370)", () => {
  beforeEach(reset);

  it("returns the NEW key value when the new key is set (global scope)", () => {
    installFullConfig();
    store.global.set("pega.endpoint", "https://new.example.com/prweb");
    store.global.set("pegaEndpoint", "https://old.example.com/prweb");
    expect(getSetting("pega.endpoint", "pegaEndpoint", "http://default/prweb"))
      .toBe("https://new.example.com/prweb");
  });

  it("returns the NEW key value when the new key is set (workspace scope)", () => {
    installFullConfig();
    store.workspace.set("mcp.serverPort", 5001);
    expect(getSetting<number>("mcp.serverPort", "mcpServerPort", 9181)).toBe(5001);
  });

  it("ignores the OLD flat key when only the old key is set (post-migration)", () => {
    // Post-migration behavior: getSetting reads ONLY the new key.
    // Old key values are handled by the one-time migration runner at activation.
    installFullConfig();
    store.global.set("llmProvider", "openai");
    expect(getSetting("llm.provider", "llmProvider", "anthropic")).toBe("anthropic");
  });

  it("honors an explicitly-set falsy NEW value over a non-empty old value", () => {
    // inspect() must distinguish "set to ''" from "unset" — an explicit
    // override to empty must not resurrect the legacy value.
    installFullConfig();
    store.global.set("llm.anthropic.baseUrl", "");
    store.global.set("anthropicBaseUrl", "https://legacy-gateway/anthropic");
    expect(getSetting("llm.anthropic.baseUrl", "anthropicBaseUrl", "fallback"))
      .toBe("");
  });

  it("returns the default when neither key is set", () => {
    installFullConfig();
    expect(getSetting<number>("mcp.maxBodyBytes", "mcpMaxBodyBytes", 67108864))
      .toBe(67108864);
  });

  it("degraded (no inspect): reads only the NEW key, then default (post-migration)", () => {
    // Post-migration: even without inspect(), the OLD flat key is IGNORED —
    // old values are handled by the one-time migration runner at activation.
    configStub = { get: (key: string, def?: unknown) => (store.global.has(key) ? store.global.get(key) : def) };
    store.global.set("pegaUsername", "legacy-op");
    expect(getSetting("pega.username", "pegaUsername", "")).toBe("");

    // Only the new key set → new value.
    reset();
    configStub = { get: (key: string, def?: unknown) => (store.global.has(key) ? store.global.get(key) : def) };
    store.global.set("pega.username", "new-op");
    expect(getSetting("pega.username", "pegaUsername", "")).toBe("new-op");

    // Neither set → default.
    reset();
    configStub = { get: (_key: string, def?: unknown) => def };
    expect(getSetting("pega.username", "pegaUsername", "dflt")).toBe("dflt");
  });

  it("returns the default when the configuration API is absent", () => {
    configStub = undefined;
    expect(getSetting("llm.provider", "llmProvider", "anthropic")).toBe("anthropic");
  });
});
