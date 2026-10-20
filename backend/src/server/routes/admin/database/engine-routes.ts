/**
 * Migration + engine-switch admin routes (SSE streaming migration, hot-swap).
 * Extracted from server/routes/admin/database.ts (BR-18) — no behavior change.
 */

import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as path from 'path';
import { DatabaseAdapterFactory } from '../../../../database/factory/DatabaseAdapterFactory.js';
import { MigrationService, type MigrationProgress } from '../../../../database/migration/MigrationService.js';
import { resetAdminDb, initAdapters } from '../../../../admin/db/core.js';
import type { DatabaseConfigService } from '../../../../database/config/DatabaseConfigService.js';
import { connectionSchema } from './shared.js';

/** Shared route dependencies supplied by the facade. */
export interface DatabaseRouteDeps {
  authGuard: (c: any) => Promise<Response | null>;
  configService: DatabaseConfigService;
  registry?: { reinitializeEngineModules(): Promise<void> } | null;
  dataDir: string;
  sqliteDbPath: string;
}

/** SA4E-45: single in-flight migration guard (module-level state). */
let activeMigration: MigrationService | null = null;

/** Register POST /migrate and POST /migrate/cancel. */
export function registerMigrationRoutes(app: Hono, deps: DatabaseRouteDeps): void {
  const { authGuard, configService, registry, dataDir, sqliteDbPath } = deps;

  app.post('/api/admin/database/migrate', async (c) => {
    const deny = await authGuard(c); if (deny) return deny;
    const body = await c.req.json();
    const parsed = connectionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } }, 400);
    if (activeMigration) return c.json({ success: false, error: { code: 'MIGRATION_ACTIVE', message: 'Already migrating' } }, 409);
    const { engine, host, port, username, database, ssl } = parsed.data;
    let { password } = parsed.data;
    // SA4E-45: If password is placeholder/empty, use saved password from database.json
    if (!password || password === '••••••••••••••••••••' || password.length < 2) {
      const savedConfig = configService.load();
      const savedEngine = savedConfig.engines[engine as 'postgresql' | 'mysql'];
      if (savedEngine?.password) {
        password = savedEngine.password;
      }
    }
    // SA4E-49: Single unified DB — migrate one SQLite file into PG/MySQL
    // Use cfg.sqliteDbPath (from config/env) instead of hardcoding 'index.db'
    const unifiedDbPath = path.join(dataDir, sqliteDbPath);
    const sqliteSource = DatabaseAdapterFactory.create({ engine: 'sqlite' as const, dbPath: unifiedDbPath });
    await sqliteSource.connect();
    return streamSSE(c, async (stream) => {
      const targetConfig = { engine, host, port, username, password, database, ssl };
      const progress = (ev: MigrationProgress) => { stream.writeSSE({ event: ev.phase === 'complete' ? 'complete' : 'progress', data: JSON.stringify(ev) }); };

      // Single-pass migration: all tables from unified DB
      const migration = new MigrationService(sqliteSource, targetConfig, configService, progress);
      activeMigration = migration;
      const finalResult = await migration.migrate();

      if (finalResult.success) {
        resetAdminDb();
        if (registry) await registry.reinitializeEngineModules();
      }
      stream.writeSSE({ event: finalResult.success ? 'complete' : 'error', data: JSON.stringify(finalResult) });
      activeMigration = null;
      await sqliteSource.disconnect();
    });
  });

  app.post('/api/admin/database/migrate/cancel', async (c) => {
    const deny = await authGuard(c); if (deny) return deny;
    if (!activeMigration) return c.json({ success: false, error: { code: 'NO_MIGRATION', message: 'No active migration' } }, 400);
    activeMigration.cancel();
    return c.json({ success: true, data: { message: 'Cancel requested' } });
  });
}

/** Register POST /switch-to-sqlite and POST /switch (SA4E-45 hot-swap). */
export function registerSwitchRoutes(app: Hono, deps: DatabaseRouteDeps): void {
  const { authGuard, configService, registry } = deps;

  app.post('/api/admin/database/switch-to-sqlite', async (c) => {
    const deny = await authGuard(c); if (deny) return deny;
    try { configService.setActiveEngine('sqlite'); return c.json({ success: true, data: { message: 'Switched to SQLite' } }); }
    catch (err) { return c.json({ success: false, error: { code: 'CONFIG_WRITE_FAIL', message: (err as Error).message } }, 500); }
  });

  app.post('/api/admin/database/switch', async (c) => {
    const deny = await authGuard(c); if (deny) return deny;
    const body = await c.req.json();
    const { engine, host, port, username, password, database, ssl } = body;
    if (!engine || engine === 'sqlite') {
      configService.setActiveEngine('sqlite');
      resetAdminDb();
      // Ensure admin schema exists on the SQLite engine too (idempotent).
      await initAdapters();
      // SA4E-45: hot-swap engine modules to use new adapter
      if (registry) await registry.reinitializeEngineModules();
      return c.json({ success: true, data: { message: 'Switched to SQLite. Engine modules reinitialized.' } });
    }
    try {
      configService.setActiveEngine(engine, { host, port, username, password, database, ssl, pool: { min: 2, max: 10 } });
      resetAdminDb();
      // Ensure the admin schema (users, sessions, config_changes, sso_providers,
      // etc.) exists on the newly-selected engine BEFORE anything queries it.
      // Root cause fix: switching to a fresh Postgres/MySQL that was never
      // migrated left the admin tables missing, so getConfigChanges() (and other
      // admin queries) threw and blanked the whole Configuration page. initAdapters
      // runs initSchema + seedDefaults, both idempotent (CREATE TABLE IF NOT EXISTS
      // / seed-if-empty), so it is safe when the schema already exists.
      await initAdapters();
      // SA4E-45: hot-swap engine modules to use new adapter
      if (registry) await registry.reinitializeEngineModules();
      return c.json({ success: true, data: { message: `Switched to ${engine}. Engine modules reinitialized.` } });
    } catch (err) {
      return c.json({ success: false, error: { code: 'SWITCH_FAIL', message: (err as Error).message } }, 500);
    }
  });
}
