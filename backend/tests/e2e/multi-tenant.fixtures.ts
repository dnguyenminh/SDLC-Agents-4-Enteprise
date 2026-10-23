/**
 * Shared E2E fixtures for multi-tenant isolation tests — KSA-285.
 *
 * The original single-file suite passed state (tokens/group ids) between
 * describe blocks. The split files each own an isolated tenant fixture
 * (unique username/group suffix) so they can run independently:
 *  - multi-tenant.setup.test.ts            → setup + cleanup assertions
 *  - multi-tenant.endpoint-permissions.*   → own fixture
 *  - multi-tenant.roledata.test.ts         → own fixture
 *  - multi-tenant.isolation-audit.test.ts  → own fixture
 *
 * Run: npm run test:e2e-api
 */
import { BASE_URL, API_URL } from './setup/e2e-config.js';

const API = API_URL;

// Admin credentials — sourced from env (vuln-0001: no hardcoded default).
// Set ADMIN_INITIAL_PASSWORD to match the running server's admin password.
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'test-admin-pw-01';

export interface TenantFixture {
  adminToken: string;
  viewer1Token: string;
  editor1Token: string;
  viewer1UserId: string;
  editor1UserId: string;
  limitedViewersGroupId: string;
  fullEditorsGroupId: string;
  apiCall(path: string, options?: RequestInit, token?: string): Promise<{ status: number; data: any }>;
}

/** Helper: make API call with specific token (defaults to the fixture admin token). */
async function apiCallWith(adminToken: string, path: string, options: RequestInit = {}, token?: string) {
  const useToken = token !== undefined ? token : adminToken;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(useToken ? { Authorization: `Bearer ${useToken}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function assertServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server is not running at ${BASE_URL}. Start with "npm run dev" before E2E tests.\n${err}`,
    );
  }
}

/** Login as admin and return the opaque session token. */
export async function loginAdmin(): Promise<string> {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const loginData = await loginRes.json();
  if (!loginData.token) throw new Error('Admin login failed — cannot build tenant fixture');
  return loginData.token;
}

/** apiCall bound to a specific default (admin) token — original suite semantics. */
export function apiCallAs(adminToken: string) {
  return (path: string, options: RequestInit = {}, token?: string) =>
    apiCallWith(adminToken, path, options, token);
}

export { assertServerUp };

/** Create groups + users + tokens for an isolated tenant (unique suffix per file). */
export async function createTenantFixture(suffix: string): Promise<TenantFixture> {
  await assertServerUp();

  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  const loginData = await loginRes.json();
  const adminToken = loginData.token;
  if (!adminToken) throw new Error('Admin login failed — cannot build tenant fixture');

  const apiCall = (path: string, options: RequestInit = {}, token?: string) =>
    apiCallWith(adminToken, path, options, token);

  const viewer1User = `viewer1-${suffix}`;
  const editor1User = `editor1-${suffix}`;
  const limitedGroup = `limited-viewers-${suffix}`;
  const fullGroup = `full-editors-${suffix}`;

  const g1 = await apiCall('/rbac/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: limitedGroup,
      permissions: [
        { name: 'KB_READ', roleData: { allowedTiers: ['USER'] } },
        { name: 'DASHBOARD_VIEW', roleData: {} },
      ],
    }),
  });
  const limitedViewersGroupId = g1.data?.group?.id || g1.data?.group?.accessGroupId;

  const g2 = await apiCall('/rbac/groups', {
    method: 'POST',
    body: JSON.stringify({
      name: fullGroup,
      permissions: [
        { name: 'KB_READ', roleData: {} },
        { name: 'KB_WRITE', roleData: {} },
        { name: 'CONFIG_EDIT', roleData: { readOnly: true } },
        { name: 'MCP_ACCESS', roleData: { allowedServers: ['atlassian'] } },
        { name: 'SEARCH_EXPLORE', roleData: {} },
      ],
    }),
  });
  const fullEditorsGroupId = g2.data?.group?.id || g2.data?.group?.accessGroupId;

  const u1 = await apiCall('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: viewer1User,
      password: 'viewer1pass',
      email: `${viewer1User}@test.com`,
      accessGroupId: limitedViewersGroupId,
    }),
  });
  const viewer1UserId = u1.data?.user?.userId;

  const u2 = await apiCall('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: editor1User,
      password: 'editor1pass',
      email: `${editor1User}@test.com`,
      accessGroupId: fullEditorsGroupId,
    }),
  });
  const editor1UserId = u2.data?.user?.userId;

  const l1 = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: viewer1User, password: 'viewer1pass' }),
  });
  const viewer1Token = (await l1.json()).token;

  const l2 = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: editor1User, password: 'editor1pass' }),
  });
  const editor1Token = (await l2.json()).token;

  return {
    adminToken, viewer1Token, editor1Token,
    viewer1UserId, editor1UserId,
    limitedViewersGroupId, fullEditorsGroupId,
    apiCall,
  };
}

/** Delete the fixture's users and groups (best effort — mirrors cleanup describe). */
export async function cleanupTenantFixture(fx: TenantFixture): Promise<void> {
  await fx.apiCall('/auth/logout', { method: 'POST' }, fx.viewer1Token);
  await fx.apiCall('/auth/logout', { method: 'POST' }, fx.editor1Token);
  await fx.apiCall(`/users/${fx.viewer1UserId}`, { method: 'DELETE' });
  await fx.apiCall(`/users/${fx.editor1UserId}`, { method: 'DELETE' });
  await fx.apiCall(`/rbac/groups/${fx.limitedViewersGroupId}`, { method: 'DELETE' });
  await fx.apiCall(`/rbac/groups/${fx.fullEditorsGroupId}`, { method: 'DELETE' });
}
