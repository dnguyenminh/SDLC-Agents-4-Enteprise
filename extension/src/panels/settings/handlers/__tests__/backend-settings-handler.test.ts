/**
 * SA4E-320/323 regression — BackendSettingsHandler must persist the
 * workspace-scoped settings (backend.url, backend.allowInsecureRemote) to the
 * WORKSPACE target so each workspace keeps its own value. A prior fix wrote
 * them to Global while package.json still declared no scope; the bug this
 * guards against is the mismatch that made the bypass checkbox read back false
 * ("Insecure backend URL rejected" even with bypass ON). Untrusted-repo abuse
 * is prevented by restrictedConfigurations + the trust gate, not by scope.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { BackendSettingsHandler } from "../BackendSettingsHandler";
import { installConfigStub, type InstalledConfig } from "../../../../__tests__/workspace-test-helpers";

const WORKSPACE = vscode.ConfigurationTarget.Workspace;
const REMOTE_HTTP = "http://sdlc.detalvn.vn:48721";

describe("BackendSettingsHandler workspace-scope persistence (SA4E-320/323)", () => {
  let cfg: InstalledConfig;
  let posted: any[];
  let handler: BackendSettingsHandler;

  beforeEach(() => {
    cfg = installConfigStub();
    posted = [];
    handler = new BackendSettingsHandler((m) => posted.push(m));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("writes allowInsecureRemote to the Workspace target (per-workspace scope)", async () => {
    await handler.setAllowInsecureRemote(true);
    expect(cfg.updates).toContainEqual({ key: "backend.allowInsecureRemote", value: true, target: WORKSPACE });
    expect(cfg.updates.some((u) => u.target === vscode.ConfigurationTarget.Global)).toBe(false);
  });

  it("bypass ON then save remote HTTP URL → saved to Workspace, no rejection", async () => {
    await handler.setAllowInsecureRemote(true);
    await handler.setBackendUrl(REMOTE_HTTP);
    // The flag persisted to Workspace is read back by getAllowInsecureRemote(),
    // so validation permits the remote HTTP URL and it is stored (Workspace).
    expect(cfg.updates).toContainEqual({ key: "backend.url", value: REMOTE_HTTP, target: WORKSPACE });
    expect(posted).toContainEqual({ type: "backendUrlSaved", success: true });
  });

  it("bypass OFF + save remote HTTP URL → rejected (enforcement intact)", async () => {
    await handler.setBackendUrl(REMOTE_HTTP);
    const saved = posted.find((m) => m.type === "backendUrlSaved");
    expect(saved.success).toBe(false);
    expect(saved.message).toMatch(/Insecure backend URL rejected/);
  });

  it("Finding #6: non-boolean enabled coerces to false (fail-closed)", async () => {
    await handler.setAllowInsecureRemote("true");
    expect(cfg.updates).toContainEqual({ key: "backend.allowInsecureRemote", value: false, target: WORKSPACE });
  });
});
