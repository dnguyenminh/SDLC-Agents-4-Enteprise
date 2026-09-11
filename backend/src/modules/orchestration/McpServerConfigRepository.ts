/**
 * McpServerConfigRepository — Read MCP server configs from DB table mcp_servers.
 * SA4E-257
 */

import { getDbAdapter } from '../../admin/admin-db.js';
import type { ServerConfig } from './McpConfigService.js';

export interface ServerConfigWithName extends ServerConfig {
  name: string;
  serverId?: string;
  projectId?: string;
}

interface DbRow {
  server_id: string;
  project_id: string;
  name: string;
  transport_type: string;
  url?: string | null;
  command?: string | null;
  args?: string | null;
  env?: string | null;
  disabled: number;
  auto_approve?: string | null;
  tools?: string | null;
  created_at?: string;
  updated_at?: string;
}

export class McpServerConfigRepository {
  private static safeParse(value: string | null | undefined): unknown {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private static normalizeTransport(type: string): string {
    return type === 'streamable-http' ? 'httpStream' : type;
  }

  private static mapRow(row: DbRow): ServerConfigWithName {
    const transport = this.normalizeTransport(row.transport_type);
    return {
      name: row.name,
      serverId: row.server_id,
      projectId: row.project_id,
      type: transport,
      transportType: transport,
      url: row.url || undefined,
      command: row.command || undefined,
      args: (this.safeParse(row.args) as string[]) || [],
      env: (this.safeParse(row.env) as Record<string, string>) || {},
      disabled: !!row.disabled,
      autoApprove: (this.safeParse(row.auto_approve) as string[]) || [],
    };
  }

  static async listEnabledServers(projectId?: string): Promise<ServerConfigWithName[]> {
    try {
      const adapter = getDbAdapter();
      if (!adapter.isConnected?.()) {
        console.warn('[McpServerConfigRepository] DB not connected');
        return [];
      }
      let sql = 'SELECT * FROM mcp_servers WHERE disabled = 0';
      const params: unknown[] = [];
      if (projectId) {
        sql += ' AND project_id = ?';
        params.push(projectId);
      }
      const rows = await adapter.allAsync<DbRow>(sql, params);
      return rows.map(r => this.mapRow(r));
    } catch (err) {
      console.warn('[McpServerConfigRepository] Failed to load enabled servers', err);
      return [];
    }
  }

  static async getServerByName(name: string, projectId?: string): Promise<ServerConfigWithName | null> {
    try {
      const adapter = getDbAdapter();
      if (!adapter.isConnected?.()) return null;
      let sql = 'SELECT * FROM mcp_servers WHERE name = ?';
      const params: unknown[] = [name];
      if (projectId) {
        sql += ' AND project_id = ?';
        params.push(projectId);
      }
      const row = await adapter.getAsync<DbRow>(sql, params);
      if (!row) return null;
      return this.mapRow(row);
    } catch (err) {
      console.warn('[McpServerConfigRepository] Failed to get server', err);
      return null;
    }
  }
}
