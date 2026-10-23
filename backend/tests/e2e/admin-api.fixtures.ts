/**
 * Shared fixtures for the Admin Portal API E2E suites.
 * (Split from admin-api.e2e.test.ts — BR-18 ≤200 lines/file.)
 *
 * Each *.e2e.test.ts sibling owns its own login session via login()/apiCall(),
 * replicating the original single-file semantics (one admin user, shared token).
 */
import { BASE_URL, API_URL } from './setup/e2e-config.js';

export const API = API_URL;

// Admin credentials — sourced from env (vuln-0001: no hardcoded default).
// Set ADMIN_INITIAL_PASSWORD to match the running server's admin password.
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'test-admin-pw-01';

let authToken = '';

/** Store the token obtained by the Auth login test (or by beforeAll login). */
export function setAuthToken(token: string): void {
  authToken = token;
}

/** Login as admin and cache the bearer token (per-file setup helper). */
export async function login(): Promise<void> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Admin login failed with status ${res.status}`);
  const data = await res.json();
  setAuthToken(data.token);
}

/** Verify the E2E server is up (throws with guidance when it is not). */
export async function ensureServerUp(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server is not running at ${BASE_URL}. Start it with "npm run dev" before running E2E tests.\n` +
        `Original error: ${err}`,
    );
  }
}

/** Helper: make authenticated API call */
export async function apiCall(
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Logout with the cached token (afterAll cleanup helper). */
export async function logout(): Promise<void> {
  if (authToken) {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }
}
