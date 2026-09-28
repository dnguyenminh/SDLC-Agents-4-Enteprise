/**
 * McpClientManager — Facade for child MCP server management with health monitoring.
 * SA4E-37: health check, auto-reconnect, connection state tracking.
 * SA4E-223: config discovery (McpServerConfigLoader), tool registry
 * (ProxiedToolRegistry) and health wiring (HealthCoordinator) extracted
 * to keep this file <= 200 lines.
 */

import type { Logger } from 'pino';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolDefinition } from '../../types/tool.js';
import type { ServerConfig } from './McpConfigService.js';
import type { HealthCheckConfig, ServerStatusEntry, ServerStateChangeCallback, Unsubscribe } from './types/health.js';
import { ConnectionStateTracker } from './health/ConnectionStateTracker.js';
import { HealthCoordinator } from './health/HealthCoordinator.js';
import { createTransport } from './health/TransportFactory.js';
import { McpServerConfigLoader } from './McpServerConfigLoader.js';
import { ProxiedToolRegistry } from './ProxiedToolRegistry.js';

export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private serverConfigs: Map<string, ServerConfig> = new Map();
  private logger: Logger;
  private stateTracker: ConnectionStateTracker;
  private toolRegistry: ProxiedToolRegistry;
  private configLoader: McpServerConfigLoader;
  private health: HealthCoordinator;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'McpClientManager' });
    this.stateTracker = new ConnectionStateTracker(logger);
    this.toolRegistry = new ProxiedToolRegistry(logger);
    this.configLoader = new McpServerConfigLoader(logger);
    this.health = new HealthCoordinator({
      logger,
      stateTracker: this.stateTracker,
      clients: this.clients,
      serverConfigs: this.serverConfigs,
      toolRegistry: this.toolRegistry,
    });
  }

  async initializeAll(): Promise<void> {
    const servers = await this.configLoader.loadAll();
    for (const { name, config } of servers) {
      try {
        await this.connectServer(name, config);
      } catch (err) {
        this.logger.error({ err, server: name }, 'Failed to connect child server (will retry via health monitor)');
        if (!this.stateTracker.getState(name)) this.stateTracker.register(name);
        this.serverConfigs.set(name, config);
      }
    }
  }

  getProxiedTools(): ToolDefinition[] { return this.toolRegistry.getProxiedTools(); }

  getServersStatus(): ServerStatusEntry[] {
    return this.stateTracker.getAllStatuses((name) => this.getServerToolCount(name));
  }

  /**
   * Reserve a set of tool names that are provided locally by the orchestrator/registry.
   * Any child server attempting to register a tool with one of these names will be skipped,
   * preventing it from shadowing the locally-provided (correct) handler. SA4E-218.
   */
  setReservedToolNames(names: Set<string>): void { this.toolRegistry.setReservedToolNames(names); }

  ownsTool(toolName: string): boolean { return this.toolRegistry.ownsTool(toolName); }

  async executeTool(toolName: string, args: unknown): Promise<any> {
    const serverName = this.toolRegistry.getOwningServer(toolName);
    if (!serverName) throw new Error(`Tool ${toolName} is not managed by any child server`);

    const state = this.stateTracker.getState(serverName);
    if (state !== 'connected') throw new Error(this.health.getErrorMsg(serverName, state));

    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Client for server ${serverName} is disconnected`);

    this.logger.info({ toolName, serverName }, 'Proxying tool execution to child server');
    const result = await client.callTool({ name: toolName, arguments: args as Record<string, unknown> });
    return { content: result.content, isError: result.isError };
  }

  async connectServer(name: string, config: ServerConfig): Promise<void> {
    if (config.disabled || name === 'code-intelligence') return;

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
    this.health.cancelReconnect(name);
    const client = this.clients.get(name);
    if (client) {
      try { await client.close(); } catch (err) {
        this.logger.warn({ err, name }, 'Failed to close MCP client connection');
      }
      this.clients.delete(name);
    }
    this.toolRegistry.clearServerTools(name);
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

  startHealthMonitor(): void { this.health.start(); }
  stopHealthMonitor(): void { this.health.stop(); }

  async reconnectServer(name: string): Promise<void> {
    const state = this.stateTracker.getState(name);
    if (state === undefined) throw new Error(`Unknown server: ${name}`);
    if (state === 'disconnected') throw new Error('Cannot reconnect manually disconnected server');
    if (state === 'connected' || state === 'reconnecting') return;
    this.stateTracker.resetReconnectState(name);
    this.stateTracker.transition(name, 'reconnecting');
    const config = this.serverConfigs.get(name);
    if (!config) throw new Error(`Server config not found for '${name}'`);
    this.health.scheduleReconnect(name, config, 1);
  }

  onServerStateChange(cb: ServerStateChangeCallback): Unsubscribe {
    return this.stateTracker.onStateChange(cb);
  }

  setHealthCheckConfig(config: Partial<HealthCheckConfig>): void { this.health.updateConfig(config); }

  isServerConnected(name: string): boolean {
    return this.clients.has(name) && this.stateTracker.getState(name) === 'connected';
  }

  getServerToolCount(name: string): number { return this.toolRegistry.getToolCount(name); }

  // --- Private ---

  private registerServerTools(name: string, client: Client): Promise<void> {
    return this.toolRegistry.registerServerTools(name, client);
  }
}
