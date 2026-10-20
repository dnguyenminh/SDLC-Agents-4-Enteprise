/** Per-engine admin schema DDL (BR-18 extraction from schema.ts). */
import type { DatabaseEngine } from '../../database/adapters/DatabaseAdapter.js';

/** SQLite `INSERT OR IGNORE` has no direct PG equivalent — PG uses ON CONFLICT DO NOTHING.
 * We use the target-less form so it does not require a specific named unique
 * constraint to exist (legacy PG tables created before a UNIQUE clause was added
 * would otherwise raise "no unique or exclusion constraint matching the ON CONFLICT
 * specification"). Target-less DO NOTHING applies to any arbiter index/constraint. */
export function insertIgnore(engine: DatabaseEngine, sql: string): string {
  if (engine === 'postgresql') {
    return sql.replace(/INSERT OR IGNORE/i, 'INSERT') + ` ON CONFLICT DO NOTHING`;
  }
  return sql;
}

/** Per-engine "current timestamp" default expression. */
export function nowExpr(engine: DatabaseEngine): string {
  return engine === 'postgresql' ? 'now()' : `(datetime('now'))`;
}

/** Per-engine auto-increment integer primary key clause. */
export function autoIncPk(engine: DatabaseEngine): string {
  return engine === 'postgresql' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
}

/** Full admin schema DDL — parameterized per engine for cross-DB compatibility. */
export function schemaSql(engine: DatabaseEngine): string {
  const now = nowExpr(engine);
  const idPk = autoIncPk(engine);
  return `
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      access_group_id TEXT NOT NULL,
      force_password_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login TEXT,
      account_type TEXT NOT NULL DEFAULT 'LOCAL' CHECK (account_type IN ('LOCAL','SSO')),
      external_provider TEXT,
      external_subject_id TEXT
    );

    CREATE TABLE IF NOT EXISTS access_groups (
      access_group_id TEXT PRIMARY KEY,
      access_group_name TEXT UNIQUE NOT NULL,
      is_system_group INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_permissions (
      id ${idPk},
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
      user_agent_hash TEXT DEFAULT '',
      login_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      family_id TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
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
      id ${idPk},
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

    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_external_identity ON users (external_provider, external_subject_id);

    CREATE TABLE IF NOT EXISTS sso_providers (
      provider_id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL CHECK (provider_type IN ('entra','google','github','x','facebook','azuread')),
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL DEFAULT '',
      redirect_uri TEXT NOT NULL DEFAULT '',
      allowed_redirects TEXT NOT NULL DEFAULT '',
      scopes TEXT NOT NULL DEFAULT '',
      login_ui_html TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${now},
      updated_at TEXT NOT NULL DEFAULT ${now}
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_sso_providers_type ON sso_providers(provider_type);

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
      created_at TEXT NOT NULL DEFAULT ${now}
    );

    CREATE TABLE IF NOT EXISTS graph_edges (
      id ${idPk},
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
}
