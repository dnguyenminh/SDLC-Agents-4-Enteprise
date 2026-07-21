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
  password: z.string().default(''),
  database: z.string().min(1),
  ssl: z.boolean().default(false),
});

let activeMigration: MigrationService | null = null;

export function createDatabaseRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  const cfg = loadConfig();
  const dataDir = path.isAbsolute(cfg.dataDir) ? cfg.dataDir : path.resolve(cfg.workspace, cfg.dataDir);
  const configService = new DatabaseConfigService(dataDir);
  // SA4E-45: registry for hot-swap after engine switch
  const registry = ctx.registry;

  app.get('/api/admin/database/status', (c) => {
    try {
      const config = configService.load();
      const engine = config.activeEngine;
      const connParams = engine !== 'sqlite' && config.engines[engine]
        ? { host: config.engines[engine]!.host, port: config.engines[engine]!.port, username: config.engines[engine]!.username, database: config.engines[engine]!.database, ssl: config.engines[engine]!.ssl }
        : undefined;
      return c.json({ success: true, data: { engine, status: 'connected', details: config.engines.sqlite, connection: connParams, lastMigration: config.migration.lastMigration } });
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

  /**
   * SA4E-45: Validate if target DB already has the expected schema.
   * Returns which required tables exist and whether schema is fully compatible.
   */
  app.post('/api/admin/database/validate-schema', async (c) => {
    const body = await c.req.json();
    const parsed = connectionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } }, 400);
    const { engine, host, port, username, password, database, ssl } = parsed.data;
    const adapter = DatabaseAdapterFactory.create({ engine, host, port, username, password, database, ssl });
    try {
      await adapter.connect();
      const existingTables = await adapter.getTableNames();
      await adapter.disconnect();

      // Required tables for engine layer to function
      const requiredTables = [
        'knowledge_entries', 'knowledge_vectors', 'knowledge_graph_edges',
        'memory_sessions', 'memory_audit', 'conversation_turns',
        'entity_index', 'agent_scope_config', 'quality_scores',
        'tags', 'entry_tags', 'citations', 'attachments',
        'files', 'symbols', 'modules', 'embeddings', 'mcp_tools', 'tool_usage',
      ];

      const found = requiredTables.filter(t => existingTables.includes(t));
      const missing = requiredTables.filter(t => !existingTables.includes(t));
      const schemaReady = missing.length === 0;

      return c.json({
        success: true,
        data: {
          schemaReady,
          totalRequired: requiredTables.length,
          found: found.length,
          missing,
          existingTables: existingTables.length,
          message: schemaReady
            ? 'Schema is fully compatible. You can switch without migration.'
            : `Missing ${missing.length} required tables. Migration needed.`,
        },
      });
    } catch (err) {
      return c.json({ success: false, error: { code: 'CONN_ERROR', message: (err as Error).message } }, 400);
    }
  });

  app.post('/api/admin/database/migrate', async (c) => {
    const body = await c.req.json();
    const parsed = connectionSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION', message: parsed.error.message } }, 400);
    if (activeMigration) return c.json({ success: false, error: { code: 'MIGRATION_ACTIVE', message: 'Already migrating' } }, 409);
    let { engine, host, port, username, password, database, ssl } = parsed.data;
    // SA4E-45: If password is placeholder/empty, use saved password from database.json
    if (!password || password === '••••••••••••••••••••' || password.length < 2) {
      const savedConfig = configService.load();
      const savedEngine = savedConfig.engines[engine as 'postgresql' | 'mysql'];
      if (savedEngine?.password) {
        password = savedEngine.password;
      }
    }
    // SA4E-49: Single unified DB — migrate one SQLite file into PG/MySQL
    const unifiedDbPath = path.join(dataDir, 'index.db');
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
      // SA4E-45: hot-swap engine modules to use new adapter
      if (registry) await registry.reinitializeEngineModules();
      return c.json({ success: true, data: { message: 'Switched to SQLite. Engine modules reinitialized.' } });
    }
    try {
      configService.setActiveEngine(engine, { host, port, username, password, database, ssl, pool: { min: 2, max: 10 } });
      resetAdminDb();
      // SA4E-45: hot-swap engine modules to use new adapter
      if (registry) await registry.reinitializeEngineModules();
      return c.json({ success: true, data: { message: `Switched to ${engine}. Engine modules reinitialized.` } });
    } catch (err) {
      return c.json({ success: false, error: { code: 'SWITCH_FAIL', message: (err as Error).message } }, 500);
    }
  });

  return app;
}
