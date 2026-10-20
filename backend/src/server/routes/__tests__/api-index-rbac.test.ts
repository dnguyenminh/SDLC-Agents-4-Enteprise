import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearIndexPermissionCache } from '../api-index';

vi.mock('../../../admin/db/sessions.js', () => ({
  validateSession: vi.fn(),
}));

vi.mock('../../../admin/admin-db.js', () => ({
  getUserPermissions: vi.fn(),
}));

vi.mock('../../middleware/jwt-auth.js', () => ({
  verifyJwtToken: vi.fn(),
  allowedProjectsFromClaims: vi.fn(),
}));

import {
  mockValidateSession,
  mockGetUserPermissions,
  mockVerifyJwtToken,
  mockAllowedProjects,
  mockGrantedCaller,
  makeApp,
} from './helpers.js';

describe('SA4E-300 SEC High #1 (BOLA) + High #2 (sync RBAC)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
    clearIndexPermissionCache(); // 'u1' is reused with different perms across tests
    mockGrantedCaller();
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
  });

  // STC: SEC — 403 enriched when caller lacks KB_WRITE (High #1 fallback gate)
  it('403 enriched on /api/index/documents when KB_WRITE missing', async () => {
    mockGetUserPermissions.mockResolvedValue([] as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({ files: [{ path: 'ok.ts', content: 'x' }] }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('Forbidden');
    expect(body.details).toContain('KB_WRITE');
    expect(body.action).toBeDefined();
  });

  // STC: SEC — 403 enriched on /api/index/source when KB_WRITE missing
  it('403 enriched on /api/index/source when KB_WRITE missing', async () => {
    mockGetUserPermissions.mockResolvedValue([] as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({ files: [{ path: 'ok.ts', content: 'x' }] }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('Forbidden');
    expect(body.details).toContain('KB_WRITE');
    expect(body.action).toBeDefined();
  });

  // STC: SEC — 403 enriched on /api/index/ingest-docs when KB_WRITE missing
  it('403 enriched on /api/index/ingest-docs when KB_WRITE missing', async () => {
    mockGetUserPermissions.mockResolvedValue([] as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('Forbidden');
    expect(body.details).toContain('KB_WRITE');
  });

  // STC: SEC — 403 enriched on sync-pega-rules when GRAPH_MAINTAIN missing (High #2)
  it('403 enriched on /api/index/sync-pega-rules when GRAPH_MAINTAIN missing', async () => {
    mockGetUserPermissions.mockResolvedValue([{ permissionId: 'KB_WRITE', roleData: {} }] as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/sync-pega-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good' },
      body: JSON.stringify({ projectId: 'proj-x' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('Forbidden');
    expect(body.details).toContain('GRAPH_MAINTAIN');
    expect(body.action).toBeDefined();
  });

  // STC: SEC — 202 background start preserved when GRAPH_MAINTAIN granted (High #2 pass path)
  it('202 on /api/index/sync-pega-rules when GRAPH_MAINTAIN granted', async () => {
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue({ status: 'ready', getEngine: () => ({}) });
    const res = await app.request('/api/index/sync-pega-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good' },
      body: JSON.stringify({ projectId: 'proj-ok' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.status).toBe('started');
    expect(body.projectId).toBe('proj-ok');
  });

  // STC: SEC — 403 when JWT grant does not include requested X-Project-Id (High #1 binding)
  it('403 enriched when X-Project-Id outside JWT grant', async () => {
    mockVerifyJwtToken.mockResolvedValue({ valid: true, payload: { sub: 'u1', pids: ['p-allowed'] } });
    mockAllowedProjects.mockReturnValue(['p-allowed']);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer jwt-token', 'X-Project-Id': 'p-other' },
      body: JSON.stringify({ files: [{ path: 'ok.ts', content: 'x' }] }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('Forbidden');
    expect(body.details).toContain('p-other');
    expect(body.action).toBeDefined();
  });

  // STC: SEC — 200 preserved when X-Project-Id inside JWT grant (High #1 pass path)
  it('200 on /api/index/documents when X-Project-Id inside JWT grant', async () => {
    mockVerifyJwtToken.mockResolvedValue({ valid: true, payload: { sub: 'u1', pids: ['p-allowed'] } });
    mockAllowedProjects.mockReturnValue(['p-allowed']);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer jwt-token', 'X-Project-Id': 'p-allowed' },
      body: JSON.stringify({ files: [{ path: 'ok.ts', content: 'hello' }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.indexed).toBe(1);
  });
});
