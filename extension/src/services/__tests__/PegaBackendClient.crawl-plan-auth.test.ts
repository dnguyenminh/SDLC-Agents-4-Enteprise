/**
 * SA4E-362 CR-01 — crawlPlan auth threading (FR-7 T-1, P2).
 * PegaProjectIndexer.crawlPlan (~:68) now passes `this.auth` through the
 * PegaHttpClient wrapper into PegaBackendClient.crawlPlan → postBackend →
 * withAuthRetry: 401 → refresh exactly once → retry with the fresh Bearer.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { crawlPlan } from "../pega/PegaBackendClient";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";
import type { PegaHttpCore } from "../pega/PegaHttpCore";

vi.mock("../../extension", () => ({
  getProjectId: () => "test-project-123",
  setProjectId: vi.fn(),
}));

function jsonResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

const core = { getBackendUrl: () => "http://localhost:48721" } as unknown as PegaHttpCore;

describe("PegaBackendClient.crawlPlan — auth threading (SA4E-362 CR-01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("crawlPlan uses the provider: 401 → refresh once → retry with fresh Bearer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse("", 401))
      .mockResolvedValueOnce(jsonResponse('{"data":{"missing":[],"cached":[]}}', 200));
    vi.stubGlobal("fetch", fetchMock);
    const refreshToken = vi.fn(async () => "fresh-token");
    const auth: IngestAuthProvider = { getTokenSync: () => "stale-token", refreshToken };

    const plan = await crawlPlan(core, { projectId: "proj-1", ruleKeys: ["A"], visitedKeys: [] }, auth);

    expect(plan).toEqual({ missing: [], cached: [] }); // retry thành công
    expect(refreshToken).toHaveBeenCalledTimes(1); // refresh-on-401 đúng 1 lần (BR-2)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const h1 = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const h2 = (fetchMock.mock.calls[1] as unknown[])[1] as RequestInit;
    expect((h1.headers as Record<string, string>)["Authorization"]).toBe("Bearer stale-token");
    expect((h2.headers as Record<string, string>)["Authorization"]).toBe("Bearer fresh-token");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/api/v1/pega/crawl-plan");
  });
});
