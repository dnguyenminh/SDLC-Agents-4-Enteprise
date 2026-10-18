/**
 * Unit tests for AuthManager — logout, SSO providers/login, SA4E-362 UT-12
 * concurrent refresh dedupe (refreshInFlight — FR-1).
 * (Split from auth-manager.test.ts — logout/SSO concern.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthManager, AuthError } from "../AuthManager";
import type { AuthState } from "../AuthManager";

const SECRET_ACCESS = "sdlcAgents.accessToken";

function makeSecrets() {
  const store = new Map<string, string>();
  const secrets = {
    get: vi.fn(async (key: string) => store.get(key) ?? undefined),
    store: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
  };
  return { store, secrets };
}

function okJson(body: unknown): Response {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

describe("AuthManager", () => {
  let auth: AuthManager;
  let secrets: ReturnType<typeof makeSecrets>["secrets"];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ secrets } = makeSecrets());
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth = new AuthManager(secrets, "http://backend:48721");
  });

  afterEach(() => {
    auth.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logout clears credentials and notifies the backend when a token exists", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "t", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    const callsBefore = fetchMock.mock.calls.length;
    const postLogout = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);
    fetchMock.mockImplementation(postLogout);
    await auth.logout();
    expect(postLogout).toHaveBeenCalled();
    expect(await secrets.get(SECRET_ACCESS)).toBeUndefined();
    expect(auth.getTokenSync()).toBe("");
    expect(auth.currentState).toBe("UNAUTHENTICATED");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("logout skips the backend call when no token is cached", async () => {
    await auth.logout();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
  });

  it("logout still clears local state when the backend call fails", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "t", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    fetchMock.mockRejectedValue(new Error("logout failure"));
    await auth.logout();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
    expect(await secrets.get(SECRET_ACCESS)).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("emits AUTHENTICATING then AUTHENTICATED on every login", async () => {
    const states: AuthState[] = [];
    auth.onStateChange((s) => states.push(s));
    fetchMock.mockResolvedValue(okJson({ token: "t", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    await auth.login("user2", "pass2");
    expect(states).toEqual(["AUTHENTICATING", "AUTHENTICATED", "AUTHENTICATING", "AUTHENTICATED"]);
    expect(await auth.getLastUsername()).toBe("user2");
  });

  describe("listSsoProviders", () => {
    it("returns enabled providers from /auth/sso/providers", async () => {
      const providers = [
        { provider_id: "google-1", provider_type: "google", name: "Google", login_ui_html: "" },
        { provider_id: "github-1", provider_type: "github", name: "GitHub", login_ui_html: "" },
      ];
      fetchMock.mockResolvedValue(okJson({ providers }));
      const result = await auth.listSsoProviders();
      expect(fetchMock).toHaveBeenCalledWith("http://backend:48721/auth/sso/providers");
      expect(result).toEqual(providers);
    });

    it("filters out malformed entries missing provider_type", async () => {
      fetchMock.mockResolvedValue(okJson({ providers: [
        { provider_id: "ok", provider_type: "google", name: "Google" },
        { provider_id: "bad", name: "NoType" },
      ] }));
      const result = await auth.listSsoProviders();
      expect(result).toHaveLength(1);
      expect(result[0].provider_type).toBe("google");
    });

    it("returns [] on non-ok response (non-fatal)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
      expect(await auth.listSsoProviders()).toEqual([]);
    });

    it("returns [] on network error (non-fatal)", async () => {
      fetchMock.mockRejectedValue(new Error("offline"));
      expect(await auth.listSsoProviders()).toEqual([]);
    });
  });

  describe("loginSso", () => {
    it("rejects an invalid provider key without changing state", async () => {
      await expect(auth.loginSso("bad/provider")).rejects.toThrow(AuthError);
      expect(auth.currentState).toBe("UNAUTHENTICATED");
    });

    it("loginEntra delegates to loginSso('entra')", async () => {
      // Spy on loginSso to confirm the alias forwards the provider key.
      const spy = vi.spyOn(auth, "loginSso").mockResolvedValue();
      await auth.loginEntra();
      expect(spy).toHaveBeenCalledWith("entra");
    });
  });

  // ─── SA4E-362 UT-12: concurrent refresh dedupe (refreshInFlight — FR-1) ───
  describe("SA4E-362 UT-12 — concurrent refresh dedupe", () => {
    it("dedupes 2 parallel getAccessToken() calls into exactly 1 POST /api/auth/refresh", async () => {
      // Arrange: login với token ĐÃ hết hạn → getAccessToken sẽ vào nhánh refresh.
      fetchMock.mockResolvedValue(okJson({ token: "expired-tok", expiresAt: new Date(Date.now() - 3600_000).toISOString() }));
      await auth.login("user1", "pass1");
      fetchMock.mockClear();
      // Refresh call → fresh token.
      fetchMock.mockResolvedValue(okJson({ token: "fresh-tok", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));

      // Act: 2 getAccessToken song song (2 caller gặp 401 cùng lúc).
      const [t1, t2] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);

      // Assert: đúng 1 fetch /api/auth/refresh (dedupe refreshInFlight — không thundering herd).
      const refreshCalls = fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes("/api/auth/refresh"));
      expect(refreshCalls.length).toBe(1);
      expect(t1).toBe("fresh-tok");
      expect(t2).toBe("fresh-tok"); // cả 2 resolve 'fresh-tok'
    });
  });
});
