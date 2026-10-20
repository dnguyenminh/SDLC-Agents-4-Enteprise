/**
 * Database Configuration admin routes.
 * Implements: SA4E-33 — multi-DB support with admin UI
 *
 * BR-18 facade — migration/switch routes live in ./database/engine-routes.ts,
 * shared schema + engine resolution in ./database/shared.ts.
 */

import { Hono } from 'hono';
import * as path from 'path';
import type { AdminContext } from './context.js';
import { DatabaseConfigService } from '../../../database/config/DatabaseConfigService.js';
import { DatabaseAdapterFactory } from '../../../database/factory/DatabaseAdapterFactory.js';
import { loadConfig } from '../../../config/index.js';
import { connectionSchema, resolveActiveEngineName } from './database/shared.js';
import { registerMigrationRoutes, registerSwitchRoutes } from './database/engine-routes.js';

export function createDatabaseRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  const cfg = loadConfig();
  const dataDir = path.isAbsolute(cfg.dataDir) ? cfg.dataDir : path.resolve(cfg.workspace, cfg.dataDir);
  const configService = new DatabaseConfigService(dataDir);
  // SA4E-45: registry for hot-swap after engine switch
  const registry = ctx.registry;

  // SEC: Auth helper — all database endpoints require CONFIG_EDIT permission
  async function authGuard(c: any): Promise<Response | null> {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const perm = await ctx.requirePermission(c, user.userId, 'CONFIG_EDIT');
    if (perm instanceof Response) return perm;
    return null;
  }

  registerMigrationRoutes(app, { authGuard, configService, registry, dataDir, sqliteDbPath: cfg.sqliteDbPath });
  registerSwitchRoutes(app, { authGuard, configService, registry, dataDir, sqliteDbPath: cfg.sqliteDbPath });

  app.get('/api/admin/database/status', async (c) => {
    const deny = await authGuard(c); if (deny) return deny;
     try {
       const config = configService.load();
       const engine = resolveActiveEngineName(config);
      // Non-sqlite engines expose connection params; sqlite does not.
      const engineKey = engine as Exclude<keyof typeof config.engines, 'sqlite'>;
      const engineCfg = engine !== 'sqlite' ? config.engines[engineKey] : undefined;
      const connParams = engineCfg
        ? { host: engineCfg.host, port: engineCfg.port, username: engineCfg.username, database: engineCfg.database, ssl: engineCfg.ssl }
        : undefined;
      return c.json({ success: true, data: { engine, status: 'connected', details: config.engines.sqlite, connection: connParams, lastMigration: config.migration.lastMigration } });
    } catch (err) {
      return c.json({ success: false, error: { code: 'STATUS_ERROR', message: (err as Error).message } }, 500);
    }
  });

  app.post('/api/admin/database/test-connection', async (c) => {
    const deny = await authGuard(c); if (deny) return deny;
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
    const deny = await authGuard(c); if (deny) return deny;
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

  return app;
}
