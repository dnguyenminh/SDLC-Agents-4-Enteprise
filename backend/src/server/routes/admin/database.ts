/**
 * Database Configuration admin routes.
 * Implements: SA4E-33 — multi-DB support with admin UI
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as path from 'path';
import type { AdminContext } from './context.js';
import { DatabaseConfigService } from '../../../database/config/DatabaseConfigService.js';
import { DatabaseAdapterFactory } from '../../../database/factory/DatabaseAdapterFactory.js';
import { MigrationService, type MigrationProgress } from '../../../database/migration/MigrationService.js';
import { resetAdminDb } from '../../../admin/db/core.js';
import { loadConfig } from '../../../config/index.js';
import { z } from 'zod';

const connectionSchema = z.object({
  engine: z.enum(['postgresql', 'mysql']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  ssl: z.boolean().default(false),
});

let activeMigration: MigrationService | null = null;

export function createDatabaseRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  const cfg = loadConfig();
  const dataDir = path.resolve(cfg.dataDir || '.code-intel');
  const configService = new DatabaseConfigService(dataDir);

  app.get('/api/admin/database/status', (c) => {
    try {
      const config = configService.load();
      return c.json({ success: true, data: { engine: config.activeEngine, status: 'connected', details: config.engines.sqlite, lastMigration: config.migration.lastMigration } });
    } catch (err) {
      return c.json({ success: false, error: { code: 'STATUS_ERROR', message: (err as Error).message } }, 500);
    }
  });

  app.post('/api/admin/database/test-connection', async (c) => {
    const body = await c.req.json();
    const parsed = connectionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } }, 400);
    const { engine, host, port, username, password, database, ssl } = parsed.data;
    const adapter = DatabaseAdapterFactory.create({ engine, host, port, username, password, database, ssl });
    try {
      const start = Date.now();
      await adapter.connect();
      const version = await adapter.getVersion();
      const tables = await adapter.getTableNames();
      await adapter.disconnect();
      return c.json({ success: true, data: { connected: true, serverVersion: version, existingTables: tables.length, latencyMs: Date.now() - start } });
    } catch (err) {
      const msg = (err as Error).message;
      let code = 'CONN_ERROR';
      if (msg.includes('auth') || msg.includes('password')) code = 'AUTH_FAILED';
      else if (msg.includes('timeout') || msg.includes('ECONNREFUSED')) code = 'CONN_TIMEOUT';
      else if (msg.includes('not exist') || msg.includes('Unknown database')) code = 'DB_NOT_FOUND';
      return c.json({ success: false, error: { code, message: msg } }, 400);
    }
  });

  app.post('/api/admin/database/migrate', async (c) => {
    const body = await c.req.json();
    const parsed = connectionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } }, 400);
    if (activeMigration) return c.json({ success: false, error: { code: 'MIGRATION_ACTIVE', message: 'Already migrating' } }, 409);
    const { engine, host, port, username, password, database, ssl } = parsed.data;
    const sourceConfig = configService.getActiveConfig();
    const source = DatabaseAdapterFactory.create(sourceConfig);
    await source.connect();
    return streamSSE(c, async (stream) => {
      const migration = new MigrationService(source, { engine, host, port, username, password, database, ssl }, configService,
        (ev: MigrationProgress) => { stream.writeSSE({ event: ev.phase === 'complete' ? 'complete' : 'progress', data: JSON.stringify(ev) }); }
      );
      activeMigration = migration;
      try {
        const result = await migration.migrate();
        if (result.success) { resetAdminDb(); }
        stream.writeSSE({ event: result.success ? 'complete' : 'error', data: JSON.stringify(result) });
      } finally { activeMigration = null; await source.disconnect(); }
    });
  });

  app.post('/api/admin/database/migrate/cancel', (c) => {
    if (!activeMigration) return c.json({ success: false, error: { code: 'NO_MIGRATION', message: 'No active migration' } }, 400);
    activeMigration.cancel();
    return c.json({ success: true, data: { message: 'Cancel requested' } });
  });

  app.post('/api/admin/database/switch-to-sqlite', (c) => {
    try { configService.setActiveEngine('sqlite'); return c.json({ success: true, data: { message: 'Switched to SQLite' } }); }
    catch (err) { return c.json({ success: false, error: { code: 'CONFIG_WRITE_FAIL', message: (err as Error).message } }, 500); }
  });

  app.post('/api/admin/database/switch', async (c) => {
    const body = await c.req.json();
    const { engine, host, port, username, password, database, ssl } = body;
    if (!engine || engine === 'sqlite') {
      configService.setActiveEngine('sqlite');
      resetAdminDb();
      return c.json({ success: true, data: { message: 'Switched to SQLite. Restart server to apply.' } });
    }
    try {
      configService.setActiveEngine(engine, { host, port, username, password, database, ssl, pool: { min: 2, max: 10 } });
      resetAdminDb();
      return c.json({ success: true, data: { message: `Switched to ${engine}. Restart server to apply.` } });
    } catch (err) {
      return c.json({ success: false, error: { code: 'SWITCH_FAIL', message: (err as Error).message } }, 500);
    }
  });

  return app;
}
