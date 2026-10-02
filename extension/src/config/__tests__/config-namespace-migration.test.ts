/**
 * Tests for config-namespace-migration — legacy `kiroSdlc.*` → `sdlcAgents.*`.
 * Uses local stubs for vscode.workspace.getConfiguration + ExtensionContext
 * globalState so the migration logic is exercised without the global mock.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- vscode stub (config sections + globalState) ---------------------------
interface ScopeStore { global: Map<string, unknown>; workspace: Map<string, unknown>; }

const sections: Record<string, ScopeStore> = {
  kiroSdlc: { global: new Map(), workspace: new Map() },
  sdlcAgents: { global: new Map(), workspace: new Map() },
};

const Global = 1;
const Workspace = 2;

function makeConfig(section: string) {
  const store = sections[section];
  return {
    inspect: (key: string) => ({
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
  workspace: { getConfiguration: (section: string) => makeConfig(section) },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

import { migrateConfigNamespace } from "../config-namespace-migration";

function makeContext(initialFlag = false) {
  const state = new Map<string, unknown>();
  if (initialFlag) state.set("sdlcAgents.configMigrated.v1", true);
  return {
    globalState: {
      get: (k: string) => state.get(k),
      update: (k: string, v: unknown) => { state.set(k, v); return Promise.resolve(); },
    },
  } as unknown as import("vscode").ExtensionContext;
}

function reset() {
  for (const s of Object.values(sections)) { s.global.clear(); s.workspace.clear(); }
}

describe("migrateConfigNamespace", () => {
  beforeEach(reset);

  it("copies a legacy global value when the new namespace is unset", async () => {
    sections.kiroSdlc.global.set("llmProvider", "openai");
    await migrateConfigNamespace(makeContext());
    expect(sections.sdlcAgents.global.get("llmProvider")).toBe("openai");
  });

  it("copies a legacy workspace value independently of global", async () => {
    sections.kiroSdlc.workspace.set("pegaEndpoint", "https://pega.local");
    await migrateConfigNamespace(makeContext());
    expect(sections.sdlcAgents.workspace.get("pegaEndpoint")).toBe("https://pega.local");
  });

  it("does NOT overwrite an existing new value (copy-not-clobber)", async () => {
    sections.kiroSdlc.global.set("mcpServerPort", 9181);
    sections.sdlcAgents.global.set("mcpServerPort", 5000);
    await migrateConfigNamespace(makeContext());
    expect(sections.sdlcAgents.global.get("mcpServerPort")).toBe(5000);
  });

  it("does NOT delete the legacy value (rollback-safe)", async () => {
    sections.kiroSdlc.global.set("llmModel", "gpt-4o");
    await migrateConfigNamespace(makeContext());
    expect(sections.kiroSdlc.global.get("llmModel")).toBe("gpt-4o");
  });

  it("is a no-op when already migrated (guard flag set)", async () => {
    sections.kiroSdlc.global.set("llmProvider", "openai");
    await migrateConfigNamespace(makeContext(true));
    expect(sections.sdlcAgents.global.get("llmProvider")).toBeUndefined();
  });

  it("sets the guard flag after a successful run", async () => {
    const ctx = makeContext();
    await migrateConfigNamespace(ctx);
    expect(ctx.globalState.get("sdlcAgents.configMigrated.v1")).toBe(true);
  });
});
