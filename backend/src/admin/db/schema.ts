/**
 * admin/db/schema.ts — Admin schema initialization and seed data.
 * SA4E-53: Accepts DatabaseAdapter (sync interface) instead of raw better-sqlite3.
 * Multi-engine: uses async adapter API + per-engine DDL/DML so it runs on both
 * SQLite and PostgreSQL (PostgresAdapter throws on the sync exec/get/run methods).
 */

import * as crypto from 'crypto';
import { hashPassword } from './password.js';
import type { DatabaseAdapter, DatabaseEngine } from '../../database/adapters/DatabaseAdapter.js';

/**
 * SQLite `INSERT OR IGNORE` has no direct PG equivalent — PG uses ON CONFLICT DO NOTHING.
 * We use the target-less form so it does not require a specific named unique
 * constraint to exist (legacy PG tables created before a UNIQUE clause was added
 * would otherwise raise "no unique or exclusion constraint matching the ON CONFLICT
 * specification"). Target-less DO NOTHING applies to any arbiter index/constraint.
 */
function insertIgnore(engine: DatabaseEngine, sql: string): string {
  if (engine === 'postgresql') {
    return sql.replace(/INSERT OR IGNORE/i, 'INSERT') + ` ON CONFLICT DO NOTHING`;
  }
  return sql;
}

/** Initialize admin schema tables (idempotent CREATE IF NOT EXISTS). */
async function migrateUsersSso(db: DatabaseAdapter, engine: DatabaseEngine): Promise<void> {
  try {
    if (engine === 'postgresql') {
      await db.execAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'LOCAL'`);
      await db.execAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_provider TEXT`);
      await db.execAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_subject_id TEXT`);
      await db.execAsync(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
      await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_external_identity ON users (external_provider, external_subject_id)`);
    } else {
      try { await db.execAsync(`ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'LOCAL'`); } catch {}
      try { await db.execAsync(`ALTER TABLE users ADD COLUMN external_provider TEXT`); } catch {}
      try { await db.execAsync(`ALTER TABLE users ADD COLUMN external_subject_id TEXT`); } catch {}
      // SQLite cannot ALTER COLUMN nullability; recreate table if password_hash is NOT NULL
      try {
        const info = await db.allAsync(`PRAGMA table_info(users)`);
        const col = (info as any[]).find(c => c.name === 'password_hash');
        if (col && col.notnull === 1) {
          await db.execAsync(`ALTER TABLE users RENAME TO users_old`);
          await db.execAsync(`CREATE TABLE users (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            status TEXT,
            access_group_id TEXT,
            force_password_change INTEGER,
            created_at TEXT,
            last_login TEXT,
            account_type TEXT NOT NULL DEFAULT 'LOCAL',
            external_provider TEXT,
            external_subject_id TEXT
          )`);
          await db.execAsync(`INSERT INTO users SELECT user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at, last_login, COALESCE(account_type,'LOCAL'), external_provider, external_subject_id FROM users_old`);
          await db.execAsync(`DROP TABLE users_old`);
        }
      } catch {}
      await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_external_identity ON users (external_provider, external_subject_id)`);
    }
  } catch (err) {
    console.debug('[schema] users_sso migration:', (err as Error).message);
  }
}

async function seedDefaultSsoProviders(db: DatabaseAdapter): Promise<void> {
  try {
    const templates = [
      {
        provider_type: 'google',
        name: 'Google',
        enabled: 0,
        login_ui_html: `<a class="sso-btn sso-google" href="/auth/google/login"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6s2.5-5.6 5.6-5.6c1.8 0 3 .8 3.7 1.4l2.5-2.4C17 2.9 14.7 1.8 12 1.8 6.8 1.8 2.5 6.1 2.5 11.3S6.8 20.8 12 20.8c5.6 0 9.3-4 9.3-9.3 0-.6 0-1.2-.1-1.8H12z"/></svg> Sign in with Google</a>`,
      },
      {
        provider_type: 'github',
        name: 'GitHub',
        enabled: 0,
        login_ui_html: `<a class="sso-btn sso-github" href="/auth/github/login"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.73.08-.73 1.22.09 1.86 1.26 1.86 1.26 1.08 1.86 2.83 1.32 3.52 1.01.11-.79.42-1.32.76-1.62-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.65-5.48 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.58A12 12 0 0 0 12 .5Z"/></svg> Sign in with GitHub</a>`,
      },
      {
        provider_type: 'x',
        name: 'X',
        enabled: 0,
        login_ui_html: `<a class="sso-btn sso-x" href="/auth/x/login">Sign in with X</a>`,
      },
      {
        provider_type: 'facebook',
        name: 'Facebook',
        enabled: 0,
        login_ui_html: `<a class="sso-btn sso-facebook" href="/auth/facebook/login"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.55-4.7 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.48 0-1.94.92-1.94 1.86v2.24h3.3l-.53 3.49h-2.77V24C19.61 23.1 24 18.1 24 12.07z"/></svg> Sign in with Facebook</a>`,
      },
    ];
    const now = new Date().toISOString();
    for (const t of templates) {
      const exists = await db.getAsync('SELECT 1 FROM sso_providers WHERE provider_type = ?', [t.provider_type]);
      if (!exists) {
        const provider_id = `${t.provider_type}-${Date.now()}`;
        await db.runAsync(`INSERT INTO sso_providers (provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [provider_id, t.provider_type, t.name, t.enabled, '', '', '', '', '', '', t.login_ui_html, now, now]);
      }
    }
  } catch (err) {
    console.debug('[schema] seedDefaultSsoProviders:', (err as Error).message);
  }
}

async function seedSsoProvidersFromEnv(db: DatabaseAdapter): Promise<void> {
    const cnt = await db.getAsync<{count:number}>('SELECT COUNT(*) as count FROM sso_providers');
    if (cnt && cnt.count > 0) return;
    const env = process.env;
    if (!env.SSO_ENABLED || env.SSO_ENABLED !== 'true') return;
    const tenant = env.ENTRA_TENANT_ID || '';
    const clientId = env.ENTRA_CLIENT_ID || '';
    const clientSecret = env.ENTRA_CLIENT_SECRET || '';
    if (!tenant || !clientId) return;
    const now = new Date().toISOString();
    const provider_id = `entra-${Date.now()}`;
    const name = 'Entra ID';
    const enabled = 1;
    const redirect_uri = env.ENTRA_REDIRECT_URI || '';
    const allowed_redirects = env.SSO_ALLOWED_REDIRECTS || '';
    const scopes = env.ENTRA_SCOPES || 'openid profile email offline_access';
    const login_ui_html = `<button class="sso-btn sso-entra">Sign in with Entra ID</button>`;
    await db.runAsync(`INSERT INTO sso_providers (provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [provider_id, 'entra', name, enabled, clientId, clientSecret, tenant, redirect_uri, allowed_redirects, scopes, login_ui_html, now, now]);
    console.debug('[schema] sso_providers seeded from env');
  } catch (err) {
    console.debug('[schema] seedSsoProvidersFromEnv:', (err as Error).message);
  }
}

export async function initSchema(db: DatabaseAdapter): Promise<void> {
  const engine = db.getEngine();

  await db.execAsync(schemaSql(engine));

  // SA4E-265 migration: users_sso
  await migrateUsersSso(db, engine);

  // SA4E-262 migration: add user_agent_hash to sessions for session fixation hardening
  try {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN user_agent_hash TEXT DEFAULT ''`);
  } catch (err) { console.debug('[schema] sessions.user_agent_hash already exists :', (err as Error).message); }

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
      last_seen TEXT NOT NULL DEFAULT ${nowExpr(engine)}
    );
  `);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_project_registry_seen ON project_registry(last_seen)`);

  // Idempotent migration: add created_by to project_registry
  try {
    await db.execAsync(`ALTER TABLE project_registry ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`);
  } catch (err) { console.debug('[schema] column already exists :', (err as Error).message); }

  // Ensure the arbiter unique index for group_permissions exists. Legacy tables
  // created before the inline UNIQUE(...) clause won't have it, which breaks the
  // `ON CONFLICT DO NOTHING` used by seedDefaults. CREATE UNIQUE INDEX IF NOT EXISTS
  // is idempotent and gives ON CONFLICT a valid arbiter on both engines.
  try {
    await db.execAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_group_permissions_uniq
       ON group_permissions(access_group_id, permission_id)`,
    );
  } catch (err) { console.debug('[schema] group_permissions unique index :', (err as Error).message); }

  // Migration: add login_ui_html column if missing
  try {
    await db.execAsync(`ALTER TABLE sso_providers ADD COLUMN login_ui_html TEXT NOT NULL DEFAULT ''`);
  } catch (err) { console.debug('[schema] login_ui_html already exists:', (err as Error).message); }

  // Migration: seed sso_providers from env if table empty
  await seedSsoProvidersFromEnv(db);

  // Seed default provider templates for Google/GitHub/X/Facebook
  await seedDefaultSsoProviders(db);
}

/** Seed default access groups and admin user. */
export async function seedDefaults(db: DatabaseAdapter): Promise<void> {
  const groupExists = await db.getAsync<Record<string, unknown>>(
    'SELECT 1 FROM access_groups WHERE access_group_id = ?', ['grp-admin'],
  );
  if (!groupExists) {
    await seedAccessGroups(db);
  }
  // Ensure admin group has all permissions even after code changes
  await ensureAdminPermissions(db);

  const userExists = await db.getAsync<Record<string, unknown>>(
    'SELECT 1 FROM users WHERE username = ?', ['admin'],
  );
  if (!userExists) {
    await seedAdminUser(db);
  }
}

/** Insert one access group + its permissions (idempotent, cross-engine). */
async function seedGroup(
  db: DatabaseAdapter, engine: DatabaseEngine,
  groupId: string, groupName: string, isSystem: 0 | 1, perms: string[],
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    insertIgnore(engine,
      `INSERT OR IGNORE INTO access_groups (access_group_id, access_group_name, is_system_group, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`),
    [groupId, groupName, isSystem, now, now],
  );
  await insertPerms(db, engine, groupId, perms);
}

/** Insert permission rows for a group (idempotent, cross-engine). */
async function insertPerms(
  db: DatabaseAdapter, engine: DatabaseEngine, groupId: string, perms: string[],
): Promise<void> {
  for (const perm of perms) {
    await db.runAsync(
      insertIgnore(engine,
        'INSERT OR IGNORE INTO group_permissions (access_group_id, permission_id, role_data) VALUES (?, ?, ?)'),
      [groupId, perm, '{}'],
    );
  }
}

async function seedAccessGroups(db: DatabaseAdapter): Promise<void> {
  const engine = db.getEngine();
  await seedGroup(db, engine, 'grp-admin', 'Administrators', 1, ALL_PERMS);
  await seedGroup(db, engine, 'grp-dev', 'Developers', 0,
    ['DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'MCP_ACCESS', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW']);
  await seedGroup(db, engine, 'grp-viewer', 'Viewers', 0,
    ['DASHBOARD_VIEW', 'KB_READ', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW']);
  await seedGroup(db, engine, 'grp-mcp-ops', 'MCP Operators', 0,
    ['DASHBOARD_VIEW', 'MCP_ACCESS', 'MCP_MANAGE']);
}

async function ensureAdminPermissions(db: DatabaseAdapter): Promise<void> {
  await insertPerms(db, db.getEngine(), 'grp-admin', ALL_PERMS);
}

async function seedAdminUser(db: DatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const initialPassword = envPassword && envPassword.length >= 12
    ? envPassword
    : crypto.randomBytes(18).toString('base64url');
  const hash = hashPassword(initialPassword);
  await db.runAsync(
    `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at, account_type)
     VALUES (?, ?, ?, ?, 'ACTIVE', 'grp-admin', 1, ?, 'LOCAL')`,
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

/** Full permission catalogue granted to the admin group. */
const ALL_PERMS = [
  'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
  'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
  'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW', 'GRAPH_MAINTAIN',
];

/** Per-engine "current timestamp" default expression. */
function nowExpr(engine: DatabaseEngine): string {
  return engine === 'postgresql' ? 'now()' : `(datetime('now'))`;
}

/** Per-engine auto-increment integer primary key clause. */
function autoIncPk(engine: DatabaseEngine): string {
  return engine === 'postgresql' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
}

/** Full admin schema DDL — parameterized per engine for cross-DB compatibility. */
function schemaSql(engine: DatabaseEngine): string {
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

