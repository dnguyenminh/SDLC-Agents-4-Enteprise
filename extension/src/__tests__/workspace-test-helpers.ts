/**
 * Shared stubs for SA4E-323 workspace-isolation tests.
 * Drives the aliased vscode mock (vitest.config.ts) with in-memory
 * configuration + SecretStorage so tests exercise real service code.
 */
import { vi } from "vitest";
import * as vscode from "vscode";

/** Point the mocked workspace at the given folder paths (null = no folder). */
export function setWorkspaceFolders(paths: string[] | null): void {
  (vscode.workspace as any).workspaceFolders = paths === null
    ? undefined
    : paths.map((p, i) => ({ uri: { fsPath: p }, name: `ws${i}`, index: i }));
}

export interface InstalledConfig {
  values: Record<string, any>;
  globals: Record<string, any>;
  updates: Array<{ key: string; value: any; target: any }>;
}

/** Install an in-memory getConfiguration stub (merged get + inspect + update). */
export function installConfigStub(init?: {
  values?: Record<string, any>;
  globals?: Record<string, any>;
  failOnUpdateKeys?: string[];
}): InstalledConfig {
  const values: Record<string, any> = { ...(init?.values ?? {}) };
  const globals: Record<string, any> = { ...(init?.globals ?? {}) };
  const updates: InstalledConfig["updates"] = [];
  const failKeys = new Set(init?.failOnUpdateKeys ?? []);
  const stub = {
    // Merged read like real VS Code: workspace value wins, else global, else default.
    get: vi.fn((key: string, def?: any) => (key in values ? values[key] : key in globals ? globals[key] : def)),
    update: vi.fn((key: string, value: any, target?: any) => {
      updates.push({ key, value, target });
      if (failKeys.has(key)) { return Promise.reject(new Error(`update failed: ${key}`)); }
      if (value === undefined) { delete values[key]; } else { values[key] = value; }
      return Promise.resolve();
    }),
    inspect: vi.fn((key: string) => ({ key, globalValue: globals[key], workspaceValue: values[key] })),
  };
  (vscode.workspace as any).getConfiguration = vi.fn(() => stub);
  return { values, globals, updates };
}

export interface InstalledSecrets {
  store: Map<string, string>;
  secrets: any;
}

/** Install an in-memory SecretStorage stub. */
export function installSecretStub(initial?: Record<string, string>, failOnStoreKeys?: string[]): InstalledSecrets {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  const failKeys = new Set(failOnStoreKeys ?? []);
  const secrets = {
    get: vi.fn((k: string) => Promise.resolve(store.get(k))),
    store: vi.fn((k: string, v: string) => {
      if (failKeys.has(k)) { return Promise.reject(new Error(`store failed: ${k}`)); }
      store.set(k, v);
      return Promise.resolve();
    }),
    delete: vi.fn((k: string) => { store.delete(k); return Promise.resolve(); }),
  };
  return { store, secrets };
}
