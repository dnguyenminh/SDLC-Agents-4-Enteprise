import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getWorkspacePath } from '../../../config/index.js';
import { recordAudit, getDbAdapter } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';

export function addMcpLog(ctx: AdminContext, serverId: string, level: string, message: string) {
  if (!ctx.mcpServerLogs[serverId]) ctx.mcpServerLogs[serverId] = [];
  ctx.mcpServerLogs[serverId].push({ timestamp: new Date().toISOString(), level, message });
  if (ctx.mcpServerLogs[serverId].length > 100) ctx.mcpServerLogs[serverId].shift();
}

export function createMcpRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.get('/api/admin/mcp/servers', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_ACCESS');
    if (permCheck instanceof Response) return permCheck;
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    let servers: any[] = [];
    try {
      const adapter = getDbAdapter();
      const rows = await adapter.allAsync<any>('SELECT * FROM mcp_servers');
      const safeParse = (v: string | null) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
      servers = rows.map((row: any) => {
        const name = row.name;
        const serverToggles = ctx.toolToggles[name] || {};
        const isConnected = clientManager?.isServerConnected?.(name) ?? false;
        const actualToolCount = clientManager?.getServerToolCount?.(name) ?? 0;
        const configTools = safeParse(row.tools) || safeParse(row.auto_approve) || [];
        let tools: any[];
        if (isConnected && actualToolCount > 0) {
          const proxied = (clientManager?.getProxiedTools?.() || []).filter((t: any) => t.category === name);
          tools = proxied.map((t: any) => ({ name: t.name, description: t.description || '', enabled: serverToggles[t.name] !== false }));
        } else {
          tools = (Array.isArray(configTools) ? configTools : []).map((t: string) => ({ name: t, description: '', enabled: serverToggles[t] !== false }));
        }
        const transportType = row.transport_type === 'streamable-http' ? 'httpStream' : (row.transport_type || 'stdio');
        return {
          id: name,
          name,
          url: row.url || '',
          type: transportType,
          transportType,
          command: row.command || '',
          args: safeParse(row.args) || [],
          env: safeParse(row.env) || {},
          disabled: !!row.disabled,
          status: row.disabled ? 'stopped' : (isConnected ? 'running' : 'disconnected'),
          tools,
        };
      });
    } catch (err) { ctx.logger.warn({ err, context: 'mcp-list-db' }, 'Failed to list MCP servers from DB'); }
    const allHandlers = ctx.registry?.getToolHandlers?.();
    if (allHandlers) {
      const allDefs = ctx.registry?.getAllToolDefinitions?.() || [];
      const defMap = new Map(allDefs.map((d: any) => [d.name, d.description || '']));
      const internalTools = Array.from(allHandlers.keys());
      servers.push({
        id: 'code-intel', name: 'code-intel', url: 'internal', type: 'internal',
        transportType: 'internal', command: '', args: [], env: {}, disabled: false,
        status: 'running', tools: internalTools.map((t: unknown) => ({ name: t as string, description: defMap.get(t as string) || '', enabled: true })),
      });
    }
    const allowedServers = (permCheck.roleData as { allowedServers?: string[] })?.allowedServers;
    if (Array.isArray(allowedServers)) servers = servers.filter(s => allowedServers.includes(s.id));
    return c.json({ servers });
  });

  app.post('/api/admin/mcp/servers/:id/restart', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    if ((permCheck.roleData as { allowRestart?: boolean })?.allowRestart === false) return c.json({ error: 'Forbidden: not allowed to restart servers' }, 403);
    const serverId = c.req.param('id');
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes('*') && !allowedServers.includes(serverId)) return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    addMcpLog(ctx, serverId, 'INFO', `Server restart requested by ${user.username}`);
    await recordAudit(user.userId, user.username, 'RESTART_SERVER', 'mcp', serverId);
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager) {
      try {
        await clientManager.disconnectServer(serverId);
        const adapter = getDbAdapter();
        const safeParse = (v: string | null) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
        const row = await adapter.getAsync<any>('SELECT * FROM mcp_servers WHERE name = ? OR server_id = ?', [serverId, serverId]);
        if (row && !row.disabled) {
          const transportType = row.transport_type === 'streamable-http' ? 'httpStream' : row.transport_type;
          const serverCfg = {
            name: row.name,
            url: row.url,
            command: row.command,
            args: safeParse(row.args) || [],
            env: safeParse(row.env) || {},
            type: transportType,
            transportType,
            disabled: !!row.disabled,
            autoApprove: safeParse(row.auto_approve) || [],
          };
          await clientManager.connectServer(serverId, serverCfg);
          const toolCount = clientManager.getServerToolCount(serverId);
          addMcpLog(ctx, serverId, 'INFO', `Reconnected. ${toolCount} tools loaded.`);
          return c.json({ success: true, status: 'connected', tools: toolCount });
        }
      } catch (err: any) { addMcpLog(ctx, serverId, 'ERROR', `Restart failed: ${err.message}`); return c.json({ success: false, error: err.message, status: 'disconnected' }); }
    }
    return c.json({ success: true, message: 'Restart signal sent' });
  });

  app.post('/api/admin/mcp/servers/:id/tools/:toolName/toggle', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    const serverId = c.req.param('id');
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes(serverId)) return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    const toolName = c.req.param('toolName');
    const { enabled } = await c.req.json();
    if (!ctx.toolToggles[serverId]) ctx.toolToggles[serverId] = {};
    ctx.toolToggles[serverId][toolName] = enabled !== false;
    addMcpLog(ctx, serverId, 'INFO', `Tool "${toolName}" ${enabled !== false ? 'enabled' : 'disabled'} by ${user.username}`);
    await recordAudit(user.userId, user.username, 'TOGGLE_TOOL', 'mcp', `${serverId}/${toolName}`, JSON.stringify({ enabled }));
    return c.json({ success: true, serverId, toolName, enabled: enabled !== false });
  });

  app.get('/api/admin/mcp/servers/:id/logs', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_ACCESS');
    if (permCheck instanceof Response) return permCheck;
    const serverId = c.req.param('id');
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes(serverId)) return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    const logs = ctx.mcpServerLogs[serverId] || [];
    return c.json({ serverId, logs });
  });

  return app;
}


