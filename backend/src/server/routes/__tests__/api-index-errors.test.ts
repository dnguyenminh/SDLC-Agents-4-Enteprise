import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  registerIndexRoutes,
  indexError,
  sanitizePathSegment,
  resolveSafeTargetPath,
  resolveIndexTempBase,
} from '../api-index';
import { summarizeIngestResult, inferTypeFromPath, extractTagsFromPath } from '../api-index-ingest';

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

import { validateSession } from '../../../admin/db/sessions.js';
import { getUserPermissions } from '../../../admin/admin-db.js';
import { verifyJwtToken, allowedProjectsFromClaims } from '../../middleware/jwt-auth.js';

const mockValidateSession = vi.mocked(validateSession);
const mockGetUserPermissions = vi.mocked(getUserPermissions);
const mockVerifyJwtToken = vi.mocked(verifyJwtToken);
const mockAllowedProjects = vi.mocked(allowedProjectsFromClaims);

/** Default: fully permissioned opaque-session caller (keeps pre-SEC tests green). */
function mockGrantedCaller() {
  mockGetUserPermissions.mockResolvedValue([
    { permissionId: 'KB_WRITE', roleData: {} },
    { permissionId: 'GRAPH_MAINTAIN', roleData: {} },
  ] as any);
  mockVerifyJwtToken.mockResolvedValue({ valid: false, payload: null });
  mockAllowedProjects.mockReturnValue([]);
}

function makeApp() {
  const app = new Hono();
  const registry = { getModule: vi.fn() } as any;
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
  registerIndexRoutes(app, registry, logger);
  return { app, registry, logger };
}

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

describe('api-index routes — SA4E-300 GAP 5 (400/401/429/rejectedReasons)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
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

  it('rejectedReasons per-file: ../evil.ts + absolute path rejected with EACCES', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'testuser', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'gap5proj' },
      body: JSON.stringify({
        files: [
          { path: '../evil.ts', content: 'bad' },
          { path: '/abs/path.ts', content: 'bad' },
          { path: 'ok.ts', content: 'hello' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.rejected).toContain('../evil.ts');
    expect(body.rejected).toContain('/abs/path.ts');
    expect(body.rejectedReasons).toHaveLength(2);
    for (const r of body.rejectedReasons) {
      expect(r.code).toBe('EACCES');
      expect(r.message).toBeDefined();
    }
    expect(body.indexed).toBe(1);
  });

  it('writeFilesPhase escape via normalize (a/../../evil.ts) still blocked', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'testuser', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const res = await app.request('/api/index/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'gap5proj2' },
      body: JSON.stringify({ files: [{ path: 'a/../../evil.ts', content: 'bad' }] }),
    });
    const body = await res.json() as any;
    expect(body.rejected).toContain('a/../../evil.ts');
    expect(body.rejectedReasons[0].code).toBe('EACCES');
    expect(body.indexed).toBe(0);
  });

  it('429 when exceeding INDEX_CONCURRENCY_LIMIT (4 parallel /api/index/source)', async () => {
    mockValidateSession.mockResolvedValue({ userId: 'u429', username: 'u', accessGroupId: 'g' } as any);
    const { app } = makeApp();
    const payload = (n: number) => ({
      method: 'POST' as const,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good', 'X-Project-Id': 'p429' },
      body: JSON.stringify({ files: [{ path: `f${n}.ts`, content: 'x' }] }),
    });
    const results = await Promise.all([
      app.request('/api/index/source', payload(1)),
      app.request('/api/index/source', payload(2)),
      app.request('/api/index/source', payload(3)),
      app.request('/api/index/source', payload(4)),
    ]);
    const statuses = results.map((r) => r.status);
    // At least the 4th concurrent request must be back-pressured
    expect(statuses).toContain(429);
    const idx = statuses.indexOf(429);
    const body = await results[idx].json() as any;
    expect(body.error).toBe('Server busy');
    expect(body.details).toContain('3');
    expect(body.action).toBeDefined();
  }, 15000);
});

describe('SA4E-300 GAP 1 helpers', () => {
  it('sanitizePathSegment strips unsafe chars and falls back', () => {
    expect(sanitizePathSegment('../../etc', 'local-dev')).toBe('....etc');
    expect(sanitizePathSegment('', 'local-dev')).toBe('local-dev');
    expect(sanitizePathSegment('..', 'default')).toBe('default');
    expect(sanitizePathSegment('user@example.com', 'local-dev')).toBe('userexample.com');
    expect(sanitizePathSegment('proj-123_abc.def', 'default')).toBe('proj-123_abc.def');
  });

  it('resolveIndexTempBase uses cross-platform base (not hardcoded Windows)', () => {
    const base = resolveIndexTempBase('u1', 'p1', 'batch-docs');
    expect(base).not.toContain('C:\\projects\\kiro\\Temp');
    expect(base.endsWith(path.join('u1', 'p1', 'batch-docs'))).toBe(true);
  });

  it('resolveSafeTargetPath blocks traversal, absolute, backslash, encoded, drive', () => {
    const tempBase = path.join(os.tmpdir(), 'CodeIntel', 'u', 'p', 'batch-docs');
    expect(resolveSafeTargetPath(tempBase, '../evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '/abs/evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '..\\evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'a/../../evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '%2e%2e/evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'C:\\evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'C:/evil.ts')).toBeNull();
    const ok = resolveSafeTargetPath(tempBase, 'docs/ok.md');
    expect(ok).not.toBeNull();
    expect(path.relative(tempBase, ok as string).startsWith('..')).toBe(false);
  });
});

describe('SA4E-300 SEC High #1 (BOLA) + High #2 (sync RBAC)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
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

/**
 * SA4E-337-QA-001 (CRITICAL) regression + SA4E-337-QA-002 (MAJOR) coverage.
 *
 * Root cause: handleIngestDocsFromTemp called `mem.getDispatcher()` — a method that
 * does NOT exist on MemoryModule → "mem.getDispatcher is not a function" → HTTP 500.
 * Fix: use `mem.getToolHandlers().get('mem_ingest_file')` (scoped withScopeContext
 * wrapper) so project_id is injected from the trusted tenant scope.
 */
describe('SA4E-337-QA-001: /api/index/ingest-docs uses mem_ingest_file tool handler', () => {
  const userId = 'qa337-user';
  const projectId = 'qa337-proj';
  const tempBase = resolveIndexTempBase(userId, projectId, 'batch-docs');

  /** Memory module mock that mimics MemoryModule — NO getDispatcher() method (root cause guard). */
  function makeMemoryModule(handler: ReturnType<typeof vi.fn>) {
    return {
      status: 'ready',
      getToolHandlers: () => new Map([['mem_ingest_file', handler]]),
      // NOTE: intentionally NO getDispatcher — mirrors the real MemoryModule API surface.
    };
  }

  /** ToolResult for a successful ingest (matches handleIngestFile success JSON). */
  function okResult(file: string) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'ingested', entries: 1, file }) }], isError: false };
  }

  function seedTempDocs() {
    fs.rmSync(tempBase, { recursive: true, force: true });
    fs.mkdirSync(path.join(tempBase, 'SA4E-337'), { recursive: true });
    fs.writeFileSync(path.join(tempBase, 'SA4E-337', 'BRD.md'), '# Requirements\ncontent');
    fs.writeFileSync(path.join(tempBase, 'SA4E-337', 'diagram.drawio'), '<mxGraphModel></mxGraphModel>');
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mockValidateSession.mockReset();
    mockGrantedCaller();
    mockValidateSession.mockResolvedValue({ userId, username: 'u', accessGroupId: 'g' } as any);
    seedTempDocs();
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

describe('api-index-ingest helpers (SA4E-337)', () => {
  it('inferTypeFromPath maps BRD/FSD/TDD/STP patterns', () => {
    expect(inferTypeFromPath('docs/SA4E-1/BRD.md')).toBe('REQUIREMENT');
    expect(inferTypeFromPath('docs/FSD-embedded.md')).toBe('REQUIREMENT');
    expect(inferTypeFromPath('docs/TDD.md')).toBe('ARCHITECTURE');
    expect(inferTypeFromPath('docs/STP.md')).toBe('PROCEDURE');
    expect(inferTypeFromPath('docs/RUN-LOG.md')).toBe('PROCEDURE');
    expect(inferTypeFromPath('docs/diagram.drawio')).toBe('CONTEXT');
    expect(inferTypeFromPath('docs/notes.txt')).toBe('CONTEXT');
  });

  it('extractTagsFromPath extracts SA4E / feature tags from segments', () => {
    expect(extractTagsFromPath('documents/SA4E-337/BRD.md')).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337']));
    expect(extractTagsFromPath('C:\\ws\\F3\\TDD.md')).toEqual(expect.arrayContaining(['feature', 'f3']));
    expect(extractTagsFromPath('docs/plain.md')).toEqual([]);
  });

  it('summarizeIngestResult classifies ok / Error / isError / unconvertible', () => {
    // Success JSON from handleIngestFile
    expect(summarizeIngestResult({ content: [{ type: 'text', text: '{"status":"ingested"}' }], isError: false }))
      .toEqual({ ok: true, reason: '' });
    // Unconvertible payload (TDD §3.2 failedFiles reason "no-tool")
    expect(summarizeIngestResult({ content: [{ type: 'text', text: '{"status":"unconvertible","reason":"no-tool"}' }], isError: false }))
      .toEqual({ ok: false, reason: 'no-tool' });
    // String error result (handler returned, not thrown)
    expect(summarizeIngestResult({ content: [{ type: 'text', text: 'Error: file not found — /x' }], isError: false }))
      .toEqual({ ok: false, reason: 'file not found — /x' });
    // withErrorHandling wrapped throw → isError envelope
    expect(summarizeIngestResult({ content: [{ type: 'text', text: 'Error: ENOSPC' }], isError: true }))
      .toEqual({ ok: false, reason: 'ENOSPC' });
    // Empty result
    expect(summarizeIngestResult(null).ok).toBe(false);
  });
});
