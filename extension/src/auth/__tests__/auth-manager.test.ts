/**
 * Unit tests for AuthManager — token lifecycle, login, token access/refresh.
 * (Split from auth-manager.test.ts — lifecycle/token concern; logout + SSO +
 * concurrent-refresh dedupe live in auth-manager.logout-sso.test.ts.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthManager } from "../AuthManager";
import type { AuthState } from "../AuthManager";

const SECRET_ACCESS = "sdlcAgents.accessToken";
const SECRET_USER = "sdlcAgents.lastUsername";

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

  it("getLastUsername migrates a legacy kiroSdlc.lastUsername on read", async () => {
    // Seed only the pre-rename key; getLastUsername must read it AND copy it forward.
    await secrets.store("kiroSdlc.lastUsername", "legacy-user");
    expect(await auth.getLastUsername()).toBe("legacy-user");
    expect(await secrets.get(SECRET_USER)).toBe("legacy-user");
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
});
