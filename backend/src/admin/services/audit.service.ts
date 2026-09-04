// KSA-286: Audit Service
import { AuditEntry, PaginatedResult, PaginationParams } from '../types/admin.types.js';

export class AuditService {
  constructor(private db: any) {}

  record(entry: Omit<AuditEntry, 'auditId' | 'timestamp'>): void {
    this.db.prepare('INSERT INTO audit_entries (audit_id, user_id, username, action, resource, resource_id, changes, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), entry.userId, entry.username, entry.action, entry.resource, entry.resourceId || null, entry.changes ? JSON.stringify(entry.changes) : null, entry.ipAddress || null);
  }

  list(filters: { userId?: string; action?: string; dateFrom?: string; dateTo?: string }, pagination: PaginationParams): PaginatedResult<AuditEntry> {
    let where = '1=1'; const params: any[] = [];
    if (filters.userId) { where += ' AND user_id = ?'; params.push(filters.userId); }
    if (filters.action) { where += ' AND action = ?'; params.push(filters.action); }
    if (filters.dateFrom) { where += ' AND timestamp >= ?'; params.push(filters.dateFrom); }
    if (filters.dateTo) { where += ' AND timestamp <= ?'; params.push(filters.dateTo); }
    const total = this.db.prepare(`SELECT COUNT(*) as cnt FROM audit_entries WHERE ${where}`).get(...params)?.cnt || 0;
    const offset = (pagination.page - 1) * pagination.size;
    const rows = this.db.prepare(`SELECT * FROM audit_entries WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, pagination.size, offset);
    return { items: rows.map((r: any) => ({ auditId: r.audit_id, userId: r.user_id, username: r.username, action: r.action, resource: r.resource, resourceId: r.resource_id, changes: r.changes ? JSON.parse(r.changes) : undefined, timestamp: r.timestamp, ipAddress: r.ip_address })), pagination: { page: pagination.page, size: pagination.size, total, totalPages: Math.ceil(total / pagination.size), hasNext: offset + pagination.size < total, hasPrev: pagination.page > 1 } };
  }

  export(format: 'csv' | 'json', dateFrom: string, dateTo: string): string {
    const rows = this.db.prepare('SELECT * FROM audit_entries WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC').all(dateFrom, dateTo);
    if (format === 'json') return JSON.stringify(rows, null, 2);
    return 'audit_id,user_id,username,action,resource,resource_id,timestamp,ip_address\n' + rows.map((r: any) => `${r.audit_id},${r.user_id},${r.username},${r.action},${r.resource},${r.resource_id||''},${r.timestamp},${r.ip_address||''}`).join('\n');
  }
}

