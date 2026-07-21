import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { hashPassword } from './password.js';

export function initSchema(db: Database.Database): void {
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
  `);

  // Idempotent migration: add project_id to graph_nodes for existing DBs
  try {
    db.exec(`ALTER TABLE graph_nodes ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
  } catch { /* column already exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id)`);
}

export function seedDefaults(db: Database.Database): void {
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

    db.prepare(`INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)`).run('grp-dev', 'Developers', now, now);
    const devPerms = ['DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'MCP_ACCESS', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW'];
    for (const perm of devPerms) {
      insertPerm.run('grp-dev', perm, '{}');
    }

    db.prepare(`INSERT INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)`).run('grp-viewer', 'Viewers', now, now);
    const viewerPerms = ['DASHBOARD_VIEW', 'KB_READ', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW'];
    for (const perm of viewerPerms) {
      insertPerm.run('grp-viewer', perm, '{}');
    }

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
    const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const initialPassword = envPassword && envPassword.length >= 12
      ? envPassword
      : crypto.randomBytes(18).toString('base64url');
    const hash = hashPassword(initialPassword);
    db.prepare(`INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'grp-admin', 1, ?)`).run('user-admin-001', 'admin', 'admin@localhost', hash, now);

    if (!envPassword) {
      process.stdout.write(
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
