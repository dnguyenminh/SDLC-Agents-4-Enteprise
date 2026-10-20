/**
 * SA4E-337-QA-001 (CRITICAL) regression + SA4E-337-QA-002 (MAJOR) coverage.
 *
 * Root cause: handleIngestDocsFromTemp called `mem.getDispatcher()` — a method that
 * does NOT exist on MemoryModule → "mem.getDispatcher is not a function" → HTTP 500.
 * Fix: use `mem.getToolHandlers().get('mem_ingest_file')` (scoped withScopeContext
 * wrapper) so project_id is injected from the trusted tenant scope.
 *
 * This file: happy path + args contract + 503 + empty staging.
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
  okResult,
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

  // SA4E-337-QA-002 — happy path: 200 { ingested, errors, total } via getToolHandlers()
  it('happy path: 200 {ingested, errors, total} when handler ingests all staged files', async () => {
    const handler = vi.fn(async (args: Record<string, unknown>) => okResult(String(args.file_path)));
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue(makeMemoryModule(handler));

    const res = await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': projectId },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ingested).toBe(2);
    expect(body.errors).toBe(0);
    expect(body.total).toBe(2);
    expect(body.failedFiles).toEqual([]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  // SA4E-337-QA-002 — args contract: type/tags/scope/content_base64 + tenant scope keys
  it('passes SA4E-337 args (type, tags, scope, content_base64) + tenant scope to the handler', async () => {
    const handler = vi.fn(async (args: Record<string, unknown>) => okResult(String(args.file_path)));
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue(makeMemoryModule(handler));

    await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': projectId },
      body: JSON.stringify({}),
    });

    expect(handler).toHaveBeenCalledTimes(2);
    const calls = handler.mock.calls.map((c: any[]) => c[0] as Record<string, unknown>);
    const brdCall = calls.find((a) => String(a.file_path).endsWith('BRD.md'))!;
    expect(brdCall).toBeDefined();
    // Bug #1: type derived from path
    expect(brdCall.type).toBe('REQUIREMENT');
    // Bug #2: tags extracted from path segment SA4E-337
    expect(String(brdCall.tags)).toContain('sa4e');
    expect(String(brdCall.tags)).toContain('sa4e-337');
    // Contract fields
    expect(brdCall.scope).toBe('PROJECT');
    expect(typeof brdCall.content_base64).toBe('string');
    expect(String(brdCall.content_base64).length).toBeGreaterThan(0);
    // Tenant scope — withScopeContext() reads these → project_id NOT NULL
    expect(brdCall.__projectId).toBe(projectId);
    expect(brdCall.__userId).toBe(userId);
    expect(brdCall._projectContext).toMatchObject({ userId, projectId });
    // Bug #4: .drawio file also ingested with CONTEXT type
    const drawioCall = calls.find((a) => String(a.file_path).endsWith('.drawio'))!;
    expect(drawioCall).toBeDefined();
    expect(drawioCall.type).toBe('CONTEXT');
  });

  // Missing mem_ingest_file handler → 503 with enriched envelope
  it('503 enriched when mem_ingest_file tool handler is unavailable', async () => {
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue({ status: 'ready', getToolHandlers: () => new Map() });

    const res = await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': projectId },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe('Memory module not ready');
    expect(body.details).toContain('mem_ingest_file');
    expect(body.action).toBeDefined();
  });

  // Empty staging area → early 200 (no handler required)
  it('returns {ingested:0, message} when temp folder missing', async () => {
    fs.rmSync(tempBase, { recursive: true, force: true });
    const { app, registry } = makeApp();
    (registry.getModule as any).mockReturnValue({ status: 'ready', getToolHandlers: () => new Map() });

    const res = await app.request('/api/index/ingest-docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': projectId },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ingested).toBe(0);
    expect(body.message).toBe('No documents in Temp folder');
  });
});
