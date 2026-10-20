/**
 * Unit tests — jwt-auth middleware (SA4E-30/50, SEC-03, SR-01).
 * This file: config helpers + verifyJwtToken / claim helpers.
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

describe('jwt config helpers', () => {
  afterEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
  });

  it('validateJwtConfig throws when auth required but secret missing', async () => {
    process.env.CODE_INTEL_REQUIRE_AUTH = 'true';
    delete (process.env as any).KB_TOKEN_SECRET;
    const { validateJwtConfig } = await loadAuthModule();
    expect(() => validateJwtConfig()).toThrow(/KB_TOKEN_SECRET/);
  });

  it('validateJwtConfig passes when auth disabled without secret', async () => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
    const { validateJwtConfig, isJwtAuthRequired } = await loadAuthModule();
    expect(() => validateJwtConfig()).not.toThrow();
    expect(isJwtAuthRequired()).toBe(false);
  });

  it('isJwtAuthRequired reflects CODE_INTEL_REQUIRE_AUTH=true', async () => {
    process.env.CODE_INTEL_REQUIRE_AUTH = 'true';
    process.env.KB_TOKEN_SECRET = 's';
    const { isJwtAuthRequired } = await loadAuthModule();
    expect(isJwtAuthRequired()).toBe(true);
  });
});

describe('verifyJwtToken & claim helpers', () => {
  beforeEach(() => {
    process.env.CODE_INTEL_REQUIRE_AUTH = 'true';
    process.env.KB_TOKEN_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete (process.env as any).CODE_INTEL_REQUIRE_AUTH;
    delete (process.env as any).KB_TOKEN_SECRET;
  });

  it('verifyJwtToken returns valid for a signed, non-expired JWT', async () => {
    const { verifyJwtToken } = await loadAuthModule();
    const token = makeJwt({ sub: 'u', pid: 'p' }, 'test-secret');
    const result = await verifyJwtToken(token);
    expect(result.valid).toBe(true);
    expect(result.payload).toMatchObject({ sub: 'u', pid: 'p' });
  });

  it('verifyJwtToken rejects non-JWT tokens', async () => {
    const { verifyJwtToken } = await loadAuthModule();
    const result = await verifyJwtToken('session-abc');
    expect(result).toEqual({ valid: false, payload: null });
  });

  it('verifyJwtToken rejects a bad signature', async () => {
    const { verifyJwtToken } = await loadAuthModule();
    const token = makeJwt({ sub: 'u' }, 'wrong-secret');
    expect((await verifyJwtToken(token)).valid).toBe(false);
  });

  it('verifyJwtToken rejects an expired JWT', async () => {
    const { verifyJwtToken } = await loadAuthModule();
    const token = makeJwt({ sub: 'u' }, 'test-secret', true);
    expect((await verifyJwtToken(token)).valid).toBe(false);
  });

  it('verifyJwtToken rejects JWT when secret not configured (SR-01)', async () => {
    delete (process.env as any).KB_TOKEN_SECRET;
    const { verifyJwtToken } = await loadAuthModule();
    const token = makeJwt({ sub: 'u' }, 'anything');
    expect((await verifyJwtToken(token)).valid).toBe(false);
  });

  it('allowedProjectsFromClaims merges pid and pids claims', async () => {
    const { allowedProjectsFromClaims } = await loadAuthModule();
    const projects = allowedProjectsFromClaims({ pid: 'p1', pids: ['p2', 'p3', 42, '', 'p4'] });
    expect(projects).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('allowedProjectsFromClaims handles missing/invalid claims', async () => {
    const { allowedProjectsFromClaims } = await loadAuthModule();
    expect(allowedProjectsFromClaims({})).toEqual([]);
    expect(allowedProjectsFromClaims({ pid: 'x' })).toEqual(['x']);
    expect(allowedProjectsFromClaims({ pids: ['y'] })).toEqual(['y']);
  });
});
