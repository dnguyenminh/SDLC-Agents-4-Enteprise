/**
 * McpConfigRoutes — REST API for MCP server config management.
 * Endpoints: GET/POST/PUT/DELETE /api/mcp-servers
 */

import { Hono } from 'hono';
import { McpConfigService, ConfigError } from './McpConfigService.js';
import type { McpClientManager } from './McpClientManager.js';
import type { Logger } from 'pino';

export function createMcpConfigRoutes(
  configService: McpConfigService,
  clientManager: McpClientManager,
  logger?: Logger
): Hono {
  const app = new Hono();

  app.get('/api/mcp-servers', (c) => {
    const servers = configService.listServers();
    const withStatus = servers.map(srv => ({
      name: srv.name,
      url: srv.url,
      command: srv.command,
      type: srv.type || srv.transportType,
      disabled: srv.disabled ?? false,
      status: clientManager.isServerConnected(srv.name!) ? 'connected' : 'disconnected',
      tools: clientManager.getServerToolCount(srv.name!),
    }));
    return c.json({ servers: withStatus });
  });

  app.get('/api/mcp-servers/:name', (c) => {
    const name = c.req.param('name');
    const server = configService.getServer(name);
    if (!server) return c.json({ error: `Server "${name}" not found` }, 404);
    return c.json({
      ...server,
      status: clientManager.isServerConnected(name) ? 'connected' : 'disconnected',
      tools: clientManager.getServerToolCount(name),
    });
  });

  app.post('/api/mcp-servers', async (c) => {
    const body = await c.req.json();
    const { name, ...config } = body;
    if (!name) return c.json({ error: 'name is required' }, 400);

    try {
      configService.addServer(name, config);
    } catch (e) {
      if (e instanceof ConfigError) {
        return c.json({ error: e.message, details: e.validationErrors }, e.statusCode);
      }
      throw e;
    }

    let status = 'disconnected';
    let tools = 0;
    if (!config.disabled) {
      try {
        await clientManager.connectServer(name, config);
        status = 'connected';
        tools = clientManager.getServerToolCount(name);
      } catch (err) {
        logger?.warn({ name, err }, 'Connect failed after add');
      }
    }
    return c.json({ name, status, tools, transport: config.type }, 201);
  });

  app.put('/api/mcp-servers/:name', async (c) => {
    const name = c.req.param('name');
    const config = await c.req.json();

    try {
      configService.updateServer(name, config);
    } catch (e) {
      if (e instanceof ConfigError) {
        return c.json({ error: e.message, details: e.validationErrors }, e.statusCode);
      }
      throw e;
    }

    let status = 'disconnected';
    let tools = 0;
    try {
      await clientManager.disconnectServer(name);
      if (!config.disabled) {
        const full = configService.getServer(name)!;
        await clientManager.connectServer(name, full);
        status = 'connected';
        tools = clientManager.getServerToolCount(name);
      }
    } catch (err) {
      logger?.warn({ name, err }, 'Reconnect failed after update');
    }
    return c.json({ name, status, tools });
  });

  app.delete('/api/mcp-servers/:name', async (c) => {
    const name = c.req.param('name');
    const toolsBefore = clientManager.getServerToolCount(name);

    try {
      configService.removeServer(name);
    } catch (e) {
      if (e instanceof ConfigError) {
        return c.json({ error: e.message }, e.statusCode);
      }
      throw e;
    }

    try { await clientManager.disconnectServer(name); } catch { /* ok */ }
    return c.json({ removed: name, tools_removed: toolsBefore });
  });

  app.post('/api/mcp-servers/:name/reconnect', async (c) => {
    const name = c.req.param('name');
    const server = configService.getServer(name);
    if (!server) return c.json({ error: `Server "${name}" not found` }, 404);

    try {
      await clientManager.disconnectServer(name);
      await clientManager.connectServer(name, server);
      return c.json({ name, status: 'connected', tools: clientManager.getServerToolCount(name) });
    } catch (err: any) {
      return c.json({ name, status: 'failed', error: err.message });
    }
  });

  return app;
}
