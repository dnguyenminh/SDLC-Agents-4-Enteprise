/**
 * SA4E-323 SEC-02 — enforcePegaEndpointHttps gates credential transmission by
 * transport, reusing the backend-url loopback + allowInsecureRemote policy.
 *
 * Contract proven here:
 *  - https remote            → accepted
 *  - http loopback           → accepted (local dev)
 *  - http remote, opt-in OFF → rejected (fail-closed, no plaintext Basic auth)
 *  - http remote, opt-in ON  → accepted with MITM warning
 *  - non http/https protocol → rejected
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockConfig } = vi.hoisted(() => ({ mockConfig: {} as Record<string, unknown> }));

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({
      get: <T>(key: string, dflt?: T): T => (key in mockConfig ? (mockConfig[key] as T) : (dflt as T)),
      update: () => Promise.resolve(),
    }),
  },
  window: {},
  commands: {},
}));

import { enforcePegaEndpointHttps } from "../pega-endpoint";

describe("enforcePegaEndpointHttps (SA4E-323 SEC-02)", () => {
  beforeEach(() => {
    mockConfig["backend.allowInsecureRemote"] = false;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("accepts https remote endpoints unchanged", () => {
    const url = "https://pega.corp.example.com/prweb";
    expect(enforcePegaEndpointHttps(url)).toBe(url);
  });

  it("accepts http loopback endpoints (localhost, 127.0.0.1)", () => {
    expect(enforcePegaEndpointHttps("http://localhost:8080/prweb")).toBe("http://localhost:8080/prweb");
    expect(enforcePegaEndpointHttps("http://127.0.0.1:8080/prweb")).toBe("http://127.0.0.1:8080/prweb");
  });

  it("rejects http remote endpoints when opt-in is OFF (fail-closed)", () => {
    expect(() => enforcePegaEndpointHttps("http://pega.attacker.tld/prweb")).toThrow(
      /Insecure Pega endpoint rejected/
    );
    expect(() => enforcePegaEndpointHttps("http://192.168.1.50:8080/prweb")).toThrow(
      /Insecure Pega endpoint rejected/
    );
  });

  it("rejects a 127-prefixed hostname (not a real loopback IP)", () => {
    expect(() => enforcePegaEndpointHttps("http://127.attacker.com/prweb")).toThrow(
      /Insecure Pega endpoint rejected/
    );
  });

  it("accepts http remote endpoints when opt-in is ON, with MITM warning", () => {
    mockConfig["backend.allowInsecureRemote"] = true;
    const url = "http://pega.internal.lan/prweb";
    expect(enforcePegaEndpointHttps(url)).toBe(url);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[Security\] WARNING: Insecure remote Pega endpoint allowed/)
    );
  });

  it("rejects non http/https protocols regardless of opt-in", () => {
    mockConfig["backend.allowInsecureRemote"] = true;
    expect(() => enforcePegaEndpointHttps("ftp://pega.corp.example.com/prweb")).toThrow(
      /Invalid Pega endpoint protocol/
    );
  });

  it("rejects malformed endpoint URLs", () => {
    expect(() => enforcePegaEndpointHttps("not a url")).toThrow(/Malformed Pega endpoint URL/);
  });
});
