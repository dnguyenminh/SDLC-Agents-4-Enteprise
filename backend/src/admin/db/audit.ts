import * as crypto from 'crypto';
import type { AuditEntry } from '../types/rbac.types.js';
import { getAdminDb } from './core.js';

export function recordAudit(userId: string, username: string, action: string, resource: string, resourceId?: string, changes?: string, ip?: string): void {
  const d = getAdminDb();
  const auditId = 'aud-' + crypto.randomUUID().slice(0, 8);
  d.prepare(`INSERT INTO audit_log (audit_id, user_id, username, action, resource, resource_id, changes, timestamp, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    auditId, userId, username, action, resource, resourceId || '', changes || '', new Date().toISOString(), ip || ''
  );
}

export function getAuditLogs(filters?: { userId?: string; action?: string; dateFrom?: string; dateTo?: string }, page = 1, pageSize = 50): { items: AuditEntry[]; total: number } {
  const d = getAdminDb();
  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (filters?.userId) { where += ' AND user_id = ?'; params.push(filters.userId); }
  if (filters?.action) { where += ' AND action = ?'; params.push(filters.action); }
  if (filters?.dateFrom) { where += ' AND timestamp >= ?'; params.push(filters.dateFrom); }
  if (filters?.dateTo) { where += ' AND timestamp <= ?'; params.push(filters.dateTo); }

  const total = (d.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${where}`).get(...params) as { cnt: number }).cnt;
  const rows = d.prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];

  return {
    total,
    items: rows.map(r => ({
      auditId: r.audit_id, userId: r.user_id, username: r.username,
      action: r.action, resource: r.resource, resourceId: r.resource_id,
      changes: r.changes, timestamp: r.timestamp, ipAddress: r.ip_address,
    })),
  };
}

export function getRecentActivity(limit = 10): AuditEntry[] {
  const d = getAdminDb();
  const rows = d.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit) as Record<string, unknown>[];
  return rows.map(r => ({
    auditId: r.audit_id, userId: r.user_id, username: r.username,
    action: r.action, resource: r.resource, resourceId: r.resource_id,
    changes: r.changes, timestamp: r.timestamp, ipAddress: r.ip_address,
  }));
}
