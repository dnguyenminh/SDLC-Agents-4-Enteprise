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
});
