/**
 * Shared fixtures for api-index route tests.
 * NOTE: vi.mock declarations live in each test file (they must be hoisted
 * there); this helper resolves the SAME mocked modules via that registry.
 */
import { vi } from 'vitest';
import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { registerIndexRoutes } from '../api-index';
import { validateSession } from '../../../admin/db/sessions.js';
import { getUserPermissions } from '../../../admin/admin-db.js';
import { verifyJwtToken, allowedProjectsFromClaims } from '../../middleware/jwt-auth.js';

export const mockValidateSession = vi.mocked(validateSession);
export const mockGetUserPermissions = vi.mocked(getUserPermissions);
export const mockVerifyJwtToken = vi.mocked(verifyJwtToken);
export const mockAllowedProjects = vi.mocked(allowedProjectsFromClaims);

/** Default: fully permissioned opaque-session caller (keeps pre-SEC tests green). */
export function mockGrantedCaller() {
  mockGetUserPermissions.mockResolvedValue([
    { permissionId: 'KB_WRITE', roleData: {} },
    { permissionId: 'GRAPH_MAINTAIN', roleData: {} },
  ] as any);
  mockVerifyJwtToken.mockResolvedValue({ valid: false, payload: null });
  mockAllowedProjects.mockReturnValue([]);
}

export function makeApp() {
  const app = new Hono();
  const registry = { getModule: vi.fn() } as any;
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any;
  registerIndexRoutes(app, registry, logger);
  return { app, registry, logger };
}

/** Memory module mock that mimics MemoryModule — NO getDispatcher() method (root cause guard). */
export function makeMemoryModule(handler: ReturnType<typeof vi.fn>) {
  return {
    status: 'ready',
    getToolHandlers: () => new Map([['mem_ingest_file', handler]]),
    // NOTE: intentionally NO getDispatcher — mirrors the real MemoryModule API surface.
  };
}

/** ToolResult for a successful ingest (matches handleIngestFile success JSON). */
export function okResult(file: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'ingested', entries: 1, file }) }], isError: false };
}

export function seedTempDocs(tempBase: string) {
  fs.rmSync(tempBase, { recursive: true, force: true });
  fs.mkdirSync(path.join(tempBase, 'SA4E-337'), { recursive: true });
  fs.writeFileSync(path.join(tempBase, 'SA4E-337', 'BRD.md'), '# Requirements\ncontent');
  fs.writeFileSync(path.join(tempBase, 'SA4E-337', 'diagram.drawio'), '<mxGraphModel></mxGraphModel>');
}

// ============================================================
// Shared fixtures for enrichment-status-routes tests (SA4E-157/338)
// ============================================================

import { createHmac } from 'crypto';
import type { Logger } from 'pino';
import pino from 'pino';
import type { TaskWorker } from '../../../modules/memory/task-queue/TaskWorker.js';

export const ES_TEST_SECRET = 'test-secret';
export const esLogger: Logger = pino({ level: 'silent' });

/** Mint an HS256 JWT matching jwt-auth verifyHs256 (pattern from jwt-auth tests). */
export function makeJwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })).toString('base64url');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const sig = createHmac('sha256', ES_TEST_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

/** Admin JWT — identity only (SA4E-338 rev B: scope comes from X-Project-Id header). */
export function adminJwt(): string {
  return makeJwt({ sub: 'admin-1', username: 'admin' });
}

/** Auth headers with a project scope (rev B default) plus any extras. */
export function authHeaders(jwt: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, 'X-Project-Id': 'proj-A', ...extra };
}

/** Auth headers carrying only the Bearer token — no project scope header. */
export function authHeadersNoScope(jwt: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${jwt}`, ...extra };
}

/** Build a fake repo with all methods the route touches. */
export function makeFakeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getStatsByProject: vi.fn().mockResolvedValue({ pending: 1, processing: 2, completed: 3, failed: 0 }),
    getEarliestActiveTimestamp: vi.fn().mockResolvedValue('2026-01-01T00:00:00.000Z'),
    listProcessing: vi.fn().mockResolvedValue([{ id: 1, source: 'src/a.ts', startedAt: '2026-01-01T00:00:00.000Z' }]),
    listFailed: vi.fn().mockResolvedValue([
      { id: 2, payload: JSON.stringify({ symbolName: 'fooFn' }), error: 'boom' },
    ]),
    listFailedDetailed: vi.fn().mockResolvedValue([
      { id: 2, source: 'fooFn', error: 'boom', retryCount: 3, completedAt: '2026-01-02T00:00:00.000Z' },
    ]),
    reconcileOrphans: vi.fn().mockResolvedValue(0),
    retryAllFailed: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

/** Build a fake TaskWorker wrapping the given repo. */
export function makeFakeTaskWorker(repo: any, statsOverride?: any): TaskWorker {
  return {
    getRepository: () => repo,
    getProgress: () => ({ file: 'src/a.ts' }),
    getConcurrency: () => 8,
    getStats: vi.fn().mockResolvedValue(
      statsOverride ?? { pending: 1, processing: 2, completed: 3, failed: 0, isRunning: true, lastPollAt: null },
    ),
  } as unknown as TaskWorker;
}

export function makeRegistry(taskWorker: any): any {
  return { getModule: (name: string) => (name === 'memory' ? { taskWorker } : null) };
}
