// KSA-286: MCP Admin Service
import { MCPServerInfo, AdminErrorCode } from '../types/admin.types.js';

export class MCPAdminService {
  constructor(private mcpOrchestrator: any) {}

  listServers(): MCPServerInfo[] {
    const servers = this.mcpOrchestrator?.getServers?.() || [];
    return servers.map((s: any) => ({
      serverId: s.id || s.serverId,
      serverName: s.name || s.serverName || s.id,
      status: s.status || 'STOPPED',
      tools: (s.tools || []).map((t: any) => ({ name: t.name, enabled: t.enabled !== false, lastCall: t.lastCall })),
      lastHeartbeat: s.lastHeartbeat,
      uptimeSeconds: s.uptimeSeconds || 0,
      restartCount: s.restartCount || 0,
    }));
  }

  getServer(serverId: string): MCPServerInfo | null {
    const servers = this.listServers();
    return servers.find(s => s.serverId === serverId) || null;
  }

  async restart(serverId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.mcpOrchestrator?.restartServer?.(serverId);
      return { success: true, message: `Server ${serverId} restarted` };
    } catch (e: any) {
      throw { code: AdminErrorCode.RESTART_FAILED, message: e.message || 'Restart failed' };
    }
  }

  toggleTool(serverId: string, toolName: string, enabled: boolean): void {
    this.mcpOrchestrator?.toggleTool?.(serverId, toolName, enabled);
  }

  getLogs(serverId: string, lines = 200): string[] {
    return this.mcpOrchestrator?.getServerLogs?.(serverId, lines) || [];
  }
}

