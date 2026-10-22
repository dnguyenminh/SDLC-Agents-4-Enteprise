/**
 * Unit tests for Pega branch creation:
 * - PegaHttpClient.createPegaBranch() — Service 7 request construction.
 * - PegaMcpTools.createBranch() — pega_create_branch handler (auto branch naming).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as vscode from "vscode";
import { PegaHttpClient } from "../services/PegaHttpClient";
import { PegaMcpTools } from "../mcp/PegaMcpTools";
import { PegaRuleSetResolverService } from "../services/PegaRuleSetResolverService";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => {
        if (key === "pega.endpoint") return "http://localhost:8080/prweb";
        if (key === "pega.username") return "SSA@TGB";
        if (key === "pega.developerShortName") return "";
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

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe("PegaHttpClient.createPegaBranch", () => {
  let client: PegaHttpClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    client = new PegaHttpClient(mockSecrets());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /rules/branch on first prefix with encoded params", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "CREATED", branchName: "SSA_SA4E-58", branchVersion: "01-01-01:SSA_SA4E-58" }));

    const data = await client.createPegaBranch("HRAppsV2", "01-01-01", "SSA_SA4E-58");

    expect(data.status).toBe("CREATED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/rules/branch?");
    expect(String(url)).toContain("rulesetName=HRAppsV2");
    expect(String(url)).toContain("baseVersion=01-01-01");
    expect(String(url)).toContain("branchName=SSA_SA4E-58");
    expect(String(url)).toContain("branchVersion=01-01-01%3ASSA_SA4E-58");
    expect(String(url)).toContain("RequestRuleSetName=HRAppsV2");
    expect(String(url)).toContain("RequestBranchName=SSA_SA4E-58");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.ruleJson).toContain("01-01-01:SSA_SA4E-58");
  });

  it("uses default base version 01-01-01 when omitted", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "CREATED", branchVersion: "01-01-01:dev_CR" }));
    await client.createPegaBranch("HRAppsV2", undefined, "dev_CR");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("baseVersion=01-01-01");
  });

  it("tries next prefix when first fails with network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(okResponse({ status: "CREATED", branchVersion: "01-01-01:SSA_SA4E-58" }));
    const data = await client.createPegaBranch("HRAppsV2", "01-01-01", "SSA_SA4E-58");
    expect(data.status).toBe("CREATED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns EXISTS when branch already present (idempotent)", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "EXISTS", branchVersion: "01-01-01:SSA_SA4E-58" }));
    const data = await client.createPegaBranch("HRAppsV2", "01-01-01", "SSA_SA4E-58");
    expect(data.status).toBe("EXISTS");
  });

  it("throws when all prefixes fail", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: vi.fn(async () => ({ error: "boom" })) });
    await expect(client.createPegaBranch("HRAppsV2", "01-01-01", "SSA_SA4E-58")).rejects.toThrow("POST /rules/branch failed");
  });
});

describe("PegaMcpTools.createBranch", () => {
  let tools: PegaMcpTools;
  let client: PegaHttpClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    client = new PegaHttpClient(mockSecrets());
    tools = new PegaMcpTools(mockSecrets());
    (tools as unknown as { client: PegaHttpClient }).client = client;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires rulesetName", async () => {
    const res = await tools.createBranch({});
    expect(res.success).toBe(false);
    expect(res.error).toContain("rulesetName");
  });

  it("uses explicit branchName and ticketId when provided", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "CREATED", branchName: "dnguyen_SA4E-58" }));
    const res = await tools.createBranch({
      rulesetName: "HRAppsV2",
      baseVersion: "02-02-02",
      branchName: "dnguyen_SA4E-58",
      ticketId: "SA4E-58",
    });
    expect(res.success).toBe(true);
    expect(res.context.branchVersion).toBe("02-02-02:dnguyen_SA4E-58");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("branchName=dnguyen_SA4E-58");
  });

  it("auto-derives branch name from ticketId + developerShortName when branchName omitted", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "CREATED" }));
    const res = await tools.createBranch({
      rulesetName: "HRAppsV2",
      ticketId: "SA4E-58",
      developerShortName: "ssa",
    });
    expect(res.success).toBe(true);
    expect(res.context.branchName).toBe("ssa_SA4E-58");
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("branchName=ssa_SA4E-58");
  });

  it("fails when branchName omitted and no ticket/cr id", async () => {
    const res = await tools.createBranch({ rulesetName: "HRAppsV2" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("branchName required");
  });
});

describe("resolver supports createBranch baseVersion override", () => {
  let resolver: PegaRuleSetResolverService;

  beforeEach(() => {
    const client = new PegaHttpClient(mockSecrets());
    resolver = new PegaRuleSetResolverService(client);
  });

  it("builds branch version from custom base version", async () => {
    const branch = await resolver.resolveBranchContext({ ticketId: "SA4E-58" }, "02-02-02");
    expect(branch!.branchVersion).toBe("02-02-02:SSA_SA4E-58");
  });
});
