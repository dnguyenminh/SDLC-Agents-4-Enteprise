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

import { mockValidateSession, mockGrantedCaller, makeApp } from './helpers.js';

describe('api-index routes — SA4E-300 GAP 5 (400/401/429/rejectedReasons)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
    clearIndexPermissionCache(); // permission cache must not leak across tests
    mockGrantedCaller();
  });

  it('401 when Authorization header missing', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('Unauthorized');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('401 when Bearer token invalid/expired (validateSession null)', async () => {
    mockValidateSession.mockResolvedValue(null);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer expired-token' },
      body: JSON.stringify({ files: [] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('Unauthorized');
    expect(body.details).toContain('Authorization');
  });

  it('400 when files array missing on /api/index/documents', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('files array required');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('400 when files array missing on /api/index/source', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p1' },
      body: JSON.stringify({ nope: 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('400 with details on sync-pega when projectId missing', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/sync-pega-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('projectId is required');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });

  it('503 with details on sync-pega when memory module not ready', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u1', username: 'u', accessGroupId: 'g' } as any);
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue({ status: 'starting' });
    const res = await app.request('/api/index/sync-pega-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good' },
      body: JSON.stringify({ projectId: 'proj-x' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe('Memory module not ready');
    expect(body.details).toBeDefined();
    expect(body.action).toBeDefined();
  });
});
