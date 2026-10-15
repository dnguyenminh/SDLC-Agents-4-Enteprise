/**
 * SA4E-362 — PegaSchemaIndexer auth (UT-13, FR-7 T-3). Root-cause: generateForHarness
 * previously sent NO Authorization header at all (guaranteed 401 under CODE_INTEL_REQUIRE_AUTH).
 * After fix: call #1 carries 'Bearer <cached>' + 401 → refresh exactly once → call #2 'Bearer fresh'.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { PegaSchemaIndexer } from "../PegaSchemaIndexer";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

vi.mock("vscode", () => ({
  window: { showWarningMessage: vi.fn(), createOutputChannel: vi.fn(() => ({ appendLine: vi.fn() })) },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
}));

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

describe("PegaSchemaIndexer Authorization + refresh-on-401 — SA4E-362 UT-13", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Authorization on call #1 (root-cause fix) and refreshes once on 401", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse("Unauthorized", 401))
      .mockResolvedValueOnce(jsonResponse('{"schema":{"type":"object","properties":{}}}', 200));
    vi.stubGlobal("fetch", fetchMock);

    const auth: IngestAuthProvider & { refreshToken: ReturnType<typeof vi.fn> } = {
      getTokenSync: () => "stale",
      refreshToken: vi.fn(async () => "fresh"),
    } as never;
    const indexer = new PegaSchemaIndexer(
      { getBaseUrl: () => "http://localhost:48721" } as never,
      () => {},
      auth,
    );
    const pegaClient = { getRuleByInsKey: vi.fn(async () => ({ pzInsKey: "H1", pxRuleReferences: [] })) } as never;

    const schema = await (indexer as unknown as {
      generateForHarness(c: unknown, h: unknown, t: string): Promise<{ type: string }>;
    }).generateForHarness(pegaClient, { pzInsKey: "H1" }, "Rule-Form");

    expect(schema.type).toBe("object"); // retry thành công, không throw
    expect(auth.refreshToken).toHaveBeenCalledTimes(1); // refresh-on-401 đúng 1 lần
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const h1 = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const h2 = (fetchMock.mock.calls[1] as unknown[])[1] as RequestInit;
    // Call #1 CÓ Authorization (trước đây: header vắng hoàn toàn — root cause #13 BRD §8.1)
    expect((h1.headers as Record<string, string>)["Authorization"]).toBe("Bearer stale");
    expect((h2.headers as Record<string, string>)["Authorization"]).toBe("Bearer fresh"); // refresh-on-401
    expect((h1.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
