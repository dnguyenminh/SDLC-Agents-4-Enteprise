/**
 * SA4E-215 — MCP Server declaration/config routes (aligned to real sa4e_db).
 *
 * CRUD on the NEW `mcp_servers` table. Distinct from mcp_tools (server tool
 * ingest/search). Scoped by project_registry.project_id (TEXT FK, no constraint
 * enforced via adapter but validated against project_registry).
 * Uses getDbAdapter() + recordAudit.
 * Mounted at /api/sa4e-215/mcp/servers (via sa4e-215/index.ts).
 *
 * BR-18 facade — create/update handlers + row mapper live in ./servers/server-handlers.ts.
 */
import { Hono } from 'hono';
import pino from 'pino';
import { getDbAdapter, recordAudit } from '../../../admin/admin-db.js';
import { requireSa4eUser } from '../sa4e-215/guard.js';
import {
  createServerHandler,
  rowToServer,
  updateServerHandler,
} from './servers/server-handlers.js';

const logger = pino({ name: 'sa4e-215-mcp-servers' });

export function createSa4e215McpServersRoutes(): Hono {
  const app = new Hono();

  // GET /api/sa4e-215/mcp/servers?projectId=&disabled=
  app.get('/', async (c) => {
    const auth = await requireSa4eUser(c);
    if (auth instanceof Response) return auth;

    try {
      const adapter = getDbAdapter();
      const projectId = c.req.query('projectId');
      const disabled = c.req.query('disabled');

      let sql = 'SELECT * FROM mcp_servers WHERE 1=1';
      const params: unknown[] = [];
      if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
      if (disabled !== undefined) {
        sql += ' AND disabled = ?';
        params.push(disabled === 'true' || disabled === '1' ? 1 : 0);
      }
      sql += ' ORDER BY created_at DESC';

      const rows = await adapter.allAsync<Record<string, unknown>>(sql, params);
      return c.json({ success: true, data: rows.map(rowToServer) });
    } catch (err: any) {
      logger.error({ err }, 'list mcp servers error');
      return c.json({ success: false, error: { code: 'ERR_009', message: 'Failed to list MCP servers' } }, 500);
    }
  });

  // POST /api/sa4e-215/mcp/servers
  app.post('/', async (c) => {
    const auth = await requireSa4eUser(c);
    if (auth instanceof Response) return auth;
    return createServerHandler(c, auth);
  });

  // GET /api/sa4e-215/mcp/servers/:id
  app.get('/:id', async (c) => {
    const auth = await requireSa4eUser(c);
    if (auth instanceof Response) return auth;

    try {
      const id = c.req.param('id');
      const adapter = getDbAdapter();
      const r = await adapter.getAsync<Record<string, unknown>>(
        'SELECT * FROM mcp_servers WHERE server_id = ?', [id],
      );
      if (!r) {
        return c.json({ success: false, error: { code: 'ERR_006', message: 'MCP server not found' } }, 404);
      }
      return c.json({ success: true, data: rowToServer(r) });
    } catch (err: any) {
      logger.error({ err }, 'get mcp server error');
      return c.json({ success: false, error: { code: 'ERR_009', message: 'Failed to get MCP server' } }, 500);
    }
  });

  // PUT /api/sa4e-215/mcp/servers/:id
  app.put('/:id', async (c) => {
    const auth = await requireSa4eUser(c);
    if (auth instanceof Response) return auth;
    return updateServerHandler(c, auth);
  });

  // DELETE /api/sa4e-215/mcp/servers/:id
  app.delete('/:id', async (c) => {
    const auth = await requireSa4eUser(c);
    if (auth instanceof Response) return auth;

    try {
      const id = c.req.param('id');
      const adapter = getDbAdapter();
      const existing = await adapter.getAsync<{ server_id: string }>(
        'SELECT server_id FROM mcp_servers WHERE server_id = ?', [id],
      );
      if (!existing) {
        return c.json({ success: false, error: { code: 'ERR_006', message: 'MCP server not found' } }, 404);
      }
      await adapter.runAsync('DELETE FROM mcp_servers WHERE server_id = ?', [id]);
      await recordAudit(auth.userId, auth.username, 'MCP_SERVER_DELETE', 'mcp_server', id);
      return c.json({ success: true, message: 'MCP server deleted' });
    } catch (err: any) {
      logger.error({ err }, 'delete mcp server error');
      return c.json({ success: false, error: { code: 'ERR_009', message: 'Failed to delete MCP server' } }, 500);
    }
  });

  return app;
}
