/**
 * Admin Portal SQLite Database Layer
 * Persistent storage for users, RBAC groups, sessions, and audit trail.
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { User, UserStatus, AccessGroup, GroupPermission, Session, AuditEntry } from './types/rbac.types.js';
import { loadConfig, getWorkspacePath } from '../config/BackendConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = loadConfig();

// DB location: .code-intel/admin.db (separate from index.db)
const DB_PATH = path.resolve(getWorkspacePath(), config.dataDir, 'admin.db');

function getIndexDbPath(): string {
  return path.resolve(getWorkspacePath(), config.dataDir, config.sqliteDbPath);
}

let db: Database.Database | null = null;

export function getAdminDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    seedDefaults(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      access_group_id TEXT NOT NULL,
      force_password_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS access_groups (
      access_group_id TEXT PRIMARY KEY,
      access_group_name TEXT UNIQUE NOT NULL,
      is_system_group INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_group_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      role_data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (access_group_id) REFERENCES access_groups(access_group_id) ON DELETE CASCADE,
      UNIQUE(access_group_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      device TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      login_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      audit_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT DEFAULT '',
      changes TEXT DEFAULT '',
      timestamp TEXT NOT NULL,
      ip_address TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS config_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      key TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      requires_restart INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_config_changes_time ON config_changes(changed_at);

    -- Graph visualization tables (spatial 3D positions for KB Graph)
    CREATE TABLE IF NOT EXISTS graph_nodes (
      entry_id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'DOCUMENT',
      tier TEXT NOT NULL DEFAULT 'SHARED',
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      z REAL NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 2,
      cluster_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      rel_type TEXT NOT NULL DEFAULT 'RELATED_TO',
      UNIQUE(source, target)
    );

    CREATE INDEX IF NOT EXISTS idx_graph_nodes_x ON graph_nodes(x);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_y ON graph_nodes(y);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_z ON graph_nodes(z);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_level ON graph_nodes(level);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_cluster ON graph_nodes(cluster_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_source_target ON graph_edges(source, target);
  `);
}

function seedDefaults(db: Database.Database): void {
  const groupExists = db.prepare('SELECT 1 FROM access_groups WHERE access_group_id = ?').get('grp-admin');
  if (!groupExists) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)`).run('grp-admin', 'Administrators', now, now);

    const allPerms = [
      'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
      'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
      'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW'
    ];
    const insertPerm = db.prepare('INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)');
    for (const perm of allPerms) {
      insertPerm.run('grp-admin', perm, '{}');
    }

    // Seed: Developers group
    db.prepare(`INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)`).run('grp-dev', 'Developers', now, now);
    const devPerms = ['DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'MCP_ACCESS', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW'];
    for (const perm of devPerms) {
      insertPerm.run('grp-dev', perm, '{}');
    }

    // Seed: Viewers group (read-only)
    db.prepare(`INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)`).run('grp-viewer', 'Viewers', now, now);
    const viewerPerms = ['DASHBOARD_VIEW', 'KB_READ', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW'];
    for (const perm of viewerPerms) {
      insertPerm.run('grp-viewer', perm, '{}');
    }

    // Seed: MCP Operators group
    db.prepare(`INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)`).run('grp-mcp-ops', 'MCP Operators', now, now);
    const mcpPerms = ['DASHBOARD_VIEW', 'MCP_ACCESS', 'MCP_MANAGE'];
    for (const perm of mcpPerms) {
      insertPerm.run('grp-mcp-ops', perm, '{}');
    }
  }

  const userExists = db.prepare('SELECT 1 FROM users WHERE username = ?').get('admin');
  if (!userExists) {
    const now = new Date().toISOString();
    // SECURITY (vuln-0001): never seed a hardcoded default password.
    // Use ADMIN_INITIAL_PASSWORD if provided; otherwise generate a strong
    // random password and print it once to the server log so the operator
    // can retrieve it. force_password_change = 1 forces a reset on first login.
    const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const initialPassword = envPassword && envPassword.length >= 12
      ? envPassword
      : crypto.randomBytes(18).toString('base64url');
    const hash = hashPassword(initialPassword);
    db.prepare(`INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'grp-admin', 1, ?)`).run('user-admin-001', 'admin', 'admin@localhost', hash, now);

    if (!envPassword) {
      // eslint-disable-next-line no-console
      console.warn(
        '\n============================================================\n' +
        '  ADMIN ACCOUNT CREATED — generated one-time password:\n' +
        `  username: admin\n  password: ${initialPassword}\n` +
        '  You MUST change this on first login. Set ADMIN_INITIAL_PASSWORD\n' +
        '  env var to control the initial password.\n' +
        '============================================================\n'
      );
    }
  }
}

// --- Password Hashing ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// --- Token Management ---

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(userId: string, device?: string, ip?: string): Session & { token: string } {
  const d = getAdminDb();
  const sessionId = 'sess-' + crypto.randomUUID().slice(0, 8);
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

  d.prepare(`INSERT INTO sessions (session_id, user_id, token, device, ip_address, login_at, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(
    sessionId, userId, token, device || '', ip || '', now.toISOString(), expires.toISOString()
  );

  return { sessionId, userId, token, device, ipAddress: ip, loginAt: now.toISOString(), expiresAt: expires.toISOString(), isActive: true };
}

export function validateSession(token: string): { userId: string; username: string; accessGroupId: string } | null {
  const d = getAdminDb();
  const row = d.prepare(`
    SELECT s.user_id, s.expires_at, s.is_active, u.username, u.access_group_id, u.status
    FROM sessions s JOIN users u ON s.user_id = u.user_id
    WHERE s.token = ?
  `).get(token) as any;

  if (!row) return null;
  if (!row.is_active) return null;
  if (row.status !== 'ACTIVE') return null;
  if (new Date(row.expires_at) < new Date()) {
    d.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?').run(token);
    return null;
  }

  return { userId: row.user_id, username: row.username, accessGroupId: row.access_group_id };
}

export function invalidateSession(token: string): void {
  const d = getAdminDb();
  d.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?').run(token);
}

export function invalidateUserSessions(userId: string): number {
  const d = getAdminDb();
  const result = d.prepare('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1').run(userId);
  return result.changes;
}

export function refreshSession(token: string): { token: string; expiresAt: string } | null {
  const d = getAdminDb();
  const row = d.prepare(`
    SELECT s.user_id, s.expires_at, s.is_active, u.status
    FROM sessions s JOIN users u ON s.user_id = u.user_id
    WHERE s.token = ?
  `).get(token) as any;

  if (!row) return null;
  if (!row.is_active) return null;
  if (row.status !== 'ACTIVE') return null;

  if (new Date(row.expires_at) < new Date()) {
    d.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?').run(token);
    return null;
  }

  const newToken = generateToken();
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  d.prepare('UPDATE sessions SET token = ?, expires_at = ? WHERE token = ?').run(newToken, newExpires, token);

  return { token: newToken, expiresAt: newExpires };
}


// --- User Operations ---

export function getUsers(filters?: { status?: string; search?: string; accessGroupId?: string }, page = 1, pageSize = 50): { items: any[]; total: number } {
  const d = getAdminDb();
  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (filters?.status) { where += ' AND u.status = ?'; params.push(filters.status); }
  if (filters?.accessGroupId) { where += ' AND u.access_group_id = ?'; params.push(filters.accessGroupId); }
  if (filters?.search) { where += ' AND (u.username LIKE ? OR u.email LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }

  const total = (d.prepare(`SELECT COUNT(*) as cnt FROM users u ${where}`).get(...params) as any).cnt;
  const rows = d.prepare(`SELECT u.*, g.access_group_name FROM users u LEFT JOIN access_groups g ON u.access_group_id = g.access_group_id ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as any[];

  return {
    total,
    items: rows.map(r => ({
      userId: r.user_id,
      username: r.username,
      email: r.email,
      status: r.status,
      accessGroupId: r.access_group_id,
      accessGroupName: r.access_group_name || '',
      forcePasswordChange: !!r.force_password_change,
      createdAt: r.created_at,
      lastLogin: r.last_login || undefined,
    })),
  };
}

export function getUserById(userId: string): User | null {
  const d = getAdminDb();
  const r = d.prepare('SELECT * FROM users WHERE user_id = ?').get(userId) as any;
  if (!r) return null;
  return {
    userId: r.user_id, username: r.username, email: r.email, status: r.status,
    accessGroupId: r.access_group_id, forcePasswordChange: !!r.force_password_change,
    createdAt: r.created_at, lastLogin: r.last_login || undefined,
  };
}

export function getUserByUsername(username: string): (User & { passwordHash: string }) | null {
  const d = getAdminDb();
  const r = d.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  if (!r) return null;
  return {
    userId: r.user_id, username: r.username, email: r.email, status: r.status,
    accessGroupId: r.access_group_id, forcePasswordChange: !!r.force_password_change,
    createdAt: r.created_at, lastLogin: r.last_login || undefined, passwordHash: r.password_hash,
  };
}

export function createUser(username: string, email: string, password: string, accessGroupId: string): User {
  const d = getAdminDb();
  const userId = 'user-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const hash = hashPassword(password);

  d.prepare(`INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, 1, ?)`).run(userId, username, email, hash, accessGroupId, now);

  return { userId, username, email, status: 'ACTIVE', accessGroupId, forcePasswordChange: true, createdAt: now };
}

export function updateUserStatus(userId: string, status: UserStatus): number {
  const d = getAdminDb();
  d.prepare('UPDATE users SET status = ? WHERE user_id = ?').run(status, userId);
  if (status === 'DISABLED') {
    return invalidateUserSessions(userId);
  }
  return 0;
}

export function deleteUser(userId: string): void {
  const d = getAdminDb();
  const user = d.prepare('SELECT username FROM users WHERE user_id = ?').get(userId) as any;
  if (user?.username === 'admin') throw new Error('Cannot delete system admin');
  invalidateUserSessions(userId);
  d.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
}

export function resetUserPassword(userId: string): string {
  const d = getAdminDb();
  const tempPwd = crypto.randomBytes(6).toString('base64url');
  const hash = hashPassword(tempPwd);
  d.prepare('UPDATE users SET password_hash = ?, force_password_change = 1 WHERE user_id = ?').run(hash, userId);
  return tempPwd;
}

export function changePassword(userId: string, newPassword: string): void {
  const d = getAdminDb();
  const hash = hashPassword(newPassword);
  d.prepare('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE user_id = ?').run(hash, userId);
}

export function updateLastLogin(userId: string): void {
  const d = getAdminDb();
  d.prepare('UPDATE users SET last_login = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
}

// --- RBAC Group Operations ---

export function getGroups(): AccessGroup[] {
  const d = getAdminDb();
  const groups = d.prepare('SELECT * FROM access_groups ORDER BY is_system_group DESC, access_group_name ASC').all() as any[];
  const permStmt = d.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?');

  return groups.map(g => {
    const perms = permStmt.all(g.access_group_id) as any[];
    return {
      accessGroupId: g.access_group_id,
      accessGroupName: g.access_group_name,
      isSystemGroup: !!g.is_system_group,
      permissions: perms.map(p => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') })),
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    };
  });
}

export function getGroupById(groupId: string): AccessGroup | null {
  const d = getAdminDb();
  const g = d.prepare('SELECT * FROM access_groups WHERE access_group_id = ?').get(groupId) as any;
  if (!g) return null;
  const perms = d.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?').all(groupId) as any[];
  return {
    accessGroupId: g.access_group_id, accessGroupName: g.access_group_name,
    isSystemGroup: !!g.is_system_group,
    permissions: perms.map(p => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') })),
    createdAt: g.created_at, updatedAt: g.updated_at,
  };
}

export function createGroup(name: string, permissions: GroupPermission[]): AccessGroup {
  const d = getAdminDb();
  const id = 'grp-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  d.prepare('INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, name, now, now);

  const insertPerm = d.prepare('INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)');
  for (const p of permissions) {
    insertPerm.run(id, p.permissionId, JSON.stringify(p.roleData || {}));
  }

  return { accessGroupId: id, accessGroupName: name, isSystemGroup: false, permissions, createdAt: now, updatedAt: now };
}

export function updateGroup(groupId: string, name: string | undefined, permissions: GroupPermission[]): AccessGroup {
  const d = getAdminDb();
  const existing = d.prepare('SELECT * FROM access_groups WHERE access_group_id = ?').get(groupId) as any;
  if (!existing) throw new Error('Group not found');

  const now = new Date().toISOString();
  if (name) {
    d.prepare('UPDATE access_groups SET access_group_name = ?, updated_at = ? WHERE access_group_id = ?').run(name, now, groupId);
  } else {
    d.prepare('UPDATE access_groups SET updated_at = ? WHERE access_group_id = ?').run(now, groupId);
  }

  d.prepare('DELETE FROM group_permissions WHERE access_group_id = ?').run(groupId);
  const insertPerm = d.prepare('INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)');
  for (const p of permissions) {
    insertPerm.run(groupId, p.permissionId, JSON.stringify(p.roleData || {}));
  }

  return getGroupById(groupId)!;
}

export function deleteGroup(groupId: string): void {
  const d = getAdminDb();
  const g = d.prepare('SELECT is_system_group FROM access_groups WHERE access_group_id = ?').get(groupId) as any;
  if (!g) throw new Error('Group not found');
  if (g.is_system_group) throw new Error('Cannot delete system group');

  const usersInGroup = d.prepare('SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?').get(groupId) as any;
  if (usersInGroup.cnt > 0) throw new Error('Cannot delete group with assigned users');

  d.prepare('DELETE FROM access_groups WHERE access_group_id = ?').run(groupId);
}

// --- User Permissions ---

export function getUserPermissions(userId: string): GroupPermission[] {
  const d = getAdminDb();
  const user = d.prepare('SELECT access_group_id FROM users WHERE user_id = ?').get(userId) as any;
  if (!user) return [];
  const perms = d.prepare('SELECT permission_id, role_data FROM group_permissions WHERE access_group_id = ?').all(user.access_group_id) as any[];
  return perms.map(p => ({ permissionId: p.permission_id, roleData: JSON.parse(p.role_data || '{}') }));
}

/** Returns the set of permission IDs granted by an access group. */
export function getGroupPermissionIds(groupId: string): string[] {
  const d = getAdminDb();
  const perms = d.prepare('SELECT permission_id FROM group_permissions WHERE access_group_id = ?').all(groupId) as any[];
  return perms.map(p => p.permission_id);
}

// --- Audit Operations ---

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

  const total = (d.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${where}`).get(...params) as any).cnt;
  const rows = d.prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as any[];

  return {
    total,
    items: rows.map(r => ({
      auditId: r.audit_id, userId: r.user_id, username: r.username,
      action: r.action, resource: r.resource, resourceId: r.resource_id,
      changes: r.changes, timestamp: r.timestamp, ipAddress: r.ip_address,
    })),
  };
}

// --- Session listing ---

export function getUserSessions(userId: string): Session[] {
  const d = getAdminDb();
  const rows = d.prepare('SELECT * FROM sessions WHERE user_id = ? AND is_active = 1 ORDER BY login_at DESC').all(userId) as any[];
  return rows.map(r => ({
    sessionId: r.session_id, userId: r.user_id,
    device: r.device, ipAddress: r.ip_address, loginAt: r.login_at,
    expiresAt: r.expires_at, isActive: !!r.is_active,
  }));
}

// --- Config Change Tracking ---

export interface ConfigChange {
  id: number;
  section: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  changedBy: string;
  changedAt: string;
  requiresRestart: boolean;
}

export function recordConfigChange(section: string, key: string, oldValue: string | null, newValue: string, changedBy: string, requiresRestart: boolean): void {
  const d = getAdminDb();
  d.prepare(`INSERT INTO config_changes (section, key, old_value, new_value, changed_by, changed_at, requires_restart) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    section, key, oldValue, newValue, changedBy, new Date().toISOString(), requiresRestart ? 1 : 0
  );
  // Keep only last 50 entries
  d.prepare(`DELETE FROM config_changes WHERE id NOT IN (SELECT id FROM config_changes ORDER BY changed_at DESC LIMIT 50)`).run();
}

export function getConfigChanges(limit = 10): ConfigChange[] {
  const d = getAdminDb();
  const rows = d.prepare('SELECT * FROM config_changes ORDER BY changed_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    section: r.section,
    key: r.key,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
    requiresRestart: !!r.requires_restart,
  }));
}

// --- Query Logs (STORY 4 — real query tracking) ---

export function initQueryLogsTable(): void {
  const d = getAdminDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      response_time_ms INTEGER NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      user_id TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp);
  `);
  // Migration: add user_id column if table already existed without it
  try {
    d.exec(`ALTER TABLE query_logs ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch { /* column already exists */ }
  // Create index on user_id (after migration ensures column exists)
  d.exec(`CREATE INDEX IF NOT EXISTS idx_query_logs_user_id ON query_logs(user_id);`);
}

export function recordQueryLog(query: string, responseTimeMs: number, resultCount: number, userId: string = ''): void {
  const d = getAdminDb();
  initQueryLogsTable();
  d.prepare('INSERT INTO query_logs (query, timestamp, response_time_ms, result_count, user_id) VALUES (?, ?, ?, ?, ?)').run(
    query, new Date().toISOString(), responseTimeMs, resultCount, userId
  );
}

export function getQueryLogs(days = 14, userId?: string): { date: string; queries: number; avgResponseTime: number }[] {
  const d = getAdminDb();
  initQueryLogsTable();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let sql = `
    SELECT 
      substr(timestamp, 1, 10) as date,
      COUNT(*) as queries,
      CAST(AVG(response_time_ms) AS INTEGER) as avg_response_time
    FROM query_logs
    WHERE timestamp >= ?`;
  const params: any[] = [since];
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  sql += `
    GROUP BY substr(timestamp, 1, 10)
    ORDER BY date ASC`;
  const rows = d.prepare(sql).all(...params) as any[];
  return rows.map(r => ({ date: r.date, queries: r.queries, avgResponseTime: r.avg_response_time }));
}

export function getQueryLogStats(userId?: string): { totalQueries: number; avgResponseTime: number; queriesLast24h: number } {
  const d = getAdminDb();
  initQueryLogsTable();
  const userFilter = userId ? ' WHERE user_id = ?' : '';
  const userFilterAnd = userId ? ' AND user_id = ?' : '';
  const totalParams = userId ? [userId] : [];
  const total = d.prepare(`SELECT COUNT(*) as cnt, CAST(AVG(response_time_ms) AS INTEGER) as avg FROM query_logs${userFilter}`).get(...totalParams) as any;
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const last24hParams = userId ? [since24h, userId] : [since24h];
  const last24h = (d.prepare(`SELECT COUNT(*) as cnt FROM query_logs WHERE timestamp >= ?${userFilterAnd}`).get(...last24hParams) as any).cnt;
  return { totalQueries: total.cnt || 0, avgResponseTime: total.avg || 0, queriesLast24h: last24h || 0 };
}

// --- Promotion Cooldown (STORY 11 — 7-day cooldown after rejection) ---

export function initPromotionCooldownTable(): void {
  const d = getAdminDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS promotion_cooldowns (
      entry_id TEXT NOT NULL,
      cooldown_until TEXT NOT NULL,
      rejected_at TEXT NOT NULL,
      rejected_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_promo_cooldown_entry ON promotion_cooldowns(entry_id);
  `);
}

export function setPromotionCooldown(entryId: string, rejectedBy: string): void {
  const d = getAdminDb();
  initPromotionCooldownTable();
  const cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  d.prepare('INSERT INTO promotion_cooldowns (entry_id, cooldown_until, rejected_at, rejected_by) VALUES (?, ?, ?, ?)').run(
    entryId, cooldownUntil, new Date().toISOString(), rejectedBy
  );
}

export function checkPromotionCooldown(entryId: string): { onCooldown: boolean; cooldownUntil?: string } {
  const d = getAdminDb();
  initPromotionCooldownTable();
  const now = new Date().toISOString();
  const row = d.prepare('SELECT cooldown_until FROM promotion_cooldowns WHERE entry_id = ? AND cooldown_until > ? ORDER BY cooldown_until DESC LIMIT 1').get(entryId, now) as any;
  if (row) return { onCooldown: true, cooldownUntil: row.cooldown_until };
  return { onCooldown: false };
}

// --- KB search with real index.db data (STORY 9) ---

export function searchKbEntries(query: string, projectId?: string): { items: any[]; total: number } {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return { items: [], total: 0 };
    const indexDb = new Database(indexDbPath, { readonly: true });

    // Check for knowledge_entries table (actual table name in index.db)
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (!tableExists || tableExists.cnt === 0) {
      indexDb.close();
      return { items: [], total: 0 };
    }

    // Tokenize query into words for TF-IDF scoring
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (queryTerms.length === 0) {
      indexDb.close();
      return { items: [], total: 0 };
    }

    // Get total document count for IDF calculation
    const totalDocs = (indexDb.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as any).cnt;

    // Use LIKE to get candidate rows matching any query term
    const searchCols = ['content', 'source', 'summary', 'tags'];
    const likeClauses: string[] = [];
    const likeParams: string[] = [];
    for (const term of queryTerms) {
      for (const col of searchCols) {
        likeClauses.push(`${col} LIKE ?`);
        likeParams.push(`%${term}%`);
      }
    }
    // Project isolation filter
    let projectFilter = '';
    const projectParams: string[] = [];
    if (projectId && projectId !== 'default') {
      projectFilter = " AND (scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR scope = 'USER')";
      projectParams.push(projectId);
    }
    const sql = `SELECT * FROM knowledge_entries WHERE (${likeClauses.join(' OR ')})${projectFilter} LIMIT 200`;
    const rows = indexDb.prepare(sql).all(...likeParams, ...projectParams) as any[];

    // Calculate document frequency for each query term across candidates
    const termDocFreq: Record<string, number> = {};
    for (const term of queryTerms) {
      let docCount = 0;
      for (const row of rows) {
        const text = `${row.content || ''} ${row.source || ''} ${row.summary || ''} ${row.tags || ''}`.toLowerCase();
        if (text.includes(term)) docCount++;
      }
      termDocFreq[term] = docCount;
    }

    // Score each row using TF-IDF + keyword/recency/quality bonuses
    const now = Date.now();
    const scoredRows = rows.map((row: any) => {
      const fields = {
        content: (row.content || '').toLowerCase(),
        source: (row.source || '').toLowerCase(),
        summary: (row.summary || '').toLowerCase(),
        tags: (row.tags || '').toLowerCase(),
      };
      const fullText = `${fields.content} ${fields.source} ${fields.summary} ${fields.tags}`;
      const totalWords = fullText.split(/\s+/).length || 1;

      // TF-IDF score
      let tfidfScore = 0;
      for (const term of queryTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        const occurrences = (fullText.match(regex) || []).length;
        const tf = occurrences / totalWords;
        const df = termDocFreq[term] || 1;
        const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
        tfidfScore += tf * idf;
      }
      // Normalize TF-IDF to 0-1 (empirical cap)
      const normalizedTfidf = Math.min(tfidfScore * 100, 1.0);

      // Keyword bonus: exact term in source/summary = high relevance
      let keywordBonus = 0;
      for (const term of queryTerms) {
        if (fields.source.includes(term)) keywordBonus += 0.15;
        if (fields.summary.includes(term)) keywordBonus += 0.1;
        if (fields.tags.includes(term)) keywordBonus += 0.05;
      }
      keywordBonus = Math.min(keywordBonus, 0.3);

      // Recency bonus: last 7 days = +0.2, last 30 days = +0.1
      let recencyBonus = 0;
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
      if (ageDays <= 7) recencyBonus = 0.2;
      else if (ageDays <= 30) recencyBonus = 0.1;

      // Quality bonus from entry's quality_score or confidence
      const qualityRaw = row.quality_score != null ? row.quality_score / 100 : (row.confidence || 0);
      const qualityBonus = qualityRaw * 0.1;

      const totalScore = normalizedTfidf + keywordBonus + recencyBonus + qualityBonus;
      const finalScore = Math.min(+totalScore.toFixed(3), 1.0);

      return {
        ...row,
        score: finalScore,
        scores: {
          similarity: +normalizedTfidf.toFixed(3),
          keyword: +keywordBonus.toFixed(3),
          recency: +recencyBonus.toFixed(3),
          quality: +qualityBonus.toFixed(3),
        },
      };
    });

    // Sort by score descending
    scoredRows.sort((a: any, b: any) => b.score - a.score);

    indexDb.close();
    return { items: scoredRows.slice(0, 50), total: scoredRows.length };
  } catch {
    return { items: [], total: 0 };
  }
}

// --- KB Embedding space from real vectors (STORY 4) ---

export function getKbEmbeddings(limit = 100): { items: { id: string; label: string; x: number; y: number; type: string }[]; hasRealData: boolean } {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return { items: [], hasRealData: false };
    const indexDb = new Database(indexDbPath, { readonly: true });

    // Check knowledge_entries table exists
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (!tableExists || tableExists.cnt === 0) {
      indexDb.close();
      return { items: [], hasRealData: false };
    }

    // Check if knowledge_vectors table exists (separate table for embeddings)
    const vectorsExist = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_vectors'").get() as any;

    if (vectorsExist && vectorsExist.cnt > 0) {
      // Join knowledge_entries with knowledge_vectors for real embedding-based projection
      const rows = indexDb.prepare(`
        SELECT e.id, e.source, e.summary, e.type, e.tier, v.vector
        FROM knowledge_entries e
        INNER JOIN knowledge_vectors v ON v.entry_id = e.id
        WHERE v.vector IS NOT NULL
        ORDER BY e.created_at DESC
        LIMIT ?
      `).all(limit) as any[];

      if (rows.length > 0) {
        const items = rows.map((row: any, i: number) => {
          let x = 0, y = 0;
          try {
            let embedding: number[] = [];
            if (typeof row.vector === 'string') {
              embedding = JSON.parse(row.vector);
            } else if (Buffer.isBuffer(row.vector)) {
              const buf = row.vector as Buffer;
              const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
              embedding = Array.from(floats);
            }

            if (embedding.length >= 2) {
              // PCA-like 2D projection: split vector in half, average each half
              const half = Math.floor(embedding.length / 2);
              let sumX = 0, sumY = 0;
              for (let j = 0; j < half; j++) {
                sumX += embedding[j];
                sumY += embedding[j + half];
              }
              x = sumX / half;
              y = sumY / half;
              // Normalize to 0-1
              x = +((x + 1) / 2).toFixed(3);
              y = +((y + 1) / 2).toFixed(3);
              x = Math.max(0, Math.min(1, x));
              y = Math.max(0, Math.min(1, y));
            }
          } catch {
            // Fallback: hash-based from content
            const content = row.source || row.summary || '';
            let h1 = 0, h2 = 0;
            for (let j = 0; j < content.length; j++) {
              h1 = (h1 * 31 + content.charCodeAt(j)) & 0x7fffffff;
              h2 = (h2 * 37 + content.charCodeAt(j)) & 0x7fffffff;
            }
            x = +((h1 % 1000) / 1000).toFixed(3);
            y = +((h2 % 1000) / 1000).toFixed(3);
          }

          return {
            id: String(row.id),
            label: row.source || row.summary || `Entry ${i + 1}`,
            x, y,
            type: row.type || 'document',
          };
        });
        indexDb.close();
        return { items, hasRealData: true };
      }
    }

    // Fallback: no vectors table or no vector data — use hash-based projection from entries
    const rows = indexDb.prepare('SELECT id, source, summary, type, content FROM knowledge_entries ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    indexDb.close();
    if (rows.length === 0) return { items: [], hasRealData: false };

    const items = rows.map((row: any, i: number) => {
      const content = row.content || row.source || row.summary || '';
      let h1 = 0, h2 = 0;
      for (let j = 0; j < content.length; j++) {
        h1 = (h1 * 31 + content.charCodeAt(j)) & 0x7fffffff;
        h2 = (h2 * 37 + content.charCodeAt(j)) & 0x7fffffff;
      }
      return {
        id: String(row.id),
        label: row.source || row.summary || `Entry ${i + 1}`,
        x: +((h1 % 1000) / 1000).toFixed(3),
        y: +((h2 % 1000) / 1000).toFixed(3),
        type: row.type || 'document',
      };
    });
    return { items, hasRealData: true };
  } catch {
    return { items: [], hasRealData: false };
  }
}

// --- KB single entry by ID (STORY 3 — graph node click detail) ---

export function getKbEntryById(entryId: string): any | null {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return null;
    const indexDb = new Database(indexDbPath, { readonly: true });

    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (!tableExists || tableExists.cnt === 0) {
      indexDb.close();
      return null;
    }

    const row = indexDb.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entryId) as any;
    indexDb.close();
    return row || null;
  } catch {
    return null;
  }
}

// --- KB Entry Count (from index.db knowledge_entries table) ---

export function getKbEntryCount(projectId?: string): number {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath, { readonly: true });
    const result = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (!result || result.cnt === 0) {
      indexDb.close();
      return 0;
    }
    let count: number;
    if (projectId && projectId !== 'default') {
      count = (indexDb.prepare("SELECT COUNT(*) as cnt FROM knowledge_entries WHERE scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR scope = 'USER'").get(projectId) as any).cnt;
    } else {
      count = (indexDb.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as any).cnt;
    }
    indexDb.close();
    return count;
  } catch {
    return 0;
  }
}

export function getKbEntries(page = 1, pageSize = 20, sortBy = 'created_at', sortDir: 'asc' | 'desc' = 'desc', projectId?: string): { items: any[]; total: number } {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return { items: [], total: 0 };
    const indexDb = new Database(indexDbPath, { readonly: true });

    // Check if knowledge_entries table exists
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (!tableExists || tableExists.cnt === 0) {
      indexDb.close();
      return { items: [], total: 0 };
    }

    // Get column names to validate sortBy
    const columns = indexDb.prepare("PRAGMA table_info(knowledge_entries)").all() as any[];
    const validColumns = columns.map((c: any) => c.name);
    const safeSort = validColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    let total: number;
    let rows: any[];
    if (projectId && projectId !== 'default') {
      const whereClause = "WHERE scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR scope = 'USER'";
      total = (indexDb.prepare(`SELECT COUNT(*) as cnt FROM knowledge_entries ${whereClause}`).get(projectId) as any).cnt;
      rows = indexDb.prepare(`SELECT * FROM knowledge_entries ${whereClause} ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`).all(projectId, pageSize, (page - 1) * pageSize) as any[];
    } else {
      total = (indexDb.prepare('SELECT COUNT(*) as cnt FROM knowledge_entries').get() as any).cnt;
      rows = indexDb.prepare(`SELECT * FROM knowledge_entries ORDER BY ${safeSort} ${safeDir} LIMIT ? OFFSET ?`).all(pageSize, (page - 1) * pageSize) as any[];
    }

    indexDb.close();
    return { items: rows, total };
  } catch {
    return { items: [], total: 0 };
  }
}

// --- Recent Activity (last N audit entries) ---

export function getRecentActivity(limit = 10): AuditEntry[] {
  const d = getAdminDb();
  const rows = d.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({
    auditId: r.audit_id, userId: r.user_id, username: r.username,
    action: r.action, resource: r.resource, resourceId: r.resource_id,
    changes: r.changes, timestamp: r.timestamp, ipAddress: r.ip_address,
  }));
}

// --- KB Tags Management ---

export function getAllKbTags(): Record<string, { count: number; lastUsed: string }> {
  const tagCounts: Record<string, { count: number; lastUsed: string }> = {};
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return tagCounts;
    const indexDb = new Database(indexDbPath, { readonly: true });
    
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare("SELECT tags, created_at FROM knowledge_entries WHERE tags IS NOT NULL AND tags != ''").all() as any[];
      for (const row of rows) {
        if (!row.tags) continue;
        const tags = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        for (const tag of tags) {
          if (!tagCounts[tag]) {
            tagCounts[tag] = { count: 0, lastUsed: row.created_at || new Date().toISOString() };
          }
          tagCounts[tag].count++;
          if (row.created_at && new Date(row.created_at) > new Date(tagCounts[tag].lastUsed)) {
            tagCounts[tag].lastUsed = row.created_at;
          }
        }
      }
    }
    indexDb.close();
  } catch (e) {
    console.error('Error in getAllKbTags:', e);
  }
  return tagCounts;
}

export function updateKbEntryTags(entryId: string, tags: string[]): void {
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return;
    const indexDb = new Database(indexDbPath);
    
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (tableExists && tableExists.cnt > 0) {
      const tagsStr = tags.join(',');
      indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?').run(tagsStr, entryId);
    }
    indexDb.close();
  } catch (e) {
    console.error('Error in updateKbEntryTags:', e);
  }
}

export function renameKbTag(oldName: string, newName: string): number {
  let renamed = 0;
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath);
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare('SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?').all(`%${oldName}%`) as any[];
      const updateStmt = indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const idx = tagArr.indexOf(oldName);
        if (idx !== -1) {
          tagArr[idx] = newName.trim();
          updateStmt.run(tagArr.join(','), row.id);
          renamed++;
        }
      }
    }
    indexDb.close();
  } catch (e) {
    console.error('Error in renameKbTag:', e);
  }
  return renamed;
}

export function deleteKbTag(tagName: string): number {
  let removed = 0;
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath);
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare('SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?').all(`%${tagName}%`) as any[];
      const updateStmt = indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const idx = tagArr.indexOf(tagName);
        if (idx !== -1) {
          tagArr.splice(idx, 1);
          updateStmt.run(tagArr.join(','), row.id);
          removed++;
        }
      }
    }
    indexDb.close();
  } catch (e) {
    console.error('Error in deleteKbTag:', e);
  }
  return removed;
}

export function mergeKbTags(sourceTag: string, targetTag: string): number {
  let merged = 0;
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return 0;
    const indexDb = new Database(indexDbPath);
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (tableExists && tableExists.cnt > 0) {
      const rows = indexDb.prepare('SELECT id, tags FROM knowledge_entries WHERE tags LIKE ?').all(`%${sourceTag}%`) as any[];
      const updateStmt = indexDb.prepare('UPDATE knowledge_entries SET tags = ? WHERE id = ?');
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const idx = tagArr.indexOf(sourceTag);
        if (idx !== -1) {
          tagArr.splice(idx, 1);
          if (!tagArr.includes(targetTag)) {
            tagArr.push(targetTag);
          }
          updateStmt.run(tagArr.join(','), row.id);
          merged++;
        }
      }
    }
    indexDb.close();
  } catch (e) {
    console.error('Error in mergeKbTags:', e);
  }
  return merged;
}

export function getKbEntriesByTag(tagName: string, projectId?: string): any[] {
  const entries: any[] = [];
  try {
    const indexDbPath = getIndexDbPath();
    if (!fs.existsSync(indexDbPath)) return entries;
    const indexDb = new Database(indexDbPath, { readonly: true });
    const tableExists = indexDb.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='knowledge_entries'").get() as any;
    if (tableExists && tableExists.cnt > 0) {
      let rows: any[];
      if (projectId && projectId !== 'default') {
        rows = indexDb.prepare("SELECT * FROM knowledge_entries WHERE tags LIKE ? AND (scope = 'SHARED' OR (scope = 'PROJECT' AND (project_id = ? OR project_id IS NULL)) OR scope = 'USER')").all(`%${tagName}%`, projectId) as any[];
      } else {
        rows = indexDb.prepare('SELECT * FROM knowledge_entries WHERE tags LIKE ?').all(`%${tagName}%`) as any[];
      }
      for (const row of rows) {
        if (!row.tags) continue;
        const tagArr = row.tags.split(',').map((t: string) => t.trim());
        if (tagArr.includes(tagName)) {
          entries.push(row);
        }
      }
    }
    indexDb.close();
  } catch (e) {
    console.error('Error in getKbEntriesByTag:', e);
  }
  return entries;
}
