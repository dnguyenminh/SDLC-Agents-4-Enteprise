/**
 * admin/db/schema.ts — Admin schema initialization and seed data.
 * SA4E-53: Accepts DatabaseAdapter instead of raw better-sqlite3.
 * Async: uses QueryDatabaseAdapter (execAsync/getAsync/runAsync) so it works on
 * the wasm SQLite engine (async-only) as well as PostgreSQL/MySQL.
 */

import * as crypto from 'crypto';
import { hashPassword } from './password.js';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

/** Initialize admin schema tables (idempotent CREATE IF NOT EXISTS). */
export async function initSchema(db: QueryDatabaseAdapter): Promise<void> {
  await db.execAsync(ADMIN_SCHEMA_SQL);

  // Idempotent migration: add project_id to graph_nodes for existing DBs
  try {
    await db.execAsync(`ALTER TABLE graph_nodes ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
  } catch (err) { console.debug('[schema] column already exists :', (err as Error).message); }
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id)`);

  // SA4E-50: project_registry — workspace → projectId mapping
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS project_registry (
      project_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '',
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_project_registry_seen ON project_registry(last_seen);
  `);

  // Idempotent migration: add created_by to project_registry
  try {
    await db.execAsync(`ALTER TABLE project_registry ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`);
  } catch (err) { console.debug('[schema] column already exists :', (err as Error).message); }
}

/** Seed default access groups and admin user. */
export async function seedDefaults(db: QueryDatabaseAdapter): Promise<void> {
  const groupExists = await db.getAsync<Record<string, unknown>>(
    'SELECT 1 FROM access_groups WHERE access_group_id = ?', ['grp-admin'],
  );
  if (!groupExists) {
    await seedAccessGroups(db);
  }

  const userExists = await db.getAsync<Record<string, unknown>>(
    'SELECT 1 FROM users WHERE username = ?', ['admin'],
  );
  if (!userExists) {
    await seedAdminUser(db);
  }
}

/** Insert one access group plus its permission rows. */
async function seedGroup(
  db: QueryDatabaseAdapter, groupId: string, name: string, isSystem: 0 | 1, perms: string[],
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [groupId, name, isSystem, now, now],
  );
  for (const perm of perms) {
    await db.runAsync(
      'INSERT INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)',
      [groupId, perm, '{}'],
    );
  }
}

async function seedAccessGroups(db: QueryDatabaseAdapter): Promise<void> {
  await seedGroup(db, 'grp-admin', 'Administrators', 1, [
    'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
    'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
    'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW',
  ]);
  await seedGroup(db, 'grp-dev', 'Developers', 0, [
    'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'MCP_ACCESS', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW',
  ]);
  await seedGroup(db, 'grp-viewer', 'Viewers', 0, [
    'DASHBOARD_VIEW', 'KB_READ', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW',
  ]);
  await seedGroup(db, 'grp-mcp-ops', 'MCP Operators', 0, [
    'DASHBOARD_VIEW', 'MCP_ACCESS', 'MCP_MANAGE',
  ]);
}

async function seedAdminUser(db: QueryDatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const initialPassword = envPassword && envPassword.length >= 12
    ? envPassword
    : crypto.randomBytes(18).toString('base64url');
  const hash = hashPassword(initialPassword);
  await db.runAsync(
    `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', 'grp-admin', 1, ?)`,
    ['user-admin-001', 'admin', 'admin@localhost', hash, now],
  );

  if (!envPassword) {
    process.stdout.write(
      '\n============================================================\n' +
      '  ADMIN ACCOUNT CREATED — generated one-time password:\n' +
      `  username: admin\n  password: ${initialPassword}\n` +
      '  You MUST change this on first login. Set ADMIN_INITIAL_PASSWORD\n' +
      '  env var to control the initial password.\n' +
      '============================================================\n',
    );
  }
}

/** Full admin schema DDL — extracted for readability. */
const ADMIN_SCHEMA_SQL = `
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

    CREATE TABLE IF NOT EXISTS graph_nodes (
      entry_id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'DOCUMENT',
      tier TEXT NOT NULL DEFAULT 'SHARED',
      project_id TEXT NOT NULL DEFAULT '',
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
`;
