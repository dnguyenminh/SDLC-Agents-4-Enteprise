/**
 * admin/db/schema-pg.ts — PostgreSQL admin schema + seed (async, PG dialect).
 *
 * The SQLite path (schema.ts) uses sync methods + SQLite-only DDL
 * (AUTOINCREMENT, datetime('now'), INSERT OR IGNORE) which PostgresAdapter
 * rejects. This module mirrors that schema using PG dialect (SERIAL,
 * NOW()::TEXT, ON CONFLICT DO NOTHING) via the async adapter methods.
 *
 * Follows the same "ensurePostgres*Schema" pattern as pg-schema-ensure.ts.
 */

import * as crypto from 'crypto';
import { hashPassword } from './password.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

/** All admin/graph tables in PostgreSQL dialect (idempotent CREATE IF NOT EXISTS). */
const ADMIN_SCHEMA_PG_SQL = `
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
    id SERIAL PRIMARY KEY,
    access_group_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    role_data TEXT NOT NULL DEFAULT '{}',
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
    is_active INTEGER NOT NULL DEFAULT 1
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
    id SERIAL PRIMARY KEY,
    section TEXT NOT NULL,
    key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    requires_restart INTEGER NOT NULL DEFAULT 0
  );

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
    created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );

  CREATE TABLE IF NOT EXISTS graph_edges (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0.5,
    rel_type TEXT NOT NULL DEFAULT 'RELATED_TO',
    UNIQUE(source, target)
  );

  CREATE TABLE IF NOT EXISTS project_registry (
    project_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    workspace_path TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    last_seen TEXT NOT NULL DEFAULT (NOW()::TEXT)
  );
`;

const ADMIN_INDEXES_PG = [
  'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_config_changes_time ON config_changes(changed_at)',
  'CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id)',
  'CREATE INDEX IF NOT EXISTS idx_graph_nodes_level ON graph_nodes(level)',
  'CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source)',
  'CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target)',
  'CREATE INDEX IF NOT EXISTS idx_project_registry_seen ON project_registry(last_seen)',
];

/** Initialize admin schema tables for PostgreSQL (idempotent). */
export async function ensurePostgresAdminSchema(adapter: DatabaseAdapter): Promise<void> {
  await adapter.execAsync(ADMIN_SCHEMA_PG_SQL);
  for (const idx of ADMIN_INDEXES_PG) {
    await adapter.execAsync(idx);
  }
}

const ALL_PERMS = [
  'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
  'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
  'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW', 'GRAPH_MAINTAIN',
];

const DEFAULT_GROUPS: Array<{ id: string; name: string; system: number; perms: string[] }> = [
  { id: 'grp-admin', name: 'Administrators', system: 1, perms: ALL_PERMS },
  { id: 'grp-dev', name: 'Developers', system: 0, perms: ['DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'MCP_ACCESS', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW'] },
  { id: 'grp-viewer', name: 'Viewers', system: 0, perms: ['DASHBOARD_VIEW', 'KB_READ', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW'] },
  { id: 'grp-mcp-ops', name: 'MCP Operators', system: 0, perms: ['DASHBOARD_VIEW', 'MCP_ACCESS', 'MCP_MANAGE'] },
];

/** Seed default access groups, permissions, and admin user for PostgreSQL. */
export async function seedDefaultsPg(adapter: DatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  for (const grp of DEFAULT_GROUPS) {
    await adapter.runAsync(
      `INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (access_group_id) DO NOTHING`,
      [grp.id, grp.name, grp.system, now, now],
    );
    for (const perm of grp.perms) {
      await adapter.runAsync(
        `INSERT INTO group_permissions (access_group_id, permission_id, role_data)
         VALUES (?, ?, ?) ON CONFLICT (access_group_id, permission_id) DO NOTHING`,
        [grp.id, perm, '{}'],
      );
    }
  }
  await seedAdminUserPg(adapter, now);
}

/** Create the initial admin user with a generated one-time password. */
async function seedAdminUserPg(adapter: DatabaseAdapter, now: string): Promise<void> {
  const existing = await adapter.getAsync<{ user_id: string }>(
    'SELECT user_id FROM users WHERE username = ?', ['admin'],
  );
  if (existing) return;

  const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const initialPassword = envPassword && envPassword.length >= 12
    ? envPassword
    : crypto.randomBytes(18).toString('base64url');
  const hash = hashPassword(initialPassword);
  await adapter.runAsync(
    `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', 'grp-admin', 1, ?) ON CONFLICT (username) DO NOTHING`,
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
