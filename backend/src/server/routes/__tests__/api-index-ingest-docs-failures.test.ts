/**
 * SA4E-337-QA-001 (CRITICAL) regression + SA4E-337-QA-002 (MAJOR) coverage.
 * This file: failure paths — per-file error isolation (no HTTP 500).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { resolveIndexTempBase, clearIndexPermissionCache } from '../api-index';

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
  mockGrantedCaller,
  makeApp,
  makeMemoryModule,
  seedTempDocs,
} from './helpers.js';

const userId = 'qa337-user';
const projectId = 'qa337-proj';
const tempBase = resolveIndexTempBase(userId, projectId, 'batch-docs');

describe('SA4E-337-QA-001: /api/index/ingest-docs uses mem_ingest_file tool handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
    clearIndexPermissionCache(); // permission cache must not leak across tests
    mockGrantedCaller();
    mockValidateSession.mockResolvedValue({ userId, username: 'u', accessGroupId: 'g' } as any);
    seedTempDocs(tempBase);
  });

  afterEach(() => {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  // SA4E-337-QA-002 — handler failure surfaces in failedFiles + errors counter
  it('counts failed ingest (isError result) into errors/failedFiles', async () => {
    const handler = vi.fn(async (args: Record<string, unknown>) => ({
      content: [{ type: 'text' as const, text: 'Error: disk write failed' }],
      isError: true,
    }));
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue(makeMemoryModule(handler));

    const res = await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': projectId },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ingested).toBe(0);
    expect(body.errors).toBe(2);
    expect(body.total).toBe(2);
    expect(body.failedFiles).toHaveLength(2);
    expect(body.failedFiles[0].reason).toBe('disk write failed');
    expect(body.failedFiles[0].file).toBeDefined();
  });

  // SA4E-337-QA-001 — regression guard: handler throwing must NOT 500 the endpoint
  it('handler throwing is captured per-file (no 500) and reported in failedFiles', async () => {
    const handler = vi.fn(async () => { throw new Error('boom'); });
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue(makeMemoryModule(handler));

    const res = await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': projectId },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ingested).toBe(0);
    expect(body.errors).toBe(2);
    expect(body.failedFiles[0].reason).toBe('boom');
  });
});
