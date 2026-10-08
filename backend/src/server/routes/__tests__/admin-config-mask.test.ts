/**
 * SA4E-338 S4 — admin config route masking (D-SEC-06; STC UT-57, TC-SEC-12a/b).
 * Verifies secrets never leave via GET /api/admin/config, GET .../history, the PATCH
 * echo or the audit entry; and that Cache-Control: no-store is set on config reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';

const { mockGetConfigChanges, mockRecordConfigChange, mockRecordAudit, mockGetLatest, mockLoadPersisted } = vi.hoisted(() => ({
  mockGetConfigChanges: vi.fn().mockResolvedValue([]),
  mockRecordConfigChange: vi.fn().mockResolvedValue(undefined),
  mockRecordAudit: vi.fn().mockResolvedValue(undefined),
  mockGetLatest: vi.fn().mockResolvedValue(undefined),
  mockLoadPersisted: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../admin/admin-db.js', () => ({
  getConfigChanges: mockGetConfigChanges,
  recordConfigChange: mockRecordConfigChange,
  recordAudit: mockRecordAudit,
  getAuditLogs: vi.fn(),
  loadPersistedLLMConfig: mockLoadPersisted,
  getLatestConfigValue: mockGetLatest,
}));

import { createConfigRoutes } from '../admin/config.js';

const RAW_KEY = 'sk-live-abc123';
const RAW_ENTRA_SECRET = 'sec-live-1';

function makeCtx(overrides: Record<string, any> = {}): any {
  return {
    logger: pino({ level: 'silent' }),
    requireAuth: vi.fn().mockResolvedValue({ userId: 'u1', username: 'admin' }),
    requirePermission: vi.fn().mockResolvedValue({ roleData: {} }),
    configOverrides: {},
    RESTART_REQUIRED_KEYS: { llm: ['provider', 'baseUrl'], server: ['port'], auth: [] },
    getRequestProjectId: () => 'default',
    registry: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockGetConfigChanges.mockReset();
  mockGetConfigChanges.mockResolvedValue([]);
  mockRecordConfigChange.mockClear();
  mockRecordAudit.mockClear();
  mockGetLatest.mockReset();
  mockGetLatest.mockResolvedValue(undefined);
  mockLoadPersisted.mockReset();
  mockLoadPersisted.mockResolvedValue({});
});

describe('GET /api/admin/config (S4)', () => {
  it('masks runtime-override secrets and sets Cache-Control: no-store', async () => {
    const app = createConfigRoutes(makeCtx({
      configOverrides: { llm: { apiKey: RAW_KEY }, auth: { entraClientSecret: RAW_ENTRA_SECRET } },
    }));

    const res = await app.request('/api/admin/config');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.config.llm.apiKey).toBe('***');
    expect(body.config.auth.entraClientSecret).toBe('***');
    const dump = JSON.stringify(body);
    expect(dump).not.toContain(RAW_KEY);
    expect(dump).not.toContain(RAW_ENTRA_SECRET);
  });

  it('returns masked history entries with the config payload', async () => {
    mockGetConfigChanges.mockResolvedValue([
      { id: 1, section: 'llm', key: 'apiKey', oldValue: '***', newValue: '***', changedBy: 'admin', changedAt: 't', requiresRestart: false },
    ]);
    const app = createConfigRoutes(makeCtx());

    const res = await app.request('/api/admin/config');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history[0].newValue).toBe('***');
  });
});

describe('GET /api/admin/config/history (S4)', () => {
  it('sets Cache-Control: no-store and forwards the masked history', async () => {
    const app = createConfigRoutes(makeCtx());

    const res = await app.request('/api/admin/config/history');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mockGetConfigChanges).toHaveBeenCalledWith(20);
    expect((await res.json()).history).toEqual([]);
  });
});

describe('PATCH /api/admin/config/:section/:key (S4)', () => {
  it('llm.apiKey — audit and PATCH echo never contain the plaintext key', async () => {
    const ctx = makeCtx();
    const app = createConfigRoutes(ctx);

    const res = await app.request('/api/admin/config/llm/apiKey', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: RAW_KEY }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe('***');
    expect(JSON.stringify(body)).not.toContain(RAW_KEY);
    // Audit payload carries no plaintext secret.
    const auditChanges = mockRecordAudit.mock.calls[0][5] as string;
    expect(auditChanges).not.toContain(RAW_KEY);
    expect(auditChanges).toContain('***');
    // Override persistence call still happens (DB > env precedence source).
    expect(mockRecordConfigChange).toHaveBeenCalled();
  });

  it('auth.entraClientSecret — audit and PATCH echo are masked', async () => {
    const ctx = makeCtx();
    const app = createConfigRoutes(ctx);

    const res = await app.request('/api/admin/config/auth/entraClientSecret', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: RAW_ENTRA_SECRET }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe('***');
    const auditChanges = mockRecordAudit.mock.calls[0][5] as string;
    expect(auditChanges).not.toContain(RAW_ENTRA_SECRET);
  });

  it('non-secret keys keep their value in the echo and audit (control)', async () => {
    const ctx = makeCtx();
    const app = createConfigRoutes(ctx);

    const res = await app.request('/api/admin/config/llm/temperature', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 0.5 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe(0.5);
    const auditChanges = mockRecordAudit.mock.calls[0][5] as string;
    expect(auditChanges).toContain('0.5');
  });
});
