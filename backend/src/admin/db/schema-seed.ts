/** Default access group / admin user seeding (BR-18 extraction from schema.ts). */
import * as crypto from 'crypto';
import type { DatabaseAdapter, DatabaseEngine } from '../../database/adapters/DatabaseAdapter.js';
import { hashPassword } from './password.js';
import { insertIgnore } from './schema-ddl.js';

/** Full permission catalogue granted to the admin group. */
export const ALL_PERMS = [
  'DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'KB_PROMOTE', 'KB_IMPORT_EXPORT',
  'MCP_ACCESS', 'MCP_MANAGE', 'USER_MANAGE', 'RBAC_MANAGE', 'CONFIG_EDIT',
  'SEARCH_EXPLORE', 'AUDIT_VIEW', 'GRAPH_VIEW', 'ANALYTICS_VIEW', 'GRAPH_MAINTAIN',
];

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

export async function seedAccessGroups(db: DatabaseAdapter): Promise<void> {
  const engine = db.getEngine();
  await seedGroup(db, engine, 'grp-admin', 'Administrators', 1, ALL_PERMS);
  await seedGroup(db, engine, 'grp-dev', 'Developers', 0,
    ['DASHBOARD_VIEW', 'KB_READ', 'KB_WRITE', 'MCP_ACCESS', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW']);
  await seedGroup(db, engine, 'grp-viewer', 'Viewers', 0,
    ['DASHBOARD_VIEW', 'KB_READ', 'SEARCH_EXPLORE', 'GRAPH_VIEW', 'ANALYTICS_VIEW']);
  await seedGroup(db, engine, 'grp-mcp-ops', 'MCP Operators', 0,
    ['DASHBOARD_VIEW', 'MCP_ACCESS', 'MCP_MANAGE']);
}

export async function ensureAdminPermissions(db: DatabaseAdapter): Promise<void> {
  await insertPerms(db, db.getEngine(), 'grp-admin', ALL_PERMS);
}

export async function seedAdminUser(db: DatabaseAdapter): Promise<void> {
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
