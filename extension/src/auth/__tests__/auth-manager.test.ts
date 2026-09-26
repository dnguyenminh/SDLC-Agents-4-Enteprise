/**
 * Unit tests for AuthManager — token lifecycle, login/logout, refresh, state transitions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthManager, AuthError } from "../AuthManager";
import type { AuthState } from "../AuthManager";

const SECRET_ACCESS = "kiroSdlc.accessToken";
const SECRET_USER = "kiroSdlc.lastUsername";

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

  it("starts unauthenticated", () => {
    expect(auth.currentState).toBe("UNAUTHENTICATED");
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.getTokenSync()).toBe("");
  });

  it("initialize stays unauthenticated even with stored token (explicit login required)", async () => {
    await secrets.store(SECRET_ACCESS, "stored-tok");
    await auth.initialize();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
    expect(auth.getTokenSync()).toBe("");
  });

  it("initialize stays unauthenticated without a stored token", async () => {
    await auth.initialize();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
  });

  it("login transitions through AUTHENTICATING to AUTHENTICATED", async () => {
    const states: AuthState[] = [];
    auth.onStateChange((s) => states.push(s));
    fetchMock.mockResolvedValue(okJson({ token: "tok-abc", user: { name: "u" }, expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    expect(states).toEqual(["AUTHENTICATING", "AUTHENTICATED"]);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.getTokenSync()).toBe("tok-abc");
    expect(await auth.getLastUsername()).toBe("user1");
    expect(await secrets.get(SECRET_ACCESS)).toBe("tok-abc");
  });

  it("login rejects with AuthError and returns to UNAUTHENTICATED on bad credentials", async () => {
    const states: AuthState[] = [];
    auth.onStateChange((s) => states.push(s));
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "invalid creds" } as unknown as Response);
    await expect(auth.login("user1", "wrong")).rejects.toThrow("Login failed (401): invalid creds");
    expect(auth.currentState).toBe("UNAUTHENTICATED");
    expect(states).toEqual(["AUTHENTICATING", "UNAUTHENTICATED"]);
  });

  it("login rejects with AuthError when backend is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(auth.login("user1", "pass1")).rejects.toThrow("Cannot reach backend: socket hang up");
    expect(auth.currentState).toBe("UNAUTHENTICATED");
  });

  it("getAccessToken returns null when not authenticated", async () => {
    await expect(auth.getAccessToken()).resolves.toBeNull();
  });

  it("getAccessToken returns token when authenticated via login", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "tok", user: { name: "u" }, expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    await expect(auth.getAccessToken()).resolves.toBe("tok");
  });

  it("getAccessToken flags state UNAUTHENTICATED when stored token disappears", async () => {
    await secrets.store(SECRET_ACCESS, "ghost");
    await auth.initialize();
    await secrets.delete(SECRET_ACCESS);
    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
  });

  it("getAccessToken refreshes and returns the new token when expired", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "expired-tok", expiresAt: new Date(Date.now() - 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    fetchMock.mockResolvedValue(okJson({ token: "fresh-tok", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    const token = await auth.getAccessToken();
    expect(token).toBe("fresh-tok");
    expect(auth.getTokenSync()).toBe("fresh-tok");
    expect(await secrets.get(SECRET_ACCESS)).toBe("fresh-tok");
  });

  it("refreshToken keeps session on network failure and warns", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "t", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    fetchMock.mockRejectedValue(new Error("network down"));
    (auth as unknown as { tokenExpiresAt: number | null }).tokenExpiresAt = Date.now() - 1;
    await auth.refreshToken();
    expect(auth.currentState).toBe("AUTHENTICATED");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to refresh token"),
      expect.anything()
    );
  });

  it("refreshToken transitions to UNAUTHENTICATED on 401 response", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "t", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    await auth.refreshToken();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
  });

  it("refreshToken stores the new token on success", async () => {
    fetchMock.mockResolvedValue(okJson({ token: "old", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.login("user1", "pass1");
    fetchMock.mockResolvedValue(okJson({ token: "renewed", expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
    await auth.refreshToken();
    expect(auth.getTokenSync()).toBe("renewed");
    expect(await secrets.get(SECRET_ACCESS)).toBe("renewed");
  });

  it("refreshToken without a cached token transitions to UNAUTHENTICATED", async () => {
    await auth.refreshToken();
    expect(auth.currentState).toBe("UNAUTHENTICATED");
    expect(fetchMock).not.toHaveBeenCalled();
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
});