/**
 * McpClientManager — Facade for child MCP server management with health monitoring.
 * SA4E-37: Added health check, auto-reconnect, and connection state tracking.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolDefinition } from '../../types/tool.js';
import type { ServerConfig } from './McpConfigService.js';
import type { HealthCheckConfig, ServerStatusEntry, ServerStateChangeCallback, Unsubscribe } from './types/health.js';
import { DEFAULT_HEALTH_CONFIG, PRODUCTION_HEALTH_CONFIG } from './types/health.js';
import { ConnectionStateTracker } from './health/ConnectionStateTracker.js';
import { HealthMonitor } from './health/HealthMonitor.js';
import { ReconnectManager } from './health/ReconnectManager.js';
import { createTransport } from './health/TransportFactory.js';

export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private toolsToServer: Map<string, string> = new Map();
  private proxiedTools: ToolDefinition[] = [];
  private serverConfigs: Map<string, ServerConfig> = new Map();
  private logger: Logger;
  private healthConfig: HealthCheckConfig;
  private stateTracker: ConnectionStateTracker;
  private healthMonitor: HealthMonitor;
  private reconnectManager: ReconnectManager;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'McpClientManager' });
    this.healthConfig = { ...PRODUCTION_HEALTH_CONFIG };
    this.stateTracker = new ConnectionStateTracker(logger);
    this.healthMonitor = new HealthMonitor(logger, {
      getConnectedServers: () => this.getConnectedClients(),
      onPingSuccess: (name) => this.stateTracker.recordPingSuccess(name),
      onPingFailed: (name, error) => this.handlePingFailed(name, error),
    }, this.healthConfig);
    this.reconnectManager = new ReconnectManager(logger, this.healthConfig, {
      onReconnectSuccess: (name, client) => this.handleReconnectSuccess(name, client),
      onReconnectFailed: (name, attempt, err) => this.handleReconnectFailed(name, attempt, err),
      onMaxRetriesExhausted: (name) => this.handleMaxRetriesExhausted(name),
    });
  }

  async initializeAll(): Promise<void> {
    const workspace = process.env.CODE_INTEL_WORKSPACE || process.cwd();
    const dataDir = process.env.CODE_INTEL_DATA_DIR || '.code-intel';
    const configPath = path.resolve(workspace, dataDir, 'orchestration.json');

    if (!fs.existsSync(configPath)) {
      this.logger.info({ configPath }, 'No orchestration.json found, skipping child servers');
      return;
    }

    let config: { mcpServers: Record<string, ServerConfig> };
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch (err) {
      this.logger.error({ err, configPath }, 'Failed to read orchestration.json');
      return;
    }

    const servers = Object.entries(config.mcpServers || {});
    this.logger.info({ count: servers.length }, 'Connecting child MCP servers');

    for (const [name, serverConfig] of servers) {
      try {
        await this.connectServer(name, serverConfig);
      } catch (err) {
        this.logger.error({ err, server: name }, 'Failed to connect child server (will retry via health monitor)');
        // Register so health monitor can attempt reconnect later
        if (!this.stateTracker.getState(name)) this.stateTracker.register(name);
        this.serverConfigs.set(name, serverConfig);
      }
    }
  }

  getProxiedTools(): ToolDefinition[] { return this.proxiedTools; }

  getServersStatus(): ServerStatusEntry[] {
    return this.stateTracker.getAllStatuses((name) => this.getServerToolCount(name));
  }

  ownsTool(toolName: string): boolean { return this.toolsToServer.has(toolName); }

  async executeTool(toolName: string, args: unknown): Promise<any> {
    const serverName = this.toolsToServer.get(toolName);
    if (!serverName) throw new Error(`Tool ${toolName} is not managed by any child server`);

    const state = this.stateTracker.getState(serverName);
    if (state !== 'connected') throw new Error(this.getErrorMsg(serverName, state));

    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Client for server ${serverName} is disconnected`);

    this.logger.info({ toolName, serverName }, 'Proxying tool execution to child server');
    const result = await client.callTool({ name: toolName, arguments: args as Record<string, unknown> });
    return { content: result.content, isError: result.isError };
  }

  async connectServer(name: string, config: ServerConfig): Promise<void> {
    if (config.disabled || name === 'code-intelligence') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = createTransport(name, config) as any;
    const client = new Client({ name: 'code-intel-orchestrator', version: '1.0.0' }, { capabilities: {} });
    await Promise.race([
      client.connect(transport),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), 10_000)),
    ]);
    this.clients.set(name, client);
    this.serverConfigs.set(name, config);
    if (!this.stateTracker.getState(name)) this.stateTracker.register(name);
    this.stateTracker.transition(name, 'connected');
    await this.registerServerTools(name, client);
    this.logger.info({ name, tools: this.getServerToolCount(name) }, 'Server connected');
  }

  async disconnectServer(name: string): Promise<void> {
    this.reconnectManager.cancelReconnect(name);
    const client = this.clients.get(name);
    if (client) {
      try { await client.close(); } catch (err) {
        this.logger.warn({ err, name }, 'Failed to close MCP client connection');
      }
      this.clients.delete(name);
    }
    this.clearServerTools(name);
    this.stateTracker.transition(name, 'disconnected');
    this.serverConfigs.delete(name);
  }

  async shutdownAll(): Promise<void> {
    this.stopHealthMonitor();
    for (const [name, client] of this.clients.entries()) {
      try { await client.close(); } catch (e) {
        this.logger.error({ err: e, serverName: name }, 'Error closing client');
      }
    }
  }

  startHealthMonitor(): void { this.healthMonitor.start(); }
  stopHealthMonitor(): void { this.healthMonitor.stop(); }

  async reconnectServer(name: string): Promise<void> {
    const state = this.stateTracker.getState(name);
    if (state === undefined) throw new Error(`Unknown server: ${name}`);
    if (state === 'disconnected') throw new Error('Cannot reconnect manually disconnected server');
    if (state === 'connected' || state === 'reconnecting') return;
    this.stateTracker.resetReconnectState(name);
    this.stateTracker.transition(name, 'reconnecting');
    const config = this.serverConfigs.get(name);
    if (!config) throw new Error(`Server config not found for '${name}'`);
    this.reconnectManager.scheduleReconnect(name, config, 1);
  }

  onServerStateChange(cb: ServerStateChangeCallback): Unsubscribe {
    return this.stateTracker.onStateChange(cb);
  }

  setHealthCheckConfig(config: Partial<HealthCheckConfig>): void {
    this.healthConfig = { ...this.healthConfig, ...config };
    this.healthMonitor.updateConfig(this.healthConfig);
    this.reconnectManager.updateConfig(this.healthConfig);
  }

  isServerConnected(name: string): boolean {
    return this.clients.has(name) && this.stateTracker.getState(name) === 'connected';
  }

  getServerToolCount(name: string): number {
    let count = 0;
    for (const [, sn] of this.toolsToServer.entries()) { if (sn === name) count++; }
    return count;
  }

  // --- Private ---

  private getConnectedClients(): Map<string, Client> {
    const connected = new Map<string, Client>();
    for (const [name, client] of this.clients.entries()) {
      if (this.stateTracker.getState(name) === 'connected') connected.set(name, client);
    }
    return connected;
  }

  private handlePingFailed(name: string, error: string): void {
    this.stateTracker.recordPingFailure(name, error);
    if (!this.stateTracker.isThresholdBreached(name, this.healthConfig.failureThreshold)) return;
    this.stateTracker.transition(name, 'unhealthy', error);
    this.stateTracker.transition(name, 'reconnecting');
    const config = this.serverConfigs.get(name);
    if (!config) return;
    const entry = this.stateTracker.getEntry(name);
    if (!entry) return;
    entry.reconnectAttempts = 1;
    const next = this.reconnectManager.scheduleReconnect(name, config, 1);
    if (next) entry.nextRetryAt = next;
  }

  private handleReconnectSuccess(name: string, client: Client): void {
    this.clients.set(name, client);
    this.clearServerTools(name);
    void this.registerServerTools(name, client).then(() => {
      this.stateTracker.resetReconnectState(name);
      this.stateTracker.transition(name, 'connected');
      this.logger.info({ server: name }, 'Reconnected successfully');
    });
  }

  private handleReconnectFailed(name: string, attempt: number, error: string): void {
    const entry = this.stateTracker.getEntry(name);
    if (!entry) return;
    entry.reconnectAttempts = attempt + 1;
    entry.lastError = error;
    const config = this.serverConfigs.get(name);
    if (!config) return;
    const next = this.reconnectManager.scheduleReconnect(name, config, attempt + 1);
    if (next) entry.nextRetryAt = next;
  }

  private handleMaxRetriesExhausted(name: string): void {
    this.stateTracker.transition(name, 'failed');
    this.logger.error({ server: name, attempts: this.healthConfig.maxRetries }, 'Max retries exhausted');
  }

  private async registerServerTools(name: string, client: Client): Promise<void> {
    const toolsResult = await client.listTools();
    for (const tool of toolsResult.tools ?? []) {
      this.toolsToServer.set(tool.name, name);
      this.proxiedTools.push({
        name: tool.name, description: tool.description ?? '',
        category: name as ToolDefinition['category'], inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
      });
    }
  }

  private clearServerTools(name: string): void {
    const names: string[] = [];
    for (const [tn, sn] of this.toolsToServer.entries()) { if (sn === name) names.push(tn); }
    for (const tn of names) this.toolsToServer.delete(tn);
    this.proxiedTools = this.proxiedTools.filter((t) => !names.includes(t.name));
  }

  private getErrorMsg(name: string, state: string | undefined): string {
    const max = this.healthConfig.maxRetries;
    if (state === 'reconnecting') {
      const a = this.stateTracker.getEntry(name)?.reconnectAttempts ?? 0;
      return `Server '${name}' is currently reconnecting (attempt ${a}/${max}). Tool call rejected.`;
    }
    if (state === 'failed') return `Server '${name}' has failed after ${max} reconnect attempts. Manual reconnection required.`;
    if (state === 'unhealthy') return `Server '${name}' is unhealthy. Reconnection will be attempted shortly.`;
    return `Server '${name}' is not connected (state: ${state}).`;
  }
}
