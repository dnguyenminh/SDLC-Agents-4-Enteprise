/**
 * admin/db/audit.ts — Audit log recording and retrieval.
 * SA4E-50: All functions are async; use getAdminAdapter() for multi-DB support.
 */

import * as crypto from 'crypto';
import type { AuditEntry } from '../types/rbac.types.js';
import { getAdminAdapter } from './core.js';

/** Map a raw DB row to a typed AuditEntry. */
function rowToAudit(r: Record<string, unknown>): AuditEntry {
  return {
    auditId: r.audit_id as string,
    userId: r.user_id as string,
    username: r.username as string,
    action: r.action as string,
    resource: r.resource as string,
    resourceId: r.resource_id as string,
    changes: r.changes as string,
    timestamp: r.timestamp as string,
    ipAddress: r.ip_address as string,
  };
}

/**
 * Record an audit log entry.
 * Fire-and-forget: errors are silently ignored to avoid blocking request flow.
 */
export async function recordAudit(
  userId: string,
  username: string,
  action: string,
  resource: string,
  resourceId?: string,
  changes?: string,
  ip?: string,
): Promise<void> {
  const adapter = getAdminAdapter();
  const auditId = 'aud-' + crypto.randomUUID().slice(0, 8);
  await adapter.runAsync(
    `INSERT INTO audit_log (audit_id, user_id, username, action, resource, resource_id, changes, timestamp, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [auditId, userId, username, action, resource, resourceId || '', changes || '', new Date().toISOString(), ip || ''],
  );
}

/**
 * Retrieve paginated audit log entries with optional filters.
 * @returns Paginated result with items and total count
 */
export async function getAuditLogs(
  filters?: { userId?: string; action?: string; dateFrom?: string; dateTo?: string },
  page = 1,
  pageSize = 50,
): Promise<{ items: AuditEntry[]; total: number }> {
  const adapter = getAdminAdapter();
  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.userId) { where += ' AND user_id = ?'; params.push(filters.userId); }
  if (filters?.action) { where += ' AND action = ?'; params.push(filters.action); }
  if (filters?.dateFrom) { where += ' AND timestamp >= ?'; params.push(filters.dateFrom); }
  if (filters?.dateTo) { where += ' AND timestamp <= ?'; params.push(filters.dateTo); }

  const countRow = await adapter.getAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM audit_log ${where}`, params,
  );
  const total = countRow?.cnt ?? 0;

  const rows = await adapter.allAsync<Record<string, unknown>>(
    `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  return { total, items: rows.map(rowToAudit) };
}

/**
 * Get the N most recent audit entries for the activity feed.
 * @param limit - Max entries to return (default 10)
 */
export async function getRecentActivity(limit = 10): Promise<AuditEntry[]> {
  const adapter = getAdminAdapter();
  const rows = await adapter.allAsync<Record<string, unknown>>(
    'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?', [limit],
  );
  return rows.map(rowToAudit);
}
