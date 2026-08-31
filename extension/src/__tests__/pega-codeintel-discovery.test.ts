/**
 * Unit tests for PegaCodeIntelDiscovery (SA4E-230) — verifies it builds the
 * correct backend request and parses the discovery report into a summary.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as vscode from "vscode";
import { PegaHttpClient } from "../services/PegaHttpClient";
import { PegaCodeIntelDiscovery } from "../services/PegaCodeIntelDiscovery";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => {
        if (key === "pegaEndpoint") return "https://cjpge4gy.pegacea.net/prweb";
        if (key === "pegaUsername") return "SSA@TGB";
        if (key === "backendUrl") return "http://127.0.0.1:48721";
        return defaultValue;
      }),
    })),
    workspaceFolders: [{ uri: { fsPath: "C:\\work\\pega-project" } }],
  },
}));

vi.mock("../extension", () => ({ setProjectId: vi.fn(), _projectId: "" }));

function mockSecrets(): vscode.SecretStorage {
  return { get: vi.fn(async () => "secret"), store: vi.fn(), delete: vi.fn() } as unknown as vscode.SecretStorage;
}

describe("PegaCodeIntelDiscovery", () => {
  const fetchMock = vi.fn();
  let client: PegaHttpClient;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    client = new PegaHttpClient(mockSecrets());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/v1/pega/discover and returns a summary", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        data: { servicePackages: 1, methods: 12, totalLinks: 12, accessGroups: ["HRAppsV2:Administrators"] },
        error: null,
      })),
    } as unknown as Response);

    const disc = new PegaCodeIntelDiscovery(client);
    const summary = await disc.run({ root: "C:\\work\\pega-project", report: { report: () => {} }, projectId: "PegaCollProj" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/pega/discover");
    const body = JSON.parse(init.body as string);
    expect(body.codeIntelBase).toBe("https://cjpge4gy.pegacea.net/prweb/api/CodeIntelligence/v1");
    expect(body.authHeader).toMatch(/^Basic /);
    expect(body.appName).toBe("HRAppsV2");
    expect(body.index).toBe(true);

    expect(summary).toContain("1 service package");
    expect(summary).toContain("12 method");
    expect(summary).toContain("12 linked rule");
  });

  it("throws when backend returns an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn(async () => "boom"),
    } as unknown as Response);

    const disc = new PegaCodeIntelDiscovery(client);
    await expect(
      disc.run({ root: "C:\\work\\pega-project", report: { report: () => {} }, projectId: "PegaCollProj" }),
    ).rejects.toThrow(/500/);
  });
});
