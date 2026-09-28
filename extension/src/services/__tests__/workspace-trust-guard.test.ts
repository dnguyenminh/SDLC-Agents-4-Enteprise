/**
 * SA4E-323 SEC-01 — WorkspaceTrustGuard blocks credential-bearing operations
 * while the workspace is untrusted, and lets them through once trusted.
 *
 * Contract proven here:
 *  - isTrusted === false → assertWorkspaceTrusted throws + notifies user
 *  - isTrusted === true  → no throw
 *  - isTrusted undefined  → no throw (legacy host with no trust concept)
 *  - PegaHttpClient.getAuthHeader and AtlassianCredentialService network/credential
 *    choke-points refuse to run in an untrusted workspace.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockState } = vi.hoisted(() => ({
  mockState: { isTrusted: true as boolean | undefined, config: {} as Record<string, unknown> },
}));

vi.mock("vscode", () => ({
  get workspace() {
    return {
      workspaceFolders: [{ uri: { fsPath: "/ws" }, name: "ws", index: 0 }],
      get isTrusted() { return mockState.isTrusted; },
      getConfiguration: () => ({
        get: <T>(key: string, dflt?: T): T => (key in mockState.config ? (mockState.config[key] as T) : (dflt as T)),
        update: () => Promise.resolve(),
      }),
    };
  },
  window: { showErrorMessage: vi.fn() },
  commands: {},
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

// Avoid pulling the extension's heavy module graph via PegaHttpClient's
// `import { setProjectId } from "../extension"` (mirrors existing Pega tests).
vi.mock("../../extension", () => ({ setProjectId: vi.fn(), _projectId: "" }));

import * as vscode from "vscode";
import {
  assertWorkspaceTrusted,
  UNTRUSTED_WORKSPACE_MESSAGE,
} from "../WorkspaceTrustGuard";
import { PegaHttpClient } from "../PegaHttpClient";
import { AtlassianCredentialService } from "../AtlassianCredentialService";

/** Minimal in-memory SecretStorage stub. */
function fakeSecrets(): vscode.SecretStorage {
  const store = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(store.get(k)),
    store: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
    delete: (k: string) => { store.delete(k); return Promise.resolve(); },
    onDidChange: () => ({ dispose() {} }),
  } as unknown as vscode.SecretStorage;
}

describe("assertWorkspaceTrusted (SA4E-323 SEC-01)", () => {
  beforeEach(() => {
    mockState.isTrusted = true;
    (vscode.window.showErrorMessage as any).mockClear?.();
  });
  afterEach(() => vi.restoreAllMocks());

  it("throws and notifies the user when workspace is untrusted", () => {
    mockState.isTrusted = false;
    expect(() => assertWorkspaceTrusted()).toThrow(UNTRUSTED_WORKSPACE_MESSAGE);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(UNTRUSTED_WORKSPACE_MESSAGE);
  });

  it("does not throw when workspace is trusted", () => {
    mockState.isTrusted = true;
    expect(() => assertWorkspaceTrusted()).not.toThrow();
  });

  it("does not throw when isTrusted is undefined (legacy host, fail-open)", () => {
    mockState.isTrusted = undefined;
    expect(() => assertWorkspaceTrusted()).not.toThrow();
  });
});

describe("PegaHttpClient credential gate (SA4E-323 SEC-01)", () => {
  beforeEach(() => { mockState.isTrusted = true; mockState.config = {}; });
  afterEach(() => vi.restoreAllMocks());

  it("getAuthHeader refuses in an untrusted workspace", async () => {
    mockState.isTrusted = false;
    const client = new PegaHttpClient(fakeSecrets());
    await expect(client.getAuthHeader()).rejects.toThrow(UNTRUSTED_WORKSPACE_MESSAGE);
  });

  it("getAuthHeader succeeds (Basic header) in a trusted workspace", async () => {
    mockState.isTrusted = true;
    mockState.config["pegaUsername"] = "op";
    const client = new PegaHttpClient(fakeSecrets());
    await expect(client.getAuthHeader()).resolves.toMatch(/^Basic /);
  });
});

describe("AtlassianCredentialService credential gate (SA4E-323 SEC-01)", () => {
  beforeEach(() => { mockState.isTrusted = true; mockState.config = {}; });
  afterEach(() => vi.restoreAllMocks());

  it("handleCredentialRequest refuses in an untrusted workspace", async () => {
    mockState.isTrusted = false;
    const svc = new AtlassianCredentialService(fakeSecrets());
    await expect(svc.handleCredentialRequest("req-1")).rejects.toThrow(UNTRUSTED_WORKSPACE_MESSAGE);
  });
});
