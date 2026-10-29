/**
 * PegaStreamIngester resilience — per-rule ingest hardening.
 * Covers the three fixes added for the UND_ERR_SOCKET / backend-URL investigation:
 *   (1) empty/malformed backend URL → clear, non-retryable config error (no fetch)
 *   (2) socket closed MID-BODY (res.text() throws) → TransientBodyError, RETRIED
 *   (3) truncated/empty/non-JSON body → TransientBodyError, RETRIED
 *   (4) a transient fetch fault (UND_ERR_SOCKET) → RETRIED then succeeds
 * Conventions mirror PegaStreamIngester.auth-retry.test.ts (vi.stubGlobal fetch).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PegaStreamIngester, IngestRejectedError } from "../PegaStreamIngester";

vi.mock("../../extension", () => ({
  getProjectId: () => "test-project-123",
  setProjectId: vi.fn(),
}));

const URL_BASE = "http://localhost:48721";
const OK = '{"data":{"status":"success","ruleId":42,"unresolvedDependencies":[]}}';

/** Response whose body methods resolve. */
function okResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

/** Response whose body read THROWS mid-stream (socket closed after headers). */
function bodyThrows(status = 200): Response {
  const sockErr = Object.assign(new TypeError("fetch failed"), {
    cause: { code: "UND_ERR_SOCKET", message: "other side closed" },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => { throw sockErr; },
    json: async () => { throw sockErr; },
  } as unknown as Response;
}

/** A fetch rejection simulating a server-closed socket before headers. */
function undiciSocketError(): Error {
  return Object.assign(new TypeError("fetch failed"), {
    cause: { code: "UND_ERR_SOCKET", message: "other side closed" },
  });
}

describe("PegaStreamIngester — resilience", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // (1) Empty backend URL → config error, fetch NEVER called, not retryable.
  it("empty backend URL → throws a clear config error without calling fetch", async () => {
    const ing = new PegaStreamIngester("");
    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" }))
      .rejects.toThrow(/backend URL is empty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // (1b) Malformed backend URL (no scheme/host) → config error, no fetch.
  it("malformed backend URL → throws a clear config error without calling fetch", async () => {
    const ing = new PegaStreamIngester("not-a-url");
    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" }))
      .rejects.toThrow(/not a valid absolute URL/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // (2) Socket closed mid-body → retried; second attempt's body reads fine.
  it("socket closed mid-body is retried and then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(bodyThrows(200))   // headers ok, body read throws
      .mockResolvedValueOnce(okResponse(OK));   // retry succeeds
    // Fast retry so the test does not wait on real backoff.
    const ing = new PegaStreamIngester(URL_BASE, undefined, undefined, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2,
    });

    const result = await ing.ingestSingleRule("proj-1", { pzInsKey: "A" });

    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // (3) Truncated/empty body (non-JSON) → treated transient → retried.
  it("empty/truncated body is retried as transient", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse("", 200)) // empty body → JSON.parse fails
      .mockResolvedValueOnce(okResponse(OK));
    const ing = new PegaStreamIngester(URL_BASE, undefined, undefined, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2,
    });

    const result = await ing.ingestSingleRule("proj-1", { pzInsKey: "A" });

    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // (4) fetch() rejects with UND_ERR_SOCKET → retried then succeeds.
  it("UND_ERR_SOCKET fetch rejection is retried then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(undiciSocketError())
      .mockResolvedValueOnce(okResponse(OK));
    const ing = new PegaStreamIngester(URL_BASE, undefined, undefined, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2,
    });

    const result = await ing.ingestSingleRule("proj-1", { pzInsKey: "A" });

    expect(result.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // (5) Exhausting retries on a persistent transient fault re-throws.
  it("persistent transient fault exhausts retries and throws", async () => {
    fetchMock.mockRejectedValue(undiciSocketError());
    const ing = new PegaStreamIngester(URL_BASE, undefined, undefined, {
      maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2,
    });

    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 try + 1 retry
  });

  // (6) A permanent classified rejection is NOT retried.
  it("permanent classified rejection (non-retryable) fails fast without retry", async () => {
    const envelope = '{"error":{"code":"VALIDATION_ERROR","message":"bad rule","details":{"category":"validation","retryable":false,"errorName":"ValidationError"}}}';
    fetchMock.mockResolvedValue(okResponse(envelope, 400));
    const ing = new PegaStreamIngester(URL_BASE, undefined, undefined, {
      maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2,
    });

    await expect(ing.ingestSingleRule("proj-1", { pzInsKey: "A" })).rejects.toBeInstanceOf(IngestRejectedError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });
});
