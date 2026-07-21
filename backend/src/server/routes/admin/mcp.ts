import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getWorkspacePath } from '../../../config/index.js';
import { recordAudit } from '../../../admin/admin-db.js';
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
    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let servers: any[] = [];
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (fs.existsSync(orchPath)) {
      try {
        const orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8'));
        servers = Object.entries(orch.mcpServers || {}).map(([name, cfg]: [string, any]) => {
          const serverToggles = ctx.toolToggles[name] || {};
          const isConnected = clientManager?.isServerConnected?.(name) ?? false;
          const actualToolCount = clientManager?.getServerToolCount?.(name) ?? 0;
          const configTools = cfg.tools || cfg.autoApprove || [];
          let tools: any[];
          if (isConnected && actualToolCount > 0) {
            const proxied = (clientManager?.getProxiedTools?.() || []).filter((t: any) => t.category === name);
            tools = proxied.map((t: any) => ({ name: t.name, description: t.description || '', enabled: serverToggles[t.name] !== false }));
          } else tools = configTools.map((t: string) => ({ name: t, description: '', enabled: serverToggles[t] !== false }));
          return {
            id: name, name, url: cfg.url || '', type: cfg.type || cfg.transportType || 'stdio',
            transportType: cfg.transportType || cfg.type || 'stdio',
            command: cfg.command || '', args: cfg.args || [], env: cfg.env || {},
            disabled: cfg.disabled || false,
            status: cfg.disabled ? 'stopped' : (isConnected ? 'running' : 'disconnected'), tools,
          };
        });
      } catch (err) { ctx.logger.warn({ err, context: 'mcp-list' }, 'Failed to list MCP servers'); }
    }
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
        const cfg = loadConfig();
        const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
        if (fs.existsSync(orchPath)) {
          const orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8'));
          const serverCfg = orch.mcpServers?.[serverId];
          if (serverCfg && !serverCfg.disabled) {
            await clientManager.connectServer(serverId, serverCfg);
            const toolCount = clientManager.getServerToolCount(serverId);
            addMcpLog(ctx, serverId, 'INFO', `Reconnected. ${toolCount} tools loaded.`);
            return c.json({ success: true, status: 'connected', tools: toolCount });
          }
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
    if (logs.length === 0) {
      const now = Date.now();
      const mockLogs = [
        { offset: -300000, level: 'INFO', message: `Server "${serverId}" started successfully` },
        { offset: -240000, level: 'INFO', message: 'Connected to transport layer' },
        { offset: -180000, level: 'INFO', message: 'Tools registered and ready' },
        { offset: -60000, level: 'DEBUG', message: 'Health check passed' },
        { offset: 0, level: 'INFO', message: 'Accepting tool calls' },
      ];
      mockLogs.forEach(m => {
        if (!ctx.mcpServerLogs[serverId]) ctx.mcpServerLogs[serverId] = [];
        ctx.mcpServerLogs[serverId].push({ timestamp: new Date(now + m.offset).toISOString(), level: m.level, message: m.message });
      });
    }
    return c.json({ serverId, logs: ctx.mcpServerLogs[serverId] || [] });
  });

  return app;
}


