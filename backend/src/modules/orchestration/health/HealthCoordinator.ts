/**
 * HealthCoordinator — wires health monitoring, reconnect scheduling and error
 * messaging for child MCP servers. Extracted from McpClientManager
 * (SA4E-223 line-count gate, <= 200 lines/file).
 */

import type { Logger } from 'pino';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { HealthCheckConfig } from '../types/health.js';
import { PRODUCTION_HEALTH_CONFIG } from '../types/health.js';
import type { ServerConfig } from '../McpConfigService.js';
import type { ProxiedToolRegistry } from '../ProxiedToolRegistry.js';
import { ConnectionStateTracker } from './ConnectionStateTracker.js';
import { HealthMonitor } from './HealthMonitor.js';
import { ReconnectManager } from './ReconnectManager.js';

export interface HealthCoordinatorDeps {
  logger: Logger;
  stateTracker: ConnectionStateTracker;
  /** Live client map shared with the owning McpClientManager. */
  clients: Map<string, Client>;
  /** Live server-config map shared with the owning McpClientManager. */
  serverConfigs: Map<string, ServerConfig>;
  toolRegistry: ProxiedToolRegistry;
}

export class HealthCoordinator {
  private logger: Logger;
  private healthConfig: HealthCheckConfig;
  private stateTracker: ConnectionStateTracker;
  private healthMonitor: HealthMonitor;
  private reconnectManager: ReconnectManager;
  private clients: Map<string, Client>;
  private serverConfigs: Map<string, ServerConfig>;
  private toolRegistry: ProxiedToolRegistry;

  constructor(deps: HealthCoordinatorDeps) {
    this.logger = deps.logger.child({ component: 'HealthCoordinator' });
    this.healthConfig = { ...PRODUCTION_HEALTH_CONFIG };
    this.stateTracker = deps.stateTracker;
    this.clients = deps.clients;
    this.serverConfigs = deps.serverConfigs;
    this.toolRegistry = deps.toolRegistry;
    this.healthMonitor = new HealthMonitor(deps.logger, {
      getConnectedServers: () => this.getConnectedClients(),
      onPingSuccess: (name) => this.stateTracker.recordPingSuccess(name),
      onPingFailed: (name, error) => this.handlePingFailed(name, error),
    }, this.healthConfig);
    this.reconnectManager = new ReconnectManager(deps.logger, this.healthConfig, {
      onReconnectSuccess: (name, client) => this.handleReconnectSuccess(name, client),
      onReconnectFailed: (name, attempt, err) => this.handleReconnectFailed(name, attempt, err),
      onMaxRetriesExhausted: (name) => this.handleMaxRetriesExhausted(name),
    });
  }

  start(): void { this.healthMonitor.start(); }
  stop(): void { this.healthMonitor.stop(); }

  updateConfig(config: Partial<HealthCheckConfig>): void {
    this.healthConfig = { ...this.healthConfig, ...config };
    this.healthMonitor.updateConfig(this.healthConfig);
    this.reconnectManager.updateConfig(this.healthConfig);
  }

  cancelReconnect(name: string): void { this.reconnectManager.cancelReconnect(name); }

  scheduleReconnect(name: string, config: ServerConfig, attempt: number): string | null {
    return this.reconnectManager.scheduleReconnect(name, config, attempt);
  }

  getErrorMsg(name: string, state: string | undefined): string {
    const max = this.healthConfig.maxRetries;
    if (state === 'reconnecting') {
      const a = this.stateTracker.getEntry(name)?.reconnectAttempts ?? 0;
      return `Server '${name}' is currently reconnecting (attempt ${a}/${max}). Tool call rejected.`;
    }
    if (state === 'failed') return `Server '${name}' has failed after ${max} reconnect attempts. Manual reconnection required.`;
    if (state === 'unhealthy') return `Server '${name}' is unhealthy. Reconnection will be attempted shortly.`;
    return `Server '${name}' is not connected (state: ${state}).`;
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
    this.toolRegistry.clearServerTools(name);
    void this.toolRegistry.registerServerTools(name, client).then(() => {
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
}
