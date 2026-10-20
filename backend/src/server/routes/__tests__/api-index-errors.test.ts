import { describe, it, expect, vi } from 'vitest';
import {
  registerIndexRoutes,
  indexError,
} from '../api-index';

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

describe('api-index error enrichment', () => {
  it('should register routes without error', () => {
    const app = { post: vi.fn(), get: vi.fn() } as any;
    const registry = { getModule: vi.fn() } as any;
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
    expect(() => registerIndexRoutes(app, registry, logger)).not.toThrow();
  });

  it('indexError returns enriched shape for PROJECT_REQUIRED', () => {
    const c = {
      json: vi.fn((body, status) => ({ body, status }))
    } as any;
    const logger = { error: vi.fn() } as any;
    const err = new Error('PROJECT_REQUIRED: missing header');
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('X-Project-Id required for indexing');
    expect(res.body.details).toContain('PROJECT_REQUIRED');
    expect(res.body.action).toBe('Provide X-Project-Id header');
  });

  it('indexError enriches ENOSPC', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const err = { message: 'no space', code: 'ENOSPC' };
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Disk full');
    expect(res.body.action).toBe('Free up disk space');
    expect(res.body.details).toBe('no space');
  });

  it('indexError enriches EACCES', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const err = { message: 'permission denied', code: 'EACCES' };
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Permission denied');
    expect(res.body.action).toBe('Check file permissions');
  });

  it('indexError caps details to 2000 chars', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const longMsg = 'a'.repeat(3000);
    const err = new Error(longMsg);
    const res = indexError(c, err, logger, 'test');
    expect(res.body.details.length).toBeLessThanOrEqual(2000);
  });

  // SA4E-300 GAP 5: default error maps to Retry
  it('indexError default maps to Retry action', () => {
    const c = { json: vi.fn((body, status) => ({ body, status })) } as any;
    const logger = { error: vi.fn() } as any;
    const err = new Error('something unexpected');
    const res = indexError(c, err, logger, 'test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal error');
    expect(res.body.action).toBe('Retry');
    expect(res.body.details).toBe('something unexpected');
  });
});
