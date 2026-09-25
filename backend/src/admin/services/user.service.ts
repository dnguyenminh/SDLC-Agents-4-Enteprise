// KSA-286: User Service
import { AdminUser, AdminErrorCode, PaginatedResult, PaginationParams } from '../types/admin.types.js';
import { randomUUID } from 'crypto';
import { hash as bcryptHash } from 'bcrypt';

export class UserService {
  constructor(private db: any) {}

  list(filters: { status?: string; search?: string }, pagination: PaginationParams): PaginatedResult<AdminUser> {
    let where = '1=1'; const params: any[] = [];
    if (filters.status) { where += ' AND status = ?'; params.push(filters.status); }
    if (filters.search) { where += ' AND (username LIKE ? OR email LIKE ?)'; params.push('%'+filters.search+'%', '%'+filters.search+'%'); }
    const total = this.db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE ${where}`).get(...params)?.cnt || 0;
    const offset = (pagination.page - 1) * pagination.size;
    const rows = this.db.prepare(`SELECT * FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pagination.size, offset);
    return { items: rows.map((r: any) => ({ userId: r.user_id, username: r.username, email: r.email, status: r.status, accessGroupId: r.access_group_id, forcePasswordChange: !!r.force_password_change, createdAt: r.created_at, lastLogin: r.last_login })), pagination: { page: pagination.page, size: pagination.size, total, totalPages: Math.ceil(total / pagination.size), hasNext: offset + pagination.size < total, hasPrev: pagination.page > 1 } };
  }

  async create(data: { username: string; email: string; password: string; accessGroupId: string }): Promise<AdminUser> {
    if (this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(data.username)) throw { code: AdminErrorCode.DUPLICATE_USERNAME };
    if (this.db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) throw { code: AdminErrorCode.DUPLICATE_EMAIL };
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(data.password)) throw { code: AdminErrorCode.WEAK_PASSWORD };
    const userId = randomUUID();
    const hash = await bcryptHash(data.password, 10);
    this.db.prepare('INSERT INTO users (user_id, username, email, password_hash, access_group_id) VALUES (?, ?, ?, ?, ?)').run(userId, data.username, data.email, hash, data.accessGroupId);
    return { userId, username: data.username, email: data.email, status: 'ACTIVE', accessGroupId: data.accessGroupId, forcePasswordChange: false, createdAt: new Date().toISOString() };
  }

  updateStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): { sessionsTerminated: number } {
    this.db.prepare('UPDATE users SET status = ? WHERE user_id = ?').run(status, userId);
    if (status === 'DISABLED') { const r = this.db.prepare('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1').run(userId); return { sessionsTerminated: r.changes }; }
    return { sessionsTerminated: 0 };
  }

  delete(userId: string): void {
    const user = this.db.prepare('SELECT access_group_id FROM users WHERE user_id = ?').get(userId);
    if (!user) throw { code: AdminErrorCode.ENTRY_NOT_FOUND };
    const group = this.db.prepare('SELECT is_system_group FROM access_groups WHERE access_group_id = ?').get(user.access_group_id);
    if (group?.is_system_group) { const cnt = this.db.prepare('SELECT COUNT(*) as c FROM users WHERE access_group_id = ?').get(user.access_group_id)?.c; if (cnt <= 1) throw { code: AdminErrorCode.LAST_SYSTEM_OWNER }; }
    this.db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
  }

  forceLogout(userId: string, sessionId?: string): { terminated: number } {
    const r = sessionId ? this.db.prepare('UPDATE sessions SET is_active = 0 WHERE session_id = ? AND user_id = ?').run(sessionId, userId) : this.db.prepare('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1').run(userId);
    return { terminated: r.changes };
  }

  async resetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const temp = randomUUID().replace(/-/g, '').slice(0, 16);
    const hash = await bcryptHash(temp, 10);
    this.db.prepare('UPDATE users SET password_hash = ?, force_password_change = 1 WHERE user_id = ?').run(hash, userId);
    return { temporaryPassword: temp };
  }
}

