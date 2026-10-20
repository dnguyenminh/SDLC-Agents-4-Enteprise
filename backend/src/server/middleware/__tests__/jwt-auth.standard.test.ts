/**
 * Unit tests — jwt-auth middleware (SA4E-30/50, SEC-03, SR-01).
 * This file: jwtAuth standard (require-auth) mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

const mockCreateProjectContext = vi.fn(
  (projectId: string, userId: string, sessionId?: string, workspaceId?: string) =>
    ({ projectId, userId, sessionId, workspaceId }) as any,
);
const mockValidateSession = vi.fn();

vi.mock('../../../modules/memory/ProjectContext.js', () => ({
  createProjectContext: mockCreateProjectContext,
}));

vi.mock('../../../admin/admin-db.js', () => ({
  validateSession: mockValidateSession,
}));

function makeContext(headers: Record<string, string | undefined>) {
  const set = vi.fn();
  const json = vi.fn((body: unknown, status: number) => ({ body, status }));
  const c: any = {
    req: { header: (name: string) => headers[name] },
    set,
    json,
  };
  return { c, set, json };
}

function makeJwt(payload: Record<string, any>, secret: string, expired = false): string {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

async function loadAuthModule() {
  vi.resetModules();
  return await import('../jwt-auth.js');
}

describe('jwtAuth (standard mode)', () => {
  beforeEach(() => {
    process.env.CODE_INTEL_REQUIRE_AUTH = 'true';
    process.env.KB_TOKEN_SECRET = 'test-secret';
    mockValidateSession.mockReset();
    mockCreateProjectContext.mockReset();
  });

  afterEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
  });

  it('rejects requests with no Authorization header when auth required', async () => {
    const { jwtAuth } = await loadAuthModule();
    const headers = { 'X-Project-Id': 'proj-1' };
    const { c, json } = makeContext(headers);
    const next = vi.fn();
    const res = await jwtAuth(c, next);
    expect(json).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects empty Bearer token when auth required', async () => {
    const { jwtAuth } = await loadAuthModule();
    const headers = { 'X-Project-Id': 'proj-1', Authorization: 'Bearer    ' };
    const res = await jwtAuth(makeContext(headers).c, vi.fn()) as any;
    expect(res.status).toBe(401);
  });

  it('accepts a valid JWT and binds identity to X-Project-Id', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-1', wid: 'ws-1', pid: 'jwt-pid' }, 'test-secret');
    const headers = { 'X-Project-Id': 'proj-9', Authorization: `Bearer ${token}` };
    const { c, set } = makeContext(headers);
    const next = vi.fn();
    await jwtAuth(c, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectContext).toHaveBeenCalledWith('proj-9', 'user-1');
    expect(set).toHaveBeenCalledWith('projectContext', expect.objectContaining({ userId: 'user-1', projectId: 'proj-9' }));
  });

  it('falls back to payload pid when X-Project-Id header is absent', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-2', pid: 'pid-2' }, 'test-secret');
    const { c, set } = makeContext({ Authorization: `Bearer ${token}` });
    await jwtAuth(c, vi.fn());
    expect(set.mock.calls[0][1].projectId).toBe('pid-2');
  });

  it('rejects a JWT with an invalid signature when auth required', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-1' }, 'wrong-secret');
    const res = await jwtAuth(makeContext({ Authorization: `Bearer ${token}` }).c, vi.fn()) as any;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects an expired JWT when auth required', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-1' }, 'test-secret', true);
    const res = await jwtAuth(makeContext({ Authorization: `Bearer ${token}` }).c, vi.fn()) as any;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects a malformed JWT payload when auth required', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-1' }, 'test-secret');
    const padded = token.split('.').map((p, i) => (i === 1 ? '%%%not-json%%%' : p)).join('.');
    const res = await jwtAuth(makeContext({ Authorization: `Bearer ${padded}` }).c, vi.fn()) as any;
    expect(res.status).toBe(401);
  });

  it('accepts a valid admin session token and binds its userId', async () => {
    const { jwtAuth } = await loadAuthModule();
    mockValidateSession.mockResolvedValue({ userId: 'admin-7', username: 'boss', accessGroupId: 'g1' });
    const headers = { 'X-Project-Id': 'proj-3', Authorization: 'Bearer abc123' };
    const { c, set } = makeContext(headers);
    const next = vi.fn();
    await jwtAuth(c, next);
    expect(mockValidateSession).toHaveBeenCalledWith('abc123', undefined);
    expect(set.mock.calls[0][1].userId).toBe('admin-7');
    expect(set.mock.calls[0][1].projectId).toBe('proj-3');
  });

  it('rejects an unknown admin session token when auth required', async () => {
    const { jwtAuth } = await loadAuthModule();
    mockValidateSession.mockResolvedValue(null);
    const res = await jwtAuth(makeContext({ Authorization: 'Bearer nope' }).c, vi.fn()) as any;
    expect(res.status).toBe(401);
  });

  it('fails closed (401) when the session DB throws', async () => {
    const { jwtAuth } = await loadAuthModule();
    mockValidateSession.mockRejectedValue(new Error('db down'));
    const res = await jwtAuth(makeContext({ Authorization: 'Bearer session-1' }).c, vi.fn()) as any;
    expect(res.status).toBe(401);
    expect(mockCreateProjectContext).not.toHaveBeenCalled();
  });
});
