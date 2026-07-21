import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getWorkspacePath } from '../../../config/index.js';
import { recordAudit } from '../../../admin/admin-db.js';
import { addMcpLog } from './mcp.js';
import type { AdminContext } from './context.js';

export function createMcpCrudRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/mcp/servers', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    if ((permCheck.roleData as { allowAdd?: boolean })?.allowAdd === false) return c.json({ error: 'Forbidden: not allowed to add servers' }, 403);
    const body = await c.req.json();
    const { name, url, type, command, args, env, disabled, autoApprove } = body;
    if (!name) return c.json({ error: 'name is required' }, 400);
    if (!url && !command) return c.json({ error: 'url or command is required' }, 400);
    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let orch: any = { mcpServers: {} };
    if (fs.existsSync(orchPath)) { try { orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8')); } catch (e) { ctx.logger.warn({ err: e, context: 'mcp-add' }, 'Failed to parse orch config for add'); } }
    if (!orch.mcpServers) orch.mcpServers = {};
    if (orch.mcpServers[name]) return c.json({ error: `Server "${name}" already exists` }, 409);
    const serverConfig: any = {};
    if (url) serverConfig.url = url;
    if (type) { serverConfig.type = type; serverConfig.transportType = type; } else { serverConfig.type = 'stdio'; serverConfig.transportType = 'stdio'; }
    if (command) serverConfig.command = command;
    if (args) serverConfig.args = args;
    if (env) serverConfig.env = env;
    if (disabled !== undefined) serverConfig.disabled = disabled;
    if (autoApprove) serverConfig.autoApprove = autoApprove;
    if (body.tools) serverConfig.tools = body.tools;
    orch.mcpServers[name] = serverConfig;
    const tmpPath = orchPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(orch, null, 2), 'utf-8');
    fs.renameSync(tmpPath, orchPath);
    addMcpLog(ctx, name, 'INFO', `Server added by ${user.username}`);
    await recordAudit(user.userId, user.username, 'ADD_SERVER', 'mcp', name);
    let status = disabled ? 'stopped' : 'disconnected';
    let toolCount = 0;
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager && !disabled) {
      try { await clientManager.connectServer(name, serverConfig); status = 'connected'; toolCount = clientManager.getServerToolCount(name); }
      catch (err: any) { addMcpLog(ctx, name, 'ERROR', `Connect failed: ${err.message}`); status = 'disconnected'; }
    }
    return c.json({ success: true, name, status, tools: toolCount }, 201);
  });

  app.delete('/api/admin/mcp/servers/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    if ((permCheck.roleData as { allowRemove?: boolean })?.allowRemove === false) return c.json({ error: 'Forbidden: not allowed to remove servers' }, 403);
    const serverId = c.req.param('id');
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes('*') && !allowedServers.includes(serverId)) return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let orch: any = { mcpServers: {} };
    if (fs.existsSync(orchPath)) { try { orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8')); } catch (e) { ctx.logger.warn({ err: e, context: 'mcp-delete' }, 'Failed to parse orch config for delete'); } }
    if (!orch.mcpServers?.[serverId]) return c.json({ error: `Server "${serverId}" not found` }, 404);
    delete orch.mcpServers[serverId];
    const tmpPath = orchPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(orch, null, 2), 'utf-8');
    fs.renameSync(tmpPath, orchPath);
    addMcpLog(ctx, serverId, 'INFO', `Server removed by ${user.username}`);
    await recordAudit(user.userId, user.username, 'REMOVE_SERVER', 'mcp', serverId);
    return c.json({ success: true, removed: serverId });
  });

  app.put('/api/admin/mcp/servers/:id', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    if ((permCheck.roleData as { allowEdit?: boolean })?.allowEdit === false) return c.json({ error: 'Forbidden: not allowed to edit server config' }, 403);
    const serverId = c.req.param('id');
    const allowedServers = (permCheck.roleData as any)?.allowedServers;
    if (Array.isArray(allowedServers) && !allowedServers.includes('*') && !allowedServers.includes(serverId)) return c.json({ error: 'Forbidden: server not in allowedServers' }, 403);
    const body = await c.req.json();
    const cfg = loadConfig();
    const orchPath = path.resolve(getWorkspacePath(), cfg.dataDir, cfg.orchestrationConfigPath);
    let orch: any = { mcpServers: {} };
    if (fs.existsSync(orchPath)) { try { orch = JSON.parse(fs.readFileSync(orchPath, 'utf-8')); } catch (e) { ctx.logger.warn({ err: e, context: 'mcp-update' }, 'Failed to parse orch config for update'); } }
    if (!orch.mcpServers?.[serverId]) return c.json({ error: `Server "${serverId}" not found` }, 404);
    const existing = orch.mcpServers[serverId];
    if (body.url !== undefined) existing.url = body.url;
    if (body.type !== undefined) { existing.type = body.type; existing.transportType = body.type; }
    if (body.command !== undefined) existing.command = body.command;
    if (body.args !== undefined) existing.args = body.args;
    if (body.env !== undefined) existing.env = body.env;
    if (body.disabled !== undefined) existing.disabled = body.disabled;
    if (body.autoApprove !== undefined) existing.autoApprove = body.autoApprove;
    const tmpPath = orchPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(orch, null, 2), 'utf-8');
    fs.renameSync(tmpPath, orchPath);
    addMcpLog(ctx, serverId, 'INFO', `Config updated by ${user.username}`);
    await recordAudit(user.userId, user.username, 'UPDATE_SERVER', 'mcp', serverId);
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager && !existing.disabled) {
      try { await clientManager.disconnectServer(serverId); await clientManager.connectServer(serverId, existing); }
      catch (err: any) { addMcpLog(ctx, serverId, 'ERROR', `Reconnect failed: ${err.message}`); }
    }
    return c.json({ success: true, name: serverId });
  });

  return app;
}

