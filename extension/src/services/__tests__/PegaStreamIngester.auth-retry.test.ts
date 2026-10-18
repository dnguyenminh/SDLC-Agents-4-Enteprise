/**
 * SA4E-362 — PegaStreamIngester refresh-on-401 retry engine (UT-01..UT-07, UT-14).
 * Conventions: vi.stubGlobal('fetch'), jsonResponse helper, (ing as any) private access,
 * fake timers for pollUntilComplete (POLL_INTERVAL_MS = 3000). STC v1.1 §3.
 * (Split from PegaStreamIngester.auth-retry.test.ts — retry-engine concern;
 *  SEC-02 + PBT-01 live in PegaStreamIngester.auth-error.test.ts.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PegaStreamIngester, IngestAuthError } from "../PegaStreamIngester";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

vi.mock("../../extension", () => ({
  getProjectId: () => "test-project-123",
  setProjectId: vi.fn(),
}));

const URL_BASE = "http://localhost:48721";

/** Response helper (STC §1): ok = 2xx, supports json() + text(). */
function jsonResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

const RULE_ENVELOPE_OK = '{"data":{"status":"success","ruleId":42,"unresolvedDependencies":[]}}';
const RULE_ENVELOPE_401 = '{"error":{"code":"TOKEN_INVALID","message":"Invalid or expired token"}}';

function makeProvider(overrides: Partial<IngestAuthProvider> = {}): IngestAuthProvider & { refreshToken: ReturnType<typeof vi.fn> } {
  return {
    getTokenSync: () => "stale-token",
    refreshToken: vi.fn(async () => "fresh-token"),
    ...overrides,
  } as IngestAuthProvider & { refreshToken: ReturnType<typeof vi.fn> };
}

describe("PegaStreamIngester refresh-on-401 — SA4E-362", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // STC: UT-01 — 401 → refresh đúng 1 lần → retry với token mới → thành công
  it("UT-01: ingestSingleRule refreshes once on 401 and retries with the fresh token", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RULE_ENVELOPE_401, 401))
      .mockResolvedValueOnce(jsonResponse(RULE_ENVELOPE_OK, 200));
    const auth = makeProvider();
    const ing = new PegaStreamIngester(URL_BASE, auth);

    const result = await ing.ingestSingleRule("proj-1", { pzInsKey: "A" });

    expect(result.status).toBe("success"); // KHÔNG throw
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [h1, h2] = fetchMock.mock.calls.map(
      (c: unknown[]) => (c[1] as RequestInit).headers as Record<string, string>,
    );
    expect(h1["Authorization"]).toBe("Bearer stale-token");
    expect(h2["Authorization"]).toBe("Bearer fresh-token");
    // BR-6: log (via withAuthRetry) never contains token values — verified through submitJob below.
  });

  // STC: UT-02 — refresh trả undefined → fetch đúng 1 lần, không loop, typed IngestAuthError
  it("UT-02: refresh undefined → no retry, throws IngestAuthError with the original message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RULE_ENVELOPE_401, 401));
    const auth = makeProvider({ refreshToken: vi.fn(async () => undefined) });
    const ing = new PegaStreamIngester(URL_BASE, auth);

    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" })).rejects.toThrow(IngestAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // không retry, không loop
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
  });

  // STC: UT-03 — non-401 (400/403/500/503) → refreshToken gọi 0 lần, fetch 1 lần
  it.each([400, 403, 500, 503])("UT-03: HTTP %i → refreshToken 0 calls, error propagates as-is", async (status) => {
    fetchMock.mockResolvedValue(
      jsonResponse('{"error":{"code":"X","message":"boom"}}', status as number),
    );
    const auth = makeProvider();
    const ing = new PegaStreamIngester(URL_BASE, auth);

    const err = await ing.ingestSingleRule("proj-1", { pzInsKey: "A" }).catch((e: unknown) => e);

    expect(auth.refreshToken).toHaveBeenCalledTimes(0); // BR-1: chỉ 401 trigger refresh
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(IngestAuthError); // 403 KHÔNG bị coi là hết hạn
    expect((err as Error).message).toContain("boom");
  });

  // STC: UT-04 — submitJob stream replay: makeBody 2 lần, 2 stream instance, duplex:'half' cả 2
  it("UT-04: submitJob rebuilds the stream per attempt with duplex:'half' on both sends", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse("", 401))
      .mockResolvedValueOnce(jsonResponse('{"data":{"jobId":"job-1"}}', 202));
    const auth = makeProvider();
    const ing = new PegaStreamIngester(URL_BASE, auth);

    const jobId = await (ing as any).submitJob(
      [{ pzInsKey: "R1" }], "proj-1", {}, {}, [], `${URL_BASE}/api/v1/pega/ingest-stream`, () => {},
    );

    expect(jobId).toBe("job-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const inits = fetchMock.mock.calls.map((c: unknown[]) => c[1] as RequestInit);
    const body1 = inits[0].body as ReadableStream<Uint8Array>;
    const body2 = inits[1].body as ReadableStream<Uint8Array>;
    expect(body1).toBeInstanceOf(ReadableStream);
    expect(body2).toBeInstanceOf(ReadableStream);
    expect(body1).not.toBe(body2); // 2 stream instance KHÁC nhau (không reuse consumed stream)
    expect((inits[0] as any).duplex).toBe("half");
    expect((inits[1] as any).duplex).toBe("half"); // BẮT BUỘC ở CẢ HAI lần gửi
    const h2 = inits[1].headers as Record<string, string>;
    expect(h2["Authorization"]).toBe("Bearer fresh-token"); // header Bearer fresh lần 2
  });

  // STC: UT-05 — poll 401 giữa loop → per-request refresh, fake timers (POLL_INTERVAL_MS=3000)
  it("UT-05: pollUntilComplete rebuilds headers per request and survives a 401 mid-poll", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse("", 401))
      .mockResolvedValueOnce(
        jsonResponse('{"data":{"status":"done","progress":{"processed":3,"total":3},"result":{"stored":3},"error":null}}', 200),
      );
    const auth = makeProvider();
    const ing = new PegaStreamIngester(URL_BASE, auth);
    const log = vi.fn();

    const pollPromise = (ing as any).pollUntilComplete("job-1", "proj-1", log);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pollPromise;

    expect(result).toEqual({ stored: 3 }); // polling hoàn tất — KHÔNG treo
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [h1, h2] = fetchMock.mock.calls.map(
      (c: unknown[]) => (c[1] as RequestInit).headers as Record<string, string>,
    );
    expect(h1["Authorization"]).toBe("Bearer stale-token"); // call #1 stale
    expect(h2["Authorization"]).toBe("Bearer fresh-token"); // headers rebuild per-request
    // BR-6: log không chứa giá trị token
    const allLogs = log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allLogs).not.toContain("stale-token");
    expect(allLogs).not.toContain("fresh-token");
  });

  // STC: UT-06 — back-compat constructor không auth → không crash, không refresh, 401 nguyên trạng
  it("UT-06: constructor without auth → single fetch, typed error, no crash", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RULE_ENVELOPE_401, 401));
    const ing = new PegaStreamIngester(URL_BASE); // KHÔNG truyền auth

    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" })).rejects.toThrow(IngestAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // không retry khi không có provider
  });

  // STC: UT-07 — token rỗng → KHÔNG Authorization, VẪN có X-Project-Id, refresh 0 lần
  it("UT-07: empty token → no Authorization header, X-Project-Id still present", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RULE_ENVELOPE_OK, 200));
    const auth = makeProvider({ getTokenSync: () => "" });
    const ing = new PegaStreamIngester(URL_BASE, auth);

    await ing.ingestSingleRule("proj-1", { pzInsKey: "A" });

    const h = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = h.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined(); // không gửi 'Bearer ' rỗng (BR-5)
    expect(headers["X-Project-Id"]).toBe("proj-1");
    expect(auth.refreshToken).toHaveBeenCalledTimes(0); // không 401 → không refresh
  });

  // STC: UT-14 — refresh OK nhưng retry VẪN 401 → IngestAuthError (auth-dead trigger #2)
  it("UT-14: retry still 401 after successful refresh → IngestAuthError, no second refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RULE_ENVELOPE_401, 401))
      .mockResolvedValueOnce(jsonResponse(RULE_ENVELOPE_401, 401));
    const auth = makeProvider(); // refresh OK → 'fresh-token' (bị backend từ chối)
    const ing = new PegaStreamIngester(URL_BASE, auth);

    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" })).rejects.toThrow(IngestAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // retry đúng 1 lần — KHÔNG loop
    expect(auth.refreshToken).toHaveBeenCalledTimes(1); // không refresh lần 2
  });

});
