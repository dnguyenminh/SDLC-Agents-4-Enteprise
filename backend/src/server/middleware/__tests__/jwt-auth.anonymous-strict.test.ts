/**
 * Unit tests — jwt-auth middleware (SA4E-30/50, SEC-03, SR-01).
 * This file: anonymous (non-strict) mode + jwtAuthStrict.
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

describe('jwtAuth (anonymous mode)', () => {
  beforeEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    process.env.KB_TOKEN_SECRET = 'test-secret';
    mockValidateSession.mockReset();
    mockCreateProjectContext.mockReset();
  });

  afterEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
  });

  it('allows anonymous access with no Authorization header', async () => {
    const { jwtAuth } = await loadAuthModule();
    const headers = { 'X-Project-Id': 'proj-1' };
    const { c } = makeContext(headers);
    const next = vi.fn();
    await jwtAuth(c, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectContext).toHaveBeenCalledWith('proj-1', 'anonymous');
  });

  it('treats an invalid signature JWT as anonymous in non-strict mode', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-1' }, 'wrong-secret');
    const { c } = makeContext({ Authorization: `Bearer ${token}` });
    await jwtAuth(c, vi.fn());
    expect(mockCreateProjectContext).toHaveBeenCalledWith('', 'anonymous');
  });

  it('treats an expired JWT as anonymous in non-strict mode', async () => {
    const { jwtAuth } = await loadAuthModule();
    const token = makeJwt({ sub: 'user-1' }, 'test-secret', true);
    const { c } = makeContext({ Authorization: `Bearer ${token}` });
    await jwtAuth(c, vi.fn());
    expect(mockCreateProjectContext).toHaveBeenCalledWith('', 'anonymous');
  });
});

describe('jwtAuthStrict', () => {
  beforeEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    process.env.KB_TOKEN_SECRET = 'test-secret';
    mockValidateSession.mockReset();
    mockCreateProjectContext.mockReset();
  });

  afterEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
  });

  it('requires a token even when global auth is disabled', async () => {
    const { jwtAuthStrict } = await loadAuthModule();
    const res = await jwtAuthStrict(makeContext({ 'X-Project-Id': 'p-1' }).c, vi.fn()) as any;
    expect(res.status).toBe(401);
  });
});
