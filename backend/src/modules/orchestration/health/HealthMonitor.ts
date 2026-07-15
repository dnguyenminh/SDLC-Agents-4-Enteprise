/**
 * HealthMonitor — Single global timer, parallel pings via Promise.allSettled.
 * SA4E-37
 */

import type { Logger } from 'pino';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { HealthCheckConfig } from '../types/health.js';

export interface HealthMonitorDeps {
  getConnectedServers: () => Map<string, Client>;
  onPingSuccess: (name: string) => void;
  onPingFailed: (name: string, error: string) => void;
}

export class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private logger: Logger;
  private deps: HealthMonitorDeps;
  private config: HealthCheckConfig;

  constructor(logger: Logger, deps: HealthMonitorDeps, config: HealthCheckConfig) {
    this.logger = logger.child({ component: 'HealthMonitor' });
    this.deps = deps;
    this.config = config;
  }

  start(): void {
    if (this.intervalId) return;
    this.logger.info({ interval: this.config.interval }, 'Health monitor started');
    this.intervalId = setInterval(() => { void this.runCycle(); }, this.config.interval);
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.logger.info('Health monitor stopped');
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  updateConfig(config: HealthCheckConfig): void {
    this.config = config;
    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }

  async runCycle(): Promise<void> {
    const servers = this.deps.getConnectedServers();
    if (servers.size === 0) return;

    const pingPromises = Array.from(servers.entries()).map(([name, client]) =>
      this.pingServer(name, client),
    );

    await Promise.allSettled(pingPromises);
  }

  private async pingServer(name: string, client: Client): Promise<void> {
    try {
      await Promise.race([
        client.listTools(),
        this.createTimeout(this.config.pingTimeout),
      ]);
      this.deps.onPingSuccess(name);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug({ server: name, error: message }, 'Ping failed');
      this.deps.onPingFailed(name, message);
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Ping timeout after ${ms}ms`)), ms);
    });
  }
}
