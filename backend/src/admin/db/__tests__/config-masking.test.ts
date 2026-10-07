/**
 * SA4E-338 S4 — config history read path masks secret rows (D-SEC-06; STC UT-57/IT-18).
 * getConfigChanges() is the single source for both GET /api/admin/config (history field)
 * and GET /api/admin/config/history — masking here covers both endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAdapter } = vi.hoisted(() => ({
  mockAdapter: { allAsync: vi.fn(), getAsync: vi.fn(), runAsync: vi.fn() },
}));
vi.mock('../core.js', () => ({ getDbAdapter: () => mockAdapter }));

import { getConfigChanges } from '../config.js';

beforeEach(() => {
  mockAdapter.allAsync.mockReset();
  mockAdapter.runAsync.mockReset();
});

describe('getConfigChanges masking (S4)', () => {
  it('masks old/new values for secret keys and leaves non-secret rows raw', async () => {
    mockAdapter.allAsync.mockResolvedValue([
      { id: 3, section: 'llm', key: 'apiKey', old_value: 'sk-old-1', new_value: 'sk-live-abc123', changed_by: 'admin', changed_at: 't3', requires_restart: 0 },
      { id: 2, section: 'auth', key: 'entraClientSecret', old_value: 'sec-a', new_value: 'sec-b', changed_by: 'admin', changed_at: 't2', requires_restart: 0 },
      { id: 1, section: 'llm', key: 'model', old_value: 'm1', new_value: 'm2', changed_by: 'admin', changed_at: 't1', requires_restart: 0 },
    ]);

    const history = await getConfigChanges(10);

    expect(history[0]).toMatchObject({ key: 'apiKey', oldValue: '***', newValue: '***' });
    expect(history[1]).toMatchObject({ key: 'entraClientSecret', oldValue: '***', newValue: '***' });
    expect(history[2]).toMatchObject({ key: 'model', oldValue: 'm1', newValue: 'm2' });
    const dump = JSON.stringify(history);
    expect(dump).not.toContain('sk-live-abc123');
    expect(dump).not.toContain('sk-old-1');
    expect(dump).not.toContain('sec-b');
  });

  it('returns an empty history when the table is unavailable', async () => {
    mockAdapter.allAsync.mockRejectedValue(new Error('no table'));
    expect(await getConfigChanges()).toEqual([]);
  });
});
