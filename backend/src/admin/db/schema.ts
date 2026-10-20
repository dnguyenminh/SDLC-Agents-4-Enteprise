/**
 * admin/db/schema.ts — Admin schema initialization and seed data.
 * SA4E-53: Accepts DatabaseAdapter (sync interface) instead of a raw Database handle.
 * Multi-engine: uses async adapter API + per-engine DDL/DML so it runs on both
 * SQLite and PostgreSQL (PostgresAdapter throws on the sync exec/get/run methods).
 * Facade (BR-18): DDL in schema-ddl.ts, SSO migrations in schema-sso.ts,
 * group/user seeding in schema-seed.ts.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { schemaSql, nowExpr } from './schema-ddl.js';
import {
  migrateUsersSso, seedDefaultSsoProviders,
  migrateLoginUiHtmlToUrlless, seedSsoProvidersFromEnv,
} from './schema-sso.js';
import { seedAccessGroups, ensureAdminPermissions, seedAdminUser } from './schema-seed.js';

export async function initSchema(db: DatabaseAdapter): Promise<void> {
  const engine = db.getEngine();

  await db.execAsync(schemaSql(engine));

  // SA4E-265 migration: users_sso
  await migrateUsersSso(db, engine);

  // SA4E-262 migration: add user_agent_hash to sessions for session fixation hardening
  try {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN user_agent_hash TEXT DEFAULT ''`);
  } catch (err) { console.debug('[schema] sessions.user_agent_hash already exists :', (err as Error).message); }

  // SA4E-321 migration: absolute session deadline (7d hard cap) for dual-token auth
  try {
    await db.execAsync(`ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT DEFAULT ''`);
  } catch (err) { console.debug('[schema] sessions.absolute_expires_at already exists :', (err as Error).message); }

  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id)`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session ON refresh_tokens(session_id)`);

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

  // Migration (SA4E-310): strip absolute-path anchors from stored login_ui_html.
  // Old seeds embedded <a href="/auth/{p}/login">…</a> which breaks sub-path
  // deploys. The login page now builds the URL from basePath, so stored HTML
  // must carry only the visual content — rewrite legacy <a href=...> to <span>.
  await migrateLoginUiHtmlToUrlless(db);

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
