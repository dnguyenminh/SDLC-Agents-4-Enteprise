/**
 * Unit Tests — admin-db.ts (KSA-285: Auth & Multitenant)
 * SA4E-50: All DB functions are now async — all calls must be awaited.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getUserByUsername,
  getUserPermissions,
  recordAudit,
  getAuditLogs,
  recordConfigChange,
  getConfigChanges,
  initAdapters,
} from '../admin-db.js';

// Await shared DB init (schema + admin seed) before any test touches the DB —
// getDbAdapter() inits fire-and-forget, so getUserByUsername('admin') would
// otherwise race seeding and return null.
beforeAll(async () => {
  await initAdapters();
});

// ============================================================
// 5. User Permissions
// ============================================================

describe('User Permissions', () => {
  it('getUserPermissions returns permissions for admin', async () => {
    const admin = await getUserByUsername('admin');
    const perms = await getUserPermissions(admin!.userId);
    expect(perms.length).toBeGreaterThan(5);
    expect(perms.some(p => p.permissionId === 'DASHBOARD_VIEW')).toBe(true);
    expect(perms.some(p => p.permissionId === 'USER_MANAGE')).toBe(true);
  });

  it('getUserPermissions returns empty for nonexistent user', async () => {
    const perms = await getUserPermissions('nonexistent-user-id');
    expect(perms).toEqual([]);
  });
});

// ============================================================
// 6. Audit Operations
// ============================================================

describe('Audit Operations', () => {
  const auditUserId = 'test-audit-user';
  const auditUsername = 'auditor';

  it('recordAudit creates audit entry', async () => {
    await recordAudit(auditUserId, auditUsername, 'TEST_ACTION', 'test-resource', 'res-001', '{"key":"value"}', '192.168.1.1');
    const logs = await getAuditLogs({ action: 'TEST_ACTION' });
    expect(logs.total).toBeGreaterThanOrEqual(1);
    const entry = logs.items.find(e => e.action === 'TEST_ACTION' && e.userId === auditUserId);
    expect(entry).toBeDefined();
    expect(entry!.username).toBe(auditUsername);
    expect(entry!.resource).toBe('test-resource');
  });

  it('getAuditLogs with action filter', async () => {
    await recordAudit(auditUserId, auditUsername, 'UNIQUE_ACTION_' + Date.now(), 'resource');
    const logs = await getAuditLogs({ action: 'TEST_ACTION' });
    expect(logs.items.every(e => e.action === 'TEST_ACTION')).toBe(true);
  });

  it('getAuditLogs with date range filter', async () => {
    const from = new Date(Date.now() - 60000).toISOString();
    const to = new Date(Date.now() + 60000).toISOString();
    await recordAudit(auditUserId, auditUsername, 'DATE_TEST', 'resource');
    const logs = await getAuditLogs({ dateFrom: from, dateTo: to });
    expect(logs.total).toBeGreaterThanOrEqual(1);
  });

  it('getAuditLogs supports pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await recordAudit(auditUserId, auditUsername, 'PAGINATE_TEST', 'resource', `item-${i}`);
    }
    const page1 = await getAuditLogs({ action: 'PAGINATE_TEST' }, 1, 2);
    expect(page1.items.length).toBeLessThanOrEqual(2);
    expect(page1.total).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
// 7. Config Change Tracking
// ============================================================

describe('Config Change Tracking', () => {
  it('recordConfigChange stores config change', async () => {
    await recordConfigChange('server', 'port', '48721', '48722', 'admin', true);
    const changes = await getConfigChanges(5);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const portChange = changes.find(c => c.key === 'port' && c.newValue === '48722');
    expect(portChange).toBeDefined();
    expect(portChange!.section).toBe('server');
    expect(portChange!.oldValue).toBe('48721');
    expect(portChange!.changedBy).toBe('admin');
    expect(portChange!.requiresRestart).toBe(true);
  });

  it('getConfigChanges respects limit', async () => {
    for (let i = 0; i < 3; i++) {
      await recordConfigChange('test', `key${i}`, null, `val${i}`, 'admin', false);
    }
    const changes = await getConfigChanges(2);
    expect(changes.length).toBeLessThanOrEqual(2);
  });
});
