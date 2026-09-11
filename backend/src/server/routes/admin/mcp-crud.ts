import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getWorkspacePath } from '../../../config/index.js';
import { recordAudit, getDbAdapter } from '../../../admin/admin-db.js';
import { addMcpLog } from './mcp.js';
import type { AdminContext } from './context.js';
import * as crypto from 'crypto';
import { McpServerConfigRepository } from '../../../modules/orchestration/McpServerConfigRepository.js';

export function createMcpCrudRoutes(ctx: AdminContext): Hono {
  const app = new Hono();

  app.post('/api/admin/mcp/servers', async (c) => {
    const user = await ctx.requireAuth(c);
    if (user instanceof Response) return user;
    const permCheck = await ctx.requirePermission(c, user.userId, 'MCP_MANAGE');
    if (permCheck instanceof Response) return permCheck;
    if ((permCheck.roleData as { allowAdd?: boolean })?.allowAdd === false) return c.json({ error: 'Forbidden: not allowed to add servers' }, 403);
    const body = await c.req.json();
    const { name, url, type, command, args, env, disabled, autoApprove, tools } = body;
    if (!name) return c.json({ error: 'name is required' }, 400);
    if (!url && !command) return c.json({ error: 'url or command is required' }, 400);
    const adapter = getDbAdapter();
    const projectRow = await adapter.getAsync<any>('SELECT project_id FROM project_registry LIMIT 1');
    const projectId = projectRow?.project_id || 'default';
    const existing = await adapter.getAsync<any>('SELECT server_id FROM mcp_servers WHERE name = ? AND project_id = ?', [name, projectId]);
    if (existing) return c.json({ error: `Server "${name}" already exists` }, 409);
    const serverId = 'mcp-' + crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const transportType = type || 'stdio';
    await adapter.runAsync(
      `INSERT INTO mcp_servers (server_id, project_id, name, transport_type, url, command, args, env, disabled, auto_approve, tools, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        serverId, projectId, name, transportType, url || null, command || null,
        args ? JSON.stringify(args) : null,
        env ? JSON.stringify(env) : null,
        disabled ? 1 : 0,
        autoApprove ? JSON.stringify(autoApprove) : null,
        tools ? JSON.stringify(tools) : null,
        now, now,
      ]
    );
    addMcpLog(ctx, name, 'INFO', `Server added by ${user.username}`);
    await recordAudit(user.userId, user.username, 'ADD_SERVER', 'mcp', name);
    let status = disabled ? 'stopped' : 'disconnected';
    let toolCount = 0;
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager && !disabled) {
      try {
        const cfg = await McpServerConfigRepository.getServerByName(name, projectId);
        if (cfg) {
          await clientManager.connectServer(cfg.name, cfg);
          status = 'connected';
          toolCount = clientManager.getServerToolCount(cfg.name);
          addMcpLog(ctx, name, 'INFO', `Real-time connect after create: ${status}`);
        }
      } catch (err: any) {
        addMcpLog(ctx, name, 'ERROR', `Connect failed after create: ${err.message}`);
        status = 'disconnected';
      }
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
    const adapter = getDbAdapter();
    const projectRow = await adapter.getAsync<any>('SELECT project_id FROM project_registry LIMIT 1');
    const projectId = projectRow?.project_id || 'default';
    const existing = await adapter.getAsync<any>('SELECT server_id, name FROM mcp_servers WHERE (name = ? OR server_id = ?) AND project_id = ?', [serverId, serverId, projectId]);
    if (!existing) return c.json({ error: `Server "${serverId}" not found` }, 404);
    const serverName = existing.name || existing.server_id;
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager) {
      try {
        await clientManager.disconnectServer(serverName);
        addMcpLog(ctx, serverName, 'INFO', `Real-time disconnect before delete`);
      } catch (e: any) {
        addMcpLog(ctx, serverName, 'WARN', `Disconnect failed: ${e.message}`);
      }
    }
    await adapter.runAsync('DELETE FROM mcp_servers WHERE server_id = ?', [existing.server_id]);
    addMcpLog(ctx, serverName, 'INFO', `Server removed by ${user.username}`);
    await recordAudit(user.userId, user.username, 'REMOVE_SERVER', 'mcp', serverName);
    return c.json({ success: true, removed: serverName });
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
    const adapter = getDbAdapter();
    const projectRow = await adapter.getAsync<any>('SELECT project_id FROM project_registry LIMIT 1');
    const projectId = projectRow?.project_id || 'default';
    const existing = await adapter.getAsync<any>('SELECT * FROM mcp_servers WHERE (name = ? OR server_id = ?) AND project_id = ?', [serverId, serverId, projectId]);
    if (!existing) return c.json({ error: `Server "${serverId}" not found` }, 404);
    const serverName = existing.name;
    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, val: any) => { fields.push(`${col} = ?`); params.push(val); };
    if (body.url !== undefined) set('url', body.url);
    if (body.type !== undefined) set('transport_type', body.type);
    if (body.command !== undefined) set('command', body.command);
    if (body.args !== undefined) set('args', JSON.stringify(body.args));
    if (body.env !== undefined) set('env', JSON.stringify(body.env));
    if (body.disabled !== undefined) set('disabled', body.disabled ? 1 : 0);
    if (body.autoApprove !== undefined) set('auto_approve', JSON.stringify(body.autoApprove));
    const configChanged = body.type !== undefined || body.command !== undefined || body.url !== undefined || body.args !== undefined || body.env !== undefined;
    if (fields.length) {
      set('updated_at', new Date().toISOString());
      params.push(existing.server_id);
      await adapter.runAsync(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE server_id = ?`, params);
    }
    addMcpLog(ctx, serverName, 'INFO', `Config updated by ${user.username}`);
    await recordAudit(user.userId, user.username, 'UPDATE_SERVER', 'mcp', serverName);
    const orchestration = ctx.registry?.getModule?.('orchestration');
    const clientManager = orchestration?.getClientManager?.();
    if (clientManager) {
      const cfg = await McpServerConfigRepository.getServerByName(serverName, projectId);
      if (configChanged) {
        try { await clientManager.disconnectServer(serverName); addMcpLog(ctx, serverName, 'INFO', 'Disconnected for config change'); } catch { /* ignore */ }
        if (cfg && !cfg.disabled) {
          try {
            await clientManager.connectServer(serverName, cfg);
            addMcpLog(ctx, serverName, 'INFO', 'Real-time reconnect after config change');
          } catch (err: any) {
            addMcpLog(ctx, serverName, 'ERROR', `Reconnect failed: ${err.message}`);
          }
        }
      } else if (body.disabled !== undefined) {
        if (body.disabled) {
          try { await clientManager.disconnectServer(serverName); addMcpLog(ctx, serverName, 'INFO', 'Disconnected due to disable'); } catch { /* ignore */ }
        } else if (cfg) {
          try {
            await clientManager.connectServer(serverName, cfg);
            addMcpLog(ctx, serverName, 'INFO', 'Real-time connect after enable');
          } catch (err: any) {
            addMcpLog(ctx, serverName, 'ERROR', `Connect after enable failed: ${err.message}`);
          }
        }
      }
    }
    return c.json({ success: true, name: serverName });
  });

  return app;
}

