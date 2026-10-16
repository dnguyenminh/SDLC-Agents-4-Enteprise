/**
 * BackendHttpPoster — regression: the bulk-check route sits behind jwtAuth and
 * 401s (AUTH_REQUIRED) without a Bearer token, which used to force a FULL
 * re-download of every Pega rule (E-04 fail-safe).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendHttpPoster } from "../BackendHttpPoster";

const TOKEN = "jwt-token-abc";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  return vi.fn(async (_url: unknown, init?: RequestInit) => ({
    ok: true,
    json: async () => ({ data: { existing: [] }, error: null }),
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    init,
  }));
}

describe("BackendHttpPoster", () => {
  it("sends Authorization when a token provider is supplied", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);

    const poster = new BackendHttpPoster("http://127.0.0.1:48721", () => TOKEN);
    await poster.postJson("/api/v1/pega/rulecatalog/bulk-check", { projectId: "p", checksums: [] }, { "X-Project-Id": "p" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(headers["X-Project-Id"]).toBe("p");
  });

  it("sends no Authorization when no token is available", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);

    const poster = new BackendHttpPoster("http://127.0.0.1:48721", () => "");
    await poster.postJson("/api/v1/pega/rulecatalog/bulk-check", {}, {});

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("throws on a non-OK response so StateComparer degrades fail-safe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 401, statusText: "Unauthorized",
      json: async () => ({}), headers: new Headers(),
    })));

    const poster = new BackendHttpPoster("http://127.0.0.1:48721", () => TOKEN);
    await expect(poster.postJson("/bulk-check", {}, {})).rejects.toThrow(/401/);
  });

  // ─── SA4E-362 UT-10: refresh-on-401 for full IngestAuthProvider (union signature) ───

  it("UT-10a: refreshes once on 401 and retries with the fresh token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}), headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: async () => ({ data: { existing: [1] }, error: null }), headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const refreshToken = vi.fn(async () => "fresh");
    const poster = new BackendHttpPoster("http://127.0.0.1:48721", { getTokenSync: () => "stale", refreshToken });

    const result = await poster.postJson("/api/v1/pega/rulecatalog/bulk-check", { projectId: "p", checksums: [] }, { "X-Project-Id": "p" });

    expect(result).toEqual({ data: { existing: [1] }, error: null }); // parsed JSON
    expect(refreshToken).toHaveBeenCalledTimes(1); // đúng 1 lần
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((init2.headers as Record<string, string>)["Authorization"]).toBe("Bearer fresh"); // call #2 fresh
  });

  it("UT-10b: refresh undefined → single fetch, rejects with the unchanged message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}), headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const refreshToken = vi.fn(async () => undefined);
    const poster = new BackendHttpPoster("http://127.0.0.1:48721", { getTokenSync: () => "stale", refreshToken });

    await expect(poster.postJson("/bulk-check", {}, {})).rejects.toThrow(/bulk-check HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // KHÔNG fallback re-fetch (US-2 AC5)
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("UT-10c: non-401 (500) → no refresh, error as before", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error", json: async () => ({}), headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);
    const refreshToken = vi.fn(async () => "fresh");
    const poster = new BackendHttpPoster("http://127.0.0.1:48721", { getTokenSync: () => "stale", refreshToken });

    await expect(poster.postJson("/bulk-check", {}, {})).rejects.toThrow(/500/);
    expect(refreshToken).toHaveBeenCalledTimes(0); // BR-1: chỉ 401 trigger refresh
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
